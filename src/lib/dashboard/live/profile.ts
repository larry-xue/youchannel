import { GoogleGenAI } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

export type LiveUserProfile = {
  currentVersion: number;
  onboardingCompletedAt: string | null;
  manualText: string;
  data: Record<string, unknown>;
  source: Record<string, unknown>;
  createdAt: string;
};

export const getLiveUserProfileFn = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ profile: LiveUserProfile | null }> => {
    const { supabase, user } = await getSupabaseAndUser();

    const { data: profileRow, error: profileError } = await supabase
      .from("live_user_profiles")
      .select("current_version,onboarding_completed_at")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profileError) {
      throw new Error(profileError.message || "Failed to load live profile");
    }

    const currentVersion =
      typeof profileRow?.current_version === "number" ? profileRow.current_version : 0;

    if (currentVersion <= 0) {
      return { profile: null };
    }

    const { data: versionRow, error: versionError } = await supabase
      .from("live_user_profile_versions")
      .select("version,manual_text,data,source,created_at")
      .eq("user_id", user.id)
      .eq("version", currentVersion)
      .single();

    if (versionError || !versionRow) {
      throw new Error(versionError?.message || "Failed to load live profile version");
    }

    return {
      profile: {
        currentVersion,
        onboardingCompletedAt: profileRow?.onboarding_completed_at ?? null,
        manualText: versionRow.manual_text as string,
        data: (versionRow.data as Record<string, unknown> | null) ?? {},
        source: (versionRow.source as Record<string, unknown> | null) ?? {},
        createdAt: versionRow.created_at as string,
      },
    };
  },
);

const createLiveUserProfileVersionSchema = z.object({
  manualText: z.string().min(1).max(20000),
  data: z.record(z.unknown()).optional().default({}),
  source: z.record(z.unknown()).optional().default({}),
});

const createLiveUserProfileVersionRpcSchema = z
  .array(
    z.object({
      version: z.number().int(),
    }),
  )
  .min(1);

export const createLiveUserProfileVersionFn = createServerFn({ method: "POST" })
  .inputValidator((data) => createLiveUserProfileVersionSchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await getSupabaseAndUser();

    const { data: rpcData, error } = await supabase.rpc(
      "create_live_user_profile_version",
      {
        p_manual_text: data.manualText,
        p_data: data.data,
        p_source: data.source,
      },
    );

    if (error) {
      throw new Error(error.message || "Failed to save live profile");
    }

    const parsed = createLiveUserProfileVersionRpcSchema.safeParse(rpcData);
    if (!parsed.success) {
      throw new Error("Unexpected response saving live profile");
    }

    return { version: parsed.data[0].version };
  });

const PROFILE_MODEL = "gemini-3-flash-preview";

const generateLiveUserProfileVersionSchema = z.object({
  uiLocale: z.string().min(1).max(35),
  deviceTimeZone: z.string().min(1).max(80),
  durationMs: z.number().int().min(0).max(120_000),
  audio: z.object({
    mimeType: z.string().min(4).max(50),
    data: z.string().min(16).max(10_000_000),
  }),
  geoStatus: z
    .enum(["idle", "requesting", "denied", "error", "granted"])
    .optional()
    .default("idle"),
  geo: z
    .object({
      lat: z.number().min(-90).max(90),
      lng: z.number().min(-180).max(180),
      accuracy_m: z.number().min(0).max(100000).nullable().optional(),
    })
    .nullable()
    .optional()
    .default(null),
});

const generatedProfileSchema = z
  .object({
    manual_text: z.string().min(1).max(20000),
    data: z.record(z.unknown()).optional().default({}),
    source: z.record(z.unknown()).optional().default({}),
  })
  .passthrough();

const getTextFromResponse = (response: unknown) => {
  const value = (response as { text?: unknown } | null)?.text;
  if (typeof value === "function") {
    const asFn = value as () => string;
    return asFn();
  }
  return typeof value === "string" ? value : "";
};

const roundNumber = (value: number, decimals: number) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stripCoordinateKeys = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    return value.map((item) => stripCoordinateKeys(item));
  }
  if (!isRecord(value)) return value;

  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (/^(lat|lng|latitude|longitude|coords|coordinates)$/i.test(key)) {
      continue;
    }
    output[key] = stripCoordinateKeys(child);
  }
  return output;
};

const toNullableString = (value: unknown): string | null => {
  if (typeof value === "string") return value;
  if (value === null) return null;
  return null;
};

export const generateLiveUserProfileVersionFn = createServerFn({ method: "POST" })
  .inputValidator((data) => generateLiveUserProfileVersionSchema.parse(data))
  .handler(async ({ data }): Promise<{ version: number }> => {
    const apiKey =
      process.env.GOOGLE_API_KEY ??
      process.env.GEMINI_API_KEY ??
      process.env.GOOGLE_LIVE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is not set on the server.");
    }

    const { supabase } = await getSupabaseAndUser();

    const geoPayload =
      data.geoStatus === "granted" && data.geo
        ? {
            lat: roundNumber(data.geo.lat, 3),
            lng: roundNumber(data.geo.lng, 3),
            accuracy_m: data.geo.accuracy_m ?? null,
          }
        : null;

    const prompt = `You are generating a user profile used as SYSTEM CONTEXT for a realtime voice conversation (Gemini Live).

Input:
- UI locale: ${data.uiLocale}
- Device time zone (IANA): ${data.deviceTimeZone}
- Optional approximate coordinates (rounded): ${geoPayload ? JSON.stringify(geoPayload) : "null"}

Tasks:
1) Transcribe the audio and infer the user's conversation preferences and learning goals.
2) If coordinates are provided, you MAY use the googleSearch tool to infer:
   country, region/state, city (best effort). If uncertain, use null.

Output STRICT JSON only (no markdown), with this shape:
{
  "manual_text": "string",
  "data": {
    "geo": {
      "country": "string|null",
      "region": "string|null",
      "city": "string|null"
    }
  },
  "source": {}
}

Rules:
- NEVER include raw coordinates in the output.
- Do NOT include the full transcript in the output.
- manual_text must be concise (max ~500 words) and written in English.
- Prefer stable preferences (topics, correction style, pacing, tone) and avoid PII.
`;

    const ai = new GoogleGenAI({ apiKey, httpOptions: { apiVersion: "v1alpha" } });
    const response = await ai.models.generateContent({
      model: PROFILE_MODEL,
      contents: [
        {
          role: "user",
          parts: [
            { text: prompt },
            { inlineData: { mimeType: data.audio.mimeType, data: data.audio.data } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        tools: geoPayload ? [{ googleSearch: {} }] : [],
      },
    });

    const responseText = getTextFromResponse(response);
    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(responseText);
    } catch (err) {
      console.error("[LiveProfile] Failed to parse Gemini JSON output", err);
      throw new Error("Failed to parse Gemini profile output");
    }

    const parsed = generatedProfileSchema.safeParse(parsedJson);
    if (!parsed.success) {
      console.error("[LiveProfile] Gemini profile validation failed", parsed.error.flatten());
      throw new Error("Failed to validate Gemini profile output");
    }

    const nowIso = new Date().toISOString();

    const sanitized = stripCoordinateKeys(parsed.data.data);
    const sanitizedData = isRecord(sanitized) ? sanitized : {};
    const modelGeo = isRecord(sanitizedData.geo) ? sanitizedData.geo : {};
    const country = toNullableString(modelGeo.country);
    const region = toNullableString(modelGeo.region);
    const city = toNullableString(modelGeo.city);

    const dataToSave: Record<string, unknown> = {
      ...sanitizedData,
      ui_locale: data.uiLocale,
      device_time_zone: data.deviceTimeZone,
    };

    if (data.geoStatus === "granted") {
      dataToSave.geo = {
        country,
        region,
        city,
        time_zone: data.deviceTimeZone,
        captured_at: nowIso,
      };
    } else if ("geo" in dataToSave) {
      delete dataToSave.geo;
    }

    const source: Record<string, unknown> = {
      ...parsed.data.source,
      model: PROFILE_MODEL,
      generated_at: nowIso,
      input_audio_ms: data.durationMs,
      geo_status: data.geoStatus,
    };

    const { data: rpcData, error } = await supabase.rpc(
      "create_live_user_profile_version",
      {
        p_manual_text: parsed.data.manual_text,
        p_data: dataToSave,
        p_source: source,
      },
    );

    if (error) {
      throw new Error(error.message || "Failed to save live profile");
    }

    const parsedRpc = createLiveUserProfileVersionRpcSchema.safeParse(rpcData);
    if (!parsedRpc.success) {
      throw new Error("Unexpected response saving live profile");
    }

    return { version: parsedRpc.data[0].version };
  });
