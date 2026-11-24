# Janus v1 Architecture & Code Style

This document is the source of truth for Janus **v1** (`src/`, React + TanStack Start + Chakra UI) file structure, placement, module boundaries, and frontend code style. Janus **v2** is a separate Rust crate under `v2/` with its own conventions — see [`v2/README.md`](v2/README.md).

Apply this structure to all new v1 code and move touched code toward it incrementally. Do not do broad drive-by reshuffles unless the task explicitly calls for them.

## Goals

- Follow TanStack Start's client/server boundary model instead of older controller-style patterns.
- Organize business code by feature so each area has one obvious home.
- Preserve a Rails-like concern decomposition inside each feature without creating a deep generic service stack.
- Keep routes focused on URL behavior and route-level page assembly.
- Keep shared code small and deliberate.

## Top-Level Structure (`src/`)

```text
src/
  app/           # App shell, theme/provider/toaster, MCP endpoint & tools
  routes/        # TanStack Start file-based routes and route-level page assembly
  components/    # App-wide UI chrome (BottomNav, NotFound, PwaUpdatePrompt)
  shared/        # Tiny set of truly cross-feature helpers/logging/types
  db/            # Drizzle schema, SQLite connection, migrations, preview seed
  integrations/  # External API adapters and transport wrappers
  features/      # Business code, organized by feature (watchlists, search, lineups)
```

Legacy folders still present during incremental migration: `src/server/` (provider adapters being moved into `src/integrations/`), `src/hooks/`, `src/lib/`, `src/utils/`. Chakra UI v3 is the shared component and theming foundation (`src/app/Theme.ts`); there is no separate `src/ui/` folder.

## Placement Workflow

When adding or moving v1 code, ask these questions in order:

1. URL or route concern (`validateSearch`, param parsing, redirects, `notFound`, `loaderDeps`, cache priming, route-level page assembly)? Put it in `src/routes/*`.
2. Business logic or UI for one product area? Put it in `src/features/<feature>/*`.
3. UI reused across multiple use cases within one feature? Put it in `src/features/<feature>/components/*`.
4. App shell, theme, toaster, or MCP server wiring? Put it in `src/app/*` (or app-wide chrome in `src/components/*`).
5. Low-level external API adapter or SDK wrapper? Put it in `src/integrations/<provider>/*.server.ts`.
6. Database schema, connection, migration, or seed code? Put it in `src/db/*`.
7. Truly cross-feature and already used by at least two real consumers? Put it in `src/shared/*`.

If the answer is no at every step, keep the code in the owning feature until a clearer shared boundary emerges.

## Feature Layout

Features are the primary unit of ownership:

```text
src/features/watchlists/
  components/
    WatchlistCard.tsx
    WatchlistFormDialog.tsx

  home/
    WatchlistHome.ts
    HomeHeader.tsx
    WatchlistGrid.tsx

  detail/
    WatchlistDetailScreen.tsx
    WatchlistDetailCache.ts
    DiscoverWatchlist.server.ts

  create/
    CreateWatchlist.ts
    CreateWatchlist.server.ts
    CreateWatchlistSchema.ts
```

Rules:

- Use shallow use-case folders such as `home/`, `detail/`, `create/`, `edit/`, `merge/`, `remove/`.
- Put UI shared across multiple use cases in `src/features/<feature>/components/*`; do not promote it to `src/shared/*` just because two files in one feature use it.
- Put UI used by only one use case in that use-case folder.
- Prefer short, domain-based filenames and folders over thin wrapper modules.

## Naming Rules

- Name files by the responsibility they capture, not just their role (`InsertOrderedItem.server.ts`, not `Mutation.server.ts`).
- Use PascalCase for TypeScript filenames, including component and non-component modules (`ModelUpdater.ts`, `WatchlistSelector.tsx`). Enforced by `.oxlintrc.json`.
- Hooks may use lower camelCase beginning with `use` (`useSearchResults.ts`).
- Keep suffixes lowercase (`ModelUpdater.server.ts`, `ModelUpdater.test.ts`).
- TanStack route filenames under `src/routes/*` are exempt because their names define routes.
- Do not use generic role-only filenames such as `Query.ts`, `Mutation.ts`, `Schema.ts`, `Screen.tsx`, or `Types.ts`.
- Use `.server.ts` for any file that touches the database, secrets, file system, or server-only SDKs.
- Avoid `index.ts` and `index.server.ts` barrels unless they provide clear, durable navigation value.
- Keep type definitions in the file that creates or derives them. Avoid standalone `types.ts` files that only re-export types. Prefer minimal structural types in pure-algorithm modules over importing DB-derived types.

## Safe And Server-Only Boundaries (TanStack Start)

TanStack Start is isomorphic by default. Prefer current TanStack Start guidance over older local patterns when the two disagree.

- Routes, `src/components/*`, `src/shared/*`, and other client-safe modules must not import `.server.ts` files directly.
- Safe responsibility-based modules expose `createServerFn` boundaries; `.server.ts` files may import `src/db/*`, `src/integrations/*`, and other server-only modules.
- In React components, call TanStack Start server functions through `useServerFn(serverFn)` instead of invoking server functions directly from event handlers, mutations, or query functions.
- Encapsulate every `useQuery` and `useMutation` call in a feature-owned custom hook. Components should consume the hook's data and actions rather than configure queries or mutations inline.
- Keep feature-owned query keys and query options in the feature module, and include every loader/search/filter input that affects returned data in the query key.
- Expected user-facing failures from `createServerFn` must return structured objects such as `{ success: false, message }` instead of throwing. Reserve throws for `redirect`, `notFound`, and truly unexpected defects.
- Do not use `"use server"` or `"use client"` directives unless there is a documented, current framework requirement. Remove them when encountered.

## Dependency Direction

- `src/routes/*` may import from `src/app/*`, `src/components/*`, `src/shared/*`, and safe feature entrypoints.
- `src/integrations/*` must not import from features.
- Feature server files may depend on `src/db/*`, `src/integrations/*`, and feature-local modules.
- Cross-feature imports should prefer safe entrypoints. Cross-feature server coupling should stay rare.

## Route Responsibilities

Routes own URL behavior and route-level page assembly: param parsing, search validation and defaults, redirects, `notFound`, `loaderDeps`, cache seeding/prefetch wiring, route-level data loading through safe feature surfaces, composing feature-owned components, and route-local providers.

- Keep small route-specific loader logic in the route file. Do not extract route loaders into wrapper functions unless extraction adds real value through reuse, deeper domain logic, or a stable shared boundary.
- Routes may compose feature components directly when mostly arranging focused pieces; do not create a screen module solely to keep a route file visually small.
- Move code out of the route when it introduces a separate reason to change (reusable sections, complex JSX subtrees, domain display logic, local workflow state, or business rules).

## JSX Rendering & Code Style

- **Component-owned JSX (enforced on staged `.tsx` files by `tools/oxlint/ComponentRendering.js`):**
  - JSX must be created in the direct return tree of a named PascalCase component. Do not store JSX in variables or return it from rendering helpers and callbacks.
  - JSX children must be values, elements, or conditional expressions rather than function calls. Compute scalar display values before the return and extract rendered subtrees into named components.
  - When reducing cyclomatic complexity in a component, extract a meaningful named component instead of moving render decisions into a value-returning helper.
  - Touching a legacy TSX file requires resolving its component-rendering violations without forcing a repository-wide migration.
- Keep JSX declarative and rendering-only. Move complex parsing, transformation, and branching into component logic or a child component. Components over 50 lines must be placed in their own adjacent file.
- Prefer declarative and functional code over imperative code:
  - Prefer array methods (`map`, `filter`, `reduce`, `find`), computed values, pure functions, declarative pipelines, and module-level constants/functions over class-based state.
  - Avoid manual `for`/`while` loops where array methods are clearer, mutating state in place, and procedural accumulation.

## Anti-Patterns To Avoid

- A global `src/models/*` layer owning feature behavior.
- A catch-all `src/server/*` folder mixing business logic, integrations, and app infrastructure.
- Feature-specific UI in top-level shared component folders.
- Direct `.server.ts` imports from routes or shared client-safe modules.
- Early extraction into `src/shared/*` before a second real consumer exists.
- `index.ts` or `index.server.ts` barrels without lasting navigation value.

## Incremental Migration Targets

- Move remaining external provider adapters from `src/server/providers/*` into `src/integrations/*`.
- Place new code according to this document even if nearby legacy code differs; only move touched legacy files when the move materially reduces confusion.

<!-- intent-skills:start -->

# Skill mappings - when working in these areas, load the linked skill file into context.

skills:

- task: "TanStack Start app structure, router setup, root shell, and entries"
  load: "node_modules/@tanstack/react-start/skills/react-start/SKILL.md"
- task: "route loaders, staleTime, pending states, and router context wiring"
  load: "node_modules/@tanstack/router-core/skills/router-core/data-loading/SKILL.md"
- task: "dynamic route params like $watchlistId and route param parsing"
  load: "node_modules/@tanstack/router-core/skills/router-core/path-params/SKILL.md"
- task: "notFound handling, error boundaries, and route error behavior"
  load: "node_modules/@tanstack/router-core/skills/router-core/not-found-and-errors/SKILL.md"
- task: "createServerFn, server/client execution boundaries, and server-only imports"
  load: "node_modules/@tanstack/start-client-core/skills/start-core/server-functions/SKILL.md"

<!-- intent-skills:end -->

Regenerate the mappings above with `pnpm dlx @tanstack/intent install` (targeting this file). Keep each `load` indented under its own `task` item and keep the blank line before the end marker, otherwise `oxfmt` dedents the final `load` and the mapping stops resolving. `pnpm run check:agents` verifies this block and runs as part of `pnpm run lint`.
