# Janus v2

One Rust crate serves HTML, local assets and MCP. Dialog and layout values use
[browser-ready Open Props tokens](https://open-props.style/) served from `static/vendor`. V2 owns watchlist reads, create/edit,
reordering and their MCP tools; v1 remains the application for the remaining writes.
Requires Rust 1.94.0 and a native C compiler.
Production needs no Node runtime or frontend build.

```sh
cd v2
DATABASE_URL=/absolute/path/to/existing/sqlite.db cargo run --locked
cargo check --locked
cargo fmt --check
cargo clippy --locked --all-targets -- -D warnings
cargo test --locked
cargo build --locked --release
```

For visual work, start from [V1-UI-MAP.md](V1-UI-MAP.md) to find the v1 reference component
and v2 template/styles for a UI area, then record evidence in [PARITY.md](PARITY.md).
`pnpm run preview:local` seeds a disposable database, builds and starts
the v2 process, and starts the v1 dev server. It prints both local URLs. During `pnpm run dev`
from the repository root, Nitro proxies `/v2` and `/v2/**` to `127.0.0.1:3001`, so the v1 dev
server can preview the separate v2 process at `http://localhost:3000/v2`. This development
proxy is not part of the production v1 bundle; deployment routing is handled by the reverse proxy
in front of the separate v2 service.

Compare the two UIs with Playwright screenshots after `preview:local`:

```sh
pnpm run visual:compare -- --route /watchlists
pnpm run visual:compare -- --route /watchlists --click "Create New List"
pnpm run visual:compare -- --route /watchlists/1 \
  --scroll 600 \
  --click-v1 "button=Watchlist actions" \
  --click-v1 "menuitem=Edit watchlist" \
  --click-v2 "button=Edit watchlist" \
  --wait "#watchlist-dialog" \
  --assert-in-viewport "#watchlist-dialog"
```

The second command opens the dialog in both versions and writes `-v1.png` and `-v2.png`
under the system temporary directory. Repeat `--click` to run a click sequence in both
versions, or use `--click-v1` and `--click-v2` for version-specific controls. A
`role=accessible name` prefix targets a role instead of page text. `--scroll` positions the
page before clicking, `--wait` holds until a selector is visible, and `--assert-in-viewport`
fails when the selector leaves the viewport. Inspect both images rather than relying on
measured values alone. If no Chromium build is available, run
`pnpm exec playwright-core install chromium` once (or set `PLAYWRIGHT_CHROMIUM` to an existing
executable).

### Parity layout rule

Render both v1 and v2 in a browser at `390x844` and `1280x800` before proposing a layout
option or claiming parity. The supporting evidence is measured geometry or screenshots from
both rendered pages at both viewports: element boxes, gaps, alignment, distribution and
scroll behavior, captured before the change is described. Framework props, component source
and earlier reasoning are not parity evidence; they can describe a rule while missing what
the page actually renders. No layout option is offered and no parity claim is made until
both versions have been measured, and when rendered geometry disagrees with source, the
geometry wins. Record the route, viewports and measurement or screenshot paths in
[PARITY.md](PARITY.md) as the evidence for the claim.

Tests require root `pnpm install --frozen-lockfile` under a supported Node version because their disposable SQLite
files are created by the actual v1 Drizzle migrator. From the repository root, `pnpm run test:v2`
runs `cargo test --locked` under the `.tool-versions` Node (through `tools/pinned-node.sh`), so
the fixture tests find that Node on `PATH` and need no manual `JANUS_TEST_NODE`; extra arguments
are appended to the cargo command. Set `JANUS_TEST_NODE` yourself to override that choice, and
point it at the same Node (`bash tools/pinned-node.sh node -p process.execPath`). Node is a test
fixture dependency only.

`JANUS_V2_BIND` defaults to `127.0.0.1:3001`. `DATABASE_URL` is a required filesystem path,
as in v1. Missing files, incompatible schema and unsupported stored values fail startup.
The connection supports create, update and reorder writes, never creates a file, and leaves journal mode unchanged.
The pool has at most two connections, a five-second connect/acquire timeout and two-second
SQLite busy timeout. V1 alone owns migrations. No schema-sync/migration features are enabled.
The existing directory must be mounted, including WAL/SHM sidecars.

- `/v2`: development landing page.
- `/v2/static/*`: every embedded static file is hashed with SHA-256 at build time and
  exposes a generated `*_URL` constant (`APP_CSS_URL`, `APP_JS_URL`, `BROWSE_JS_URL`, ...).
  Templates reference those constants, so a URL changes exactly when its bytes do. The
  current version is served as immutable; any other version revalidates against its ETag, so
  an old cached copy cannot pair with new markup. Files without a browser content type are
  left out of the binary and are not served. HTML responses are the deploy's unversioned
  entry point, so every GET page and fragment is served `Cache-Control: no-cache` with a
  content ETag and answers a matching `If-None-Match` with `304`.
- `/v2/watchlists`: v1-style home grid with covers, progress, next item, paused dates,
  lifecycle sections, Unicode name search and continuation pages. Search swaps only the grid
  through HTMX and keeps the URL in sync. Create tile and mobile button open the native dialog.
  `POST /v2/watchlists` creates through the shared operation; HTMX swaps the refreshed grid,
  while JSON callers receive the structured result.
- `/v2/watchlists/{id}`: existing items in release/custom order, text filtering, release-year
  grouping, expandable watched runs, stable IDs and nullable metadata. The edit dialog updates
  name, description and order mode, then refreshes the header in place.
- `POST /v2/watchlists/{id}`: shared metadata update with v1's timestamp and empty-description
  semantics.
- `/v2/watchlists/{id}/reorder`: atomic custom-order moves from web drag or keyboard intents.
- `/v2/mcp`: `list_watchlists`, `search_watchlists`, `get_watchlist`, `find_watchlist_items`,
  `create_watchlists`, `update_watchlists`, `reorder_watchlist_items`.
- `/v2/health/live`: HTTP liveness.
- `/v2/health/ready`: compatibility-validated application readiness.

MCP uses the official rmcp SDK with JSON responses, legacy session headers and a fifteen-minute
idle timeout. The adapter preserves v1's session-not-found text and successful DELETE status.
Item cursors bind watchlist, page size, query and result view; summary cursors bind ordering
and normalized search. Result envelopes carry both text and structured content. Order tokens
use the same SHA-256 input as v1. Existing MCP clients remain on v1.

`src/database/v1-schema.json` is generated through v1 migrations by
`node v2/tools/capture-v1-schema.cjs`. It captures column types, defaults, nullability, primary
keys, foreign keys and indexes. Reconcile v1 changes before regenerating it. V2 only reads
this contract. Timestamps stay strings; JSON authors and nullable integer booleans preserve
v1 values. Name search uses NFC plus lowercase; detail text search intentionally retains
SQLite LIKE's ASCII case behavior and treats wildcard characters literally.

Detail pages and reorder fragments share one feature-owned presentation module,
`src/features/watchlists/timeline.rs`. It turns a typed detail snapshot and filters into
the page or fragment with no Axum or database access, leaving HTTP extraction, content
negotiation, failures and response selection in the web adapter. Focused unit tests cover
title matching, release years and missing dates, poster resolution, custom/release ordering,
watched runs spanning years, empty results and unwatched-only filtering; HTTP regressions
remain covered by the fixture-backed `cargo test` suite, and `pnpm run test:v2:dom` covers the
HTMX and reorder DOM behavior.

Custom-order detail pages render their timeline as a Light DOM `<watchlist-reorder>` element.
HTMX owns row rendering and recovery responses; the element owns drag/keyboard interaction,
Sortable lifecycle and swap protection scoped to its subtree. Release-order pages use ordinary
timeline markup and do not register reorder behavior.

Watchlist read state is split by responsibility. `item_order.rs` owns stored order-mode
decoding and the ordering SQL shared by reads and reorder; private `storage.rs` decodes rows
and runs focused item queries; `summary.rs` owns progress, next-unwatched and cover
selection; `snapshot.rs` composes typed records, detail snapshots and summary reads and owns
their transactions. Summary reads use counts plus selected rows instead of loading every
item, while detail derives the same summary rules from its already loaded snapshot. Order
tokens keep the v1 SHA-256 input. Unit tests cover progress, cover selection and stored
ordering; fixture-backed tests cover empty, partial and completed progress, nullable
metadata, order-token bytes, reorder semantics and reads after v1 writes.

Discovery is split the same way. `discovery/summary.rs` owns watchlist ordering, Unicode
name search and summary pages; `discovery/items.rs` owns item selectors, grouped titles and
item pages; private discovery code owns page windows, cursor binding and shared input
validation. Web and MCP build a typed `DiscoveryRequest`, call the typed operation and
project the typed result themselves. Legacy MCP coercion, unknown-field filtering and JSON
envelopes stay in `mcp.rs`.

The browse home is separate from MCP discovery. `browse.rs` turns one typed summary snapshot
into v1-style cards: stored recency ordering, NFC-plus-lowercase name matching, bound
continuation cursors, lifecycle sections, cover selection, progress, next-item labels and
paused dates. A Light DOM `<watchlist-browser>` owns search, continuation, busy state, status
announcements and request coordination; its HTMX listeners only handle requests initiated
inside that element. Search and continuation share a replace policy, so a newer query cancels
an older page request instead of allowing stale results to win. The server-rendered cursor
still replaces the current result page and remains bound to the normalized query.
`snapshot.rs` reads the home summaries in one transaction with grouped counts
and mode-specific ranked selections instead of loading every item or issuing per-list
queries. `web.rs` chooses the full page or the grid fragment;
HTMX search and pagination swap only `#watchlist-browse` and push the new URL. A
shared layout provides the v1 bottom navigation on the home and detail pages. Delete and
merge controls remain with their own slices.

Reorder writes renumber the complete displayed sequence, keeping ranks contiguous even
when v1 deletions left gaps. Watchlist creation writes v1's pause and rotation defaults;
updates set `updated_at` explicitly because SeaORM does not supply Drizzle's application-side
hook. Omitted creation fields keep stored defaults, and updates treat an empty description as
null. `watchlist-dialog.js` keeps dialog state and lifecycle handlers in a single controller;
dialog and form styles are scoped to the native dialog. Web dialogs validate, announce
pending/failed requests, restore focus and refresh their list or detail surface through HTMX.
See [PARITY.md](PARITY.md) for evidence and outstanding acceptance.

V2 DOM regressions: `pnpm run test:v2:dom` runs `v2/tests/htmx-browser.cjs` and
`v2/tests/reorder-browser.cjs` with Node's test runner. The suites use jsdom to exercise real
HTMX requests and swaps, optimistic keyboard reorder, drop anchors, blocked swaps during drags
and saves, failed-save reconciliation, and filter/scroll/focus restoration. They need the
`.tool-versions` Node (`bash tools/pinned-node.sh pnpm run test:v2:dom` on the host) and root
`pnpm install --frozen-lockfile`, but no downloaded browser. Every pull request runs the same command in the "V2 DOM
Tests" job, so a failing DOM regression fails the check.
Dialog DOM regression: `node --test v2/tests/watchlist-form-browser.cjs`.
Dialog viewport layout: `node --test v2/tests/dialog-layout-browser.cjs` (requires Chromium;
set `PLAYWRIGHT_BROWSERS=chromium,webkit` to also cover WebKit).
Browse card sizing: `node --test v2/tests/browse-browser.cjs`.
Reorder custom-element lifecycle: `node --test v2/tests/reorder-lifecycle-browser.cjs` (Chromium/WebKit).
Full-page layout regression: `node --test v2/tests/layout-browser.cjs`. The check builds the v2
debug binary, creates a disposable v1-migrated fixture database, starts its own v2 process on a
free port and stops it afterwards. It renders `/v2/watchlists` at `390x844` and `1280x800` and
fails with measured and expected values when footer items leave one row or drift horizontally,
the grid loses its two mobile or four desktop columns, a card exceeds the 220px cap, or the
visible `Watchlists` section `<h2>` (under `<h1>My Lists</h1>`) regresses. Expected values come from
`v2/tests/v1-layout-baseline.json`, recorded from the v1 home. To refresh that baseline, start
`pnpm run preview:local` in another terminal and run
`JANUS_LAYOUT_RECORD=1 node --test v2/tests/layout-browser.cjs` (set `JANUS_V1_BASE_URL` for a
different v1 address). It needs Chromium: install it once with
`pnpm exec playwright-core install chromium` or point `PLAYWRIGHT_CHROMIUM` at an existing executable.

Watchlists home layout: `node --test v2/tests/watchlists-home-browser.cjs` (also
`pnpm run test:v2:home`). It boots the same disposable fixture database and v2
process, then renders `/v2/watchlists` at `320x568`, `390x844`, `768x1024` and `1280x800`. It
fails with measured and expected values when the grid density per width (two phone columns and
four tablet/desktop columns, with the expected rows), horizontal overflow, a sort control, the
hidden empty-search clear control, or the populated clear control's placement inside the search
field regresses. Failed viewports write full-page screenshots to
`v2/tests/artifacts/watchlists-home` (override the directory with `JANUS_VISUAL_ARTIFACTS`), and
CI uploads them as artifacts. The check launches only the Chromium build pinned by the
checked-in `playwright-core` version, so install exactly that build once with
`pnpm exec playwright-core install chromium`; it does not use whichever cached Playwright browser or
in-app browser connection is available.

For isolated end-to-end verification across both v1 and v2 against a disposable SQLite database
with saved transcripts, ARIA snapshots, and screenshots, use the `verify` skill
(`.agents/skills/verify/SKILL.md`).
