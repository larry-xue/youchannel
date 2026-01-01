import { defineEventHandler, readBody, getHeader, createError } from "h3";

// Environment variable helpers
const getEnvValue = (key: string) => {
  return process.env[key];
};

// Log helper
function logApi(message: string, details?: Record<string, unknown>) {
  const timestamp = new Date().toISOString();
  if (details) {
    console.log(`[sync-api] ${timestamp} ${message}`, JSON.stringify(details, null, 2));
  } else {
    console.log(`[sync-api] ${timestamp} ${message}`);
  }
}

// Verify sync API key
function verifySyncApiKey(authHeader: string | null): boolean {
  const syncApiKey = getEnvValue("SYNC_API_KEY");
  if (!syncApiKey) {
    logApi("SYNC_API_KEY 未配置");
    return false;
  }

  if (!authHeader) {
    logApi("缺少 Authorization 头");
    return false;
  }

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    logApi("Authorization 头格式错误", { scheme, hasToken: !!token });
    return false;
  }

  const isValid = token === syncApiKey;
  if (!isValid) {
    logApi("API Key 验证失败");
  }
  return isValid;
}

export default defineEventHandler(async (event) => {
  const method = event.method;
  const authHeader = getHeader(event, "authorization");

  logApi(`收到请求`, { method, path: event.path });

  // Verify API key
  if (!verifySyncApiKey(authHeader)) {
    logApi("API Key 验证失败，拒绝请求");
    throw createError({
      statusCode: 401,
      message: "Unauthorized: Invalid or missing API key",
    });
  }

  if (method === "GET") {
    // Health check
    logApi("健康检查请求");
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
        logApi("解析请求体", { hasUserId: !!userId });
      } catch {
        // No body or invalid JSON - proceed without userId filter
        logApi("请求体为空或无效，继续处理");
      }

      logApi("开始执行同步任务", { userId });

      // Import and run sync
      const { runPlaylistSync } = await import("~/lib/server/sync");
      const result = await runPlaylistSync({ userId });

      logApi("同步任务完成", {
        success: result.success,
        playlistsSynced: result.playlistsSynced,
        videosAdded: result.totalVideosAdded,
        videosRemoved: result.totalVideosRemoved,
        analysesTriggered: result.totalAnalysesTriggered,
        analysesSkipped: result.totalAnalysesSkipped,
        errorCount: result.errors.length,
      });

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
      logApi("同步任务异常", { error: message });

      throw createError({
        statusCode: 500,
        message: `Sync error: ${message}`,
      });
    }
  }

  logApi("不支持的请求方法", { method });
  throw createError({
    statusCode: 405,
    message: "Method not allowed",
  });
});

