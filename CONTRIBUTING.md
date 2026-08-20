# Contributing

Use this document to decide where new code belongs. `ARCHITECTURE.md` defines the target structure and boundary rules. This file is the practical placement guide.

## Placement Workflow

When adding or moving code, ask these questions in order.

1. Is this a URL or route concern?
   Put it in `src/routes/*`.
   Examples: param parsing, `validateSearch`, redirects, `notFound`, `loaderDeps`, route cache priming, route-level data loading, and straightforward page assembly from feature-owned components.
2. Is this business logic or UI for one product area?
   Put it in `src/features/<feature>/*`.
3. Is this UI reused across multiple use cases within one feature?
   Put it in `src/features/<feature>/components/*`.
4. Is this app shell or global chrome?
   Put it in `src/app/*`.
5. Is this a reusable design-system primitive?
   Put it in `src/ui/*`.
6. Is this a low-level external API adapter or SDK wrapper?
   Put it in `src/integrations/*`.
7. Is this database schema, connection, or migration code?
   Put it in `src/db/*`.
8. Is this truly cross-feature and already used by at least two real consumers?
   Put it in `src/shared/*`.

If the answer is no at every step, keep the code in the owning feature until a clearer shared boundary emerges.

## Common Recipes

### New Route

- Add the route file under `src/routes/*`.
- Keep URL behavior and route-level page assembly in the route file.
- Load data through safe feature query or mutation surfaces.
- Compose feature-owned components directly when the route is mostly arranging already-focused pieces.
- Create a feature screen module only when the page composition is substantial enough to deserve its own module.

Example:

```text
src/routes/watchlists/$watchlistId.tsx
src/features/watchlists/detail/WatchlistDetailScreen.tsx
src/features/watchlists/detail/WatchlistDetail.ts
src/features/watchlists/detail/WatchlistDetail.server.ts
```

### New Read Use Case

- Create a shallow use-case folder under the owning feature.
- Give the safe entrypoint a responsibility-based name such as `MediaSearch.ts`.
- Put server-only logic in the matching `.server.ts` file, such as `MediaSearch.server.ts`.
- Put page-sized UI in a responsibility-based file such as `SearchResultsScreen.tsx` when the page composition has its own meaningful responsibility beyond route-level assembly.
  Example:

```text
src/features/search/search/
  MediaSearch.ts
  MediaSearch.server.ts
  SearchResultsScreen.tsx
  MediaSearchSchema.ts
  MediaSearch.test.ts
```

### New Write Use Case

- Create a shallow use-case folder under the owning feature.
- Give the safe entrypoint a responsibility-based name such as `CreateWatchlist.ts`.
- Put server-only logic in the matching `.server.ts` file, such as `CreateWatchlist.server.ts`.
- Put validation in a responsibility-based schema file such as `CreateWatchlistSchema.ts` if it has meaningful reuse or size.

Example:

```text
src/features/watchlists/create/
  CreateWatchlist.ts
  CreateWatchlist.server.ts
  CreateWatchlistSchema.ts
```

### UI Shared Inside One Feature

- Use `src/features/<feature>/components/*`.
- Do not promote it to `src/shared/*` or `src/ui/*` just because two files in one feature use it.

### App-Wide Shared Utility Or Hook

- Keep it out of `src/shared/*` until a second real consumer exists.
- If it lands in `src/shared/*`, keep it generic and stable.

### New External Provider

- Put the adapter in `src/integrations/<provider>/*.server.ts`.
- Keep provider-specific request and response mapping there.
- Let feature server files orchestrate business behavior on top of it.

## Naming Rules

- Name files by the responsibility they capture, not just their role. The filename should tell you the domain concept. For example, `InsertOrderedItem.server.ts` is better than `Mutation.server.ts` because it describes what the module does.
- Use PascalCase for TypeScript filenames, including component and non-component modules. For example, use `ModelUpdater.ts` and `WatchlistSelector.tsx`.
- Hooks may instead use lower camelCase beginning with `use`, such as `useSearchResults.ts`.
- Keep suffixes lowercase, such as `ModelUpdater.server.ts` and `ModelUpdater.test.ts`.
- TanStack route filenames under `src/routes/*` are exempt because their names define routes.
- Do not use generic role-only filenames such as `Query.ts`, `Mutation.ts`, `Schema.ts`, `Screen.tsx`, or `Types.ts`. Name the file after its specific responsibility.
- Use `.server.ts` for any file that touches the database, secrets, file system, or server-only SDKs.
- Avoid `index.ts` and `index.server.ts` unless they provide clear, durable navigation value.

## TanStack Start Rules

- Routes and other client-safe modules must not import `.server.ts` files directly.
- React components must call server functions through `useServerFn(serverFn)`.
- `createServerFn` surfaces should return structured expected failures instead of throwing.
- Do not use `"use server"` or `"use client"` directives unless a documented framework requirement leaves no alternative.

## JSX Rendering Rules

- JSX must be created in the direct return tree of a named PascalCase component. Do not store JSX in variables or return it from rendering helpers and callbacks.
- JSX children must be values, elements, or conditional expressions rather than function calls. Compute scalar display values before the return and extract rendered subtrees into components.
- When reducing cyclomatic complexity in a component, extract a meaningful named component instead of moving render decisions into a value-returning helper.
- These rules run on staged TSX files. Touching a legacy TSX file requires resolving its component-rendering violations without forcing a repository-wide migration.

## Agent Workflow

- Read `ARCHITECTURE.md` before adding new modules or moving existing ones.
- Use this file to pick the destination path before writing code.
- Prefer incremental migration in touched areas over large opportunistic reorganizations.
- If nearby legacy structure conflicts with the target shape, place new code according to the target shape and only move touched files when the move materially reduces confusion.
- When the right location is still unclear, prefer the smallest change that strengthens feature ownership and the safe/server split.
