import { GoogleGenAI } from "@google/genai";
import { createServerFn } from "@tanstack/react-start";
import { getSupabaseAndUser } from "~/lib/dashboard/utils.server";

export const getGeminiToken = createServerFn({ method: "POST" }).handler(async () => {
  // Ensure properly authenticated user
  try {
    await getSupabaseAndUser();
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("Server: bypassing Supabase auth check in development", error);
    } else {
      throw error;
    }
  }

  const apiKey = process.env.GOOGLE_LIVE_API_KEY;
  if (!apiKey) {
    console.error("Server: GOOGLE_API_KEY not found");
    throw new Error("GOOGLE_API_KEY is not set on the server.");
  }

  const client = new GoogleGenAI({ apiKey });

  // Create an ephemeral token
  // Expires in 30 minutes, session creation allowed for 1 minute
  const expireTime = new Date(Date.now() + 30 * 60 * 1000).toISOString();

  // Note: create() method signature might vary based on SDK version, following user provided example
  // adjusting to match SDK types if needed.
  try {
    const response = await client.authTokens.create({
      config: {
        uses: 1, // Restrict to single use if possible? Docs say default is 1
        expireTime: expireTime,
        // newSessionExpireTime: (Optional) defaults to 1m
        httpOptions: { apiVersion: "v1alpha" },
      },
    });

    if (!response.name) {
      console.error("Server: Token creation returned no name", response);
      throw new Error("Failed to create ephemeral token");
    }

    return { token: response.name };
  } catch (err) {
    console.error("Server: Token creation failed", err);
    throw err;
  }
});

// @ts-ignore - bypassing strict type check for server fn input inference issues
export const explainTerm = createServerFn({ method: "POST" })
  .handler(async (ctx: any) => {
    const data = ctx.data as { phrase: string; context?: string };
    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      throw new Error("GOOGLE_API_KEY is not set on the server.");
    }

    const client = new GoogleGenAI({ apiKey });

    // The @google/genai SDK v1alpha usage:
    // client.models.generateContent({ model: '...', contents: ... })

    const prompt = `Explain the phrase "${data.phrase}" concisely (under 20 words) for a language learner.${data.context ? ` Context: "${data.context}"` : ""
      }`;

    try {
      const response = await client.models.generateContent({
        model: "gemini-2.5-flash-lite",
        contents: [{ parts: [{ text: prompt }] }],
        config: {
          tools: [{ googleSearch: {} }]
        }
      });

      // Check if text is a function or property. GoogleGenAI v1alpha usually returns text() function.
      // User feedback said it is a property. I will try property first, if undefined check function?
      // Actually the error was "Type 'String' has no call signatures", implying typescript thinks it's a string.
      // So I will use it as a property.
      const output = typeof response.text === 'function'
        ? (response.text as any)()
        : (response.text as unknown as string);

      return { explanation: (output || "").trim() };
    } catch (error) {
      console.error("Explanation generation failed:", error);
      // Fallback or rethrow
      return { explanation: "Could not generate explanation." };
    }
  });

// @ts-ignore - bypassing strict type check for server fn input inference issues
export const analyzeUserInput = createServerFn({ method: "POST" }).handler(async (ctx: any) => {
  const data = ctx.data as { sentence: string; context?: string };
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set on the server.");
  }

  const client = new GoogleGenAI({ apiKey });

  const prompt = `Analyze the following sentence spoken by a language learner in a conversation.

Sentence: "${data.sentence}"
${data.context ? `Context: "${data.context}"` : ""}

Task:
1. **Grammar Check**: Determine if the sentence is grammatically correct AND sounds natural.
   - If natural and correct (even if casual), set grammar to null.
   - If it has errors or sounds unnatural, provide a corrected version and brief explanation (max 15 words).
   - IGNORE minor disfluencies or valid slang. Focus on genuine errors.

2. **Phrase Explanations**: Identify 0-2 interesting phrases, idioms, or vocabulary words in the sentence that a language learner might benefit from understanding better.
   - For each phrase, provide a brief explanation (max 20 words).
   - Only include phrases that are genuinely interesting or educational.
   - If no phrases are worth explaining, return an empty array.

Output JSON format:
{
  "grammar": {
    "corrected": "string | null",
    "explanation": "string | null"
  },
  "phrases": [
    {
      "phrase": "string",
      "explanation": "string"
    }
  ]
}`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-2.5-flash-lite",
      contents: [{ parts: [{ text: prompt }] }],
      config: {
        responseMimeType: "application/json",
      },
    });

    const output = typeof response.text === 'function'
      ? (response.text as any)()
      : (response.text as unknown as string);

    const parsedOutput = JSON.parse(output || "{}");

    // Normalize grammar result
    let grammar = null;
    if (parsedOutput.grammar?.corrected && parsedOutput.grammar.corrected !== data.sentence) {
      grammar = {
        corrected: parsedOutput.grammar.corrected,
        explanation: parsedOutput.grammar.explanation || "Improved phrasing.",
      };
    }

    // Normalize phrases result
    const phrases = Array.isArray(parsedOutput.phrases)
      ? parsedOutput.phrases.filter((p: any) => p.phrase && p.explanation)
      : [];

    return { grammar, phrases };
  } catch (error) {
    console.error("User input analysis failed:", error);
    return { grammar: null, phrases: [] };
  }
});

// Keep checkGrammar as alias for backward compatibility
export const checkGrammar = analyzeUserInput;
