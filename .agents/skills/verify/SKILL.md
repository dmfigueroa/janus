---
name: verify
description: Launch, drive, and verify Janus (v1 TanStack Start web UI, v2 Rust/HTMX web UI, shared SQLite state, and JSON/MCP endpoints) with isolated disposable instances and durable proof artifacts. Reach for this skill whenever proving a UI change, API/MCP behavior, persistence across v1 and v2, or a bug fix against the running app.
---

# Verify Janus

Use this skill to prove user-facing behavior against a live, isolated Janus stack (both v1 and v2 sharing a disposable SQLite database) instead of relying on unit tests or source inspection alone.

## Surfaces and isolation

Janus exposes two web applications backed by one SQLite database, plus content-negotiated JSON and MCP endpoints:

- **Janus v1 (primary web UI, TanStack Start / React / Chakra UI):** `/` (`Watch Now`), `/watchlists` (`My Lists`), `/watchlists/$watchlistId` (timeline, watched toggles, item menus, edit/pause/delete), `/search` (`Discover Everything`), `/rotations` (`Manage Lineups`), and `/mcp`.
- **Janus v2 (Rust / Axum / HTMX / Askama):** `/v2` (landing page), `/v2/watchlists` (`My Lists` with Unicode search, pagination, create dialog), `/v2/watchlists/{id}` (timeline, filter/search, edit dialog, custom-order reorder), `/v2/mcp`, `/v2/health/live`, and `/v2/health/ready`.

Each verification run is isolated by `--run-id <id>`:

- Disposable runtime directory: `/tmp/janus-verify-<id>/` (holds `janus.sqlite`, WAL/SHM sidecars, `state.json`, `v1.log`, `v2.log`).
- Durable evidence directory: `/tmp/janus-verify-evidence/<id>/` (survives cleanup).
- Ephemeral ports on `127.0.0.1` are allocated per run unless `--v1-port` or `--v2-port` is passed, so multiple runs can execute side by side without colliding.
- **Dev proxy caveat:** `vite.config.ts` hardcodes the v1 `/v2` devProxy to `127.0.0.1:3001`. Always drive v2 directly via the run's `v2Url` (using `--target v2`), never through `v1Url/v2`. Never drive a developer's existing port `3000`/`3001` session.

## Launch

Prerequisite: root dependencies must be installed once per checkout (`bash tools/pinned-node.sh pnpm install --frozen-lockfile` on the host, or `pnpm install --frozen-lockfile` inside the devcontainer). Playwright Chromium must exist in `~/.cache/ms-playwright` or `PLAYWRIGHT_CHROMIUM` (install once with `bash tools/pinned-node.sh pnpm exec playwright-core install chromium`).

Start an isolated v1 + v2 stack from an empty disposable directory (runs `src/db/Migrate.ts`, runs `src/db/Seed.ts` with `SEED_ON_STARTUP=true`, builds `v2/target/debug/janus-v2` with `cargo build --locked`, starts both servers detached, and waits for full readiness):

```bash
.agents/skills/verify/scripts/verify-janus launch --run-id demo
```

Optional flags:

- `--v1-only` or `--v2-only`: launch only one server when proving a single-surface change.
- `--no-build`: reuse an existing `v2/target/debug/janus-v2` binary when Rust sources have not changed.
- `--empty-db`: run migrations without seeding the four demo watchlists.
- `--v1-port <port>` / `--v2-port <port>`: pin ports explicitly (for example `3000` and `3001` if you also want `pnpm run visual:compare`).
- `--evidence-dir <path>`: override the default `/tmp/janus-verify-evidence/<run-id>` output directory.

**Readiness contract:** `launch` does not return when a TCP socket opens. It waits until:

1. `v2` responds HTTP `200` on `/v2/health/ready` with `Database compatibility validated`, AND `GET /v2/watchlists` with `Accept: application/json` returns HTTP `200`.
2. `v1` responds HTTP `200` on `/watchlists` with rendered HTML containing `Marvel Cinematic Universe` (or `My Lists` under `--empty-db`), proving Vite SSR, Drizzle, and SQLite reads work end to end.

Seeded baseline watchlists (created by `src/db/Seed.ts` in ID order):

1. `Marvel Cinematic Universe` (id `1`, `release`, 9 movies, 6 watched / 3 unwatched)
2. `Star Wars` (id `2`, `release`, 7 movies, 3 watched / 4 unwatched)
3. `Anime & Manga` (id `3`, `release`, 7 items, 1 watched / 6 unwatched)
4. `Reading List` (id `4`, `custom`, 4 books, `custom_rank` `1..4`, 1 watched / 3 unwatched)

Always run `cleanup` when finished, including after failed runs (see [Cleanup](#cleanup)).

## Doctor

Run this read-only check before driving or whenever behavior looks stale or unexpected:

```bash
.agents/skills/verify/scripts/verify-janus doctor --run-id demo
```

`doctor` verifies without mutating state:

- `/tmp/janus-verify-demo/state.json` exists.
- Current `git rev-parse HEAD` matches the `gitHead` recorded at launch.
- Each launched PID is alive and `/proc/<pid>/cmdline` matches `vite` (v1) or `janus-v2` (v2).
- `v1` `/watchlists` and `v2` `/v2/health/ready` respond HTTP `200` with expected markers.
- `janus.sqlite` opens read-only and reports watchlist and item counts.
- Playwright Chromium executable exists on disk.

Exit code `0` means the instance is healthy and safe to drive; exit code `1` prints which check failed.

## Drive

Read [`features/README.md`](features/README.md) first, then follow the matching feature file. All browser, HTTP, and read-only DB actions run through `.agents/skills/verify/scripts/verify-janus`.

### Browser actions (`drive`)

`drive` executes an ordered JSON array of steps on one Playwright Chromium page (preserving dialogs, HTMX swaps, React state, focus, and scroll) and writes a transcript plus requested screenshots and ARIA snapshots to `<evidenceDir>/<feature>/`:

```bash
.agents/skills/verify/scripts/verify-janus drive \
  --run-id demo \
  --target v2 \
  --viewport 1280x800 \
  --feature watchlists-browse-and-search \
  --evidence-name v2-desktop <<'EOF'
[
  { "op": "goto", "path": "/v2/watchlists" },
  { "op": "expectText", "text": "Marvel Cinematic Universe" },
  { "op": "fill", "target": "role=searchbox,name=Search watchlists", "value": "star" },
  { "op": "expectText", "target": "css=#watchlist-browse", "text": "Star Wars" },
  { "op": "expectNoText", "target": "css=#watchlist-browse", "text": "Reading List" },
  { "op": "aria", "file": "search-star.aria.txt" },
  { "op": "screenshot", "file": "search-star.png" }
]
EOF
```

Target locator prefixes (prefer ARIA roles and labels over CSS selectors):

- `role=<role>,name=<accessible name>` (add `,exact` for exact name matching)
- `label=<form label>`
- `placeholder=<placeholder text>`
- `text=<visible text>`
- `css=<selector>`

Supported step `op` values:

- `goto`: `{ "op": "goto", "path": "/watchlists" }`
- `click`: `{ "op": "click", "target": "role=button,name=Create New List" }`
- `fill`: `{ "op": "fill", "target": "role=textbox,name=Name", "value": "Sci-Fi Classics" }`
- `select`: `{ "op": "select", "target": "label=Watched items", "value": "false" }`
- `press`: `{ "op": "press", "target": "role=button,name=Move The Name of the Wind", "key": "Alt+ArrowDown" }`
- `wait`: `{ "op": "wait", "target": "css=#watchlist-dialog", "state": "visible" }` (`visible` or `hidden`)
- `expectText` / `expectNoText`: `{ "op": "expectText", "target": "css=#watchlist-browse", "text": "Star Wars" }`
- `expectUrl`: `{ "op": "expectUrl", "contains": "query=star" }`
- `aria`: `{ "op": "aria", "file": "state.aria.txt" }` (optional `target`)
- `screenshot`: `{ "op": "screenshot", "file": "state.png", "fullPage": true }`

If any step fails, `drive` saves `failure.png`, `failure.aria.txt`, and `<evidence-name>.failure.json` in `<evidenceDir>/<feature>/` and exits `1`.

For v1/v2 visual parity checks (which require both viewports `390x844` and `1280x800`), launch with `--v1-port 3000 --v2-port 3001` and run `bash tools/pinned-node.sh pnpm run visual:compare -- --route /watchlists --viewport 390x844` and `--viewport 1280x800`, or run `drive` against both `--target v1` and `--target v2` at both viewports.

### HTTP / JSON / MCP calls (`http`)

```bash
.agents/skills/verify/scripts/verify-janus http \
  --run-id demo \
  --target v2 \
  --header "Accept: application/json" \
  --save watchlists-browse-and-search/v2-list.json \
  /v2/watchlists
```

### Read-only SQLite side-effect checks (`db`)

```bash
.agents/skills/verify/scripts/verify-janus db \
  --run-id demo \
  --save create-and-edit-watchlist/db-watchlists.json \
  "SELECT id, name, description, item_order_mode FROM watchlists ORDER BY id"
```

`db` opens SQLite with `readonly: true` and rejects any statement that does not start with `SELECT`, `PRAGMA`, or `WITH`.

## Evidence

Default evidence location: `/tmp/janus-verify-evidence/<run-id>/<feature>/`.

Proof standards:

- Exercise the real user path (UI clicks, form inputs, keyboard shortcuts, or real HTTP/MCP requests). Do not mutate SQLite directly or call internal test-only setters to fake a journey.
- Capture both the action and the resulting state: every `drive` run writes a `<name>.transcript.json` alongside `.aria.txt` snapshots and `.png` screenshots.
- Verify persistent side effects alongside visible UI: reload the page (or view the mutation from the sibling v1/v2 surface) and confirm stored rows with `verify-janus db`.
- Only mock external systems where a production boundary already isolates them. External search providers (`/search` TMDB/RAWG/ComicVine/Google Books) require real API keys in `.env`; if keys are absent, report the unmet precondition honestly instead of claiming external search passed.
- If seeded data lacks a precondition a mapped journey requires, fail the journey and document the missing precondition in that feature's `Gotchas`. Never weaken assertions to make a journey pass.

## Cleanup

Tear down the instance after every run (including failed runs):

```bash
.agents/skills/verify/scripts/verify-janus cleanup --run-id demo
```

What `cleanup` does:

- Sends `SIGTERM` (then `SIGKILL` after 5 seconds) ONLY to the exact process groups recorded in `/tmp/janus-verify-<run-id>/state.json`. Never kills by process name (`pkill`/`killall`).
- Deletes `/tmp/janus-verify-<run-id>/` (the disposable SQLite DB, WAL/SHM sidecars, logs, and `state.json`).
- **Never deletes `/tmp/janus-verify-evidence/<run-id>/`.** Prints the preserved evidence directory and every surviving artifact path so you can confirm the proof survived teardown.

## Helpers

| Helper                                       | Purpose                                                                                                                                                                          |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.agents/skills/verify/scripts/verify-janus` | Executable wrapper that runs under Node 24 directly (devcontainer) or via `tools/pinned-node.sh` (host) and dispatches `launch`, `doctor`, `drive`, `http`, `db`, and `cleanup`. |
| `.agents/skills/verify/scripts/lib/*.cjs`    | Modular implementation (`paths.cjs`, `lifecycle.cjs`, `doctor.cjs`, `locators.cjs`, `drive.cjs`, `inspect.cjs`, `cli.cjs`).                                                      |

## Feature map

Start at [`features/README.md`](features/README.md) for baseline preconditions and proof rules, then use the mapped feature files:

- [Browse and search watchlists](features/watchlists-browse-and-search.md)
- [Create and edit a watchlist](features/create-and-edit-watchlist.md)
- [Watchlist timeline and progress](features/watchlist-timeline-and-progress.md)
- [Custom-order item reordering](features/custom-order-reorder.md)
- [Watch Now and custom lineups](features/watch-now-and-lineups.md)
