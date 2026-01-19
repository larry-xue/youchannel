import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createServerFn } from "@tanstack/react-start";
import { stepCountIs, streamText, tool } from "ai";
import { appendFile } from "node:fs/promises";
import { z } from "zod";

const turnSchema = z.object({
  turnId: z.string(),
  speaker: z.enum(["USER", "AI"]),
  text: z.string(),
  timestamp: z.union([z.string(), z.number(), z.date()]),
});

const recentOutputSchema = z.object({
  toolName: z.enum(["showInsight", "showGrammarFix", "addTopicTerm"]),
  hash: z.string(),
  turnId: z.string(),
  ts: z.number(),
});

const observerRequestSchema = z.object({
  sessionId: z.string().min(1),
  uiLocale: z.string().min(2),
  turns: z.array(turnSchema).min(1).max(12),
  recentOutputs: z.array(recentOutputSchema).max(5).optional(),
});

export type ObserverRequest = z.infer<typeof observerRequestSchema>;
export type ObserverTurn = z.infer<typeof turnSchema>;

type ToolOutput =
  | {
    toolName: "showInsight";
    input: {
      term: string;
      context: string;
      meaning: string;
      equivalent?: string | null;
      examples?: Array<{ text: string; explanation?: string | null }>;
      turnId: string;
    };
    output: {
      term: string;
      context: string;
      meaning: string;
      equivalent?: string | null;
      examples?: Array<{ text: string; explanation?: string | null }>;
      turnId: string;
    };
  }
  | {
    toolName: "showGrammarFix";
    input: {
      original: string;
      suggested: string;
      reasoning: string;
      severity: "MINOR" | "MEANING" | "POLITENESS";
      turnId: string;
    };
    output: {
      original: string;
      suggested: string;
      reasoning: string;
      severity: "MINOR" | "MEANING" | "POLITENESS";
      turnId: string;
    };
  }
  | {
    toolName: "addTopicTerm";
    input: {
      term: string;
      translation?: string | null;
      domain?: string | null;
      turnId: string;
    };
    output: {
      term: string;
      translation?: string | null;
      domain?: string | null;
      turnId: string;
    };
  };

export interface ObserverResponse {
  toolResult: ToolOutput | null;
  finishReason?: string | null;
}

const truncate = (value: string, max: number) =>
  value.length > max ? value.slice(0, max) : value;

async function logObserver(event: Record<string, unknown>) {
  const line = `${new Date().toISOString()} ${JSON.stringify(event)}\n`;
  try {
    await appendFile("logs/observer.log", line, "utf8");
  } catch (err) {
    console.error("observer.log failed", err);
  }
}

const tools = {
  showInsight: tool({
    description:
      "Share cultural/idiom/pragmatics insight for learners. Preserve quoted text; explanations must use uiLocale.",
    inputSchema: z.object({
      term: z.string().min(1).max(80),
      context: z.string().min(1).max(200),
      meaning: z.string().min(1).max(200),
      equivalent: z.string().max(80).optional(),
      examples: z
        .array(
          z.object({
            text: z.string().min(1).max(200),
            explanation: z.string().max(200).optional(),
          }),
        )
        .max(2)
        .optional(),
      turnId: z.string(),
    }),
    execute: async (input) => ({
      ...input,
      term: truncate(input.term, 80),
      context: truncate(input.context, 200),
      meaning: truncate(input.meaning, 200),
      equivalent: input.equivalent ? truncate(input.equivalent, 80) : undefined,
      examples: input.examples?.map((ex) => ({
        text: truncate(ex.text, 200),
        explanation: ex.explanation ? truncate(ex.explanation, 200) : undefined,
      })),
    }),
  }),
  showGrammarFix: tool({
    description:
      "Polish or fix a sentence. Keep suggested language aligned with source per rules. Explanations use uiLocale.",
    inputSchema: z.object({
      original: z.string().min(1).max(200),
      suggested: z.string().min(1).max(200),
      reasoning: z.string().min(1).max(200),
      severity: z.enum(["MINOR", "MEANING", "POLITENESS"]),
      turnId: z.string(),
    }),
    execute: async (input) => ({
      ...input,
      original: truncate(input.original, 200),
      suggested: truncate(input.suggested, 200),
      reasoning: truncate(input.reasoning, 200),
    }),
  }),
  addTopicTerm: tool({
    description:
      "Track key topic term. Keep term as-is. Use uiLocale for translation/domain.",
    inputSchema: z.object({
      term: z.string().min(1).max(80),
      translation: z.string().max(80).optional(),
      domain: z.string().max(40).optional(),
      turnId: z.string(),
    }),
    execute: async (input) => ({
      ...input,
      term: truncate(input.term, 80),
      translation: input.translation
        ? truncate(input.translation, 80)
        : undefined,
      domain: input.domain ? truncate(input.domain, 40) : undefined,
    }),
  }),
};

export const runObserverFn = createServerFn({ method: "POST" })
  .inputValidator((data) => observerRequestSchema.parse(data))
  .handler(async ({ data }): Promise<ObserverResponse> => {
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GOOGLE_API_KEY for observer.");
    }

    const google = createGoogleGenerativeAI({ apiKey });
    const model = google("gemini-3-flash-preview");

    const turns = data.turns.slice(-12);
    const messages = turns.map((turn) => ({
      role: turn.speaker === "USER" ? ("user" as const) : ("assistant" as const),
      content: turn.text,
    }));

    const system = [
      "You are Observer Agent: side-channel language coach for learners.",
      "ASR text may contain recognition errors. First infer the likely intended wording before deciding on a tool.",
      "If you find ANY cultural/idiom/pragmatic note, grammar/politeness issue, or key topic term, you MUST call exactly one tool.",
      "Only skip tools when absolutely no actionable learning value exists.",
      "Respect input code-switching; do not force a target language.",
      "All explanation fields must use uiLocale strictly; keep quoted originals unchanged.",
      `uiLocale: ${data.uiLocale}`,
      "Choose exactly one of: showInsight | showGrammarFix | addTopicTerm.",
      "Grammar fix suggestions must follow language consistency rules from the spec (stay in the source language or maintain code-switch).",
    ].join("\n");

    try {
      await logObserver({
        type: "observer.request",
        sessionId: data.sessionId,
        uiLocale: data.uiLocale,
        turnCount: turns.length,
        lastTurn: turns[turns.length - 1],
      });

      const result = streamText({
        model,
        system,
        messages,
        tools,
        toolChoice: "required",
        maxRetries: 0,
        providerOptions: {
          google: {
            thinkingBudget: 1024,
          }
        },
        stopWhen: stepCountIs(1),
      });

      const toolResults = await result.toolResults;
      const first = (toolResults?.[0] ?? null) as ToolOutput | null;

      await logObserver({
        type: "observer.result",
        sessionId: data.sessionId,
        tool: first?.toolName ?? null,
        finishReason: await result.finishReason,
      });

      return {
        toolResult: first,
        finishReason: await result.finishReason,
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
