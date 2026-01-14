# BACKEND KNOWLEDGE BASE (src/lib/server)

## OVERVIEW

Core backend logic, Auth orchestration, RPC layers, and External API integrations.
Strictly server-side; depends on Supabase SSR and TanStack Start server utilities.

## MODULE MAP

- `auth.server.ts`: Supabase SSR client factory. Cookie-based session persistence.
- `auth.ts`: Auth-related `createServerFn` (e.g., `signOutFn`).
- `db.ts`: Database client and schema utilities.
- `gemini.ts`: Server-side AI generation via TanStack AI. Logs to `logs/gemini.log`.
- `quotas.ts`: Complex grant aggregation. Merges multiple `quota_grants` into `UserQuotaSummary`.
- `user.ts`: User data and quota summary retrieval functions.
- `youtube.ts`: Pure API wrappers for YouTube Data API. Logs to `logs/youtube-playlists.log`.

## AUTH FLOW

- **SSR Identity**: `getSupabaseServerClient` uses TanStack `getCookies` for session recovery.
- **Enforcement**: Server functions use `getSupabaseAndUser` to verify JWT and retrieve metadata.
- **OAuth Linkage**: `youtube.ts` handles code exchange and token refreshing for Google services.
- **Persistence**: Auth state maintained via Supabase `auth` schema; metadata in `public.users`.
