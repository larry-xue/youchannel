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
  const data = ctx.data as {
    sentence: string;
    conversationHistory?: Array<{ role: string; content: string }>;
    uiLanguage?: string;
  };
  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) {
    throw new Error("GOOGLE_API_KEY is not set on the server.");
  }

  const client = new GoogleGenAI({ apiKey });

  // Map language codes to full names for clearer prompts
  const languageNames: Record<string, string> = {
    en: "English",
    zh: "Simplified Chinese (简体中文)",
    "zh-TW": "Traditional Chinese (繁體中文)",
    ja: "Japanese (日本語)",
    ko: "Korean (한국어)",
    es: "Spanish (Español)",
    de: "German (Deutsch)",
    fr: "French (Français)",
  };
  const outputLanguage = languageNames[data.uiLanguage || "en"] || "English";

  // Format conversation history for context
  const historyContext = data.conversationHistory && data.conversationHistory.length > 0
    ? `Recent conversation:\n${data.conversationHistory.map(m => `${m.role === 'user' ? 'User' : 'AI'}: ${m.content}`).join('\n')}\n\n`
    : "";

  const prompt = `You are analyzing SPOKEN conversation from a language learner. This is real-time voice chat with automatic speech recognition (ASR).

${historyContext}Current user input (ASR result): "${data.sentence}"

**IMPORTANT**: 
- All explanations MUST be written in ${outputLanguage}.
- This is SPOKEN language with potential ASR errors - be very tolerant.

Task 0 - ASR Calibration (REQUIRED):
The speech recognition may have misheard words. Based on the conversation context, determine what the user most likely intended to say.
- Fix obvious ASR errors like "a life" → "alive", "we'll" → "wheel", "their" → "there"
- Consider the conversation context to understand intended meaning
- If the ASR result seems correct, return it unchanged
- This is NOT grammar correction - only fix what was likely misheard
- Return the calibrated sentence in the "calibrated" field

Task 1 - Grammar Check (on calibrated sentence):
- ONLY flag errors that would cause genuine misunderstanding or sound very wrong
- Be very tolerant of spoken language patterns:
  - Filler words, hesitations, repetitions
  - Informal contractions and casual speech
  - Sentence fragments natural in conversation
- If acceptable for casual spoken conversation, return grammar as null
- If correction is needed, provide: corrected sentence + brief explanation (max 15 words, in ${outputLanguage})

Task 2 - Annotations (0-3 items, on calibrated sentence):
Identify interesting items that deserve a brief explanation:
- Proper nouns: Names of people, places, events, brands, organizations
- Idioms and phrasal verbs
- Cultural references
- Advanced vocabulary words
- Technical terms

For each item, provide a brief explanation (max 25 words, in ${outputLanguage}).
If nothing is worth annotating, return an empty array.

Output JSON format:
{
  "calibrated": "string (the ASR-calibrated sentence)",
  "grammar": null | {
    "corrected": "string",
    "explanation": "string"
  },
  "phrases": [] | [
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

    // Get calibrated sentence (fall back to original if not provided)
    const calibrated = parsedOutput.calibrated || data.sentence;

    // Normalize grammar result
    let grammar = null;
    if (parsedOutput.grammar?.corrected && parsedOutput.grammar.corrected !== calibrated) {
      grammar = {
        corrected: parsedOutput.grammar.corrected,
        explanation: parsedOutput.grammar.explanation || "Improved phrasing.",
      };
    }

    // Normalize phrases result
    const phrases = Array.isArray(parsedOutput.phrases)
      ? parsedOutput.phrases.filter((p: any) => p.phrase && p.explanation)
      : [];

    return { calibrated, grammar, phrases };
  } catch (error) {
    console.error("User input analysis failed:", error);
    return { calibrated: data.sentence, grammar: null, phrases: [] };
  }
});

// Keep checkGrammar as alias for backward compatibility
export const checkGrammar = analyzeUserInput;
