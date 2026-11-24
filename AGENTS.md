# AGENTS

## Docs Map

Read the relevant on-demand document before exploring or modifying an area:

- **v1 (`src/`) architecture, file placement, TanStack Start boundaries, and code style:** [`ARCHITECTURE.md`](ARCHITECTURE.md).
- **v2 (`v2/`) routes, module ownership, setup, checks, tests, and visual parity rules:** [`v2/README.md`](v2/README.md).
- **v2 parity baseline, checklist, and UI mapping:** [`v2/PARITY.md`](v2/PARITY.md) and [`v2/V1-UI-MAP.md`](v2/V1-UI-MAP.md).
- **Container deployment, v1/v2 coexistence, and demo seeding:** [`deploy/README.md`](deploy/README.md).
- **Cloudflare Access Managed OAuth and MCP contracts:** [`docs/mcp.md`](docs/mcp.md).
- **Domain glossary and ADRs:** [`CONTEXT.md`](CONTEXT.md) and [`docs/agents/domain.md`](docs/agents/domain.md).
- **GitHub issue tracker CLI conventions and triage labels:** [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md).

Apply the target structure to new code and touched areas. Do not do broad drive-by reorganizations unless the user asks for them.

## Running Commands

### Devcontainer (primary path)

- Run commands inside the repository devcontainer: start it with `devcontainer up --workspace-folder . --docker-path podman`, then run commands with `devcontainer exec --workspace-folder . --docker-path podman <command>` (for example `pnpm run lint`).
- When using Podman directly, locate the container with `podman ps -a --filter "label=devcontainer.local_folder=$(pwd)"`, confirm it belongs to the current checkout, then run commands with `podman exec --workdir /workspaces/janus <container> <command>`. Never use an unrelated Toolbox or development container.
- If the Dev Container CLI is missing or `devcontainer up` fails, use the host path below instead of retrying the container. Do not use a bare host `node`.
- Enable Corepack (`corepack enable`) or install pnpm matching the `packageManager` field in `package.json`.

### Host toolchain (fallback path)

- Run every host command through `bash tools/pinned-node.sh <command>`, which runs it under the `.tool-versions` Node (`node@24.18.0`) via `mise exec`. For example `bash tools/pinned-node.sh pnpm install --frozen-lockfile`.
- Never run a bare `node` or `pnpm` on the host: the default shell can resolve a newer major such as `26.2.0`, which is outside `engines` (`>=24.12 <26`) and has no `better-sqlite3` prebuilt binary.
- Run root `bash tools/pinned-node.sh pnpm install --frozen-lockfile` once per checkout before v2 tests and never borrow another checkout's `node_modules`.
- Run v2 Rust tests with `pnpm run test:v2`, which uses the wrapper and forwards arguments to `cargo test --locked`. Run `cargo test` directly only through `bash tools/pinned-node.sh cargo test --manifest-path v2/Cargo.toml --locked`. If setting `JANUS_TEST_NODE` manually, point it at `bash tools/pinned-node.sh node -p process.execPath`.

## Docker Build Context

- Both images build from the repository root as context (`Dockerfile` for v1, `v2/Dockerfile` for v2; `deploy/compose.yaml` spells this as `context: ..`). They share the single root `.dockerignore`, so changes to either Dockerfile or `.dockerignore` affect both builds.
- `v2/`, `test/` and `tools/` must stay in the build context: v2 builds from `v2/`, and v1's `tsc` step typechecks every `*.ts`/`*.tsx` file, including `test/` and `tools/`.
- `v2/target` must stay ignored in `.dockerignore`: v2 copies `v2/` sources wholesale, so Rust build output left in the context would bloat and invalidate the build.

## Git Conventions

Agents should commit and push work frequently without explicit user request, and create branches/PRs instead of working on `main`. Never commit or push directly to `main`.

- On a feature branch: commit and push after completing a meaningful unit of work (one commit per logical change, not per edit). Do not wait for an explicit user request.
- On `main`: create a conventional feature branch (e.g. `feat/watchlists-write-boundary`, `fix/search-pagination`), commit and push frequently, and open a PR when ready.
- Use conventional branch names, commit messages (`type(scope): summary` or `type: summary`), and PR titles. Prefer `feat`, `fix`, `refactor`, `chore`, `docs`, `test`, `build`.
- Open PRs as ready for review by default; create draft PRs only when explicitly requested.
- **Never use `--no-verify` or `--no-gpg-sign` or any flag that bypasses git hooks.** Diagnose and fix hook failures instead of skipping them.

## Database Migrations

- Never edit `drizzle/*.sql` files directly.
- Always generate SQL migrations and snapshot updates through the Drizzle CLI from schema changes.

## Naming

- Write out full words. Avoid abbreviations like `tx` (use `transaction`), `itemToInsertValues` (use `extractItemFields` or `itemAsInsertValues`), `err` (use `error`), `cb` (use `callback`), etc.
- Parameter and variable names should be readable without domain context (`item` is fine in a watchlist context; `tx` is not).

## GitHub & Task Clarity

- Never use WebFetch or curl to access the GitHub API directly; use the `gh` CLI with `--repo dmfigueroa/janus` (see [`docs/agents/issue-tracker.md`](docs/agents/issue-tracker.md)).
- Never infer context or make assumptions when requirements are unclear; ask the user for clarification before proceeding.
- When working on a GitHub issue, fetch the full issue details first (including parent PRDs and blocking dependencies) before planning implementation.
- When feedback arrives as a screenshot, restate the target element and intended change before editing, then implement that restatement rather than a larger redesign. Ask when the screenshot does not make the target element or kind of change clear (styling, layout, interaction); a request that already names both proceeds without confirmation.

## V2 Rust

Before writing new Rust or reviewing Rust changes under `v2/`, load the `rust-best-practices` skill and apply it as the review baseline. If that skill is unavailable, work from Apollo's upstream handbook at <https://github.com/apollographql/rust-best-practices> instead and say which source you used.

## V2 Frontend

- All first-party V2 browser JavaScript is loaded as ES modules. Enforcement: `pnpm run check:v2-modules` requires every `v2/static/*.js` asset (outside `vendor/`) to be loaded with a `type="module"` script entry in a template or to use ES module `import`/`export` syntax.
- Use relative units and Open Props tokens for spacing, type and sizing. Add fixed units only where the browser requires them, such as hairline borders.
- Before changing V2 visuals or making any layout/parity claim, follow the local preview, screenshot comparison, and `390x844`/`1280x800` measurement rules in [`v2/README.md`](v2/README.md); never use a remote preview deployment as the development loop.
- A new V2 affordance needs a V1 counterpart (confirmed via [`v2/V1-UI-MAP.md`](v2/V1-UI-MAP.md) and [`v2/PARITY.md`](v2/PARITY.md)) or an explicit user request. In review, treat an unrequested control, glyph, or interaction without a V1 counterpart as a defect to remove.
- Use HTMX for all v2 browser HTTP requests (`hx-*` attributes). Drag-and-drop and keyboard handlers may update request values and dispatch custom DOM events consumed by `hx-trigger`. Do not use `htmx.ajax`, `fetch`, or standalone `XMLHttpRequest` for frontend requests. Frontend requests must consume server-rendered HTML while backend endpoints preserve JSON support for API callers through content negotiation.
