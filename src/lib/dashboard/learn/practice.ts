import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { computeDrillKey } from "~/lib/dashboard/live/drillKey";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

type RecommendationCandidate = {
  drillKey: string;
  kind: "shadowing";
  language: string;
  targetText: string;
  title?: string;
  why?: string;
  tip?: string;
  sourceLiveSessionId: string;
};

type DrillStats = {
  bestOverall: number | null;
  emaOverall: number | null;
  lastOverall: number | null;
  lastAttemptAt: string | null;
  attemptedWithin24h: boolean;
};

export type PracticeRecommendation = RecommendationCandidate & {
  stats: DrillStats;
};

const getPracticeRecommendationsSchema = z.object({
  language: z.string().min(2).max(35),
  limit: z.number().min(1).max(10).default(5),
  sessionShownKeys: z.array(z.string().min(1).max(40)).max(50).default([]),
  dayShownKeys: z.array(z.string().min(1).max(40)).max(200).default([]),
});

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

const computeAttemptEma = (values: number[], alpha = 0.35): number | null => {
  if (values.length === 0) return null;
  let ema = values[0];
  for (let i = 1; i < values.length; i++) {
    ema = ema * (1 - alpha) + values[i] * alpha;
  }
  return ema;
};

const weightedSample = <T,>(items: Array<{ item: T; weight: number }>, count: number) => {
  const pool = items.filter((entry) => entry.weight > 0);
  const picked: T[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const total = pool.reduce((sum, entry) => sum + entry.weight, 0);
    if (total <= 0) break;
    let r = Math.random() * total;
    let idx = 0;
    for (; idx < pool.length; idx++) {
      r -= pool[idx].weight;
      if (r <= 0) break;
    }
    const chosen = pool.splice(Math.min(idx, pool.length - 1), 1)[0];
    picked.push(chosen.item);
  }

  return picked;
};

const normalizeAssessmentDrills = (input: unknown): Array<{
  language: string;
  drills: Array<{
    id?: string;
    kind?: string;
    title?: string;
    why?: string;
    tip?: string;
    target_text?: string;
  }>;
}> => {
  if (!Array.isArray(input)) return [];
  const result: Array<{
    language: string;
    drills: Array<{
      id?: string;
      kind?: string;
      title?: string;
      why?: string;
      tip?: string;
      target_text?: string;
    }>;
  }> = [];

  for (const entry of input) {
    if (!entry || typeof entry !== "object") continue;
    const record = entry as Record<string, unknown>;
    const language = typeof record.language === "string" ? record.language : null;
    const drills = Array.isArray(record.practice_drills)
      ? (record.practice_drills as Array<unknown>)
          .map((item) => (item && typeof item === "object" ? (item as Record<string, unknown>) : null))
          .filter(Boolean)
      : [];

    if (!language || drills.length === 0) continue;

    result.push({
      language,
      drills: drills.map((drill) => ({
        id: typeof drill.id === "string" ? drill.id : undefined,
        kind: typeof drill.kind === "string" ? drill.kind : undefined,
        title: typeof drill.title === "string" ? drill.title : undefined,
        why: typeof drill.why === "string" ? drill.why : undefined,
        tip: typeof drill.tip === "string" ? drill.tip : undefined,
        target_text: typeof drill.target_text === "string" ? drill.target_text : undefined,
      })),
    });
  }

  return result;
};

const isGoodTargetText = (value: string) => {
  const text = value.trim();
  if (text.length < 1 || text.length > 240) return false;
  if (/<noise>|\[noise\]/i.test(text)) return false;
  const wordCount = text.split(/\s+/).filter(Boolean).length;
  if (wordCount > 30) return false;
  return true;
};

type ParsedLanguageTag = {
  primary: string;
  script: string | null;
  region: string | null;
};

const parseLanguageTag = (value: string): ParsedLanguageTag => {
  const normalized = value.trim().replace(/_/g, "-");
  const parts = normalized.split("-").filter(Boolean);
  const primary = (parts[0] ?? "und").toLowerCase();

  let script: string | null = null;
  let region: string | null = null;

  for (const part of parts.slice(1)) {
    if (!script && /^[A-Za-z]{4}$/.test(part)) {
      script = part[0].toUpperCase() + part.slice(1).toLowerCase();
      continue;
    }
    if (!region && (/^[A-Za-z]{2}$/.test(part) || /^\d{3}$/.test(part))) {
      region = part.toUpperCase();
    }
  }

  return { primary, script, region };
};

const deriveChineseScriptFromRegion = (region: string | null) => {
  if (!region) return null;
  const hansRegions = new Set(["CN", "SG", "MY"]);
  const hantRegions = new Set(["TW", "HK", "MO"]);
  if (hansRegions.has(region)) return "Hans";
  if (hantRegions.has(region)) return "Hant";
  return null;
};

const isLanguageCompatible = (candidate: string, requested: string) => {
  const a = parseLanguageTag(candidate);
  const b = parseLanguageTag(requested);

  if (a.primary !== b.primary) return false;

  if (a.primary === "zh") {
    const scriptA = a.script ?? deriveChineseScriptFromRegion(a.region);
    const scriptB = b.script ?? deriveChineseScriptFromRegion(b.region);
    if (scriptA && scriptB) return scriptA === scriptB;
  }

  return true;
};

export const getPracticeRecommendationsFn = createServerFn({ method: "POST" })
  .inputValidator((data) => getPracticeRecommendationsSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase, user } = await getSupabaseAndUser();
    const since7d = new Date(Date.now() - 7 * ONE_DAY_MS).toISOString();
    const since90d = new Date(Date.now() - 90 * ONE_DAY_MS).toISOString();

    const { data: assessmentsRows, error: assessmentsError } = await supabase
      .from("live_session_assessments")
      .select("live_session_id, assessment")
      .gte("updated_at", since7d)
      .order("updated_at", { ascending: false })
      .limit(200);

    if (assessmentsError) {
      throw new Error(assessmentsError.message || "Failed to load assessments");
    }

    const candidatesByKey = new Map<string, RecommendationCandidate>();

    for (const row of assessmentsRows ?? []) {
      const liveSessionId = row.live_session_id;
      if (typeof liveSessionId !== "string") continue;

      const entries = normalizeAssessmentDrills(row.assessment);
      for (const entry of entries) {
        if (!isLanguageCompatible(entry.language, data.language)) continue;

        for (const drill of entry.drills) {
          if (drill.kind !== "shadowing") continue;
          if (!drill.target_text) continue;
          if (!isGoodTargetText(drill.target_text)) continue;

          const drillKey = computeDrillKey({
            language: entry.language,
            kind: "shadowing",
            targetText: drill.target_text,
          });

          if (candidatesByKey.has(drillKey)) continue;

          candidatesByKey.set(drillKey, {
            drillKey,
            kind: "shadowing",
            language: entry.language,
            targetText: drill.target_text.trim(),
            title: drill.title,
            why: drill.why,
            tip: drill.tip,
            sourceLiveSessionId: liveSessionId,
          });

          if (candidatesByKey.size >= 240) break;
        }

        if (candidatesByKey.size >= 240) break;
      }

      if (candidatesByKey.size >= 240) break;
    }

    const candidates = Array.from(candidatesByKey.values());
    if (candidates.length === 0) {
      return { drills: [] as PracticeRecommendation[] };
    }

    const drillKeys = candidates.map((candidate) => candidate.drillKey);
    const { data: attempts, error: attemptsError } = await supabase
      .from("shadowing_attempts")
      .select("drill_key, overall, created_at")
      .eq("user_id", user.id)
      .eq("language", data.language)
      .in("drill_key", drillKeys)
      .gte("created_at", since90d)
      .order("created_at", { ascending: true });

    if (attemptsError) {
      throw new Error(attemptsError.message || "Failed to load attempts");
    }

    const now = Date.now();
    const perKey = new Map<string, Array<{ overall: number; createdAt: string }>>();

    for (const row of attempts ?? []) {
      const drillKey = row.drill_key;
      const overall = row.overall;
      const createdAt = row.created_at;
      if (typeof drillKey !== "string") continue;
      if (!Number.isFinite(overall)) continue;
      if (typeof createdAt !== "string") continue;
      const list = perKey.get(drillKey) ?? [];
      list.push({ overall, createdAt });
      perKey.set(drillKey, list);
    }

    const buildStats = (drillKey: string): DrillStats => {
      const rows = perKey.get(drillKey) ?? [];
      if (rows.length === 0) {
        return {
          bestOverall: null,
          emaOverall: null,
          lastOverall: null,
          lastAttemptAt: null,
          attemptedWithin24h: false,
        };
      }

      let best = -Infinity;
      const values: number[] = [];
      for (const row of rows) {
        best = Math.max(best, row.overall);
        values.push(row.overall);
      }

      const last = rows[rows.length - 1];
      const lastAttemptAt = last?.createdAt ?? null;
      const attemptedWithin24h = lastAttemptAt
        ? now - new Date(lastAttemptAt).getTime() < ONE_DAY_MS
        : false;

      return {
        bestOverall: Number.isFinite(best) ? best : null,
        emaOverall: computeAttemptEma(values),
        lastOverall: last?.overall ?? null,
        lastAttemptAt,
        attemptedWithin24h,
      };
    };

    const sessionShown = new Set(data.sessionShownKeys);
    const dayShown = new Set(data.dayShownKeys);

    const scored = candidates.map((candidate) => {
      const stats = buildStats(candidate.drillKey);
      const ema = stats.emaOverall ?? stats.lastOverall ?? 50;
      const best = stats.bestOverall;

      let base = 100 - ema;
      if (typeof best === "number") {
        base += Math.max(0, best - ema) * 0.7;
      } else {
        base += 25;
      }

      const sessionPenalty = sessionShown.has(candidate.drillKey) ? 0.1 : 1;
      const dayPenalty =
        dayShown.has(candidate.drillKey) || stats.attemptedWithin24h ? 0.3 : 1;
      const weight = Math.max(0.01, base * sessionPenalty * dayPenalty);

      return { candidate: { ...candidate, stats }, weight };
    });

    scored.sort((a, b) => b.weight - a.weight);
    const topK = scored.slice(0, 30);
    const sampled = weightedSample(
      topK.map((entry) => ({ item: entry.candidate, weight: entry.weight })),
      data.limit,
    );

    return { drills: sampled };
  });

const getShadowingProgressSchema = z.object({
  language: z.string().min(2).max(35),
  days: z.number().min(7).max(365).default(30),
});

export type ShadowingProgressPoint = {
  date: string;
  avgOverall: number;
  count: number;
};

export type ShadowingProgressSummary = {
  language: string;
  bestOverall: number | null;
  lastOverall: number | null;
  lastAttemptAt: string | null;
  emaOverall: number | null;
  attemptsCount: number;
  series: ShadowingProgressPoint[];
  recentAttempts: Array<{
    id: string;
    drillKey: string;
    targetText: string;
    overall: number;
    createdAt: string;
  }>;
};

export const getShadowingProgressFn = createServerFn({ method: "POST" })
  .inputValidator((data) => getShadowingProgressSchema.parse(data))
  .handler(async ({ data }): Promise<ShadowingProgressSummary> => {
    const { supabase, user } = await getSupabaseAndUser();
    const since = new Date(Date.now() - data.days * ONE_DAY_MS).toISOString();

    const { data: seriesRows, error: seriesError } = await supabase
      .from("shadowing_attempts")
      .select("overall, created_at")
      .eq("user_id", user.id)
      .eq("language", data.language)
      .gte("created_at", since)
      .order("created_at", { ascending: true });

    if (seriesError) throw new Error(seriesError.message || "Failed to load progress");

    const values: number[] = [];
    const buckets = new Map<string, { sum: number; count: number }>();

    for (const row of seriesRows ?? []) {
      const overall = row.overall;
      const createdAt = row.created_at;
      if (!Number.isFinite(overall)) continue;
      if (typeof createdAt !== "string") continue;
      values.push(overall);
      const day = createdAt.slice(0, 10);
      const bucket = buckets.get(day) ?? { sum: 0, count: 0 };
      bucket.sum += overall;
      bucket.count += 1;
      buckets.set(day, bucket);
    }

    const series = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, bucket]) => ({
        date,
        avgOverall: bucket.count ? bucket.sum / bucket.count : 0,
        count: bucket.count,
      }));

    const emaOverall = computeAttemptEma(values);

    const { data: bestRow, error: bestError } = await supabase
      .from("shadowing_attempts")
      .select("overall")
      .eq("user_id", user.id)
      .eq("language", data.language)
      .order("overall", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (bestError) throw new Error(bestError.message || "Failed to load best score");

    const { data: lastRow, error: lastError } = await supabase
      .from("shadowing_attempts")
      .select("overall, created_at")
      .eq("user_id", user.id)
      .eq("language", data.language)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastError) throw new Error(lastError.message || "Failed to load last score");

    const { data: recentRows, error: recentError } = await supabase
      .from("shadowing_attempts")
      .select("id, drill_key, target_text, overall, created_at")
      .eq("user_id", user.id)
      .eq("language", data.language)
      .order("created_at", { ascending: false })
      .limit(12);

    if (recentError) throw new Error(recentError.message || "Failed to load attempts");

    const recentAttempts = (recentRows ?? []).filter(
      (row): row is {
        id: string;
        drill_key: string;
        target_text: string;
        overall: number;
        created_at: string;
      } =>
        typeof row.id === "string" &&
        typeof row.drill_key === "string" &&
        typeof row.target_text === "string" &&
        Number.isFinite(row.overall) &&
        typeof row.created_at === "string",
    );

    return {
      language: data.language,
      bestOverall: Number.isFinite(bestRow?.overall) ? bestRow?.overall : null,
      lastOverall: Number.isFinite(lastRow?.overall) ? lastRow?.overall : null,
      lastAttemptAt: typeof lastRow?.created_at === "string" ? lastRow.created_at : null,
      emaOverall,
      attemptsCount: values.length,
      series,
      recentAttempts: recentAttempts.map((row) => ({
        id: row.id,
        drillKey: row.drill_key,
        targetText: row.target_text,
        overall: row.overall,
        createdAt: row.created_at,
      })),
    };
  });
