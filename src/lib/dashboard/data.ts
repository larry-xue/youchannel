import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { Playlist, Video, VideoAnalysis } from "~/schema";

export const DEFAULT_ANALYSIS_PROMPT =
  "Summarize the video in 5 bullet points and call out key insights.";

export const PLAYLISTS_QUERY_KEY = ["playlists"] as const;

export type VideoWithStatus = Video & {
  analysis_count: number;
  latest_analysis_at: string | null;
};

async function getSupabaseAndUser() {
  const { getSupabaseServerClient } = await import("~/lib/server/auth.server");
  const supabase = await getSupabaseServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("User not authenticated");
  return { supabase, user };
}

export const startYouTubeOAuthFn = createServerFn({ method: "POST" }).handler(
  async () => {
    const { supabase, user } = await getSupabaseAndUser();
    const { randomUUID } = await import("crypto");
    const state = randomUUID();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    const { error } = await supabase.from("youtube_oauth_states").insert({
      user_id: user.id,
      state,
      expires_at: expiresAt,
    });

    if (error) throw error;

    const { buildYouTubeAuthUrl } = await import("~/lib/server/youtube");
    return { url: buildYouTubeAuthUrl(state) };
  },
);

export const YOUCHANNEL_PLAYLIST_TITLE = "YouChannel AI";
export const YOUCHANNEL_PLAYLIST_DESCRIPTION = "Add videos here for AI analysis";

export const completeYouTubeOauthFn = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ code: z.string(), state: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabase, user } = await getSupabaseAndUser();

    // Validate OAuth state
    const { data: stateRow, error: stateError } = await supabase
      .from("youtube_oauth_states")
      .select("*")
      .eq("state", data.state)
      .eq("user_id", user.id)
      .maybeSingle();

    if (stateError || !stateRow) throw new Error("Invalid OAuth state");

    const expiresAt = new Date(stateRow.expires_at).getTime();
    if (Date.now() > expiresAt) {
      throw new Error("OAuth state expired. Please connect again.");
    }

    await supabase.from("youtube_oauth_states").delete().eq("id", stateRow.id);

    // Exchange code for tokens
    const { exchangeCodeForTokens, createYouTubePlaylist } =
      await import("~/lib/server/youtube");
    const token = await exchangeCodeForTokens(data.code);
    const tokenExpiresAt = new Date(Date.now() + token.expires_in * 1000).toISOString();

    // Save or update YouTube account
    const { data: existingAccount } = await supabase
      .from("youtube_accounts")
      .select("*")
      .eq("user_id", user.id)
      .eq("provider", "google")
      .maybeSingle();

    let accountId = existingAccount?.id;

    if (existingAccount) {
      const refreshToken = token.refresh_token || existingAccount.refresh_token;
      if (!refreshToken) throw new Error("Missing refresh token");

      const { error: updateError } = await supabase
        .from("youtube_accounts")
        .update({
          access_token: token.access_token,
          refresh_token: refreshToken,
          expires_at: tokenExpiresAt,
          scope: token.scope || existingAccount.scope,
          token_type: token.token_type || existingAccount.token_type,
        })
        .eq("id", existingAccount.id);

      if (updateError) throw updateError;
    } else {
      if (!token.refresh_token) throw new Error("Missing refresh token");

      const { data: inserted, error: insertError } = await supabase
        .from("youtube_accounts")
        .insert({
          user_id: user.id,
          provider: "google",
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          expires_at: tokenExpiresAt,
          scope: token.scope,
          token_type: token.token_type,
        })
        .select()
        .single();

      if (insertError || !inserted) throw insertError || new Error("Account save failed");
      accountId = inserted.id;
    }

    // Create the YouChannel AI playlist on YouTube
    const createdPlaylist = await createYouTubePlaylist(
      token.access_token,
      YOUCHANNEL_PLAYLIST_TITLE,
      YOUCHANNEL_PLAYLIST_DESCRIPTION,
      "private",
    );

    // Save the playlist to database
    const { error: playlistError } = await supabase.from("playlists").insert({
      user_id: user.id,
      youtube_account_id: accountId,
      playlist_id: createdPlaylist.playlistId,
      title: createdPlaylist.title,
      description: createdPlaylist.description,
      is_active: true,
    });

    if (playlistError) throw playlistError;

    return { success: true, playlistTitle: createdPlaylist.title };
  });

export const getPlaylistsFn = createServerFn({ method: "GET" }).handler(async () => {
  const { supabase, user } = await getSupabaseAndUser();
  const { data, error } = await supabase
    .from("playlists")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: true });

  if (error) throw error;
  return (data || []) as Playlist[];
});

export const syncPlaylistsFn = createServerFn({ method: "POST" }).handler(async () => {
  const { supabase, user } = await getSupabaseAndUser();
  const { data: account, error: accountError } = await supabase
    .from("youtube_accounts")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();

  if (accountError || !account)
    throw accountError || new Error("YouTube account not found");

  let accessToken = account.access_token;
  const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;

  if (!expiresAt || Date.now() > expiresAt - 60_000) {
    const { refreshAccessToken } = await import("~/lib/server/youtube");
    const refreshed = await refreshAccessToken(account.refresh_token);
    accessToken = refreshed.access_token;

    const updatedExpiresAt = new Date(
      Date.now() + refreshed.expires_in * 1000,
    ).toISOString();

    const { error: updateError } = await supabase
      .from("youtube_accounts")
      .update({
        access_token: accessToken,
        refresh_token: refreshed.refresh_token || account.refresh_token,
        expires_at: updatedExpiresAt,
        scope: refreshed.scope || account.scope,
        token_type: refreshed.token_type || account.token_type,
      })
      .eq("id", account.id);

    if (updateError) throw updateError;
  }

  const { fetchPlaylistSummaries } = await import("~/lib/server/youtube");
  const playlistSummaries = await fetchPlaylistSummaries(accessToken);
  if (playlistSummaries.length === 0) {
    throw new Error("No YouTube playlists found for this account");
  }

  const { data: existingPlaylists, error: existingError } = await supabase
    .from("playlists")
    .select("playlist_id, is_active")
    .eq("user_id", user.id);

  if (existingError) throw existingError;

  const activeByPlaylist = new Map(
    (existingPlaylists || []).map((playlist) => [
      playlist.playlist_id,
      playlist.is_active,
    ]),
  );
  const hasActive = (existingPlaylists || []).some((playlist) => playlist.is_active);

  const upsertPayload = playlistSummaries.map((summary, index) => ({
    user_id: user.id,
    youtube_account_id: account.id,
    playlist_id: summary.playlistId,
    title: summary.title,
    description: summary.description,
    thumbnail_url: summary.thumbnailUrl,
    custom_url: summary.customUrl,
    is_active: activeByPlaylist.get(summary.playlistId) ?? (!hasActive && index === 0),
  }));

  const { error: upsertError } = await supabase
    .from("playlists")
    .upsert(upsertPayload, { onConflict: "user_id,playlist_id" });

  if (upsertError) throw upsertError;

  return { total: playlistSummaries.length };
});

export const setActivePlaylistFn = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ playlistId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.playlistId) throw new Error("Missing playlistId");

    const { error: resetError } = await supabase
      .from("playlists")
      .update({ is_active: false })
      .eq("user_id", user.id);
    if (resetError) throw resetError;

    const { error } = await supabase
      .from("playlists")
      .update({ is_active: true })
      .eq("id", data.playlistId)
      .eq("user_id", user.id);

    if (error) throw error;
    return { success: true };
  });

export const savePlaylistPromptFn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ playlistId: z.string(), prompt: z.string() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.playlistId) throw new Error("Missing playlistId");

    const prompt = data.prompt.trim() || DEFAULT_ANALYSIS_PROMPT;
    const { error } = await supabase
      .from("playlists")
      .update({ analysis_prompt: prompt })
      .eq("id", data.playlistId)
      .eq("user_id", user.id);

    if (error) throw error;
    return { success: true };
  });

export const getVideosFn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ playlistIds: z.array(z.string()).optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabase } = await getSupabaseAndUser();
    const playlistIds = data?.playlistIds?.filter(Boolean) || [];
    if (playlistIds.length === 0) return [] as VideoWithStatus[];

    const { data: videos, error } = await supabase
      .from("videos")
      .select("*")
      .in("playlist_id", playlistIds)
      .order("published_at", { ascending: false });

    if (error) throw error;

    const videoIds = (videos || []).map((video) => video.id);
    if (videoIds.length === 0) return [] as VideoWithStatus[];

    const { data: analyses } = await supabase
      .from("video_analyses")
      .select("video_id, created_at")
      .in("video_id", videoIds);

    const analysisMap = new Map<string, { count: number; latest: string | null }>();
    for (const analysis of analyses || []) {
      const current = analysisMap.get(analysis.video_id) || {
        count: 0,
        latest: null,
      };
      const nextLatest =
        !current.latest ||
        new Date(analysis.created_at).getTime() > new Date(current.latest).getTime()
          ? analysis.created_at
          : current.latest;
      analysisMap.set(analysis.video_id, {
        count: current.count + 1,
        latest: nextLatest,
      });
    }

    return (videos || []).map((video) => ({
      ...video,
      analysis_count: analysisMap.get(video.id)?.count || 0,
      latest_analysis_at: analysisMap.get(video.id)?.latest || null,
    })) as VideoWithStatus[];
  });

export const getVideoAnalysesFn = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ videoId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await getSupabaseAndUser();
    if (!data?.videoId) return [] as VideoAnalysis[];

    const { data: analyses, error } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("video_id", data.videoId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (analyses || []) as VideoAnalysis[];
  });

export const syncPlaylistFn = createServerFn({ method: "POST" })
  .inputValidator((data) => z.object({ playlistId: z.string() }).parse(data))
  .handler(async ({ data }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.playlistId) throw new Error("Missing playlistId");

    const { data: playlist, error: playlistError } = await supabase
      .from("playlists")
      .select("*")
      .eq("id", data.playlistId)
      .eq("user_id", user.id)
      .single();

    if (playlistError || !playlist)
      throw playlistError || new Error("Playlist not found");
    if (!playlist.youtube_account_id)
      throw new Error("Playlist is not connected to YouTube");

    const { data: account, error: accountError } = await supabase
      .from("youtube_accounts")
      .select("*")
      .eq("id", playlist.youtube_account_id)
      .single();

    if (accountError || !account)
      throw accountError || new Error("YouTube account not found");

    let accessToken = account.access_token;
    const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;

    if (!expiresAt || Date.now() > expiresAt - 60_000) {
      const { refreshAccessToken } = await import("~/lib/server/youtube");
      const refreshed = await refreshAccessToken(account.refresh_token);
      accessToken = refreshed.access_token;

      const updatedExpiresAt = new Date(
        Date.now() + refreshed.expires_in * 1000,
      ).toISOString();

      const { error: updateError } = await supabase
        .from("youtube_accounts")
        .update({
          access_token: accessToken,
          refresh_token: refreshed.refresh_token || account.refresh_token,
          expires_at: updatedExpiresAt,
          scope: refreshed.scope || account.scope,
          token_type: refreshed.token_type || account.token_type,
        })
        .eq("id", account.id);

      if (updateError) throw updateError;
    }

    const { fetchPlaylistSummaries, fetchPlaylistVideos } =
      await import("~/lib/server/youtube");

    const playlistSummaries = await fetchPlaylistSummaries(accessToken);
    const summary =
      playlistSummaries.find((item) => item.playlistId === playlist.playlist_id) ||
      playlistSummaries[0];

    if (!summary?.uploadsPlaylistId) throw new Error("Unable to fetch playlist items");

    const fetchedVideos = await fetchPlaylistVideos(
      accessToken,
      summary.uploadsPlaylistId,
      25,
    );

    const upsertPayload = fetchedVideos.map((video) => ({
      playlist_id: playlist.id,
      youtube_video_id: video.videoId,
      title: video.title,
      description: video.description,
      published_at: video.publishedAt,
      thumbnail_url: video.thumbnailUrl,
      duration: video.duration,
      raw: video.raw,
    }));

    const { data: upserted, error: upsertError } = await supabase
      .from("videos")
      .upsert(upsertPayload, { onConflict: "playlist_id,youtube_video_id" })
      .select();

    if (upsertError) throw upsertError;

    const { error: playlistUpdateError } = await supabase
      .from("playlists")
      .update({
        title: summary.title,
        description: summary.description,
        thumbnail_url: summary.thumbnailUrl,
        custom_url: summary.customUrl,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", playlist.id);

    if (playlistUpdateError) throw playlistUpdateError;

    const prompt =
      (playlist.analysis_prompt || DEFAULT_ANALYSIS_PROMPT).trim() ||
      DEFAULT_ANALYSIS_PROMPT;
    const { createHash } = await import("crypto");
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    const videoRows = upserted || [];
    if (videoRows.length === 0) {
      return { created: 0, skipped: 0, total: 0 };
    }

    const videoIds = videoRows.map((video) => video.id);
    const { data: existingAnalyses } = await supabase
      .from("video_analyses")
      .select("video_id, prompt_hash")
      .in("video_id", videoIds)
      .eq("prompt_hash", promptHash);

    const existingSet = new Set((existingAnalyses || []).map((row) => row.video_id));

    const { generateVideoAnalysis } = await import("~/lib/server/gemini");

    let created = 0;
    let skipped = 0;

    for (const video of videoRows) {
      if (existingSet.has(video.id)) {
        skipped += 1;
        continue;
      }

      const videoUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;

      try {
        const result = await generateVideoAnalysis({ videoUrl, prompt });
        const { error: insertError } = await supabase.from("video_analyses").insert({
          video_id: video.id,
          playlist_id: playlist.id,
          user_id: user.id,
          prompt,
          prompt_hash: promptHash,
          analysis_text: result.text,
          model: result.model,
          status: "completed",
        });

        if (insertError) throw insertError;
        created += 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : "Analysis failed";

        await supabase.from("video_analyses").insert({
          video_id: video.id,
          playlist_id: playlist.id,
          user_id: user.id,
          prompt,
          prompt_hash: promptHash,
          analysis_text: "",
          model: "gemini-2.5-flash",
          status: "failed",
          error: message,
        });
      }
    }

    return { created, skipped, total: videoRows.length };
  });

export const runVideoAnalysisFn = createServerFn({ method: "POST" })
  .inputValidator((data) =>
    z.object({ videoId: z.string(), prompt: z.string().optional() }).parse(data),
  )
  .handler(async ({ data }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.videoId) throw new Error("Missing videoId");

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("*")
      .eq("id", data.videoId)
      .single();

    if (videoError || !video) throw videoError || new Error("Video not found");

    const { data: playlist, error: playlistError } = await supabase
      .from("playlists")
      .select("*")
      .eq("id", video.playlist_id)
      .single();

    if (playlistError || !playlist)
      throw playlistError || new Error("Playlist not found");

    const prompt =
      (data.prompt || playlist.analysis_prompt || DEFAULT_ANALYSIS_PROMPT).trim() ||
      DEFAULT_ANALYSIS_PROMPT;

    const { createHash } = await import("crypto");
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    const { generateVideoAnalysis } = await import("~/lib/server/gemini");
    const videoUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
    const result = await generateVideoAnalysis({ videoUrl, prompt });

    const { data: inserted, error: insertError } = await supabase
      .from("video_analyses")
      .insert({
        video_id: video.id,
        playlist_id: playlist.id,
        user_id: user.id,
        prompt,
        prompt_hash: promptHash,
        analysis_text: result.text,
        model: result.model,
        status: "completed",
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return { analysis: inserted, reused: false };
  });
