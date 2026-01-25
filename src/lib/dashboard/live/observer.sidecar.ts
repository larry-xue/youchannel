import { GoogleGenAI, Type } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
import { appendFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const suggestionTypeSchema = z.enum([
  "grammar",
  "vocabulary",
  "pronunciation",
  "fluency",
  "comprehension",
  "other",
]);

const suggestionSchema = z.object({
  type: suggestionTypeSchema,
  text: z.string().min(1).max(220),
  example: z.string().min(1).max(120).optional().nullable(),
  confidence: z.number().min(0).max(1),
});

const injectionSchema = z.object({
  text: z.string().min(1).max(600),
  priority: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1).max(160).optional().nullable(),
});

const audioChunkSchema = z.object({
  mimeType: z.string().min(1),
  data: z.string().min(1),
});

const turnSchema = z.object({
  assistantTranscript: z.string().min(1).max(2200),
  userAudioChunks: z.array(audioChunkSchema).min(1).max(120),
});

const sidecarRequestSchema = z.object({
  sessionId: z.string().min(1),
  uiLocale: z.string().min(2),
  summary: z.string().max(2000).optional().nullable(),
  turns: z.array(turnSchema).min(1).max(2),
  assistantName: z.string().max(120).optional().nullable(),
  assistantPrompt: z.string().max(2200).optional().nullable(),
});

const sidecarResponseSchema = z.object({
  transcript: z.string().min(1),
  suggestions: z.array(suggestionSchema).max(6),
  injection: injectionSchema.optional().nullable(),
  confidence: z.number().min(0).max(1),
  summary: z.string().min(1).max(2000),
});

export type LiveObserverSidecarResponse = z.infer<typeof sidecarResponseSchema>;

type SidecarContentPart = {
  text?: string;
  inlineData?: { mimeType: string; data: string };
};

type SidecarContentEntry = {
  role: "model" | "user";
  parts: SidecarContentPart[];
};

const logSidecar = (...args: unknown[]) => {
  console.debug("[ObserverSidecar][server]", ...args);
};

const observerContentsLogDir = path.resolve(process.cwd(), "logs");
const observerContentsLogFile = path.join(
  observerContentsLogDir,
  "observer-sidecar-contents.log",
);

const persistContentsLog = async (sessionId: string, contents: SidecarContentEntry[]) => {
  try {
    await mkdir(observerContentsLogDir, { recursive: true });
    const record = {
      timestamp: new Date().toISOString(),
      sessionId,
      contents,
    };
    await appendFile(observerContentsLogFile, `${JSON.stringify(record)}\n`);
  } catch (error) {
    console.error("[ObserverSidecar] Failed to persist contents log", error);
  }
};

const buildSidecarSystemInstruction = (data: z.infer<typeof sidecarRequestSchema>) => {
  const assistantName = data.assistantName?.trim() || "the assistant";
  const assistantPrompt =
    data.assistantPrompt?.trim() || "Use the existing assistant guidance.";
  const previousSummary = data.summary?.trim() ?? "";
  const summarySection = previousSummary
    ? `Conversation summary so far:
${previousSummary}`
    : "Conversation summary so far: (none)";

  return `You are a sidecar observer ("director") for a live voice conversation.

Use audio as the primary evidence for what the user actually said. The assistant
transcript provides context for what the assistant said.

Product goal: the assistant should feel like a friendly chat partner who quietly
helps the user improve (no classroom vibe). Keep the conversation flowing, help the
user speak more, and make the next step easy.

The conversation history is provided in the request contents:
- Each turn is: role "model" (assistant transcript) then role "user" (audio).
- The LAST role "user" audio message is the utterance you must transcribe.

Output MUST be strict JSON with this schema:
{
  "transcript": "string (your best corrected transcript of the user's latest speech)",
  "suggestions": [
    {
      "type": "grammar|vocabulary|pronunciation|fluency|comprehension|other",
      "text": "USER quick card in ${data.uiLocale}",
      "example": "optional short alt phrase in ${data.uiLocale} or null",
      "confidence": 0-1
    }
  ],
  "injection": null | {
    "text": "DIRECTOR_CUE for the assistant (structured, actionable)",
    "priority": "low|medium|high",
    "reason": "brief rationale in ${data.uiLocale} or null"
  },
  "confidence": 0-1,
  "summary": "string (updated summary after processing the provided turns)"
}

Rules:
- Do NOT add any extra keys. Strict JSON only.
- Keep user-facing strings in ${data.uiLocale} (suggestions + injection.reason).
- "suggestions" are USER-facing, immediate, speakable next steps (2-4 items max):
  1) "Quick reply" the user can say next (1 sentence, natural)
  2) "Upgrade" a more natural version of what they just tried to say
  3) A short follow-up question the user can ask
  4) A tiny micro-drill (one pattern), only if it won't disrupt flow
  Avoid generic advice. Prefer concrete phrases the user can actually say now.
- "injection" is the assistant DIRECTOR_CUE. Include it whenever it can meaningfully
  improve the next assistant reply. Keep it short, structured, and easy to follow.
  If no steering is needed, return "injection": null.
- Set injection.priority:
  - high: the next reply should significantly change (critical misunderstanding, wrong
    topic, user stuck, or a key correction that unlocks fluency)
  - medium: normal steering for personalization + flow
  - low: minor style/wording polish only
- DIRECTOR_CUE format (text) must be <= 6 short lines, keys in English:
  DIRECTOR_CUE
  GOAL=...
  LEVEL=...
  STYLE=...
  DO=...
  NEXT_Q=...
  (optional) AVOID=...
  Content after '=' can be in ${data.uiLocale} if helpful, but keep it concise.
- Update "summary" by merging the previous summary with the new turns. Keep it concise
  (<= 900 chars). Include 1-2 stable notes about the user's level/preferences and
  recurring focus areas so future turns can stay personalized.

Assistant name: ${assistantName}
Assistant guidance: ${assistantPrompt}

${summarySection}`;
};

export const runLiveObserverSidecarFn = createServerFn({ method: "POST" })
  .inputValidator((data) => sidecarRequestSchema.parse(data))
  .handler(async ({ data }): Promise<LiveObserverSidecarResponse> => {
    const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_LIVE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is not set on the server.");
    }

    logSidecar("request", {
      sessionId: data.sessionId,
      uiLocale: data.uiLocale,
      summaryLength: data.summary?.length ?? 0,
      turns: data.turns.length,
      audioChunks: data.turns.reduce((sum, turn) => sum + turn.userAudioChunks.length, 0),
      hasAssistantContext: Boolean(data.assistantPrompt || data.assistantName),
    });

    const systemInstruction = buildSidecarSystemInstruction(data);
    const contents: SidecarContentEntry[] = data.turns.flatMap((turn) => [
      { role: "model" as const, parts: [{ text: turn.assistantTranscript }] },
      {
        role: "user" as const,
        parts: turn.userAudioChunks.map((chunk) => ({
          inlineData: { mimeType: chunk.mimeType, data: chunk.data },
        })),
      },
    ]);
    await persistContentsLog(data.sessionId, contents);

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents,
      config: {
        responseMimeType: "application/json",
        systemInstruction,
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            transcript: { type: Type.STRING },
            suggestions: {
              type: Type.ARRAY,
              items: {
                type: Type.OBJECT,
                properties: {
                  type: {
                    type: Type.STRING,
                    enum: [
                      "grammar",
                      "vocabulary",
                      "pronunciation",
                      "fluency",
                      "comprehension",
                      "other",
                    ],
                  },
                  text: { type: Type.STRING },
                  example: { type: Type.STRING, nullable: true },
                  confidence: { type: Type.NUMBER },
                },
                required: ["type", "text", "confidence"],
              },
            },
            injection: {
              type: Type.OBJECT,
              nullable: true,
              properties: {
                text: { type: Type.STRING },
                priority: { type: Type.STRING, enum: ["low", "medium", "high"] },
                reason: { type: Type.STRING, nullable: true },
              },
              required: ["text", "priority"],
            },
            confidence: { type: Type.NUMBER },
            summary: { type: Type.STRING },
          },
          required: ["transcript", "suggestions", "confidence", "summary"],
        },
      },
    });
    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Observer sidecar returned empty output.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textOutput);
    } catch (error) {
      console.error("[ObserverSidecar] Failed to parse JSON", error);
      throw new Error("Observer sidecar returned invalid JSON.");
    }

    const validated = sidecarResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error(
        "[ObserverSidecar] Response validation failed",
        validated.error.flatten(),
      );
      throw new Error("Observer sidecar returned invalid response.");
    }

    logSidecar("response", {
      confidence: validated.data.confidence,
      suggestions: validated.data.suggestions.length,
      injection: Boolean(validated.data.injection?.text),
    });

    return validated.data;
  });
