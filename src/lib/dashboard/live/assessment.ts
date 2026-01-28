import {
  GoogleGenAI,
  type Interactions,
  type LiveServerMessage,
  Modality,
} from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

const LIVE_MODEL = "gemini-2.5-flash-native-audio-preview-12-2025";
const FORMAT_MODEL = "gemini-3-flash-preview";
const TURN_TIMEOUT_MS = 20000;
const ASSESSMENT_VOICE = "Orus";

const formatHandleForLog = (handle: string) => {
  const suffix = handle.slice(-6);
  return `${handle.length}:${suffix}`;
};

const logAssessment = (...args: unknown[]) => {
  console.debug("[LiveAssessment]", ...args);
};

const cefrSchema = z.enum(["A1", "A2", "B1", "B2", "C1", "C2"]);

const bcp47Schema = z.string().min(2).max(35);

const practiceDrillSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.literal("shadowing"),
  title: z.string().min(1).max(80),
  why: z.string().min(1).max(200),
  target_text: z.string().min(1).max(300),
  source_user_quote: z.string().min(1).max(300).optional(),
  tip: z.string().min(1).max(160).optional(),
});

const assessmentEntrySchema = z.object({
  language: bcp47Schema,
  overall_cefr: cefrSchema,
  dimensions: z.object({
    pronunciation: cefrSchema,
    fluency: cefrSchema,
    grammar: cefrSchema,
    vocabulary: cefrSchema,
    comprehension: cefrSchema,
  }),
  confidence: z.number().min(0).max(1),
  summary: z.string(),
  strengths: z.array(z.string()).max(5),
  weaknesses: z.array(z.string()).max(5),
  recommendations: z.array(z.string()).max(5),
  practice_drills: z.array(practiceDrillSchema).max(10).optional(),
});

const assessmentArraySchema = z.array(assessmentEntrySchema);

export type LiveSessionAssessmentEntry = z.infer<typeof assessmentEntrySchema>;
export type LiveSessionAssessment = z.infer<typeof assessmentArraySchema>;

const assessLiveSessionSchema = z.object({
  liveSessionId: z.string().uuid(),
  resumptionHandle: z.string().min(1),
  uiLocale: z.string().min(1),
});

const liveSessionAssessmentQuerySchema = z.object({
  liveSessionId: z.string().uuid(),
});

type AssessmentResult = {
  assessment: LiveSessionAssessment;
  formattedBy: "live" | "gemini-3";
};

const createMessageQueue = () => {
  const queue: LiveServerMessage[] = [];
  let resolver: ((msg: LiveServerMessage) => void) | null = null;

  return {
    push(message: LiveServerMessage) {
      if (resolver) {
        const resolve = resolver;
        resolver = null;
        resolve(message);
        return;
      }
      queue.push(message);
    },
    next(): Promise<LiveServerMessage> {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      return new Promise((resolve) => {
        resolver = resolve;
      });
    },
  };
};

const extractTextFromMessage = (message: LiveServerMessage) => {
  const parts = message.serverContent?.modelTurn?.parts ?? [];
  for (const part of parts) {
    if (typeof (part as { text?: unknown }).text === "string") {
      return (part as { text: string }).text;
    }
  }

  const fallbackText = message.serverContent?.outputTranscription?.text;
  return typeof fallbackText === "string" ? fallbackText : null;
};

const nextWithTimeout = <T,>(promise: Promise<T>, timeoutMs: number) =>
  Promise.race([
    promise,
    new Promise<T>((_, reject) => {
      setTimeout(() => reject(new Error("Live response timeout")), timeoutMs);
    }),
  ]);

const collectTurnText = async (
  queue: ReturnType<typeof createMessageQueue>,
  timeoutMs: number,
) => {
  const textChunks: string[] = [];
  const start = Date.now();

  while (true) {
    const elapsed = Date.now() - start;
    const remaining = Math.max(timeoutMs - elapsed, 0);
    if (remaining === 0) {
      throw new Error("Live response timeout");
    }
    const message = await nextWithTimeout(queue.next(), remaining);
    const text = extractTextFromMessage(message);
    if (text) textChunks.push(text);
    if (message.serverContent?.turnComplete) {
      break;
    }
  }

  return textChunks.join("").trim();
};

const bcp47TagPattern = /^[A-Za-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/;

const normalizeLanguageTag = (value: string | null | undefined) => {
  if (!value) return "und";
  const normalized = value.trim().replace(/_/g, "-");
  if (!normalized || !bcp47TagPattern.test(normalized)) return "und";

  const parts = normalized.split("-");
  const [primary, ...rest] = parts;
  const normalizedParts = [
    primary.toLowerCase(),
    ...rest.map((part) => {
      if (part.length === 4) {
        return part[0].toUpperCase() + part.slice(1).toLowerCase();
      }
      if (part.length === 2 || /^\d{3}$/.test(part)) {
        return part.toUpperCase();
      }
      return part.toLowerCase();
    }),
  ];

  return normalizedParts.join("-");
};

const dedupeAssessments = (entries: LiveSessionAssessmentEntry[]) => {
  const byLanguage = new Map<string, LiveSessionAssessmentEntry>();
  const order: string[] = [];
  for (const entry of entries) {
    if (!byLanguage.has(entry.language)) {
      order.push(entry.language);
    }
    byLanguage.set(entry.language, entry);
  }
  return order.map((language) => byLanguage.get(language)!);
};

const normalizeAssessmentEntry = (
  candidate: unknown,
  fallbackLanguage: string,
): LiveSessionAssessmentEntry | null => {
  if (!candidate || typeof candidate !== "object") return null;
  const record = candidate as Record<string, unknown>;
  const rawLanguage =
    typeof record.language === "string"
      ? record.language
      : typeof record.lang === "string"
        ? record.lang
        : undefined;
  const language = normalizeLanguageTag(rawLanguage ?? fallbackLanguage);
  const parsed = assessmentEntrySchema.safeParse({ ...record, language });
  return parsed.success ? parsed.data : null;
};

const normalizeAssessmentArray = (
  input: unknown,
  fallbackLanguage = "und",
): LiveSessionAssessment => {
  const normalizedFallback = normalizeLanguageTag(fallbackLanguage);
  const normalize = (entry: unknown) =>
    normalizeAssessmentEntry(entry, normalizedFallback);

  let entries: LiveSessionAssessmentEntry[] = [];

  if (Array.isArray(input)) {
    entries = input
      .map((entry) => normalize(entry))
      .filter((entry): entry is LiveSessionAssessmentEntry => Boolean(entry));
  } else if (input && typeof input === "object") {
    const record = input as Record<string, unknown>;
    if (Array.isArray(record.assessments)) {
      entries = record.assessments
        .map((entry) => normalize(entry))
        .filter((entry): entry is LiveSessionAssessmentEntry => Boolean(entry));
    } else {
      const single = normalize(input);
      if (single) entries = [single];
    }
  } else {
    const single = normalize(input);
    if (single) entries = [single];
  }

  return assessmentArraySchema.parse(dedupeAssessments(entries));
};

const mergeAssessments = (
  previous: LiveSessionAssessment | null,
  next: LiveSessionAssessment,
) => {
  if (!previous || previous.length === 0) return next;
  if (next.length === 0) return previous;

  const nextByLanguage = new Map(
    next.map((entry) => [entry.language, entry] as const),
  );
  const merged: LiveSessionAssessmentEntry[] = [];
  const used = new Set<string>();

  for (const entry of previous) {
    const updated = nextByLanguage.get(entry.language);
    if (updated) {
      merged.push(updated);
      used.add(updated.language);
    } else {
      merged.push(entry);
      used.add(entry.language);
    }
  }

  for (const entry of next) {
    if (!used.has(entry.language)) {
      merged.push(entry);
      used.add(entry.language);
    }
  }

  return dedupeAssessments(merged);
};

const buildAssessmentPrompt = (
  uiLocale: string,
  previousAssessment: LiveSessionAssessment | null,
) => {
  const previous =
    previousAssessment && previousAssessment.length > 0
      ? JSON.stringify(previousAssessment)
      : "[]";

  return `The user had ended the live session. Now imagine you are a CEFR evaluator for spoken language.
Analyze ONLY the user's utterances in this Live session memory.

If the user uses multiple languages, return one report per language.
Use BCP-47 tags in "language" (e.g., en, en-US, zh-Hans).
Only include a language if there is sufficient user data in this session
to evaluate it. If insufficient, omit that language. If none qualify,
return [].

Return a JSON array (no extra keys, no markdown). Each item:
{
  "language": "BCP-47",
  "overall_cefr": "A1|A2|B1|B2|C1|C2",
  "dimensions": {
    "pronunciation": "A1|A2|B1|B2|C1|C2",
    "fluency": "A1|A2|B1|B2|C1|C2",
    "grammar": "A1|A2|B1|B2|C1|C2",
    "vocabulary": "A1|A2|B1|B2|C1|C2",
    "comprehension": "A1|A2|B1|B2|C1|C2"
  },
  "confidence": 0-1,
  "summary": "string",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommendations": ["..."],
  "practice_drills": [
    {
      "id": "shadow_1",
      "kind": "shadowing",
      "title": "string (ui locale)",
      "why": "string (ui locale)",
      "target_text": "string (target language)",
      "source_user_quote": "string (target language, optional)",
      "tip": "string (ui locale, optional)"
    }
  ]
}

Write summary/strengths/weaknesses/recommendations in ${uiLocale}.
For practice_drills:
- title/why/tip MUST be written in ${uiLocale}.
- target_text/source_user_quote MUST be in the same language as "language".
- Create 3-5 drills per language when possible.
- Keep target_text short and speakable (1 sentence, <= 20 words if possible).
- Use ids like "shadow_1", "shadow_2", ... unique per language entry.

If previous_assessment is provided, update the relevant language entries
with new evidence and override fields where needed.

previous_assessment: ${previous}`;
};

const formatAssessmentWithGemini = async (
  apiKey: string,
  rawText: string,
  uiLocale: string,
  previousAssessment: LiveSessionAssessment | null,
): Promise<LiveSessionAssessment> => {
  const ai = new GoogleGenAI({ apiKey });
  const previous =
    previousAssessment && previousAssessment.length > 0
      ? JSON.stringify(previousAssessment)
      : "[]";

  const prompt = `Format the following CEFR assessment into strict JSON.
If the text is vague, infer the best structured output.

Output must be a JSON object with a single key "assessments", whose value
is an array of assessment items. Each item must follow this schema:
{
  "language": "BCP-47",
  "overall_cefr": "A1|A2|B1|B2|C1|C2",
  "dimensions": {
    "pronunciation": "A1|A2|B1|B2|C1|C2",
    "fluency": "A1|A2|B1|B2|C1|C2",
    "grammar": "A1|A2|B1|B2|C1|C2",
    "vocabulary": "A1|A2|B1|B2|C1|C2",
    "comprehension": "A1|A2|B1|B2|C1|C2"
  },
  "confidence": 0-1,
  "summary": "string",
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommendations": ["..."],
  "practice_drills": [
    {
      "id": "shadow_1",
      "kind": "shadowing",
      "title": "string (ui locale)",
      "why": "string (ui locale)",
      "target_text": "string (target language)",
      "source_user_quote": "string (target language, optional)",
      "tip": "string (ui locale, optional)"
    }
  ]
}

If multiple languages are present, include multiple items.
Only include languages with sufficient evidence; if none, return [].

Write summary/strengths/weaknesses/recommendations in ${uiLocale}.
For practice_drills, enforce:
- title/why/tip in ${uiLocale}
- target_text/source_user_quote in the same language as "language"
previous_assessment: ${previous}

Raw assessment text:
${rawText}`;

  const interaction = await ai.interactions.create({
    model: FORMAT_MODEL,
    input: [{ type: "text", text: prompt }],
    response_format: {
      type: "object",
      properties: {
        assessments: {
          type: "array",
          items: {
            type: "object",
            properties: {
              language: { type: "string" },
              overall_cefr: {
                type: "string",
                enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
              },
              dimensions: {
                type: "object",
                properties: {
                  pronunciation: {
                    type: "string",
                    enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
                  },
                  fluency: {
                    type: "string",
                    enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
                  },
                  grammar: {
                    type: "string",
                    enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
                  },
                  vocabulary: {
                    type: "string",
                    enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
                  },
                  comprehension: {
                    type: "string",
                    enum: ["A1", "A2", "B1", "B2", "C1", "C2"],
                  },
                },
                required: [
                  "pronunciation",
                  "fluency",
                  "grammar",
                  "vocabulary",
                  "comprehension",
                ],
                additionalProperties: false,
              },
              confidence: { type: "number" },
              summary: { type: "string" },
              strengths: { type: "array", items: { type: "string" } },
              weaknesses: { type: "array", items: { type: "string" } },
              recommendations: { type: "array", items: { type: "string" } },
              practice_drills: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    id: { type: "string" },
                    kind: { type: "string", enum: ["shadowing"] },
                    title: { type: "string" },
                    why: { type: "string" },
                    target_text: { type: "string" },
                    source_user_quote: { type: "string" },
                    tip: { type: "string" },
                  },
                  required: ["id", "kind", "title", "why", "target_text"],
                  additionalProperties: false,
                },
              },
            },
            required: [
              "language",
              "overall_cefr",
              "dimensions",
              "confidence",
              "summary",
              "strengths",
              "weaknesses",
              "recommendations",
            ],
            additionalProperties: false,
          },
        },
      },
      required: ["assessments"],
      additionalProperties: false,
    },
    response_mime_type: "application/json",
  });

  const textOutput = interaction.outputs?.find(
    (output): output is Interactions.TextContent => {
      if (!output || typeof output !== "object") return false;
      const candidate = output as Partial<Interactions.TextContent>;
      return candidate.type === "text" && typeof candidate.text === "string";
    },
  );

  if (!textOutput?.text) {
    throw new Error("Gemini 3 returned no formatted assessment");
  }

  const parsed = JSON.parse(textOutput.text);
  return normalizeAssessmentArray(parsed, uiLocale);
};

export const getLiveSessionAssessmentFn = createServerFn({ method: "POST" })
  .inputValidator((data) => liveSessionAssessmentQuerySchema.parse(data))
  .handler(async ({ data }) => {
    const { supabase } = await getSupabaseAndUser();

    const { data: row, error } = await supabase
      .from("live_session_assessments")
      .select("assessment")
      .eq("live_session_id", data.liveSessionId)
      .maybeSingle();

    if (error) {
      throw new Error(error.message || "Failed to load assessment");
    }

    return {
      assessment: normalizeAssessmentArray(row?.assessment),
    };
  });

export const evaluateLiveSessionFn = createServerFn({ method: "POST" })
  .inputValidator((data) => assessLiveSessionSchema.parse(data))
  .handler(async ({ data }): Promise<AssessmentResult> => {
    const startedAt = Date.now();
    try {
      const { supabase } = await getSupabaseAndUser();
      const liveApiKey = process.env.GOOGLE_LIVE_API_KEY;
      const formatApiKey = process.env.GOOGLE_API_KEY ?? liveApiKey;

      if (!liveApiKey) {
        throw new Error("GOOGLE_LIVE_API_KEY is not set on the server.");
      }

      logAssessment("start", {
        liveSessionId: data.liveSessionId,
        handle: formatHandleForLog(data.resumptionHandle),
        uiLocale: data.uiLocale,
      });

      const { data: previous, error: previousError } = await supabase
        .from("live_session_assessments")
        .select("assessment")
        .eq("live_session_id", data.liveSessionId)
        .maybeSingle();

      if (previousError) {
        throw new Error(previousError.message || "Failed to load assessment");
      }

      const previousAssessment = normalizeAssessmentArray(
        previous?.assessment,
        data.uiLocale,
      );
      const previousForPrompt =
        previousAssessment.length > 0 ? previousAssessment : null;

      logAssessment("previous_assessment_loaded", {
        count: previousAssessment.length,
        languages: previousAssessment.map((entry) => entry.language),
      });

      const prompt = buildAssessmentPrompt(data.uiLocale, previousForPrompt);
      const messageQueue = createMessageQueue();

      let evaluationText = "";
      const ai = new GoogleGenAI({
        apiKey: liveApiKey,
        httpOptions: { apiVersion: "v1alpha" },
      });
      const session = await ai.live.connect({
        model: LIVE_MODEL,
        config: {
          responseModalities: [Modality.AUDIO],
          sessionResumption: { handle: data.resumptionHandle },
          speechConfig: {
            voiceConfig: {
              prebuiltVoiceConfig: { voiceName: ASSESSMENT_VOICE },
            },
          },
          outputAudioTranscription: {},
        },
        callbacks: {
          onopen: () => {
            logAssessment("live_connect_open");
          },
          onmessage: (message: LiveServerMessage) => {
            const resumptionUpdate = (message as {
              sessionResumptionUpdate?: {
                resumable?: boolean;
                newHandle?: string;
              };
            }).sessionResumptionUpdate;
            if (resumptionUpdate?.newHandle) {
              logAssessment("live_resumption_handle_update", {
                resumable: resumptionUpdate.resumable ?? false,
                handle: formatHandleForLog(resumptionUpdate.newHandle),
              });
            }
            messageQueue.push(message);
            if (message.serverContent?.turnComplete) {
              logAssessment("live_turn_complete");
            }
          },
          onerror: (error) => {
            console.error("[LiveAssessment] Live session error", error);
          },
          onclose: (event) => {
            console.warn("[LiveAssessment] Live session closed", event.reason);
          },
        },
      });

      try {
        type LiveSessionClientContent = {
          turns: Array<{
            role: string;
            parts: Array<{ text: string }>;
          }>;
          turnComplete: boolean;
        };
        type LiveSessionClient = {
          sendClientContent?: (content: LiveSessionClientContent) => Promise<unknown>;
        };

        const client = session as unknown as LiveSessionClient;
        if (typeof client.sendClientContent !== "function") {
          throw new Error("sendClientContent is not available on live session");
        }

        await client.sendClientContent({
          turns: [
            {
              role: "user",
              parts: [{ text: prompt }],
            },
          ],
          turnComplete: true,
        });

        logAssessment("prompt_sent", { length: prompt.length });
        evaluationText = await collectTurnText(messageQueue, TURN_TIMEOUT_MS);
        const preview = evaluationText.slice(0, 200);
        logAssessment("live_text_received", {
          length: evaluationText.length,
          preview,
        });
      } finally {
        session.close();
      }

      if (!formatApiKey) {
        throw new Error("GOOGLE_API_KEY is not set for assessment formatting.");
      }

      logAssessment("original_output", { evaluationText });

      const assessment = await formatAssessmentWithGemini(
        formatApiKey,
        evaluationText,
        data.uiLocale,
        previousForPrompt,
      );
      const formattedBy: AssessmentResult["formattedBy"] = "gemini-3";
      logAssessment("gemini3_assessment_parsed", {
        count: assessment.length,
        languages: assessment.map((entry) => entry.language),
      });

      const mergedAssessment = mergeAssessments(previousForPrompt, assessment);
      const model = formattedBy === "live" ? LIVE_MODEL : FORMAT_MODEL;

      const { error: upsertError } = await supabase
        .from("live_session_assessments")
        .upsert(
          {
            live_session_id: data.liveSessionId,
            assessment: mergedAssessment,
            model,
          },
          { onConflict: "live_session_id" },
        );

      if (upsertError) {
        throw new Error(upsertError.message || "Failed to save assessment");
      }

      logAssessment("saved", {
        formattedBy,
        languageCount: mergedAssessment.length,
        durationMs: Date.now() - startedAt,
      });

      return { assessment: mergedAssessment, formattedBy };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logAssessment("error", {
        message,
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }
  });
