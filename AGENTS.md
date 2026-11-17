# AGENTS

## Architecture Docs

- `ARCHITECTURE.md` is the source of truth for Janus's target file structure, ownership model, and dependency rules.
- `CONTRIBUTING.md` is the placement guide for new files and incremental migrations.
- When adding files, moving modules, or introducing new boundaries, read those docs first and follow them.
- Apply the target structure to new code and touched areas. Do not do broad drive-by reorganizations unless the user asks for them.

## Running Commands

- v2 setup, checks, tests and module layout: [`v2/README.md`](v2/README.md).
- Prefer the repository's devcontainer when the `devcontainer` CLI is available: start it with `devcontainer up --workspace-folder . --docker-path podman`, then run commands with `devcontainer exec --workspace-folder . --docker-path podman <command>`.
- When using Podman directly, locate the container with `podman ps -a --filter "label=devcontainer.local_folder=$(pwd)"`, confirm it belongs to the current checkout, then run commands with `podman exec --workdir /workspaces/janus <container> <command>`. Never use an unrelated Toolbox or development container.
- On the host, run root `npm ci` once per checkout before v2 tests. Native modules such as `better-sqlite3` must be compiled by the Node that runs the tests: use the `.tool-versions` pin (`mise exec -- <command>`) and set `JANUS_TEST_NODE` when the shell's `node` differs. Never borrow another checkout's `node_modules`.
- The `24.12` engine floor is a minimum, not the test Node; the pinned version wins.

## Git Conventions

Agents should commit and push work frequently without explicit user request, and create branches/PRs instead of working on main. Never push directly to `main`.

### On a feature branch

- Commit and push after completing a meaningful unit of work (new feature, refactor, bug fix, etc.)
- Do NOT wait for explicit user request to commit
- One commit per logical change, not per edit
- Push immediately after committing

### On main branch (assigned a ticket)

**Never commit or push directly to `main`.** Always work on a feature branch and open a PR.

- Create a new branch with a conventional branch name (e.g., `feat/watchlists-write-boundary`, `fix/search-pagination`)
- Implement the work on that branch with frequent commits/pushes
- Open a PR when the work is ready for review

### Conventions

- Use conventional branch names matching the ticket/work
- Use conventional commit messages: `type(scope): summary` when a scope adds clarity, or `type: summary` when it does not.
- Use conventional pull request titles in the same format
- Prefer standard conventional commit types: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `build`
- Open PRs as ready for review by default. Create draft PRs only when explicitly requested.
- **Never use `--no-verify` or `--no-gpg-sign` or any flag that bypasses git hooks.** If a hook fails or times out, diagnose and fix the issue rather than skipping it. Hooks exist to catch problems before they reach CI.

## Database Migrations

- Never edit `drizzle/*.sql` files directly.
- Always generate SQL migrations and snapshot updates through the Drizzle CLI from schema changes.

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

## Naming

- Write out full words. Avoid abbreviations like `tx` (use `transaction`), `itemToInsertValues` (use `extractItemFields` or `itemAsInsertValues`), `err` (use `error`), `cb` (use `callback`), etc.
- Parameter and variable names should be readable without domain context. `item` is fine in a watchlist context; `tx` is not.

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

## GitHub Interactions

- Never use WebFetch or curl to access GitHub API directly. Always use the `gh` CLI tool.
- When fetching issues, always include the `--repo owner/project` flag. The correct format is:
  ```
  gh issue view <issue-number> --repo dmfigueroa/janus --json title,body,labels
  ```
  Without the `--repo` flag, the command fails for non-default repositories.

## Task Clarity

- Never infer context or make assumptions about a task when the requirements are unclear. If the ticket, issue, or user request is ambiguous, ask the user for clarification before proceeding.
- When working on a GitHub issue, always fetch the full issue details first (including parent PRDs and blocking dependencies) to understand the complete scope before planning implementation.

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

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `dmfigueroa/janus`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. See `docs/agents/domain.md`.

## V2 Rust

Before writing new Rust or reviewing Rust changes under `v2/`, load the `rust-best-practices` skill and apply it as the review baseline while implementing. If that skill is unavailable, work from Apollo's upstream handbook at <https://github.com/apollographql/rust-best-practices> instead and say which source you used.

## V2 Frontend

- Use HTMX for all v2 browser HTTP requests. Declare requests, triggers, targets, and swaps with hx-\* attributes. Drag-and-drop and keyboard handlers may update request values and dispatch custom DOM events consumed by hx-trigger. Do not use htmx.ajax. Frontend requests must consume server-rendered HTML and let HTMX swap it into the page. Backend endpoints must also preserve JSON support for API callers through content negotiation. Do not use fetch or standalone XMLHttpRequest for frontend requests.
