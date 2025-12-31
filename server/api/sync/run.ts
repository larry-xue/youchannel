import { defineEventHandler, readBody, getHeader, createError } from "h3";

// Environment variable helpers
const getEnvValue = (key: string) => {
  return process.env[key];
};

// Verify sync API key
function verifySyncApiKey(authHeader: string | null): boolean {
  const syncApiKey = getEnvValue("SYNC_API_KEY");
  if (!syncApiKey) {
    console.warn("SYNC_API_KEY not configured");
    return false;
  }

  if (!authHeader) return false;

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) return false;

  return token === syncApiKey;
}

export default defineEventHandler(async (event) => {
  const method = event.method;
  const authHeader = getHeader(event, "authorization");

  // Verify API key
  if (!verifySyncApiKey(authHeader)) {
    throw createError({
      statusCode: 401,
      message: "Unauthorized: Invalid or missing API key",
    });
  }

  if (method === "GET") {
    // Health check
    return {
      status: "ok",
      service: "playlist-sync",
      timestamp: new Date().toISOString(),
    };
  }

  if (method === "POST") {
    try {
      // Parse optional request body for userId filter
      let userId: string | undefined;
      try {
        const body = await readBody(event);
        userId = body?.userId;
      } catch {
        // No body or invalid JSON - proceed without userId filter
      }

      // Import and run sync
      const { runPlaylistSync } = await import("~/lib/server/sync");
      const result = await runPlaylistSync({ userId });

      return {
        success: result.success,
        data: {
          playlistsSynced: result.playlistsSynced,
          videosAdded: result.totalVideosAdded,
          videosRemoved: result.totalVideosRemoved,
          analysesTriggered: result.totalAnalysesTriggered,
          analysesSkipped: result.totalAnalysesSkipped,
        },
        errors: result.errors.length > 0 ? result.errors : undefined,
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Sync failed";

      throw createError({
        statusCode: 500,
        message: `Sync error: ${message}`,
      });
    }
  }

  throw createError({
    statusCode: 405,
    message: "Method not allowed",
  });
});

