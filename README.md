# YouChannel Studio

A TanStack Start + Supabase workspace for syncing a YouTube playlist, generating Gemini-powered video analyses, and chatting across one or more videos.

## Features

- Email sign-up and sign-in with Supabase Auth
- YouTube OAuth connect with automatic "YouChannel AI" playlist creation
- **Automated background sync** - System automatically detects new videos added to playlist
- Prompted video analysis with Gemini via TanStack AI
- Analysis history per video with status tracking
- Free tier quota system (3 analyses, max 10 min video duration)
- Playlist status management with restore/re-auth capabilities
- Skip duplicate analysis runs when a prompt has already been processed

## Setup

1. Install dependencies:

   ```bash
   pnpm install
   ```

2. Copy the environment template:

   ```bash
   cp .env.example .env
   ```

3. Fill in the required values:
   - Supabase: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`
   - Gemini: `GOOGLE_API_KEY` (or `GEMINI_API_KEY`)
   - YouTube OAuth: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REDIRECT_URI`
   - Sync API: `SYNC_API_KEY` (secure random string for background sync endpoint)
   - Optional: `FREE_USER_MAX_ANALYSES` (default: 3), `FREE_USER_MAX_VIDEO_DURATION` (default: 600 seconds)

4. Run Supabase migrations:

   ```bash
   pnpm supabase db reset
   ```

5. Start the dev server:
   ```bash
   pnpm dev
   ```

## YouTube OAuth notes

- Set the redirect URI to `http://localhost:3000/connect-youtube` (or your production URL).
- Enable the YouTube Data API in your Google Cloud project.
- Use the `https://www.googleapis.com/auth/youtube` scope (full access for creating playlists).

## Background Sync API

The system provides an API endpoint for automated background syncing:

```bash
# Sync all active playlists
POST /api/sync/run
Authorization: Bearer <SYNC_API_KEY>

# Optional: Sync specific user's playlists
POST /api/sync/run
Authorization: Bearer <SYNC_API_KEY>
Content-Type: application/json
{"userId": "<user-id>"}

# Health check
GET /api/sync/run
Authorization: Bearer <SYNC_API_KEY>
```

## Fly.io background jobs

For Fly.io deployments, use three process groups so sync runs as a queue:

- `web` - TanStack Start app (`node .output/server/index.mjs`)
- `scheduler` - enqueue due playlists (`node dist/scheduler.js`)
- `worker` - consume jobs (`node dist/worker.js`)

Run the latest Supabase migrations to create the `jobs` table and
`playlists.next_sync_at`. See `fly.toml` for the process definitions.
Make sure `pnpm build` runs so `dist/` contains the scheduler/worker output.

### HTTP scheduling options (legacy)

If you prefer to drive sync via HTTP, you can still call the endpoint on a
schedule:

1. **Vercel Cron** - Add to `vercel.json`:
   ```json
   {
     "crons": [{
       "path": "/api/sync/run",
       "schedule": "*/10 * * * *"
     }]
   }
   ```

2. **GitHub Actions** - Use a scheduled workflow to call the endpoint

3. **External Cron Service** - Any service that supports HTTP webhooks

### Sync Behavior

- Scans all active playlists every sync interval
- Detects new videos and triggers analysis automatically
- Handles removed videos (marks as "removed" but preserves existing analyses)
- Respects user quotas (3 free analyses, max 10 min video duration)
- Idempotent - safe to call multiple times without duplicate processing

## Tech

- TanStack Start + Router + Query
- Supabase Auth + Postgres with RLS
- TanStack AI + Gemini adapter
- Tailwind CSS v4 styled for Material Design 3
