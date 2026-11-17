# v1 App Routes And Frontend Style

Janus v1 is the React/TanStack Start application under `src/`. V2 is a separate
Rust crate under `v2/` with its own conventions (see `v2/README.md`). This file
holds the v1 placement and code-style rules that `AGENTS.md` used to carry.

## Route And Feature Boundaries

- Put business code under `src/features/*`, app shell code under `src/app/*`, design-system primitives under `src/ui/*`, and external adapters under `src/integrations/*`.
- Use shallow feature use-case folders with responsibility-based PascalCase names such as `detail/WatchlistDetail.ts`, `detail/WatchlistDetail.server.ts`, and `detail/WatchlistDetailScreen.tsx`.
- Prefer current TanStack Start guidance over older local patterns when the two disagree.
- Keep small route-specific loader logic in the route file. Param parsing, route defaults, redirects, and `notFound` handling usually belong in the route.
- Do not extract route loaders into wrapper functions unless the extraction adds real value through reuse, deeper domain logic, or a stable shared boundary.
- Shared route modules must not import `.server` modules directly. Routes are part of the shared module graph, and direct `.server` imports can leak server-only dependencies into the client bundle.
- Avoid `index.ts` / `index.server.ts` barrels unless they provide a clear, durable navigation benefit.
- Keep type definitions in the file that creates or derives them. Avoid standalone `types.ts` files that only re-export types from other modules. When a type is consumed across module boundaries, export it from the module that owns the derivation (e.g., the file that imports the DB schema) and import it where needed. Prefer minimal structural types in pure-algorithm modules over importing DB-derived types.
- Prefer short, domain-based filenames and folders over thin wrapper modules.
- Do not use `"use server"` or `"use client"` directives. Prefer framework-native boundaries such as `createServerFn`, route/module boundaries, and `.server` files where appropriate.
- Remove `"use server"` and `"use client"` directives when you encounter them unless there is a documented, current framework requirement that makes one unavoidable.
- In React components, call TanStack Start server functions through `useServerFn(serverFn)` instead of invoking server functions directly from event handlers, mutations, or query functions.
- Encapsulate every `useQuery` and `useMutation` call in a feature-owned custom hook. Components should consume the hook's data and actions rather than define query or mutation configuration inline.
- Keep feature-owned query keys and query options in the feature module, and include every loader/search/filter input that affects returned data in the query key.
- For `createServerFn` and other TanStack response surfaces, expected user-facing failures must return structured error objects such as `{ success: false, message }` instead of throwing. Reserve throws for framework control flow like `redirect` / `notFound` or truly unexpected defects.

## Code Style

Keep JSX declarative and rendering-only. Trivial expressions such as string concatenation and one-line ternaries may stay in JSX, but move more complex parsing, transformation, and branching into component logic or a child component. Components over 50 lines must be placed in their own adjacent file.

Prefer declarative and functional code over imperative code.

### Prefer

- Array methods (`map`, `filter`, `reduce`, `find`) over manual loops
- Computed values over mutation
- Pure functions over side effects
- Declarative data transformations over imperative accumulation
- Module-level constants and functions over class-based state where appropriate

### Avoid

- Manual `for`/`while` loops where array methods would be clearer
- Mutating state in place
- Procedural step-by-step logic when a functional pipeline reads better
