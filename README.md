# YouChannel

YouChannel is the user-facing web app for importing YouTube playlists and
turning videos into language-learning material. It uses TanStack Start,
Supabase Auth/Postgres, YouTube Data API, and Gemini.

This repository also contains the canonical Supabase schema for the whole
product. Apply migrations from this repo when setting up a full local or
production environment.

## What This App Does

- Email and Google sign-in through Supabase/Auth UI flows.
- YouTube OAuth connection with read-only playlist access.
- Playlist and video import from YouTube.
- Video analysis requests sent to the jobs service through
  `POST /openapi/analysis`.
- Library, learning, shadowing practice, quota display, and Gemini Live
  practice flows.
- Localized UI via Inlang/Paraglide message files.

## Related Repositories

- `../youchannel-service`: Fastify jobs API, pg-boss workers, admin console,
  and the OpenAPI analysis ingestion endpoint.
- `../youchannel-openapi-analysis-docs`: Scalar docs for the public analysis
  API.

## Prerequisites

- Node.js 22.
- pnpm 9+.
- Docker, for local Supabase.
- Supabase CLI 2+.
- A Supabase project, local or hosted.
- Google Cloud OAuth credentials with YouTube Data API enabled.
- A Gemini API key.

## Local Development

1. Install dependencies.

   ```bash
   pnpm install
   ```

2. Start Supabase and apply the full schema.

   ```bash
   supabase start
   supabase db reset
   supabase status
   ```

   Use `supabase status` to copy the local API URL, anon key, service role key,
   and database URL if another service needs direct Postgres access.

3. Create the app env file.

   ```bash
   cp .env.example .env
   ```

4. Fill the required variables.

   ```ini
   VITE_BASE_URL=http://localhost:3000

   VITE_SUPABASE_URL=http://127.0.0.1:54321
   VITE_SUPABASE_ANON_KEY=<local anon key>
   SUPABASE_URL=http://127.0.0.1:54321
   SUPABASE_ANON_KEY=<local anon key>
   SUPABASE_SERVICE_ROLE_KEY=<local service role key>

   GOOGLE_API_KEY=<gemini key>
   GOOGLE_LIVE_API_KEY=<gemini live key, or the same key if enabled>
   GEMINI_MODEL=gemini-2.5-flash

   GOOGLE_OAUTH_CLIENT_ID=<google oauth client id>
   GOOGLE_OAUTH_CLIENT_SECRET=<google oauth client secret>
   GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/playlists
   VITE_GOOGLE_OAUTH_CLIENT_ID=<google oauth client id>

   OPENAPI_BASE_URL=http://localhost:4000
   OPENAPI_SHARED_KEY=<same value as the jobs service>
   ```

5. Start the jobs service before using video analysis.

   ```bash
   cd ../youchannel-service
   cp apps/jobs/.env.example apps/jobs/.env
   cp apps/admin/.env.example apps/admin/.env
   pnpm install
   pnpm -C apps/jobs dev
   ```

   The user app can run without the jobs service for sign-in and basic browsing,
   but playlist video analysis needs `OPENAPI_BASE_URL` to be reachable.

6. Start the user app.

   ```bash
   cd ../youchannel
   pnpm dev
   ```

   The app runs at `http://localhost:3000`.

## Google Setup

Create an OAuth client in Google Cloud and enable the YouTube Data API.

Local redirect URI:

```text
http://localhost:3000/playlists
```

Production redirect URI:

```text
https://<your-app-domain>/playlists
```

The app currently requests the `https://www.googleapis.com/auth/youtube.readonly`
scope and stores access/refresh tokens in Supabase.

## Supabase Setup

For local development, `supabase db reset` applies every migration and seed from
`supabase/`.

For hosted Supabase:

```bash
supabase link --project-ref <project-ref>
supabase db push
```

Then configure Supabase Auth:

- Site URL: `https://<your-app-domain>` in production.
- Additional redirect URLs: local and production app URLs.
- Email provider or Google provider as desired for user sign-in.

## Production Deployment On Fly.io

The Docker image needs public client values at build time. Runtime secrets are
set with Fly secrets and are not committed to `fly.toml`.

1. Create the app if needed.

   ```bash
   fly apps create youchannel
   ```

2. Set runtime secrets.

   ```bash
   fly secrets set \
     VITE_BASE_URL=https://<your-app-domain> \
     SUPABASE_URL=https://<project-ref>.supabase.co \
     SUPABASE_ANON_KEY=<supabase anon key> \
     SUPABASE_SERVICE_ROLE_KEY=<supabase service role key> \
     GOOGLE_API_KEY=<gemini key> \
     GOOGLE_LIVE_API_KEY=<gemini live key> \
     GEMINI_MODEL=gemini-2.5-flash \
     GOOGLE_OAUTH_CLIENT_ID=<google oauth client id> \
     GOOGLE_OAUTH_CLIENT_SECRET=<google oauth client secret> \
     GOOGLE_OAUTH_REDIRECT_URI=https://<your-app-domain>/playlists \
     OPENAPI_BASE_URL=https://<your-service-domain> \
     OPENAPI_SHARED_KEY=<shared key>
   ```

3. Deploy with public build args.

   ```bash
   fly deploy \
     --build-arg VITE_SUPABASE_URL=https://<project-ref>.supabase.co \
     --build-arg VITE_SUPABASE_ANON_KEY=<supabase anon key> \
     --build-arg VITE_GOOGLE_OAUTH_CLIENT_ID=<google oauth client id>
   ```

## Useful Commands

```bash
pnpm dev          # start TanStack Start dev server
pnpm build        # production build
pnpm start        # run built server from .output
pnpm lint         # eslint
pnpm format       # prettier
pnpm db:migrate   # supabase db push
```

## Troubleshooting

- `Missing VITE_SUPABASE_URL` or `Missing SUPABASE_URL`: check both the public
  `VITE_*` variables and server-side Supabase variables in `.env`.
- YouTube OAuth redirects but does not connect: confirm the Google OAuth
  redirect URI is exactly `/playlists` for the current domain.
- Analysis requests fail with `OpenAPI service unavailable`: start
  `youchannel-service` and make sure `OPENAPI_BASE_URL` and
  `OPENAPI_SHARED_KEY` match the service env.
- Hosted Supabase connection failures from the service often come from a
  malformed `DATABASE_URL`; URL-encode special characters in the database
  password.
