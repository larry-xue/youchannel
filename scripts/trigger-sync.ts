#!/usr/bin/env node
/**
 * 本地脚本：手动触发同步任务
 *
 * 用法:
 *   npm run trigger-sync                    # 同步所有播放列表
 *   npm run trigger-sync -- --userId <id>   # 只同步指定用户的播放列表
 */

import { config } from "dotenv";
import { runPlaylistSync } from "../src/lib/server/sync";

// 加载 .env 文件
config();

// 解析命令行参数
const args = process.argv.slice(2);
let userId: string | undefined;

for (let i = 0; i < args.length; i++) {
  if (args[i] === "--userId" && args[i + 1]) {
    userId = args[i + 1];
    i++;
  } else if (args[i] === "--help" || args[i] === "-h") {
    console.log(`
用法:
  npm run trigger-sync                    # 同步所有播放列表
  npm run trigger-sync -- --userId <id>   # 只同步指定用户的播放列表

环境变量:
  SUPABASE_URL              - Supabase 项目 URL
  SUPABASE_SERVICE_ROLE_KEY - Supabase 服务角色密钥
    `);
    process.exit(0);
  }
}

const main = async () => {
  try {
    console.log("[trigger-sync] 开始同步任务", userId ? { userId } : {});

    const result = await runPlaylistSync({ userId });

    console.log("[trigger-sync] 同步任务完成", {
      success: result.success,
      playlistsSynced: result.playlistsSynced,
      videosAdded: result.totalVideosAdded,
      videosRemoved: result.totalVideosRemoved,
      analysesTriggered: result.totalAnalysesTriggered,
      analysesSkipped: result.totalAnalysesSkipped,
      errors: result.errors.length > 0 ? result.errors : undefined,
    });

    if (!result.success && result.errors.length > 0) {
      console.error("[trigger-sync] 同步过程中有错误:", result.errors);
      process.exit(1);
    }

    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("[trigger-sync] 同步任务失败:", message);
    process.exit(1);
  }
};

void main();
