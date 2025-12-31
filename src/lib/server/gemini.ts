import { chat, type ConstrainedModelMessage } from "@tanstack/ai";
import { geminiText, type GeminiTextModel } from "@tanstack/ai-gemini";

const DEFAULT_MODEL: GeminiTextModel =
  (process.env.GEMINI_MODEL as GeminiTextModel) || "gemini-2.5-flash";

async function writeGeminiLog(entry: Record<string, unknown>) {
  try {
    const { mkdir, appendFile } = await import("fs/promises");
    const { join } = await import("path");
    const logDir = join(process.cwd(), "logs");
    const logPath = join(logDir, "gemini.log");
    await mkdir(logDir, { recursive: true });
    const line = `${new Date().toISOString()} ${JSON.stringify(entry)}\n`;
    await appendFile(logPath, line, "utf8");
  } catch {
    // Avoid breaking analysis if logging fails.
  }
}

function previewText(text: string, maxLength = 200) {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}...`;
}

type VideoAnalysisInput = {
  videoUrl: string;
  prompt: string;
  model?: GeminiTextModel;
};

export async function generateVideoAnalysis({
  videoUrl,
  prompt,
  model = DEFAULT_MODEL,
}: VideoAnalysisInput) {
  const adapter = geminiText(model);
  await writeGeminiLog({
    event: "gemini.video.request",
    model,
    videoUrl,
    promptLength: prompt.length,
  });

  try {
    const startedAt = Date.now();
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

    await writeGeminiLog({
      event: "gemini.video.response",
      model,
      durationMs: Date.now() - startedAt,
      textLength: result.length,
      textPreview: previewText(result),
    });

    return { text: result, model };
  } catch (error) {
    await writeGeminiLog({
      event: "gemini.video.error",
      model,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}

type GeminiAdapter = ReturnType<typeof geminiText>;
type GeminiMessage = ConstrainedModelMessage<{
  inputModalities: GeminiAdapter["~types"]["inputModalities"];
  messageMetadataByModality: GeminiAdapter["~types"]["messageMetadataByModality"];
}>;

type ConversationInput = {
  messages: GeminiMessage[];
  systemPrompts?: string[];
  model?: GeminiTextModel;
};

export async function generateConversationReply({
  messages,
  systemPrompts,
  model = DEFAULT_MODEL,
}: ConversationInput) {
  const adapter = geminiText(model);
  await writeGeminiLog({
    event: "gemini.chat.request",
    model,
    messageCount: messages.length,
    systemPromptCount: systemPrompts?.length ?? 0,
  });

  try {
    const startedAt = Date.now();
    const result = await chat({
      adapter,
      stream: false,
      messages,
      systemPrompts,
    });

    await writeGeminiLog({
      event: "gemini.chat.response",
      model,
      durationMs: Date.now() - startedAt,
      textLength: result.length,
      textPreview: previewText(result),
    });

    return { text: result, model };
  } catch (error) {
    await writeGeminiLog({
      event: "gemini.chat.error",
      model,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
}
