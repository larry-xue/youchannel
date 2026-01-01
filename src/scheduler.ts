/**
 * Scheduler 进程 - 纯 Node.js 进程
 *
 * 注意：此文件是独立的 Node.js 进程，不使用 Vite 构建。
 * - 不能使用 Vite 路径别名（如 ~/），必须使用相对路径
 * - 动态导入必须使用相对路径并包含 .js 扩展名（ESM 要求）
 * - 使用 TypeScript 编译器 + tsc-alias 构建
 */
import cron from "node-cron";
import { createClient } from "@supabase/supabase-js";

type PlaylistRow = {
  id: string;
  user_id: string;
  next_sync_at: string | null;
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

const cronSchedule = getEnvValue("SYNC_CRON_SCHEDULE") || "*/1 * * * *";
const cronTimezone = getEnvValue("SYNC_CRON_TIMEZONE") || "UTC";
const cronEnabled = (getEnvValue("SYNC_CRON_ENABLED") || "true") !== "false";

const intervalMinutesRaw = Number.parseInt(
  getEnvValue("SYNC_INTERVAL_MINUTES") || "20",
  10,
);
const jitterSecondsRaw = Number.parseInt(
  getEnvValue("SYNC_JITTER_SECONDS") || "120",
  10,
);
const intervalMinutes = Number.isFinite(intervalMinutesRaw) && intervalMinutesRaw > 0
  ? intervalMinutesRaw
  : 20;
const jitterSeconds = Number.isFinite(jitterSecondsRaw) && jitterSecondsRaw >= 0
  ? jitterSecondsRaw
  : 0;

let isRunning = false;

const computeNextSyncAt = (baseTime: Date) => {
  const baseMs = intervalMinutes * 60 * 1000;
  const jitterMs = jitterSeconds ? Math.floor(Math.random() * jitterSeconds * 1000) : 0;
  return new Date(baseTime.getTime() + baseMs + jitterMs).toISOString();
};

const log = (message: string, details?: Record<string, unknown>) => {
  if (details) {
    console.log(`[scheduler] ${message}`, details);
    return;
  }
  console.log(`[scheduler] ${message}`);
};

const enqueueDuePlaylists = async () => {
  const now = new Date();
  const nowIso = now.toISOString();

  log("检查需要同步的播放列表", { now: nowIso });

  const { data: playlists, error } = await supabase
    .from("playlists")
    .select("id, user_id, next_sync_at")
    .eq("entry_status", "active")
    .eq("is_active", true)
    .or(`next_sync_at.is.null,next_sync_at.lte.${nowIso}`);

  if (error) {
    log("查询播放列表失败", { error: error.message });
    throw error;
  }

  const duePlaylists = (playlists || []) as PlaylistRow[];
  if (duePlaylists.length === 0) {
    log("没有需要同步的播放列表");
    return;
  }

  log("找到需要同步的播放列表", {
    count: duePlaylists.length,
    playlistIds: duePlaylists.map((p) => p.id),
  });

  const jobs = duePlaylists.map((playlist) => ({
    type: "sync_playlist",
    user_id: playlist.user_id,
    payload: { playlistId: playlist.id },
    run_after: nowIso,
    status: "queued",
    dedupe_key: `sync_playlist:${playlist.id}`,
  }));

  const { error: insertError } = await supabase
    .from("jobs")
    .upsert(jobs, { onConflict: "dedupe_key", ignoreDuplicates: true });

  if (insertError) {
    log("插入任务失败", { error: insertError.message });
    throw insertError;
  }

  const updates = duePlaylists.map((playlist) => {
    const nextSyncAt = computeNextSyncAt(now);
    return {
      id: playlist.id,
      next_sync_at: nextSyncAt,
    };
  });

  const { error: updateError } = await supabase
    .from("playlists")
    .upsert(updates, { onConflict: "id" });

  if (updateError) {
    log("更新播放列表 next_sync_at 失败", { error: updateError.message });
    throw updateError;
  }

  log("任务已加入队列", {
    count: jobs.length,
    nextSyncTimes: updates.map((u) => ({
      playlistId: u.id,
      nextSyncAt: u.next_sync_at,
    })),
  });
};

const tick = async () => {
  if (isRunning) {
    log("上一次运行仍在进行中，跳过本次执行");
    return;
  }

  isRunning = true;
  const startTime = Date.now();
  log("开始调度器 tick");

  try {
    await enqueueDuePlaylists();
    const duration = Date.now() - startTime;
    log("调度器 tick 完成", { duration: `${duration}ms` });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const duration = Date.now() - startTime;
    log("调度器 tick 失败", { error: message, duration: `${duration}ms` });
  } finally {
    isRunning = false;
  }
};

const shutdown = (signal: string) => {
  log("shutting down", { signal });
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

if (!cronEnabled) {
  log("Cron 已禁用，退出");
  process.exit(0);
}

log("启动调度器", {
  cronSchedule,
  cronTimezone,
  intervalMinutes,
  jitterSeconds,
});

void tick();

cron.schedule(
  cronSchedule,
  () => {
    log("Cron 触发");
    void tick();
  },
  { timezone: cronTimezone },
);
