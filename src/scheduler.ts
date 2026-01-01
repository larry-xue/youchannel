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

  const { data: playlists, error } = await supabase
    .from("playlists")
    .select("id, user_id, next_sync_at")
    .eq("entry_status", "active")
    .eq("is_active", true)
    .or(`next_sync_at.is.null,next_sync_at.lte.${nowIso}`);

  if (error) throw error;

  const duePlaylists = (playlists || []) as PlaylistRow[];
  if (duePlaylists.length === 0) {
    log("no due playlists");
    return;
  }

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

  if (insertError) throw insertError;

  const updates = duePlaylists.map((playlist) => ({
    id: playlist.id,
    next_sync_at: computeNextSyncAt(now),
  }));

  const { error: updateError } = await supabase
    .from("playlists")
    .upsert(updates, { onConflict: "id" });

  if (updateError) throw updateError;

  log("enqueued sync jobs", { count: jobs.length });
};

const tick = async () => {
  if (isRunning) {
    log("previous run still in progress, skipping");
    return;
  }

  isRunning = true;
  try {
    await enqueueDuePlaylists();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("run failed", { error: message });
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
  log("cron disabled, exiting");
  process.exit(0);
}

log("starting scheduler", { cronSchedule, cronTimezone });

void tick();

cron.schedule(
  cronSchedule,
  () => {
    void tick();
  },
  { timezone: cronTimezone },
);
