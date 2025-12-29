import { createServerFn } from "@tanstack/react-start";
import type {
  Channel,
  Conversation,
  ConversationMessage,
  Video,
  VideoAnalysis,
} from "~/schema";

export const DEFAULT_ANALYSIS_PROMPT =
  "Summarize the video in 5 bullet points and call out key insights.";

export const CHANNELS_QUERY_KEY = ["channels"] as const;
export const CONVERSATIONS_QUERY_KEY = ["conversations"] as const;

export type VideoWithStatus = Video & {
  analysis_count: number;
  latest_analysis_at: string | null;
};

export type ConversationWithCount = Conversation & {
  video_count: number;
};

async function getSupabaseAndUser() {
  const { getSupabaseServerClient } = await import("~/lib/server/auth");
  const supabase = getSupabaseServerClient();
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

export const getChannelsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabase, user } = await getSupabaseAndUser();
    const { data, error } = await supabase
      .from("channels")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (data || []) as Channel[];
  },
);

export const syncChannelsFn = createServerFn({ method: "POST" }).handler(
  async () => {
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

    const { fetchChannelSummaries } = await import("~/lib/server/youtube");
    const channelSummaries = await fetchChannelSummaries(accessToken);
    if (channelSummaries.length === 0) {
      throw new Error("No YouTube channels found for this account");
    }

    const { data: existingChannels, error: existingError } = await supabase
      .from("channels")
      .select("channel_id, is_active")
      .eq("user_id", user.id);

    if (existingError) throw existingError;

    const activeByChannel = new Map(
      (existingChannels || []).map((channel) => [
        channel.channel_id,
        channel.is_active,
      ]),
    );
    const hasActive = (existingChannels || []).some((channel) => channel.is_active);

    const upsertPayload = channelSummaries.map((summary, index) => ({
      user_id: user.id,
      youtube_account_id: account.id,
      channel_id: summary.channelId,
      title: summary.title,
      description: summary.description,
      thumbnail_url: summary.thumbnailUrl,
      custom_url: summary.customUrl,
      is_active: activeByChannel.get(summary.channelId) ?? (!hasActive && index === 0),
    }));

    const { error: upsertError } = await supabase
      .from("channels")
      .upsert(upsertPayload, { onConflict: "user_id,channel_id" });

    if (upsertError) throw upsertError;

    return { total: channelSummaries.length };
  },
);

export const setActiveChannelFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { channelId: string } }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.channelId) throw new Error("Missing channelId");

    const { error: resetError } = await supabase
      .from("channels")
      .update({ is_active: false })
      .eq("user_id", user.id);
    if (resetError) throw resetError;

    const { error } = await supabase
      .from("channels")
      .update({ is_active: true })
      .eq("id", data.channelId)
      .eq("user_id", user.id);

    if (error) throw error;
    return { success: true };
  },
);

export const saveChannelPromptFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { channelId: string; prompt: string } }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.channelId) throw new Error("Missing channelId");

    const prompt = data.prompt.trim() || DEFAULT_ANALYSIS_PROMPT;
    const { error } = await supabase
      .from("channels")
      .update({ analysis_prompt: prompt })
      .eq("id", data.channelId)
      .eq("user_id", user.id);

    if (error) throw error;
    return { success: true };
  },
);

export const getVideosFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { channelIds?: string[] } }) => {
    const { supabase } = await getSupabaseAndUser();
    const channelIds = data?.channelIds?.filter(Boolean) || [];
    if (channelIds.length === 0) return [] as VideoWithStatus[];

    const { data: videos, error } = await supabase
      .from("videos")
      .select("*")
      .in("channel_id", channelIds)
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
        new Date(analysis.created_at).getTime() >
          new Date(current.latest).getTime()
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
  },
);

export const getVideoAnalysesFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { videoId: string } }) => {
    const { supabase } = await getSupabaseAndUser();
    if (!data?.videoId) return [] as VideoAnalysis[];

    const { data: analyses, error } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("video_id", data.videoId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (analyses || []) as VideoAnalysis[];
  },
);

export const syncChannelFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { channelId: string } }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.channelId) throw new Error("Missing channelId");

    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("*")
      .eq("id", data.channelId)
      .eq("user_id", user.id)
      .single();

    if (channelError || !channel) throw channelError || new Error("Channel not found");
    if (!channel.youtube_account_id)
      throw new Error("Channel is not connected to YouTube");

    const { data: account, error: accountError } = await supabase
      .from("youtube_accounts")
      .select("*")
      .eq("id", channel.youtube_account_id)
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

    const { fetchChannelSummaries, fetchChannelVideos } = await import(
      "~/lib/server/youtube",
    );

    const channelSummaries = await fetchChannelSummaries(accessToken);
    const summary =
      channelSummaries.find((item) => item.channelId === channel.channel_id) ||
      channelSummaries[0];

    if (!summary?.uploadsPlaylistId)
      throw new Error("Unable to fetch channel uploads");

    const fetchedVideos = await fetchChannelVideos(
      accessToken,
      summary.uploadsPlaylistId,
      25,
    );

    const upsertPayload = fetchedVideos.map((video) => ({
      channel_id: channel.id,
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
      .upsert(upsertPayload, { onConflict: "channel_id,youtube_video_id" })
      .select();

    if (upsertError) throw upsertError;

    const { error: channelUpdateError } = await supabase
      .from("channels")
      .update({
        title: summary.title,
        description: summary.description,
        thumbnail_url: summary.thumbnailUrl,
        custom_url: summary.customUrl,
        last_synced_at: new Date().toISOString(),
      })
      .eq("id", channel.id);

    if (channelUpdateError) throw channelUpdateError;

    const prompt =
      (channel.analysis_prompt || DEFAULT_ANALYSIS_PROMPT).trim() ||
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

    const existingSet = new Set(
      (existingAnalyses || []).map((row) => row.video_id),
    );

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
        const { error: insertError } = await supabase
          .from("video_analyses")
          .insert({
            video_id: video.id,
            channel_id: channel.id,
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
          channel_id: channel.id,
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
  },
);

export const runVideoAnalysisFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { videoId: string; prompt?: string } }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.videoId) throw new Error("Missing videoId");

    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("*")
      .eq("id", data.videoId)
      .single();

    if (videoError || !video) throw videoError || new Error("Video not found");

    const { data: channel, error: channelError } = await supabase
      .from("channels")
      .select("*")
      .eq("id", video.channel_id)
      .single();

    if (channelError || !channel)
      throw channelError || new Error("Channel not found");

    const prompt =
      (data.prompt || channel.analysis_prompt || DEFAULT_ANALYSIS_PROMPT).trim() ||
      DEFAULT_ANALYSIS_PROMPT;

    const { createHash } = await import("crypto");
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    const { data: existing } = await supabase
      .from("video_analyses")
      .select("*")
      .eq("video_id", video.id)
      .eq("prompt_hash", promptHash)
      .maybeSingle();

    if (existing) return { analysis: existing, reused: true };

    const { generateVideoAnalysis } = await import("~/lib/server/gemini");
    const videoUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
    const result = await generateVideoAnalysis({ videoUrl, prompt });

    const { data: inserted, error: insertError } = await supabase
      .from("video_analyses")
      .insert({
        video_id: video.id,
        channel_id: channel.id,
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
  },
);

export const getConversationsFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const { supabase, user } = await getSupabaseAndUser();
    const { data: conversations, error } = await supabase
      .from("conversations")
      .select("*")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    const convoIds = (conversations || []).map((conversation) => conversation.id);
    if (convoIds.length === 0) return [] as ConversationWithCount[];

    const { data: selections } = await supabase
      .from("conversation_videos")
      .select("conversation_id")
      .in("conversation_id", convoIds);

    const counts = new Map<string, number>();
    for (const selection of selections || []) {
      counts.set(
        selection.conversation_id,
        (counts.get(selection.conversation_id) || 0) + 1,
      );
    }

    return (conversations || []).map((conversation) => ({
      ...conversation,
      video_count: counts.get(conversation.id) || 0,
    })) as ConversationWithCount[];
  },
);

export const createConversationFn = createServerFn({ method: "POST" }).handler(
  async ({
    data,
  }: {
    data: {
      channelId?: string | null;
      title?: string;
      selections: Array<{ videoId: string; analysisId?: string | null }>;
    };
  }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.selections?.length) throw new Error("Select at least one video");

    const videoIds = data.selections.map((selection) => selection.videoId);

    const { data: videos, error: videoError } = await supabase
      .from("videos")
      .select("id, title, channel_id")
      .in("id", videoIds);

    if (videoError) throw videoError;

    const { data: analyses } = await supabase
      .from("video_analyses")
      .select("id, video_id, created_at")
      .in("video_id", videoIds)
      .order("created_at", { ascending: false });

    const latestByVideo = new Map<string, string>();
    for (const analysis of analyses || []) {
      if (!latestByVideo.has(analysis.video_id)) {
        latestByVideo.set(analysis.video_id, analysis.id);
      }
    }

    const selectionRows = data.selections.map((selection) => ({
      video_id: selection.videoId,
      analysis_id: selection.analysisId || latestByVideo.get(selection.videoId) || null,
    }));

    const missing = selectionRows.filter((row) => !row.analysis_id);
    if (missing.length > 0) {
      throw new Error("Run analysis for all selected videos first");
    }

    const trimmedTitle = data.title?.trim();
    const sortedTitles = (videos || []).map((video) => video.title || "Video");
    const title =
      trimmedTitle ||
      (sortedTitles.length === 1
        ? `Chat: ${sortedTitles[0]}`
        : `Chat: ${sortedTitles[0]} +${sortedTitles.length - 1}`);

    const channelIds = new Set((videos || []).map((video) => video.channel_id));
    const conversationChannelId = channelIds.size === 1 ? [...channelIds][0] : null;

    const { data: conversation, error: conversationError } = await supabase
      .from("conversations")
      .insert({
        user_id: user.id,
        channel_id: conversationChannelId,
        title,
      })
      .select()
      .single();

    if (conversationError || !conversation)
      throw conversationError || new Error("Conversation not created");

    const { error: selectionError } = await supabase
      .from("conversation_videos")
      .insert(
        selectionRows.map((row) => ({
          conversation_id: conversation.id,
          video_id: row.video_id,
          analysis_id: row.analysis_id,
        })),
      );

    if (selectionError) throw selectionError;

    return { conversation };
  },
);

export const getConversationMessagesFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { conversationId: string } }) => {
    const { supabase } = await getSupabaseAndUser();
    if (!data?.conversationId) return [] as ConversationMessage[];

    const { data: messages, error } = await supabase
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });

    if (error) throw error;
    return (messages || []) as ConversationMessage[];
  },
);

export const sendConversationMessageFn = createServerFn({ method: "POST" }).handler(
  async ({ data }: { data: { conversationId: string; content: string } }) => {
    const { supabase, user } = await getSupabaseAndUser();
    if (!data?.conversationId) throw new Error("Missing conversationId");

    const content = data.content?.trim();
    if (!content) throw new Error("Message cannot be empty");

    const { data: conversation, error: convoError } = await supabase
      .from("conversations")
      .select("*")
      .eq("id", data.conversationId)
      .eq("user_id", user.id)
      .single();

    if (convoError || !conversation)
      throw convoError || new Error("Conversation not found");

    const { error: insertUserError } = await supabase
      .from("conversation_messages")
      .insert({
        conversation_id: data.conversationId,
        role: "user",
        content,
      });

    if (insertUserError) throw insertUserError;

    const { data: selections, error: selectionError } = await supabase
      .from("conversation_videos")
      .select("video_id, analysis_id")
      .eq("conversation_id", data.conversationId);

    if (selectionError) throw selectionError;

    const analysisIds = (selections || [])
      .map((selection) => selection.analysis_id)
      .filter(Boolean) as string[];

    if (analysisIds.length === 0)
      throw new Error("Conversation has no analysis records");

    const { data: analyses } = await supabase
      .from("video_analyses")
      .select("id, video_id, prompt, analysis_text")
      .in("id", analysisIds);

    const { data: videos } = await supabase
      .from("videos")
      .select("id, title, youtube_video_id")
      .in(
        "id",
        (selections || []).map((selection) => selection.video_id),
      );

    const videoMap = new Map((videos || []).map((video) => [video.id, video]));
    const analysisMap = new Map(
      (analyses || []).map((analysis) => [analysis.id, analysis]),
    );

    const promptBlocks = (selections || []).map((selection, index) => {
      const analysis = selection.analysis_id
        ? analysisMap.get(selection.analysis_id)
        : undefined;
      const video = videoMap.get(selection.video_id);
      const title = video?.title || "Untitled video";
      const url = video?.youtube_video_id
        ? `https://www.youtube.com/watch?v=${video.youtube_video_id}`
        : "Unknown URL";
      const prompt = analysis?.prompt || "No prompt";
      const analysisText = analysis?.analysis_text || "No analysis available.";

      return `Video ${index + 1}: ${title}\nURL: ${url}\nPrompt: ${prompt}\n${analysisText}`;
    });

    const systemPrompt = [
      "You are a helpful assistant who answers questions about YouTube videos.",
      "Use the following analysis summaries as your knowledge base.",
      "Answer clearly and cite which video your answer comes from when relevant.",
      "",
      promptBlocks.join("\n\n"),
    ].join("\n");

    const { data: messages } = await supabase
      .from("conversation_messages")
      .select("*")
      .eq("conversation_id", data.conversationId)
      .order("created_at", { ascending: true });

    const modelMessages = (messages || []).map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content,
    }));

    const { generateConversationReply } = await import("~/lib/server/gemini");
    const reply = await generateConversationReply({
      messages: modelMessages,
      systemPrompts: [systemPrompt],
    });

    const { error: insertAssistantError } = await supabase
      .from("conversation_messages")
      .insert({
        conversation_id: data.conversationId,
        role: "assistant",
        content: reply.text,
        metadata: { model: reply.model },
      });

    if (insertAssistantError) throw insertAssistantError;

    await supabase
      .from("conversations")
      .update({ updated_at: new Date().toISOString() })
      .eq("id", conversation.id);

    return { reply: reply.text, model: reply.model };
  },
);
