# AGENTS

## Architecture Docs

- `ARCHITECTURE.md` is the source of truth for Janus's target file structure, ownership model, and dependency rules.
- `CONTRIBUTING.md` is the placement guide for new files and incremental migrations.
- When adding files, moving modules, or introducing new boundaries, read those docs first and follow them.
- Apply the target structure to new code and touched areas. Do not do broad drive-by reorganizations unless the user asks for them.

## Git Conventions

Agents should commit and push work frequently without explicit user request, and create branches/PRs instead of committing directly to main.

### On a feature branch

- Commit and push after completing a meaningful unit of work (new feature, refactor, bug fix, etc.)
- Do NOT wait for explicit user request to commit
- One commit per logical change, not per edit
- Push immediately after committing

### On main branch (assigned a ticket)

- Do NOT commit directly to the main branch; instead, create a new branch with a conventional branch name (e.g., feat/watchlists-write-boundary, fix/search-pagination)
- Implement the work on that branch with frequent commits/pushes
- Open a PR when the work is ready for review

### Conventions

- Use conventional branch names matching the ticket/work (e.g., type/branch-description)
- Use conventional commit messages: `type(scope): summary` when a scope adds clarity, or `type: summary` when it does not.
- Use conventional pull request titles in the same format
- Prefer standard conventional commit types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `build`
- Open PRs as ready for review by default. Create draft PRs only when explicitly requested.

## Database Migrations

- Never edit `drizzle/*.sql` files directly.
- Always generate SQL migrations and snapshot updates through the Drizzle CLI from schema changes.

## Route And Feature Boundaries

- Put business code under `src/features/*`, app shell code under `src/app/*`, design-system primitives under `src/ui/*`, and external adapters under `src/integrations/*`.
- Use shallow feature use-case folders with short role names such as `detail/query.ts`, `detail/query.server.ts`, and `detail/screen.tsx`.
- Prefer current TanStack Start guidance over older local patterns when the two disagree.
- Keep small route-specific loader logic in the route file. Param parsing, route defaults, redirects, and `notFound` handling usually belong in the route.
- Do not extract route loaders into wrapper functions unless the extraction adds real value through reuse, deeper domain logic, or a stable shared boundary.
- Shared route modules must not import `.server` modules directly. Routes are part of the shared module graph, and direct `.server` imports can leak server-only dependencies into the client bundle.
- Avoid `index.ts` / `index.server.ts` barrels unless they provide a clear, durable navigation benefit.
- Prefer short, domain-based filenames and folders over thin wrapper modules.
- Do not use `"use server"` or `"use client"` directives. Prefer framework-native boundaries such as `createServerFn`, route/module boundaries, and `.server` files where appropriate.
- Remove `"use server"` and `"use client"` directives when you encounter them unless there is a documented, current framework requirement that makes one unavoidable.
- In React components, call TanStack Start server functions through `useServerFn(serverFn)` instead of invoking server functions directly from event handlers, mutations, or query functions.
- Keep feature-owned query keys and query options in the feature module, and include every loader/search/filter input that affects returned data in the query key.
- For `createServerFn` and other TanStack response surfaces, expected user-facing failures must return structured error objects such as `{ success: false, message }` instead of throwing. Reserve throws for framework control flow like `redirect` / `notFound` or truly unexpected defects.
- Avoid `any`. Prefer provider result types, local interfaces, explicit narrowing, or typed helper boundaries.

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
