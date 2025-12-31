import { createClient } from "@supabase/supabase-js";
import type {
  Playlist,
  PlaylistEntryStatus,
  SyncLog,
  UserQuota,
  Video,
  VideoAnalysisSkipReason,
} from "~/schema";

// Environment variable helpers
const getEnvValue = (key: string) => {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  return process.env[key] ?? metaEnv?.[key];
};

// Constants
const FREE_USER_MAX_ANALYSES = parseInt(
  getEnvValue("FREE_USER_MAX_ANALYSES") || "3",
  10,
);
const FREE_USER_MAX_VIDEO_DURATION = parseInt(
  getEnvValue("FREE_USER_MAX_VIDEO_DURATION") || "600",
  10,
);
const MIN_SYNC_INTERVAL_MS = 20 * 60 * 1000; // 20 minutes minimum between syncs

// Get Supabase client with service role for background jobs
function getServiceClient() {
  const supabaseUrl = getEnvValue("VITE_SUPABASE_URL") ?? getEnvValue("SUPABASE_URL");
  const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
  if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

  return createClient(supabaseUrl, serviceRoleKey);
}

// Parse ISO 8601 duration to seconds
// Example: PT4M13S -> 253 seconds
export function parseDuration(isoDuration: string | null): number {
  if (!isoDuration) return 0;

  const match = isoDuration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!match) return 0;

  const hours = parseInt(match[1] || "0", 10);
  const minutes = parseInt(match[2] || "0", 10);
  const seconds = parseInt(match[3] || "0", 10);

  return hours * 3600 + minutes * 60 + seconds;
}

// Write sync log
async function writeSyncLog(entry: Record<string, unknown>) {
  try {
    const { mkdir, appendFile } = await import("fs/promises");
    const { join } = await import("path");
    const logDir = join(process.cwd(), "logs");
    const logPath = join(logDir, "sync.log");
    await mkdir(logDir, { recursive: true });
    const line = `${new Date().toISOString()} ${JSON.stringify(entry)}\n`;
    await appendFile(logPath, line, "utf8");
  } catch {
    // Avoid breaking sync if logging fails.
  }
}

// Check user quota
export async function checkUserQuota(
  userId: string,
): Promise<{ allowed: boolean; reason?: VideoAnalysisSkipReason; quota: UserQuota }> {
  const supabase = getServiceClient();

  // Get or create user quota
  const { data: existingQuota, error: fetchError } = await supabase
    .from("user_quotas")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (fetchError) throw fetchError;

  let typedQuota: UserQuota;

  if (existingQuota) {
    typedQuota = existingQuota as UserQuota;
  } else {
    // Create quota record for new user
    const { data: newQuota, error: insertError } = await supabase
      .from("user_quotas")
      .insert({
        user_id: userId,
        analysis_count: 0,
        max_analyses: FREE_USER_MAX_ANALYSES,
      })
      .select()
      .single();

    if (insertError) throw insertError;
    typedQuota = newQuota as UserQuota;
  }

  if (typedQuota.analysis_count >= typedQuota.max_analyses) {
    return { allowed: false, reason: "quota_exceeded", quota: typedQuota };
  }

  return { allowed: true, quota: typedQuota };
}

// Increment user quota count
async function incrementQuotaCount(userId: string): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase.rpc("increment_quota_count", {
    p_user_id: userId,
  });

  // Fallback if RPC doesn't exist
  if (error?.code === "42883") {
    // Function does not exist
    const { data: quota } = await supabase
      .from("user_quotas")
      .select("analysis_count")
      .eq("user_id", userId)
      .single();

    if (quota) {
      await supabase
        .from("user_quotas")
        .update({ analysis_count: quota.analysis_count + 1 })
        .eq("user_id", userId);
    }
  } else if (error) {
    throw error;
  }
}

// Update playlist entry status
async function updatePlaylistEntryStatus(
  playlistId: string,
  status: PlaylistEntryStatus,
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("playlists")
    .update({ entry_status: status })
    .eq("id", playlistId);

  if (error) throw error;
}

// Create sync log entry
async function createSyncLog(
  userId: string | null,
  playlistId: string | null,
): Promise<string> {
  const supabase = getServiceClient();

  const { data, error } = await supabase
    .from("sync_logs")
    .insert({
      user_id: userId,
      playlist_id: playlistId,
      status: "running",
      started_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (error) throw error;
  return data.id;
}

// Update sync log
async function updateSyncLog(
  logId: string,
  updates: Partial<SyncLog>,
): Promise<void> {
  const supabase = getServiceClient();

  const { error } = await supabase
    .from("sync_logs")
    .update({
      ...updates,
      completed_at: new Date().toISOString(),
    })
    .eq("id", logId);

  if (error) throw error;
}

// Sync a single playlist
async function syncSinglePlaylist(
  playlist: Playlist,
  account: { access_token: string; refresh_token: string; expires_at: string | null },
): Promise<{
  videosAdded: number;
  videosRemoved: number;
  analysesTriggered: number;
  analysesSkipped: number;
  error?: string;
}> {
  const supabase = getServiceClient();
  const result = {
    videosAdded: 0,
    videosRemoved: 0,
    analysesTriggered: 0,
    analysesSkipped: 0,
    error: undefined as string | undefined,
  };

  try {
    // Check if token needs refresh
    let accessToken = account.access_token;
    const expiresAt = account.expires_at ? new Date(account.expires_at).getTime() : 0;

    if (!expiresAt || Date.now() > expiresAt - 60_000) {
      const { refreshAccessToken } = await import("~/lib/server/youtube");
      try {
        const refreshed = await refreshAccessToken(account.refresh_token);
        accessToken = refreshed.access_token;

        // Update token in database
        const updatedExpiresAt = new Date(
          Date.now() + refreshed.expires_in * 1000,
        ).toISOString();

        await supabase
          .from("youtube_accounts")
          .update({
            access_token: accessToken,
            refresh_token: refreshed.refresh_token || account.refresh_token,
            expires_at: updatedExpiresAt,
          })
          .eq("id", playlist.youtube_account_id);
      } catch {
        // Token refresh failed - mark as auth invalid
        await updatePlaylistEntryStatus(playlist.id, "auth_invalid");
        result.error = "Authorization expired";
        return result;
      }
    }

    // Fetch current videos from YouTube
    const { fetchPlaylistVideos } = await import("~/lib/server/youtube");
    let youtubeVideos;

    try {
      youtubeVideos = await fetchPlaylistVideos(accessToken, playlist.playlist_id, 50);
    } catch (fetchError) {
      const errorMessage =
        fetchError instanceof Error ? fetchError.message : String(fetchError);

      // Check if playlist was deleted
      if (errorMessage.includes("404") || errorMessage.includes("playlistNotFound")) {
        await updatePlaylistEntryStatus(playlist.id, "lost");
        result.error = "Playlist not found";
        return result;
      }

      // Check for auth errors
      if (errorMessage.includes("401") || errorMessage.includes("403")) {
        await updatePlaylistEntryStatus(playlist.id, "auth_invalid");
        result.error = "Authorization invalid";
        return result;
      }

      throw fetchError;
    }

    // Get existing videos from database
    const { data: existingVideos, error: videosError } = await supabase
      .from("videos")
      .select("*")
      .eq("playlist_id", playlist.id);

    if (videosError) throw videosError;

    const existingVideoMap = new Map(
      (existingVideos || []).map((v) => [v.youtube_video_id, v as Video]),
    );
    const youtubeVideoIds = new Set(youtubeVideos.map((v) => v.videoId));

    // Find new videos to add
    const newVideos = youtubeVideos.filter(
      (v) => !existingVideoMap.has(v.videoId),
    );

    // Find videos that were removed from playlist
    const removedVideos = (existingVideos || []).filter(
      (v) => !youtubeVideoIds.has(v.youtube_video_id) && v.sync_status === "synced",
    );

    // Insert new videos
    if (newVideos.length > 0) {
      const insertPayload = newVideos.map((video) => ({
        playlist_id: playlist.id,
        youtube_video_id: video.videoId,
        title: video.title,
        description: video.description,
        published_at: video.publishedAt,
        thumbnail_url: video.thumbnailUrl,
        duration: video.duration,
        raw: video.raw,
        sync_status: "synced",
      }));

      const { data: insertedVideos, error: insertError } = await supabase
        .from("videos")
        .upsert(insertPayload, { onConflict: "playlist_id,youtube_video_id" })
        .select();

      if (insertError) throw insertError;

      result.videosAdded = insertedVideos?.length || 0;

      // Trigger analysis for new videos
      for (const video of insertedVideos || []) {
        const analysisResult = await checkQuotaAndAnalyze(
          video as Video,
          playlist,
        );
        if (analysisResult.triggered) {
          result.analysesTriggered += 1;
        } else {
          result.analysesSkipped += 1;
        }
      }
    }

    // Mark removed videos
    if (removedVideos.length > 0) {
      const removedIds = removedVideos.map((v) => v.id);

      const { error: updateError } = await supabase
        .from("videos")
        .update({
          sync_status: "removed",
          removed_at: new Date().toISOString(),
        })
        .in("id", removedIds);

      if (updateError) throw updateError;
      result.videosRemoved = removedVideos.length;
    }

    // Update last_synced_at
    await supabase
      .from("playlists")
      .update({ last_synced_at: new Date().toISOString() })
      .eq("id", playlist.id);

    return result;
  } catch (error) {
    result.error = error instanceof Error ? error.message : String(error);
    return result;
  }
}

// Check quota and duration, then trigger analysis if allowed
export async function checkQuotaAndAnalyze(
  video: Video,
  playlist: Playlist,
): Promise<{ triggered: boolean; reason?: VideoAnalysisSkipReason }> {
  const supabase = getServiceClient();

  // Check video duration
  const durationSeconds = parseDuration(video.duration);
  if (durationSeconds > FREE_USER_MAX_VIDEO_DURATION) {
    // Create skipped analysis record
    const { createHash } = await import("crypto");
    const prompt = playlist.analysis_prompt || "Summarize the video";
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    await supabase.from("video_analyses").upsert(
      {
        video_id: video.id,
        playlist_id: playlist.id,
        user_id: playlist.user_id,
        prompt,
        prompt_hash: promptHash,
        analysis_text: "",
        model: "gemini-2.5-flash",
        status: "skipped",
        skip_reason: "duration_exceeded",
      },
      { onConflict: "video_id,prompt_hash" },
    );

    return { triggered: false, reason: "duration_exceeded" };
  }

  // Check user quota
  const quotaCheck = await checkUserQuota(playlist.user_id);
  if (!quotaCheck.allowed) {
    // Create skipped analysis record
    const { createHash } = await import("crypto");
    const prompt = playlist.analysis_prompt || "Summarize the video";
    const promptHash = createHash("sha256").update(prompt).digest("hex");

    await supabase.from("video_analyses").upsert(
      {
        video_id: video.id,
        playlist_id: playlist.id,
        user_id: playlist.user_id,
        prompt,
        prompt_hash: promptHash,
        analysis_text: "",
        model: "gemini-2.5-flash",
        status: "skipped",
        skip_reason: quotaCheck.reason,
      },
      { onConflict: "video_id,prompt_hash" },
    );

    return { triggered: false, reason: quotaCheck.reason };
  }

  // Check if analysis already exists
  const { createHash } = await import("crypto");
  const prompt = playlist.analysis_prompt || "Summarize the video";
  const promptHash = createHash("sha256").update(prompt).digest("hex");

  const { data: existingAnalysis } = await supabase
    .from("video_analyses")
    .select("id, status")
    .eq("video_id", video.id)
    .eq("prompt_hash", promptHash)
    .maybeSingle();

  if (existingAnalysis && existingAnalysis.status !== "failed") {
    return { triggered: false };
  }

  // Create pending analysis record
  const { error: insertError } = await supabase.from("video_analyses").upsert(
    {
      video_id: video.id,
      playlist_id: playlist.id,
      user_id: playlist.user_id,
      prompt,
      prompt_hash: promptHash,
      analysis_text: "",
      model: "gemini-2.5-flash",
      status: "processing",
    },
    { onConflict: "video_id,prompt_hash" },
  );

  if (insertError) throw insertError;

  // Run analysis
  try {
    const { generateVideoAnalysis } = await import("~/lib/server/gemini");
    const videoUrl = `https://www.youtube.com/watch?v=${video.youtube_video_id}`;
    const result = await generateVideoAnalysis({ videoUrl, prompt });

    // Update with result
    await supabase
      .from("video_analyses")
      .update({
        analysis_text: result.text,
        model: result.model,
        status: "completed",
      })
      .eq("video_id", video.id)
      .eq("prompt_hash", promptHash);

    // Increment quota
    await incrementQuotaCount(playlist.user_id);

    return { triggered: true };
  } catch (analysisError) {
    const errorMessage =
      analysisError instanceof Error ? analysisError.message : String(analysisError);

    // Update with error
    await supabase
      .from("video_analyses")
      .update({
        status: "failed",
        error: errorMessage,
      })
      .eq("video_id", video.id)
      .eq("prompt_hash", promptHash);

    return { triggered: false };
  }
}

// Main sync function - called by cron job
export async function runPlaylistSync(options?: {
  userId?: string;
}): Promise<{
  success: boolean;
  playlistsSynced: number;
  totalVideosAdded: number;
  totalVideosRemoved: number;
  totalAnalysesTriggered: number;
  totalAnalysesSkipped: number;
  errors: string[];
}> {
  const supabase = getServiceClient();

  await writeSyncLog({ event: "sync.start", options });

  const result = {
    success: true,
    playlistsSynced: 0,
    totalVideosAdded: 0,
    totalVideosRemoved: 0,
    totalAnalysesTriggered: 0,
    totalAnalysesSkipped: 0,
    errors: [] as string[],
  };

  try {
    // Build query for active playlists
    let query = supabase
      .from("playlists")
      .select(
        `
        *,
        youtube_accounts!inner (
          id,
          access_token,
          refresh_token,
          expires_at
        )
      `,
      )
      .eq("entry_status", "active")
      .eq("is_active", true);

    // Filter by user if specified
    if (options?.userId) {
      query = query.eq("user_id", options.userId);
    }

    const { data: playlists, error: playlistsError } = await query;

    if (playlistsError) throw playlistsError;

    if (!playlists || playlists.length === 0) {
      await writeSyncLog({ event: "sync.complete", result: "no_playlists" });
      return result;
    }

    // Sync each playlist
    for (const playlistRow of playlists) {
      const playlist = playlistRow as Playlist & {
        youtube_accounts: {
          id: string;
          access_token: string;
          refresh_token: string;
          expires_at: string | null;
        };
      };

      // Check minimum sync interval
      if (playlist.last_synced_at) {
        const lastSyncTime = new Date(playlist.last_synced_at).getTime();
        if (Date.now() - lastSyncTime < MIN_SYNC_INTERVAL_MS) {
          await writeSyncLog({
            event: "sync.playlist.skipped",
            playlistId: playlist.id,
            reason: "too_soon",
          });
          continue;
        }
      }

      // Create sync log entry
      const logId = await createSyncLog(playlist.user_id, playlist.id);

      try {
        const syncResult = await syncSinglePlaylist(
          playlist,
          playlist.youtube_accounts,
        );

        result.playlistsSynced += 1;
        result.totalVideosAdded += syncResult.videosAdded;
        result.totalVideosRemoved += syncResult.videosRemoved;
        result.totalAnalysesTriggered += syncResult.analysesTriggered;
        result.totalAnalysesSkipped += syncResult.analysesSkipped;

        if (syncResult.error) {
          result.errors.push(`Playlist ${playlist.id}: ${syncResult.error}`);
        }

        // Update sync log
        await updateSyncLog(logId, {
          status: syncResult.error ? "failed" : "completed",
          videos_added: syncResult.videosAdded,
          videos_removed: syncResult.videosRemoved,
          analyses_triggered: syncResult.analysesTriggered,
          analyses_skipped: syncResult.analysesSkipped,
          error: syncResult.error,
        });

        await writeSyncLog({
          event: "sync.playlist.complete",
          playlistId: playlist.id,
          ...syncResult,
        });
      } catch (playlistError) {
        const errorMessage =
          playlistError instanceof Error
            ? playlistError.message
            : String(playlistError);

        result.errors.push(`Playlist ${playlist.id}: ${errorMessage}`);

        await updateSyncLog(logId, {
          status: "failed",
          error: errorMessage,
        });

        await writeSyncLog({
          event: "sync.playlist.error",
          playlistId: playlist.id,
          error: errorMessage,
        });
      }
    }

    if (result.errors.length > 0) {
      result.success = false;
    }

    await writeSyncLog({ event: "sync.complete", result });
    return result;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    result.success = false;
    result.errors.push(errorMessage);

    await writeSyncLog({ event: "sync.error", error: errorMessage });
    return result;
  }
}

// Verify sync API key
export function verifySyncApiKey(authHeader: string | null): boolean {
  const syncApiKey = getEnvValue("SYNC_API_KEY");
  if (!syncApiKey) {
    console.warn("SYNC_API_KEY not configured");
    return false;
  }

  if (!authHeader) return false;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;

  return token === syncApiKey;
}

