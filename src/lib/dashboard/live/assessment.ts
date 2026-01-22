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

const assessmentSchema = z.object({
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
});

export type LiveSessionAssessment = z.infer<typeof assessmentSchema>;

const assessLiveSessionSchema = z.object({
  liveSessionId: z.string().uuid(),
  resumptionHandle: z.string().min(1),
  uiLocale: z.string().min(1),
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

const buildAssessmentPrompt = (
  uiLocale: string,
  previousAssessment: LiveSessionAssessment | null,
) => {
  const previous = previousAssessment
    ? JSON.stringify(previousAssessment)
    : "null";

  return `You are a CEFR evaluator for spoken language. 
Evaluate the user's proficiency based ONLY on this Live session memory.

Return a JSON object with this exact schema (no extra keys, no markdown):
{
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
  "recommendations": ["..."]
}

Write summary/strengths/weaknesses/recommendations in ${uiLocale}.

If previous_assessment is provided, update it with new evidence and
override fields where needed.

previous_assessment: ${previous}`;
};

const parseJsonFromText = (text: string) => {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start >= 0 && end > start) {
    return JSON.parse(candidate.slice(start, end + 1));
  }
  return JSON.parse(candidate);
};

const formatAssessmentWithGemini = async (
  apiKey: string,
  rawText: string,
  uiLocale: string,
  previousAssessment: LiveSessionAssessment | null,
): Promise<LiveSessionAssessment> => {
  const ai = new GoogleGenAI({ apiKey });
  const previous = previousAssessment
    ? JSON.stringify(previousAssessment)
    : "null";

  const prompt = `Format the following CEFR assessment into strict JSON.
If the text is vague, infer the best structured output.

Target schema:
{
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
  "recommendations": ["..."]
}

Write summary/strengths/weaknesses/recommendations in ${uiLocale}.
previous_assessment: ${previous}

Raw assessment text:
${rawText}`;

  const interaction = await ai.interactions.create({
    model: FORMAT_MODEL,
    input: [{ type: "text", text: prompt }],
    response_format: {
      type: "object",
      properties: {
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
      },
      required: [
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
  return assessmentSchema.parse(parsed);
};

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

      const previousAssessment = previous?.assessment
        ? assessmentSchema.safeParse(previous.assessment).data ?? null
        : null;

      logAssessment("previous_assessment_loaded", {
        exists: Boolean(previousAssessment),
      });

      const prompt = buildAssessmentPrompt(data.uiLocale, previousAssessment);
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
        if (typeof (session as any).sendClientContent !== "function") {
          throw new Error("sendClientContent is not available on live session");
        }

        await (session as any).sendClientContent({
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

      let assessment: LiveSessionAssessment | null = null;
      const formattedBy: AssessmentResult["formattedBy"] = "gemini-3";


      if (!formatApiKey) {
        throw new Error(
          "GOOGLE_API_KEY is not set for assessment formatting.",
        );
      }

      logAssessment("original_output", { evaluationText })

      assessment = await formatAssessmentWithGemini(
        formatApiKey,
        evaluationText,
        data.uiLocale,
        previousAssessment,
      );

      const { error: upsertError } = await supabase
        .from("live_session_assessments")
        .upsert(
          {
            live_session_id: data.liveSessionId,
            assessment,
            model: FORMAT_MODEL,
          },
          { onConflict: "live_session_id" },
        );

      if (upsertError) {
        throw new Error(upsertError.message || "Failed to save assessment");
      }

      logAssessment("saved", {
        formattedBy,
        durationMs: Date.now() - startedAt,
      });

      return { assessment, formattedBy };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logAssessment("error", {
        message,
        durationMs: Date.now() - startedAt,
      });
      throw err;
    }
  });
