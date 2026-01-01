import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { resolve } from "path";

export default defineConfig({
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
  ],
  build: {
    outDir: "dist",
    emptyOutDir: false, // 不清理 dist 目录，因为主应用也会输出到这里
    rollupOptions: {
      input: {
        worker: resolve(__dirname, "src/worker.ts"),
        scheduler: resolve(__dirname, "src/scheduler.ts"),
      },
      output: {
        entryFileNames: "[name].js",
        chunkFileNames: "assets/[name]-[hash].js",
        format: "es",
        // 使用代码分割，但确保路径正确
        manualChunks: (id) => {
          // 将 node_modules 中的依赖打包到单独的 chunk
          if (id.includes("node_modules")) {
            // 将大型依赖单独打包
            if (id.includes("@supabase")) {
              return "vendor-supabase";
            }
            if (id.includes("@tanstack")) {
              return "vendor-tanstack";
            }
            return "vendor";
          }
        },
      },
      external: [
        // Node.js 内置模块
        "crypto",
        "fs",
        "fs/promises",
        "path",
        "events",
        "child_process",
        "node:crypto",
        "node:fs",
        "node:fs/promises",
        "node:path",
        "node:events",
        "node:child_process",
      ],
    },
    target: "node18",
    minify: false, // 开发时可以不压缩，生产环境可以改为 true
    sourcemap: true,
    // 使用 SSR 模式，避免浏览器相关的代码注入
    ssr: true,
  },
  resolve: {
    alias: {
      "~": resolve(__dirname, "src"),
    },
  },
  // 使用 SSR 模式，避免浏览器相关的代码注入
  ssr: {
    // 打包所有第三方依赖，Node.js 内置模块已在 external 中排除
    noExternal: true,
  },
});
