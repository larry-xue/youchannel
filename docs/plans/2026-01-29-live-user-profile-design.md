# Live User Profile (Live-only) — Design

## Goal

Improve Gemini Live conversation quality by providing richer **user-specific context** while
keeping friction low and avoiding sensitive data retention.

Scope is **Live voice chat only** (TanStack Start route: `src/routes/_layout/live.tsx`).

## High-level UX

- Entry is **non-blocking**: a small control in the **bottom-left** of the Live page.
- First visit shows a one-time hint: “You can adjust in the bottom-left”.
- Onboarding runs in a dialog with a short guided flow (driver.js):
  1. **Mic intro**: user records ~20–40s describing goals, preferences, correction style, and
     favorite topics. Audio is used only for generation and is never stored.
  2. **Geo permission (optional)**: request `navigator.geolocation`. If granted, the app sends a
     **rounded** lat/lng to Gemini, which uses `googleSearch` tool to infer
     `{country, region, city}`. The raw coordinates are never persisted.
  3. **Generate v1**: Gemini returns:
     - `manual_text`: a compact plain-text “user manual” appended to Live system prompt
     - `data` (jsonb): structured fields (geo/timezone/locale) for future extensions
- Changes apply **next time** the user starts Live (no mid-session reconnect).

## Data model (Supabase)

Append-only versioning:

- `public.live_user_profiles` (1 row per user)
  - `user_id` (PK), `current_version` int, `onboarding_completed_at`, timestamps
- `public.live_user_profile_versions` (history)
  - `user_id`, `version` (unique per user), `manual_text`, `data jsonb`, `source jsonb`,
    `created_at`

Writes go through a Postgres RPC (transactional bump + insert) to guarantee monotonic versions.

## Prompt integration

When starting a Live session, the system instruction is:

`LIVE_SYSTEM_PROMPT + deviceContext + profileContext`

Where `profileContext` is derived from the **current profile version** and includes only
high-signal fields (manual text + inferred region + timezone + locale).

## Privacy & safety

- No audio storage.
- No raw lat/lng storage; only derived region fields.
- Geo is optional and never blocks Live.
- Profile UI is not exposed (no view/edit); only an entry point to (re)generate.
