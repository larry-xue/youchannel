import { GoogleGenAI, type Interactions } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
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
  text: z.string().min(1).max(220),
  priority: z.enum(["low", "medium", "high"]),
  reason: z.string().min(1).max(160).optional().nullable(),
});

const sidecarRequestSchema = z.object({
  sessionId: z.string().min(1),
  uiLocale: z.string().min(2),
  transcript: z.string().min(1).max(4000),
  latestUserUtterance: z.string().max(800).optional().nullable(),
  personaName: z.string().max(120).optional().nullable(),
  personaPrompt: z.string().max(2200).optional().nullable(),
  audioChunks: z
    .array(
      z.object({
        mimeType: z.string().min(1),
        data: z.string().min(1),
      }),
    )
    .max(120)
    .optional(),
});

const sidecarResponseSchema = z.object({
  transcript: z.string().min(1),
  suggestions: z.array(suggestionSchema).max(6),
  injection: injectionSchema.optional().nullable(),
  confidence: z.number().min(0).max(1),
});

export type LiveObserverSidecarResponse = z.infer<typeof sidecarResponseSchema>;

const logSidecar = (...args: unknown[]) => {
  console.debug("[ObserverSidecar][server]", ...args);
};

const buildSidecarPrompt = (data: z.infer<typeof sidecarRequestSchema>) => {
  const personaName = data.personaName?.trim() || "the assistant";
  const personaPrompt = data.personaPrompt?.trim() || "Use the existing persona.";
  const latestUserUtterance =
    data.latestUserUtterance?.trim() || "No explicit latest utterance provided.";

  return `You are a sidecar observer for a live voice conversation.

Use audio as the primary evidence for what the user actually said. The transcript
may contain ASR errors. Your job is to provide concise language-learning guidance
for the USER, plus an optional prompt injection to guide the assistant.

Output MUST be strict JSON with this schema:
{
  "transcript": "string (your best corrected transcript of the user's latest speech)",
  "suggestions": [
    {
      "type": "grammar|vocabulary|pronunciation|fluency|comprehension|other",
      "text": "short guidance in ${data.uiLocale}",
      "example": "short example in ${data.uiLocale} or null",
      "confidence": 0-1
    }
  ],
  "injection": null | {
    "text": "short assistant-guidance prompt in ${data.uiLocale}",
    "priority": "low|medium|high",
    "reason": "short rationale in ${data.uiLocale} or null"
  },
  "confidence": 0-1
}

Rules:
- Do NOT add any extra keys.
- Suggestions: 1-4 items max, only if meaningful. Use "other" sparingly.
- Use audio to correct the transcript if needed.
- Keep all user-facing strings in ${data.uiLocale}.
- The injection should be short, actionable, and align with the persona.
- If no injection is needed, return "injection": null.

Persona name: ${personaName}
Persona guidance: ${personaPrompt}

Conversation transcript (most recent first is not guaranteed):
${data.transcript}

Latest user utterance (if available):
${latestUserUtterance}`;
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
      transcriptLength: data.transcript.length,
      audioChunks: data.audioChunks?.length ?? 0,
      hasPersona: Boolean(data.personaPrompt || data.personaName),
    });

    const prompt = buildSidecarPrompt(data);
    const audioChunks = data.audioChunks ?? [];
    const contents: Array<Interactions.Content> = [
      ...audioChunks.map((chunk) => ({
        type: "audio" as const,
        data: chunk.data,
        mime_type: chunk.mimeType,
      })),
      { type: "text" as const, text: prompt },
    ];

    const ai = new GoogleGenAI({ apiKey });
    const interaction = await ai.interactions.create({
      model: "gemini-3-flash-preview",
      input: contents,
      response_format: {
        type: "object",
        properties: {
          transcript: { type: "string" },
          suggestions: {
            type: "array",
            items: {
              type: "object",
              properties: {
                type: {
                  type: "string",
                  enum: [
                    "grammar",
                    "vocabulary",
                    "pronunciation",
                    "fluency",
                    "comprehension",
                    "other",
                  ],
                },
                text: { type: "string" },
                example: { type: ["string", "null"] },
                confidence: { type: "number" },
              },
              required: ["type", "text", "confidence"],
              additionalProperties: false,
            },
          },
          injection: {
            type: ["object", "null"],
            properties: {
              text: { type: "string" },
              priority: { type: "string", enum: ["low", "medium", "high"] },
              reason: { type: ["string", "null"] },
            },
            required: ["text", "priority"],
            additionalProperties: false,
          },
          confidence: { type: "number" },
        },
        required: ["transcript", "suggestions", "confidence"],
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
      throw new Error("Observer sidecar returned empty output.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textOutput.text);
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
