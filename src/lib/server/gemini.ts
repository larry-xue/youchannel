import { chat, type ModelMessage } from "@tanstack/ai";
import { geminiText } from "@tanstack/ai-gemini";

const DEFAULT_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

type VideoAnalysisInput = {
  videoUrl: string;
  prompt: string;
  model?: string;
};

export async function generateVideoAnalysis({
  videoUrl,
  prompt,
  model = DEFAULT_MODEL,
}: VideoAnalysisInput) {
  const adapter = geminiText(model);
  const result = await chat({
    adapter,
    stream: false,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "video",
            source: { type: "url", value: videoUrl },
            metadata: { mimeType: "video/mp4" },
          },
          {
            type: "text",
            content: prompt,
          },
        ],
      },
    ],
  });

  return { text: result, model };
}

type ConversationInput = {
  messages: ModelMessage[];
  systemPrompts?: string[];
  model?: string;
};

export async function generateConversationReply({
  messages,
  systemPrompts,
  model = DEFAULT_MODEL,
}: ConversationInput) {
  const adapter = geminiText(model);
  const result = await chat({
    adapter,
    stream: false,
    messages,
    systemPrompts,
  });

  return { text: result, model };
}
