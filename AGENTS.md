# AGENTS.md

This file contains essential guidance for agentic coding assistants working in this repository.

---

## Build, Lint, and Format Commands

**Package Manager**: `pnpm` (use exclusively)

| Command                  | Purpose                                            |
| ------------------------ | -------------------------------------------------- |
| `pnpm dev`               | Start development server (Vite with host access)   |
| `pnpm build`             | Production build                                   |
| `pnpm start`             | Run production server (`.output/server/index.mjs`) |
| `pnpm lint`              | Run ESLint across all TS/TSX files                 |
| `pnpm format`            | Format code with Prettier                          |
| `pnpm machine-translate` | Trigger machine translation via Inlang             |
| `pnpm ui <component>`    | Add Shadcn component (runs `shadcn@canary`)        |

**Testing**: No automated test suite is configured. No test runner or test scripts exist in the repo.

---

## Code Style Guidelines

### Formatting (Prettier + EditorConfig)

- Indentation: 2 spaces (no tabs)
- Line length: 90 characters max
- Quotes: Double quotes (`"`)
- Semicolons: Required
- Line endings: LF
- Trailing commas: All
- Plugins: `prettier-plugin-tailwindcss`, `prettier-plugin-organize-imports`

### TypeScript Configuration

- Strict mode: Enabled
- Target: ES2022
- Module resolution: Bundler
- JSX: `react-jsx`
- Path alias: `~/*` → `./src/*`

### Linting (ESLint Flat Config)

- TypeScript strict type checking
- React Hooks recommended rules
- React Compiler integration
- TanStack Query and Router plugins (recommended rules)
- Prettier integration (no conflicts)

### Naming Conventions

**TanStack Router (File-Based Routing)**

- Root route: `__root.tsx`
- Index routes: `index.tsx`
- Dynamic segments: Prefix with `$` (e.g., `$postId.tsx`)
- Pathless layouts: Prefix with `_` (e.g., `_layout.tsx`)
- Excluded files/folders: Prefix with `-` (colocation support)

**UI Components (Shadcn)**

- Use canary version for all shadcn installs:
  ```bash
  npx shadcn@canary <package-name>
  ```
- Or via the `pnpm ui` alias: `pnpm ui <component>`

### Imports and Organization

- Use absolute imports with `~` alias for src files
- Prettier automatically organizes imports via `prettier-plugin-organize-imports`
- Tailwind classes are auto-sorted by `prettier-plugin-tailwindcss`

### Error Handling

- No specific patterns found in configs
- Follow React/TypeScript best practices (try/catch, error boundaries, etc.)

### React Compiler

- Enabled with `eslint-plugin-react-compiler` and `babel-plugin-react-compiler`
- Configure rules in `eslint.config.js` (currently using recommended config)

---

## Tech Stack and Patterns

- **Framework**: TanStack Start (Vite-based full-stack React)
- **Routing**: TanStack Router with file-based routing
- **State/Data**: TanStack Query (loader integration)
- **UI**: Shadcn components + Tailwind CSS v4 (Material Design 3 style)
- **Auth/DB**: Supabase Auth + Postgres with RLS
- **AI**: TanStack AI + Gemini adapter
- **i18n**: Inlang (Paraglide)

---

## Important Notes

- Always run `pnpm lint` and `pnpm format` before committing
- No automated tests are currently set up — if adding tests, consider Vitest
- Cursor rules in `.cursor/rules/` contain additional project-specific guidance
