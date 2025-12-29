# YouChannel Studio

A TanStack Start + Supabase workspace for syncing a YouTube channel, generating Gemini-powered video analyses, and chatting across one or more videos.

## Features

- Email sign-up and sign-in with Supabase Auth
- YouTube OAuth connect (readonly) + channel sync
- Prompted video analysis with Gemini via TanStack AI
- Analysis history per video and conversation threads across multiple videos
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

4. Run Supabase migrations:
   ```bash
   pnpm supabase db reset
   ```

5. Start the dev server:
   ```bash
   pnpm dev
   ```

## YouTube OAuth notes

- Set the redirect URI to `http://localhost:3000/dashboard` (or your production URL).
- Enable the YouTube Data API in your Google Cloud project.
- Use the `https://www.googleapis.com/auth/youtube.readonly` scope.

## Scheduling

The dashboard provides manual sync plus an auto-sync toggle that runs every 30 minutes while the page is open. For production scheduling, trigger the sync server function on a timer (for example, with a hosted cron job) and reuse the same prompt hashing logic to avoid duplicate calls.

## Tech

- TanStack Start + Router + Query
- Supabase Auth + Postgres with RLS
- TanStack AI + Gemini adapter
- Tailwind CSS v4 styled for Material Design 3
