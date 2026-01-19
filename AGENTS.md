# AGENTS GUIDE

**Generated:** 2026-01-19
**Stack:** TanStack Start (Vite) + Supabase + TanStack Query + @google/genai
**UI:** Shadcn UI + Tailwind CSS v4

## Project Overview

Full-stack workspace for YouTube video analysis and language learning.
Integrates Supabase Auth/DB, TanStack Router (file-based), and Gemini AI.
Internationalized via Paraglide (Inlang).

## Repo Layout

```
.
├── messages/                 # i18n source JSON files
├── src/
│   ├── lib/
│   │   ├── components/ui/    # Shadcn components (Material 3 styled)
│   │   ├── dashboard/        # Feature: Dashboard logic & RPC wrappers
│   │   ├── gemini/           # Feature: Client-side AI (Live/Audio)
│   │   └── server/           # Backend: Auth, DB, quotas, external APIs
│   ├── paraglide/            # Generated i18n code (DO NOT EDIT JS FILES)
│   └── routes/               # TanStack Router (file-based)
└── supabase/                 # Migrations & config
```

## Commands (Build / Lint / Test)

**Package manager:** `pnpm` only.

### Build & Run

- `pnpm dev` — local dev server
- `pnpm build` — production build
- `pnpm start` — run built server

### Lint & Format

- `pnpm lint` — run ESLint
- `pnpm lint -- <path>` — lint a single file (ESLint passes args)
- `pnpm format` — run Prettier
- `pnpm format -- <path>` — format a single file

### Tests

- No test runner is configured in `package.json`.
- If adding tests, document a single-test command here.

### Data / i18n / UI

- `pnpm supabase db reset` — reset local DB + seed
- `pnpm db:migrate` — push migrations
- `pnpm db:seed` — push seed data
- `pnpm machine-translate` — fill missing i18n keys
- `pnpm ui <comp>` — add Shadcn component (canary)

## Architecture Conventions

- **Routing:** TanStack Router file-based routes in `src/routes`.
- **Data fetching:** Use client-side TanStack Query. Avoid Router Loaders.
- **Auth:** SSR-aware logic in `src/lib/server/auth.server.ts`.
- **Server calls:** Use `createServerFn` wrappers (dashboard/server).
- **Supabase:** Use `getSupabaseServerClient()` in server fns.
- **AI:** Server logic in `src/lib/server/gemini.ts`; client realtime in `src/lib/gemini`.

## i18n (Paraglide)

- Edit `messages/{locale}.json` only.
- Keys must be `snake_case` (build fails otherwise).
- Usage: `import * as m from "~/paraglide/messages"`.

## Code Style Guidelines

### Formatting & Imports

- Prettier + EditorConfig: 2 spaces, 90-char line length.
- Prefer absolute imports via `~` alias where used.
- Keep imports grouped: external → internal → relative.
- Avoid unused imports; prefer named imports for clarity.

### Types & Safety

- TypeScript is strict; do not use `as any` or `@ts-ignore`.
- Prefer explicit types for public APIs and data models.
- Validate external input with Zod or runtime guards.

### Naming

- `camelCase` for variables/functions.
- `PascalCase` for components/classes/types.
- `snake_case` only for i18n keys.
- Route files follow TanStack Router conventions (`_layout`, `$param`).

### Error Handling

- Never use empty `catch` blocks.
- Return structured errors from server fns; log with context.
- For user-facing errors, map to UI-safe messages.

### React / TanStack Query

- Prefer hooks over class components.
- Keep hooks side-effect safe (use `useEffect` sparingly).
- Use Query for data; avoid direct fetch in components.

### CSS / UI

- Tailwind v4
- Keep UI consistent with Shadcn component patterns.

## Repository Anti-Patterns

- **No Router Loaders**: use `beforeLoad` for auth only.
- **No direct DB clients**: use server helpers.
- **No camelCase i18n keys**.
- **No `as any` / type suppression**.

## Cursor / Copilot Rules

- `.cursor/rules/shadcn.mdc`: for shadcn installation always use
  `npx shadcn@latest add <package-name>`.
- `.cursor/rules/tanstack-react-router_setup-and-architecture.mdc`:
  TanStack Router guidance applies to `package.json`, `vite.config.ts`,
  `tsconfig.json`, and `src/**/*.ts(x)`.
- No `.cursorrules` or `.github/copilot-instructions.md` detected.

## Notes for Agents

- Prefer minimal, focused changes aligned with existing patterns.
- Update docs only when behavior changes.
- Keep migrations explicit and timestamped if DB changes are required.
