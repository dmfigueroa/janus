# AGENTS

## Architecture Docs

- `ARCHITECTURE.md` is the source of truth for Janus's target file structure, ownership model, and dependency rules.
- `CONTRIBUTING.md` is the placement guide for new files and incremental migrations.
- `deploy/README.md` documents deployment topology, production Coolify applications and PR preview URLs. Read it before debugging routing or preview behavior.
- v1 app routes, feature boundaries, and frontend code style: [`docs/agents/v1-app.md`](docs/agents/v1-app.md).
- When adding files, moving modules, or introducing new boundaries, read those docs first and follow them.
- Apply the target structure to new code and touched areas. Do not do broad drive-by reorganizations unless the user asks for them.

## Running Commands

- v2 setup, checks, tests and module layout: [`v2/README.md`](v2/README.md).
- Run commands inside the repository devcontainer: start it with `devcontainer up --workspace-folder . --docker-path podman`, then run commands with `devcontainer exec --workspace-folder . --docker-path podman <command>`.
- The host toolchain is a fallback for when the container cannot start. When using Podman directly, locate the container with `podman ps -a --filter "label=devcontainer.local_folder=$(pwd)"`, confirm it belongs to the current checkout, then run commands with `podman exec --workdir /workspaces/janus <container> <command>`. Never use an unrelated Toolbox or development container.
- Run root `npm ci` once per checkout before v2 tests and never borrow another checkout's `node_modules`. `npm run test:v2` pins `JANUS_TEST_NODE` to the `.tool-versions` Node and forwards arguments to `cargo test --locked`; `engines` accepts Node `>=24.12 <26` and the pinned version wins. Run host Node commands through `mise exec --` (for example `mise exec -- npm ci`): a bare `node` can be a newer major, which npm now rejects before installing.

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

## Naming

- Write out full words. Avoid abbreviations like `tx` (use `transaction`), `itemToInsertValues` (use `extractItemFields` or `itemAsInsertValues`), `err` (use `error`), `cb` (use `callback`), etc.
- Parameter and variable names should be readable without domain context. `item` is fine in a watchlist context; `tx` is not.

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

Regenerate the mappings above with `npx @tanstack/intent install`. Keep each `load` indented under its own `task` item and keep the blank line before the end marker, otherwise `oxfmt` dedents the final `load` and the mapping stops resolving. `npm run check:agents` verifies the block and runs as part of `npm run lint`.

## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues for `dmfigueroa/janus`. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

This is a single-context repository. `CONTEXT.md` at the root is the domain glossary — the file some skills call `GLOSSARY.md`. See `docs/agents/domain.md`.

## V2 Rust

Before writing new Rust or reviewing Rust changes under `v2/`, load the `rust-best-practices` skill and apply it as the review baseline while implementing. If that skill is unavailable, work from Apollo's upstream handbook at <https://github.com/apollographql/rust-best-practices> instead and say which source you used.

## V2 Frontend

- Use relative units and Open Props tokens for spacing, type and sizing. Add fixed units only where the browser requires them, such as hairline borders.
- Before changing V2 visuals, run `npm run preview:local` and compare local v1 and v2 screenshots with `npm run visual:compare -- --route /watchlists`; inspect both images, and never use a Coolify preview as the development loop. Measure both versions at `390x844` and `1280x800` before offering any layout option or parity claim (see [`v2/README.md`](v2/README.md) parity layout rule).
- A new V2 affordance needs a V1 counterpart or an explicit user request. Confirm the counterpart in the [`v2/PARITY.md`](v2/PARITY.md) ledger, which records the parity baseline and outstanding acceptance, using [`v2/V1-UI-MAP.md`](v2/V1-UI-MAP.md) to find the v1 control. In review, treat a control, glyph or interaction that v1 has no counterpart for and the request did not name as a defect to remove rather than a feature to keep. This is a review judgement call, not a lint rule, and it is not a reason to ask before every UI edit.
- Use HTMX for all v2 browser HTTP requests. Declare requests, triggers, targets, and swaps with hx-\* attributes. Drag-and-drop and keyboard handlers may update request values and dispatch custom DOM events consumed by hx-trigger. Do not use htmx.ajax. Frontend requests must consume server-rendered HTML and let HTMX swap it into the page. Backend endpoints must also preserve JSON support for API callers through content negotiation. Do not use fetch or standalone XMLHttpRequest for frontend requests.
