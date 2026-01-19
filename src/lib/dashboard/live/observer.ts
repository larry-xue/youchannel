import { GoogleGenAI } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
import { logObserver } from "./observer.logger";
import { observerSystemInstruction } from "./observer.prompt";
import { observerRequestSchema } from "./observer.schemas";
import type { ObserverResponse } from "./observer.types";
import {
  buildToolResult,
  isFunctionCallContent,
  observerToolChoice,
  observerTools,
} from "./observer.tools";

export type { ObserverRequest, ObserverTurn } from "./observer.schemas";
export type { ObserverResponse, ToolOutput } from "./observer.types";

export const runObserverFn = createServerFn({ method: "POST" })
  .inputValidator((data) => observerRequestSchema.parse(data))
  .handler(async ({ data }): Promise<ObserverResponse> => {
    const apiKey = process.env.GOOGLE_LIVE_API_KEY;
    if (!apiKey) {
      throw new Error("Missing GOOGLE_API_KEY for observer.");
    }

    const turns = data.turns.slice(-12);
    const messages = turns.map((turn) => ({
      role: turn.speaker === "USER" ? ("user" as const) : ("model" as const),
      content: turn.text,
    })).filter(msg => msg.role === "model");

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
        model: "gemini-3-flash-preview",
        system_instruction: observerSystemInstruction,
        generation_config: {
          tool_choice: observerToolChoice,
          thinking_level: "low"
        },
        input: messages.map(msg => msg.content).join("\n"),
        tools: observerTools,
      });

      const outputs = interaction.outputs ?? [];
      const toolCall = outputs.find(isFunctionCallContent) ?? null;
      const toolResult = buildToolResult(toolCall, {
        sessionId: data.sessionId,
        uiLocale: data.uiLocale,
      });

      await logObserver({
        type: "observer.result",
        sessionId: data.sessionId,
        tool: toolCall?.name ?? null,
        finishReason: interaction.status,
      });

      return {
        toolResult,
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
