import { randomUUID } from "crypto";
import { createClient } from "@supabase/supabase-js";

type JobStatus = "queued" | "running" | "succeeded" | "dead";
type JobType = "sync_playlist" | "analyze_video";

type JobRow = {
  id: number;
  type: JobType;
  user_id: string | null;
  payload: Record<string, unknown>;
  status: JobStatus;
  priority: number;
  run_after: string;
  attempts: number;
  max_attempts: number;
  last_error: string | null;
  last_error_at: string | null;
  locked_by: string | null;
  locked_at: string | null;
  lease_until: string | null;
  dedupe_key: string | null;
  created_at: string;
  updated_at: string;
};

const getEnvValue = (key: string) => {
  const metaEnv = (import.meta as { env?: Record<string, string | undefined> }).env;
  return process.env[key] ?? metaEnv?.[key];
};

const supabaseUrl = getEnvValue("SUPABASE_URL") ?? getEnvValue("VITE_SUPABASE_URL");
const serviceRoleKey = getEnvValue("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl) throw new Error("Missing SUPABASE_URL");
if (!serviceRoleKey) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(supabaseUrl, serviceRoleKey);

const workerId =
  getEnvValue("WORKER_ID") ||
  process.env.FLY_MACHINE_ID ||
  `worker-${randomUUID()}`;

const pollIntervalRaw = Number.parseInt(
  getEnvValue("JOBS_POLL_INTERVAL_MS") || "5000",
  10,
);
const leaseSecondsRaw = Number.parseInt(
  getEnvValue("JOBS_LEASE_SECONDS") || "300",
  10,
);
const retryDelayRaw = Number.parseInt(
  getEnvValue("JOBS_RETRY_DELAY_SECONDS") || "60",
  10,
);
const pollIntervalMs = Number.isFinite(pollIntervalRaw) && pollIntervalRaw > 0
  ? pollIntervalRaw
  : 5000;
const leaseSeconds = Number.isFinite(leaseSecondsRaw) && leaseSecondsRaw > 0
  ? leaseSecondsRaw
  : 300;
const retryDelaySeconds = Number.isFinite(retryDelayRaw) && retryDelayRaw >= 0
  ? retryDelayRaw
  : 60;
const jobTypes = (getEnvValue("JOBS_TYPES") || "sync_playlist")
  .split(",")
  .map((entry) => entry.trim())
  .filter(Boolean);

const log = (message: string, details?: Record<string, unknown>) => {
  if (details) {
    console.log(`[worker] ${message}`, details);
    return;
  }
  console.log(`[worker] ${message}`);
};

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const claimJob = async () => {
  try {
    const { data, error } = await supabase.rpc("claim_job", {
      p_lock_id: workerId,
      p_job_types: jobTypes.length > 0 ? jobTypes : null,
      p_lease_seconds: leaseSeconds,
    });

    if (error) {
      log("获取任务失败", { error: error.message });
      throw error;
    }

    if (!data) return null;
    const rows = Array.isArray(data) ? data : [data];
    return (rows[0] as JobRow) || null;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("claimJob 异常", { error: message });
    throw error;
  }
};

const markJobSucceeded = async (jobId: number) => {
  const { error } = await supabase
    .from("jobs")
    .update({
      status: "succeeded",
      locked_by: null,
      locked_at: null,
      lease_until: null,
      dedupe_key: null,
      last_error: null,
      last_error_at: null,
    })
    .eq("id", jobId);

  if (error) throw error;
};

const markJobFailed = async (job: JobRow, message: string) => {
  const attempts = job.attempts;
  const maxAttempts = job.max_attempts;
  const isDead = attempts >= maxAttempts;
  const nextRunAt = new Date(Date.now() + retryDelaySeconds * 1000).toISOString();

  const { error } = await supabase
    .from("jobs")
    .update({
      status: isDead ? "dead" : "queued",
      run_after: isDead ? job.run_after : nextRunAt,
      locked_by: null,
      locked_at: null,
      lease_until: null,
      last_error: message,
      last_error_at: new Date().toISOString(),
      dedupe_key: isDead ? null : job.dedupe_key,
    })
    .eq("id", job.id);

  if (error) throw error;
};

const processJob = async (job: JobRow) => {
  if (job.type === "sync_playlist") {
    const playlistId = job.payload?.playlistId as string | undefined;
    log("处理 sync_playlist 任务", {
      jobId: job.id,
      playlistId,
      userId: job.user_id,
    });

    try {
      // Import and run sync for specific playlist
      const { runPlaylistSync } = await import("./lib/server/sync");

      // If playlistId is provided, we need to sync only that playlist
      // For now, we'll sync all playlists for the user (or all if no userId)
      const result = await runPlaylistSync({
        userId: job.user_id || undefined,
      });

      log("sync_playlist 任务完成", {
        jobId: job.id,
        playlistId,
        success: result.success,
        playlistsSynced: result.playlistsSynced,
        videosAdded: result.totalVideosAdded,
        videosRemoved: result.totalVideosRemoved,
        errors: result.errors.length > 0 ? result.errors : undefined,
      });

      if (!result.success && result.errors.length > 0) {
        throw new Error(result.errors.join("; "));
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      log("sync_playlist 任务失败", {
        jobId: job.id,
        playlistId,
        error: errorMessage,
      });
      throw error;
    }
  } else {
    log("未知任务类型", { jobId: job.id, type: job.type });
    throw new Error(`Unknown job type: ${job.type}`);
  }

  await markJobSucceeded(job.id);
};

let shouldStop = false;

const shutdown = (signal: string) => {
  log("shutting down", { signal });
  shouldStop = true;
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

const run = async () => {
  log("Worker 启动", { workerId, jobTypes, pollIntervalMs, leaseSeconds });

  while (!shouldStop) {
    let activeJob: JobRow | null = null;
    try {
      activeJob = await claimJob();
      if (!activeJob) {
        await sleep(pollIntervalMs);
        continue;
      }

      log("获取到任务", {
        jobId: activeJob.id,
        type: activeJob.type,
        attempts: activeJob.attempts,
        maxAttempts: activeJob.max_attempts,
      });

      await processJob(activeJob);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log("任务处理失败", {
        error: message,
        jobId: activeJob?.id,
        jobType: activeJob?.type,
      });

      if (activeJob) {
        try {
          await markJobFailed(activeJob, message);
          log("任务标记为失败", {
            jobId: activeJob.id,
            attempts: activeJob.attempts + 1,
            maxAttempts: activeJob.max_attempts,
          });
        } catch (updateError) {
          const updateMessage =
            updateError instanceof Error ? updateError.message : String(updateError);
          log("更新任务状态失败", {
            jobId: activeJob.id,
            error: updateMessage,
          });
        }
      }

      await sleep(pollIntervalMs);
    }
  }

  log("Worker 已停止");
};

void run().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  log("fatal worker error", { error: message });
  process.exit(1);
});
