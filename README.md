# Fluentlyby.ai

A TanStack Start + Supabase workspace for syncing a YouTube playlist, generating Gemini-powered video analyses, and chatting across one or more videos.

## Features

- Email sign-up and sign-in with Supabase Auth
- YouTube OAuth connect with automatic "Fluentlyby AI" playlist creation
- **Automated background sync** - System automatically detects new videos added to playlist
- Prompted video analysis with Gemini via TanStack AI
- Analysis history per video with status tracking
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

- Set the redirect URI to `http://localhost:3000/playlists` (or your production URL).
- Enable the YouTube Data API in your Google Cloud project.
- Use the `https://www.googleapis.com/auth/youtube` scope (full access for creating playlists).

## Local Development

### Manual Sync Trigger

For local development, you can manually trigger sync jobs using the trigger script:

```bash
# Trigger sync for all due playlists
npm run trigger-sync

# Trigger sync for a specific user
npm run trigger-sync -- --userId <user-id>

# Trigger sync for a specific playlist
npm run trigger-sync -- --playlistId <playlist-id>
```

The script will:

- Find all playlists that need syncing (where `next_sync_at` is null or <= now)
- Run the sync process directly
- Update `next_sync_at` for each playlist

Make sure you have the required environment variables set:

- `SUPABASE_URL` or `VITE_SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## Tech

- TanStack Start + Router + Query
- Supabase Auth + Postgres with RLS
- TanStack AI + Gemini adapter
- Tailwind CSS v4
