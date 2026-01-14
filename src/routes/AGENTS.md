# AGENTS: src/routes

## OVERVIEW

- **Framework**: TanStack Router (File-based).
- **Core**: SSR-ready, client-side data fetching via TanStack Query.
- **Context**: `{ queryClient, authStore }` injected at root.

## ROUTING MAP

- `__root.tsx`: Global entry. Handles `beforeLoad` auth & `head` meta.
- `_layout/`: Auth boundary. Redirects to `/signin` if `context.user` null.
  - `library.tsx`: Paginated video library. Uses `zod` for `validateSearch`.
  - `playlists.tsx`: YouTube playlist explorer. Manual `validateSearch`.
  - `learn/$videoId.tsx`: Main AI learning interface. Resizable panels.
  - `quotas.tsx`: User usage tracking.
- `signin.tsx`: Public auth entry.
- `$.tsx`: Global 404 catch-all.
- `api/`: Server-side API endpoints (e.g., `character-chat.ts`).

## DATA FETCHING STRATEGY

- **NO Loaders**: Zero data fetching in Router loaders to prevent waterfall/blocking.
- **TanStack Query**: All data fetched in components via `useQuery` / `useInfiniteQuery`.
- **loaderDeps**: Tracks search params/ID changes to trigger Query invalidation/re-fetch.
- **validateSearch**: Mandatory for type-safe search params. Zod preferred (see `library.tsx`).
- **State Flow**: `beforeLoad` (Auth) -> `useSearch/useParams` -> `useQuery` (Data).
