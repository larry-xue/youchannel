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
