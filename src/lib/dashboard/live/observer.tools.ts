import type { Interactions } from "@google/genai";
import type { ToolOutput } from "./observer.types";

export const observerTools: Interactions.Tool[] = [
  {
    type: "function",
    name: "extract_linguistic_insights",
    description: "Extracts language-learning insights from the input.",
    parameters: {
      type: "object",
      properties: {
        insights: {
          type: "array",
          items: { type: "string" },
          description:
            "Words or phrases extracted from the input (e.g., 'c'est la vie', 'break the ice', '木漏れ日').",
        },
      },
      required: ["insights"],
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
