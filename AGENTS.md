# AGENTS

## Architecture Docs

- `ARCHITECTURE.md` is the source of truth for Janus's target file structure, ownership model, and dependency rules.
- `CONTRIBUTING.md` is the placement guide for new files and incremental migrations.
- `deploy/README.md` documents deployment topology, production Coolify applications and PR preview URLs. Read it before debugging routing or preview behavior.
- v1 app routes, feature boundaries, and frontend code style: [`docs/agents/v1-app.md`](docs/agents/v1-app.md).
- Before exploring `v2/` source for routes, module ownership, or local setup/check/test commands, read [`v2/README.md`](v2/README.md); it is the entry document for v2.
- Before recording or checking parity and acceptance evidence for v2, read [`v2/PARITY.md`](v2/PARITY.md) for the baseline, existing evidence and outstanding acceptance; [`v2/V1-UI-MAP.md`](v2/V1-UI-MAP.md) locates the v1 counterpart of a UI area.
- When adding files, moving modules, or introducing new boundaries, read those docs first and follow them.
- Apply the target structure to new code and touched areas. Do not do broad drive-by reorganizations unless the user asks for them.

## Running Commands

### Devcontainer (primary path)

- Run commands inside the repository devcontainer: start it with `devcontainer up --workspace-folder . --docker-path podman`, then run commands with `devcontainer exec --workspace-folder . --docker-path podman <command>`.
- When using Podman directly, locate the container with `podman ps -a --filter "label=devcontainer.local_folder=$(pwd)"`, confirm it belongs to the current checkout, then run commands with `podman exec --workdir /workspaces/janus <container> <command>`. Never use an unrelated Toolbox or development container.
- If the Dev Container CLI is missing or `devcontainer up` fails, use the host path below instead of retrying the container. Do not use a bare host `node`.

### Host toolchain (fallback path)

- Run every host command through `bash tools/pinned-node.sh <command>`, which runs it under the `.tool-versions` Node (`node@24.18.0`) via `mise exec`. For example `bash tools/pinned-node.sh npm ci`. This path needs only `mise`, a C toolchain for `better-sqlite3` and the Rust toolchain; it is verified to work on the agent host.
- Never run a bare `node` or `npm` on the host: the default shell can resolve a newer major such as `26.2.0`, which is outside `engines` (`>=24.12 <26`) and has no `better-sqlite3` prebuilt binary, so `npm ci` fails on the native-module ABI.
- Run root `bash tools/pinned-node.sh npm ci` once per checkout before v2 tests and never borrow another checkout's `node_modules`.
- Run the v2 Rust tests with `npm run test:v2`, which uses the same wrapper and forwards arguments to `cargo test --locked`, so the Node fixtures need no manual `JANUS_TEST_NODE`. Run `cargo test` directly only through the wrapper: `bash tools/pinned-node.sh cargo test --manifest-path v2/Cargo.toml --locked`. If you set `JANUS_TEST_NODE` yourself, point it at the pinned binary from `bash tools/pinned-node.sh node -p process.execPath`, otherwise the fixture tests spawn a different Node ABI.

## Docker Build Context

- Both images build from the repository root as context — `docker build -f Dockerfile .` for v1 and `docker build -f v2/Dockerfile .` for v2; `deploy/compose.yaml` spells the same root context as `context: ..`. They share the single root `.dockerignore`, so a change to either Dockerfile or `.dockerignore` affects both builds.
- `v2/`, `test/` and `tools/` must stay in the build context: v2 builds from `v2/`, and v1's `tsc` step typechecks every `*.ts`/`*.tsx` file, including `test/` and `tools/`.
- `v2/target` must stay ignored in `.dockerignore`: v2 copies its `v2/` sources wholesale, so Rust build output left in the context would bloat the build and invalidate it.

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
- When feedback arrives as a screenshot, restate the target element and the intended change before editing, then implement that restatement rather than a larger redesign. Ask when the screenshot does not make the target element or the kind of change clear (styling, layout, interaction). This is a judgement rule for ambiguous feedback, not a gate on UI edits: a request that already names the element and change proceeds without confirmation.

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

- Shared browser code uses named ES module exports and imports. Enforcement: `npm run check:v2-modules` rejects classes assigned to `window` in `v2/static/*.js`.
- Use relative units and Open Props tokens for spacing, type and sizing. Add fixed units only where the browser requires them, such as hairline borders.
- Before changing V2 visuals, run `npm run preview:local` and compare local v1 and v2 screenshots with `npm run visual:compare -- --route /watchlists`; inspect both images, and never use a Coolify preview as the development loop. Measure both versions at `390x844` and `1280x800` before offering any layout option or parity claim (see [`v2/README.md`](v2/README.md) parity layout rule).
- A new V2 affordance needs a V1 counterpart or an explicit user request. Confirm the counterpart in the [`v2/PARITY.md`](v2/PARITY.md) ledger, which records the parity baseline and outstanding acceptance, using [`v2/V1-UI-MAP.md`](v2/V1-UI-MAP.md) to find the v1 control. In review, treat a control, glyph or interaction that v1 has no counterpart for and the request did not name as a defect to remove rather than a feature to keep. This is a review judgement call, not a lint rule, and it is not a reason to ask before every UI edit.
- Use HTMX for all v2 browser HTTP requests. Declare requests, triggers, targets, and swaps with hx-\* attributes. Drag-and-drop and keyboard handlers may update request values and dispatch custom DOM events consumed by hx-trigger. Do not use htmx.ajax. Frontend requests must consume server-rendered HTML and let HTMX swap it into the page. Backend endpoints must also preserve JSON support for API callers through content negotiation. Do not use fetch or standalone XMLHttpRequest for frontend requests.
