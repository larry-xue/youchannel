import { paraglideVitePlugin } from '@inlang/paraglide-js'
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from 'nitro/vite'

export default defineConfig({
  server: {
    host: "127.0.0.1",
    port: 3000,
  },
  plugins: [
    tsConfigPaths({
      projects: ["./tsconfig.json"],
    }),
    tailwindcss(),
    tanstackStart(),
    nitro(),
    viteReact({
      babel: {
        plugins: [
          [
            "babel-plugin-react-compiler",
            {
              target: "19",
            },
          ],
        ],
      },
    }),
    paraglideVitePlugin({
      project: './project.inlang',
      outdir: './src/paraglide',
      outputStructure: 'message-modules',
      cookieName: 'lang',
      localStorageKey: 'lang',
      strategy: ['url', 'cookie', 'preferredLanguage', 'baseLocale'],
      // urlPatterns: [
      //   {
      //     pattern: '/',
      //     localized: [
      //       ['en', '/en'],
      //       ['de', '/de'],
      //     ],
      //   },
      //   {
      //     pattern: '/:path(.*)?',
      //     localized: [
      //       ['en', '/en/:path(.*)?'],
      //       ['de', '/de/:path(.*)?'],
      //     ],
      //   },
      // ],
    }),
  ],
});
