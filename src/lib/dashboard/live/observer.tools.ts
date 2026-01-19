import type { Interactions } from "@google/genai";
import type { ToolOutput } from "./observer.types";

export const observerTools: Interactions.Tool[] = [
  {
    type: "function",
    name: "extract_linguistic_insights",
    description:
      "Record high-value linguistic moments from the user's dialogue turn.",
    parameters: {
      type: "object",
      properties: {
        turnId: {
          type: "string",
          description: "The originating user or model turn ID.",
        },
        speaker: {
          type: "string",
          enum: ["USER", "AI"],
          description: "Who produced the utterance being analyzed.",
        },
        insights: {
          type: "array",
          items: {
            type: "object",
            properties: {
              phrase: { type: "string", description: "Key phrase or term." },
              language: {
                type: "string",
                description: "Language tag, if known.",
              },
              note: {
                type: "string",
                description: "Short learner-friendly explanation.",
              },
            },
            required: ["phrase", "note"],
            additionalProperties: false,
          },
        },
      },
      required: ["turnId", "speaker", "insights"],
      additionalProperties: false,
    },
  },
  {
    type: "function",
    name: "fallback_no_action",
    description:
      "Fallback tool. Use this when no other tool functions are applicable.",
    parameters: {
      type: "object",
      properties: {},
      required: [],
      additionalProperties: false,
    },
  },
];

export const observerToolChoice: Interactions.ToolChoice = {
  allowed_tools: {
    mode: "any",
    tools: ["extract_linguistic_insights", "fallback_no_action"],
  },
};

export function isFunctionCallContent(
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

export function buildToolResult(
  toolCall: Interactions.FunctionCallContent | null,
  context: { sessionId: string; uiLocale: string },
): ToolOutput | null {
  if (!toolCall) return null;
  return {
    toolName: toolCall.name,
    input: {
      sessionId: context.sessionId,
      uiLocale: context.uiLocale,
    },
    output: toolCall.arguments,
  };
}
