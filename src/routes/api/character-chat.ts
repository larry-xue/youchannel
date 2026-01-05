import { chat, type ConstrainedModelMessage, toServerSentEventsStream } from "@tanstack/ai";
import { geminiText, type GeminiTextModel } from "@tanstack/ai-gemini";
import { createFileRoute } from "@tanstack/react-router";
import {
  getAnalysisContextWithoutCharacters,
  sanitizeCharacter,
  type AnalysisCharacter,
} from "~/lib/dashboard/learn/analysis";

type GeminiAdapter = ReturnType<typeof geminiText>;
type GeminiMessage = ConstrainedModelMessage<{
  inputModalities: GeminiAdapter["~types"]["inputModalities"];
  messageMetadataByModality: GeminiAdapter["~types"]["messageMetadataByModality"];
}>;

const DEFAULT_MODEL: GeminiTextModel =
  (process.env.GEMINI_MODEL as GeminiTextModel) || "gemini-2.5-flash";

type CharacterChatRequest = {
  messages?: GeminiMessage[];
  data?: {
    analysisText?: string;
    character?: AnalysisCharacter;
  };
};

function formatCharacterProfile(character: AnalysisCharacter) {
  const traits = character.traits.join(", ");
  const topics = character.notable_topics?.join(", ");
  const evidence = character.evidence
    ?.map((item) => {
      const timestamp = item.timestamp ? `[${item.timestamp}] ` : "";
      return `${timestamp}${item.quote || ""}`.trim();
    })
    .filter(Boolean)
    .join("\n");

  return [
    `Name: ${character.name}`,
    `Role: ${character.kind}`,
    `Description: ${character.description}`,
    `Traits: ${traits}`,
    `Speaking style: ${character.speaking_style}`,
    topics ? `Topics: ${topics}` : null,
    evidence ? `Evidence:\n${evidence}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

export const Route = createFileRoute("/api/character-chat")({
  server: {
    handlers: {
      GET: () => new Response("Method Not Allowed", { status: 405 }),
      POST: async ({ request }) => {
        const payload = (await request.json().catch(() => null)) as CharacterChatRequest | null;
        if (!payload?.messages?.length) {
          return new Response("Missing messages", { status: 400 });
        }

        const analysisContext = getAnalysisContextWithoutCharacters(payload.data?.analysisText);
        if (!analysisContext) {
          return new Response("Missing analysis context", { status: 400 });
        }

        const character = sanitizeCharacter(payload.data?.character);
        if (!character) {
          return new Response("Missing character profile", { status: 400 });
        }

        const abortController = new AbortController();
        request.signal.addEventListener("abort", () => abortController.abort(), {
          once: true,
        });

        const adapter = geminiText(DEFAULT_MODEL);
        const systemPrompts = [
          `You are role-playing as "${character.name}" (${character.kind}) from the analyzed video. Stay in character, answer concisely, and follow their speaking style.`,
          `Character profile:\n${formatCharacterProfile(character)}`,
          `Video analysis context (characters removed):\n${analysisContext}`,
          "Use only the provided analysis and character profile. If the analysis does not contain the answer, say you do not know based on the analysis.",
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
