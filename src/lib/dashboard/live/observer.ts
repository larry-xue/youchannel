import { createServerFn } from "@tanstack/react-start";
import { appendFile } from "node:fs/promises";
import { z } from "zod";
import { defineTool, runAgent, truncate } from "~/lib/gemini/agent";

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

async function logObserver(event: Record<string, unknown>) {
  const line = `${new Date().toISOString()} ${JSON.stringify(event)}\n`;
  try {
    await appendFile("logs/observer.log", line, "utf8");
  } catch (err) {
    console.error("observer.log failed", err);
  }
}

// Define tools using the new agent SDK
const tools = {
  showInsight: defineTool("showInsight", {
    description:
      "Share cultural/idiom/pragmatics insight for learners. Preserve quoted text; explanations must use uiLocale.",
    parameters: z.object({
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

  showGrammarFix: defineTool("showGrammarFix", {
    description:
      "Polish or fix a sentence. Keep suggested language aligned with source per rules. Explanations use uiLocale.",
    parameters: z.object({
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

  addTopicTerm: defineTool("addTopicTerm", {
    description:
      "Track key topic term. Keep term as-is. Use uiLocale for translation/domain.",
    parameters: z.object({
      term: z.string().min(1).max(80),
      translation: z.string().max(80).optional(),
      domain: z.string().max(40).optional(),
      turnId: z.string(),
    }),
    execute: async (input) => ({
      ...input,
      term: truncate(input.term, 80),
      translation: input.translation ? truncate(input.translation, 80) : undefined,
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

    const turns = data.turns.slice(-12);
    // Map to Gemini's role format: "user" | "model"
    const messages = turns.map((turn) => ({
      role: turn.speaker === "USER" ? ("user" as const) : ("model" as const),
      content: turn.text,
    }));

    const systemInstruction = [
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

      const result = await runAgent({
        apiKey,
        model: "gemini-2.5-flash",
        systemInstruction,
        messages,
        tools,
        toolChoice: "required",
        maxSteps: 1, // Observer only needs one tool call
        thinkingBudget: 1024,
      });

      // Map the first tool call result to the expected ToolOutput format
      let toolResult: ToolOutput | null = null;

      if (result.toolCalls.length > 0) {
        const firstCall = result.toolCalls[0];
        // Extract data from the new { ok, data/error } format
        if (firstCall.result.ok) {
          toolResult = {
            toolName: firstCall.name as ToolOutput["toolName"],
            input: firstCall.parsedArgs ?? firstCall.rawArgs,
            output: firstCall.result.data,
          } as ToolOutput;
        } else {
          // Tool call failed, log error but return null
          console.error(`Tool ${firstCall.name} failed:`, firstCall.result.error);
        }
      }

      await logObserver({
        type: "observer.result",
        sessionId: data.sessionId,
        tool: toolResult?.toolName ?? null,
        finishReason: result.finishReason,
      });

      return {
        toolResult,
        finishReason: result.finishReason,
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
