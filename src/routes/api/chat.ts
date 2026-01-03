import { chat, type ConstrainedModelMessage, toServerSentEventsStream } from "@tanstack/ai";
import { geminiText, type GeminiTextModel } from "@tanstack/ai-gemini";
import { createFileRoute } from "@tanstack/react-router";

type GeminiAdapter = ReturnType<typeof geminiText>;
type GeminiMessage = ConstrainedModelMessage<{
  inputModalities: GeminiAdapter["~types"]["inputModalities"];
  messageMetadataByModality: GeminiAdapter["~types"]["messageMetadataByModality"];
}>;

const DEFAULT_MODEL: GeminiTextModel =
  (process.env.GEMINI_MODEL as GeminiTextModel) || "gemini-2.5-flash";

type ChatRequestBody = {
  messages?: GeminiMessage[];
  data?: {
    analysisText?: string;
  };
};

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: async ({ request }) => {
        const payload = (await request.json().catch(() => null)) as ChatRequestBody | null;
        if (!payload?.messages || payload.messages.length === 0) {
          return new Response("Missing messages", { status: 400 });
        }

        const analysisText = payload.data?.analysisText?.trim() ?? "";
        if (!analysisText) {
          return new Response("Missing analysis context", { status: 400 });
        }

        const abortController = new AbortController();
        request.signal.addEventListener("abort", () => abortController.abort(), {
          once: true,
        });

        const adapter = geminiText(DEFAULT_MODEL);
        const systemPrompts = [
          "You are a helpful assistant for answering questions about a YouTube video. Use the provided video analysis context to answer. If the analysis does not contain the answer, say you do not know based on the analysis.",
          `Video analysis context:\n${analysisText}`,
        ];

        const stream = chat({
          adapter,
          messages: payload.messages,
          systemPrompts,
          abortController,
        });

        return new Response(toServerSentEventsStream(stream, abortController), {
          headers: {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
          },
        });
      },
    },
  },
});
