# Architecture

This document is the source of truth for Janus's target file structure and module boundaries.

The repo is in transition. Apply this structure to all new code, and move touched code toward it incrementally. Do not do broad drive-by reshuffles unless the task explicitly calls for them.

## Goals

- Follow TanStack Start's client/server boundary model instead of older controller-style patterns.
- Organize business code by feature so each area has one obvious home.
- Preserve a Rails-like concern decomposition inside each feature without creating a deep generic service stack.
- Keep routes focused on URL behavior and route-level page assembly.
- Keep shared code small and deliberate.

## Top-Level Structure

```text
src/
  app/           # App shell, router setup, root document, nav, global chrome
  routes/        # TanStack Start route entrypoints and route-level page assembly
  ui/            # Reusable design-system primitives
  shared/        # Tiny set of cross-feature helpers/hooks/types
  db/            # Database schema, connection, migrations
  integrations/  # External API adapters and SDK wrappers
  features/      # Business code, organized by feature
```

## Folder Ownership

- `src/app/*`
  App-level pieces such as `router.tsx`, the root shell, navigation, theme wiring, PWA wiring, and app-wide not-found/error presentation.
- `src/routes/*`
  File-based TanStack Start routes. Routes own params, search parsing, redirects, `notFound`, loader deps, cache priming, and straightforward page assembly from feature-owned components.
- `src/ui/*`
  Reusable design-system primitives. These should not import feature code.
- `src/shared/*`
  Truly cross-feature helpers, hooks, and types. This folder stays small and mostly flat. Nothing goes here until a second real consumer proves the abstraction.
- `src/db/*`
  Drizzle schema, connection, and migrations.
- `src/integrations/*`
  Low-level adapters for TMDB, RAWG, Google Books, ComicVine, AniList, and similar external systems.
- `src/features/*`
  Feature-owned UI, query/mutation surfaces, server implementations, tests, and feature-local helpers.

## Feature Layout

Features are the primary unit of ownership.

```text
src/features/watchlists/
  components/
    WatchlistCard.tsx
    WatchlistSelector.tsx

  list/
    WatchlistList.ts
    WatchlistList.server.ts
    WatchlistListScreen.tsx
    WatchlistList.test.ts

  detail/
    WatchlistDetail.ts
    WatchlistDetail.server.ts
    WatchlistDetailScreen.tsx
    OptimisticWatchlist.ts
    WatchlistDetail.test.ts

  create/
    CreateWatchlist.ts
    CreateWatchlist.server.ts
    CreateWatchlistSchema.ts

  merge/
    MergeWatchlists.ts
    MergeWatchlists.server.ts
    MergeWatchlistsSchema.ts
```

Rules:

- Use shallow use-case folders such as `list/`, `detail/`, `create/`, and `merge/`.
- Name files by the responsibility they capture, not just their role. The filename should tell you the domain concept. For example, `InsertOrderedItem.server.ts` is better than `Mutation.server.ts` because it describes what the module does.
- Use responsibility-based PascalCase filenames. Do not use generic role-only names such as `Query.ts`, `Mutation.ts`, `Schema.ts`, or `Screen.tsx`.
- Put UI shared across multiple use cases in `src/features/<feature>/components/*`.
- Put UI used by only one use case in that use-case folder.

## Safe And Server-Only Files

TanStack Start is isomorphic by default. Make server boundaries obvious.

Client-safe files include:

- `WatchlistDetail.ts`
- `CreateWatchlist.ts`
- `WatchlistDetailScreen.tsx`
- `CreateWatchlistSchema.ts`
- `WatchlistTypes.ts`
- pure helpers without server-only imports

Server-only files use the `.server.ts` suffix, for example:

- `WatchlistDetail.server.ts`
- `CreateWatchlist.server.ts`
- `tmdb/SearchMovies.server.ts`

Rules:

- Routes, `src/ui/*`, `src/shared/*`, and other client-safe modules must not import `.server.ts` files directly.
- React components must call TanStack Start server functions through `useServerFn(serverFn)`.
- Safe responsibility-based modules such as `WatchlistDetail.ts` and `CreateWatchlist.ts` expose `createServerFn` boundaries.
- `.server.ts` files may import `src/db/*`, `src/integrations/*`, and other server-only modules.
- Do not use `"use server"` or `"use client"` directives unless there is a documented framework requirement.

## Dependency Direction

- `src/routes/*` may import from `src/app/*`, `src/ui/*`, `src/shared/*`, and safe feature entrypoints.
- `src/ui/*` must stay feature-agnostic.
- `src/integrations/*` must not import from features.
- Feature server files may depend on `src/db/*`, `src/integrations/*`, and feature-local modules.
- Cross-feature imports should prefer safe entrypoints. Cross-feature server coupling should stay rare.

## Route Responsibilities

Routes own URL behavior and route-level page assembly:

- param parsing
- search validation and defaults
- redirects
- `notFound`
- `loaderDeps`
- cache seeding and prefetch wiring
- route-level data loading through safe feature query surfaces
- composing feature-owned components into the page
- route-local providers needed by that page

Routes may compose feature components directly when the route is mostly arranging already-focused pieces. Do not create a feature screen module solely to keep a route file visually small.

Move code out of the route when it introduces a separate reason to change, such as:

- reusable page sections
- complex JSX subtrees
- domain-specific display logic
- local workflow state that belongs behind a feature component or provider
- business rules or data transformations

## Error Handling And Data Surfaces

- Expected user-facing failures from `createServerFn` should return structured objects such as `{ success: false, message }`.
- Reserve throws for `redirect`, `notFound`, and truly unexpected defects.
- Keep feature-owned query keys and query helpers with the owning feature.

## Anti-Patterns To Avoid

- A global `src/models/*` layer owning feature behavior.
- A catch-all `src/server/*` folder mixing business logic, integrations, and app infrastructure.
- Feature-specific UI in top-level shared component folders.
- Direct `.server.ts` imports from routes or shared client-safe modules.
- Early extraction into `src/shared/*` before a second real consumer exists.
- `index.ts` or `index.server.ts` barrels that add indirection without lasting navigation value.

## Incremental Migration Rules

- New code follows this document even if nearby legacy code does not.
- Touched code should move one step closer to this structure when the move is small and clarifying.
- Do not move unrelated files just to satisfy the target tree.
- When in doubt, prefer the smallest change that improves feature ownership and server safety.

## Current Repo Migration Targets

- Move watchlist-specific UI from `src/components/*` and `src/components/watchlist/*` into `src/features/watchlists/*`.
- Replace top-level `src/server/search.ts` with a search feature-owned query surface and server implementation.
- Move external provider code from `src/server/providers/*` into `src/integrations/*`.
- Move business ownership out of `src/models/*` and into feature-local `.server.ts` modules.
