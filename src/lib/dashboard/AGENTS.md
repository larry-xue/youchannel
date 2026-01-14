# DASHBOARD KNOWLEDGE BASE

**Context:** Dashboard feature domain & RPC wrappers.

## OVERVIEW

- Core business logic and data access for the workspace dashboard.
- Handles user profiles, video metadata, analysis retrieval, and playlist management.
- Integration point between the frontend routes and the server-side Supabase/AI logic.

## RPC PATTERN

- **Server Functions**: Uses `@tanstack/react-start`'s `createServerFn`.
- **Location**: Define in files like `video.ts`, `analysis.ts`, `user.ts`.
- **Auth Guard**: Use `getSupabaseAndUser()` from `utils.server.ts` in every handler.
- **Validation**: Strict input validation using `zod` via `.inputValidator()`.
- **Method**: Default to `POST` for all RPCs.

## COMPONENT STRUCTURE

- **`learn/`**: Dedicated sub-domain for the video learning interface.
  - `components/`: Specific UI for learning (Player, Chat, Tabs).
  - `constants.ts`: UI configuration (e.g., `TAB_OPTIONS`).
  - `utils.ts`: Domain-specific formatting and parsing logic.
- **Top-level Components**:
  - `LearningTabs.tsx`: Main navigation for video info, wiki, and captions.
  - `VideoPlayerCard.tsx`: YouTube player wrapper with timestamp sync.
  - `ChatSidebar.tsx`: Gemini-powered contextual chat interface.

## KEY UTILS

- `utils.server.ts`: Auth helpers for RPCs (Supabase client + User).
- `utils.ts`: Shared dashboard utilities (formatting, date handling).
- `analysis.ts` (in `learn/`): Logic for parsing AI-generated analysis text.
