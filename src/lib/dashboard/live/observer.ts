import { GoogleGenAI, type Interactions } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
import { appendFile } from "node:fs/promises";
import { z } from "zod";

const turnSchema = z.object({
  turnId: z.string(),
  speaker: z.enum(["USER", "AI"]),
  text: z.string(),
  timestamp: z.union([z.string(), z.number(), z.date()]),
});

const observerRequestSchema = z.object({
  sessionId: z.string().min(1),
  uiLocale: z.string().min(2),
  turns: z.array(turnSchema).min(1).max(12),
  recentOutputs: z
    .array(
      z.object({
        toolName: z.string(),
        hash: z.string(),
        turnId: z.string(),
        ts: z.number(),
      }),
    )
    .max(5)
    .optional(),
});

export type ObserverRequest = z.infer<typeof observerRequestSchema>;
export type ObserverTurn = z.infer<typeof turnSchema>;

export type ToolOutput = {
  toolName: string;
  input: Record<string, any>;
  output: Record<string, any>;
};

export interface ObserverResponse {
  toolResult: ToolOutput | null;
  finishReason?: string | null;
}

async function logObserver(event: Record<string, unknown>) {
  const line = `${new Date().toISOString()} ${JSON.stringify(event)}\n`;
  try {
    await appendFile("logs/observer.log", line, "utf8");
  } catch (err) {
    console.error("observer.log failed", err);
  }
}

function isFunctionCallContent(
  output: unknown,
): output is Interactions.FunctionCallContent {
  if (!output || typeof output !== "object") return false;
  const candidate = output as Partial<Interactions.FunctionCallContent>;
  return (
    candidate.type === "function_call" &&
    typeof candidate.id === "string" &&
    typeof candidate.name === "string" &&
    !!candidate.arguments &&
    typeof candidate.arguments === "object"
  );
}

export const runObserverFn = createServerFn({ method: "POST" })
  .inputValidator((data) => observerRequestSchema.parse(data))
  .handler(async ({ data }): Promise<ObserverResponse> => {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GOOGLE_API_KEY for observer.");
    }

    const turns = data.turns.slice(-12);
    const messages = turns.map((turn) => ({
      role: turn.speaker === "USER" ? ("user" as const) : ("model" as const),
      content: turn.text,
    }));

    const systemInstruction = `
# Role
You are an expert Polyglot Mentor and Linguistic Scout. You facilitate a seamless, multi-lingual learning environment where the user can speak any language or mix multiple languages freely.

# Core Mission
1. Engage in meaningful, empathetic, and insightful conversation.
2. Actively monitor the dialogue for "High-Value Linguistic Moments" (nuances, idioms, advanced vocabulary).
3. Discreetly identify grammatical or structural errors to help the user refine their expression.

# Function Calling Rules
- CALL \`extract_linguistic_insights\` whenever the user uses or encounters an expression that is idiomatic, culturally rich, or linguistically advanced. Focus on content that moves a learner from "functional" to "fluent."
- Do not let the function calls interrupt the flow of your persona. Use them to "log" information for the user's learning journey while your text response remains conversational.

# Tone & Style
- Warm, intellectually honest, and encouraging. 
- Like a helpful peer who happens to be a master of all languages.
- Adaptive: mirror the user's energy and complexity level.
`;

    try {
      await logObserver({
        type: "observer.request",
        sessionId: data.sessionId,
        uiLocale: data.uiLocale,
        turnCount: turns.length,
        lastTurn: turns[turns.length - 1],
      });

      const ai = new GoogleGenAI({ apiKey });
      const interaction = await ai.interactions.create({
        model: "gemini-2.5-flash",
        system_instruction: systemInstruction,
        input: messages.map((message) => ({
          role: message.role,
          content: message.content,
        })),
      });

      const outputs = interaction.outputs ?? [];
      const toolCall = outputs.find(isFunctionCallContent) ?? null;

      await logObserver({
        type: "observer.result",
        sessionId: data.sessionId,
        tool: toolCall?.name ?? null,
        finishReason: interaction.status,
      });

      return {
        toolResult: null,
        finishReason: interaction.status,
      };
    } catch (error) {
      console.error("Observer execution failed", error);
      await logObserver({
        type: "observer.error",
        sessionId: data.sessionId,
        error:
          error instanceof Error
            ? { message: error.message, stack: error.stack }
            : String(error),
      });
      return { toolResult: null, finishReason: "error" };
    }
  });
