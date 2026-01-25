import { GoogleGenAI, Type } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

const generateLiveSessionTitleSchema = z.object({
  liveSessionId: z.string().uuid(),
  uiLocale: z.string().min(2),
});

const titleResponseSchema = z.object({
  title: z.string().min(1).max(120),
});

export type GenerateLiveSessionTitleResponse = {
  title: string | null;
  updated: boolean;
};

const MAX_TRANSCRIPT_CHARS = 12000;

const stripWrappingQuotes = (value: string) =>
  value.replace(/^(["'“”‘’])+|(["'“”‘’])+$/g, "");

export const generateLiveSessionTitleFn = createServerFn({ method: "POST" })
  .inputValidator((data) => generateLiveSessionTitleSchema.parse(data))
  .handler(async ({ data }): Promise<GenerateLiveSessionTitleResponse> => {
    const apiKey = process.env.GOOGLE_API_KEY ?? process.env.GOOGLE_LIVE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is not set on the server.");
    }

    const { supabase } = await getSupabaseAndUser();

    const { data: messages, error: messagesError } = await supabase
      .from("live_session_messages")
      .select("role,content,created_at,sequence_number")
      .eq("live_session_id", data.liveSessionId)
      .order("sequence_number", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: true });

    if (messagesError) {
      throw new Error(messagesError.message || "Failed to load live session messages");
    }

    const transcriptLines = (messages ?? [])
      .map((message) => ({
        role:
          message.role === "user"
            ? "User"
            : message.role === "assistant"
              ? "Assistant"
              : "System",
        content: String(message.content ?? ""),
      }))
      .filter((message) => message.content.trim().length > 0)
      .map((message) => `${message.role}: ${message.content.trim()}`);

    if (transcriptLines.length === 0) {
      return { title: null, updated: false };
    }

    let transcript = transcriptLines.join("\n");
    if (transcript.length > MAX_TRANSCRIPT_CHARS) {
      transcript = transcript.slice(-MAX_TRANSCRIPT_CHARS);
    }

    const prompt = `Generate a short, descriptive title for this conversation.

Output MUST be strict JSON with this schema:
{ "title": "string" }

Rules:
- Use language: ${data.uiLocale}
- Max length: 60 characters
- No surrounding quotes
- Do not include speaker labels (User/Assistant)
- Be specific to the main topic

Conversation transcript:
${transcript}`;

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
          },
          required: ["title"],
        },
      },
    });

    const textOutput = response.text;
    if (!textOutput) {
      throw new Error("Title generation returned empty output.");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(textOutput);
    } catch (error) {
      console.error("[LiveTitle] Failed to parse JSON", error);
      throw new Error("Title generation returned invalid JSON.");
    }

    const validated = titleResponseSchema.safeParse(parsed);
    if (!validated.success) {
      console.error("[LiveTitle] Response validation failed", validated.error.flatten());
      throw new Error("Title generation returned invalid response.");
    }

    const title = stripWrappingQuotes(validated.data.title).replace(/\s+/g, " ").trim();
    if (!title) {
      return { title: null, updated: false };
    }

    const { error: updateError } = await supabase
      .from("live_sessions")
      .update({ title })
      .eq("id", data.liveSessionId);

    if (updateError) {
      throw new Error(updateError.message || "Failed to update live session title");
    }

    return { title, updated: true };
  });

