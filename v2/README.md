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

For visual work, `npm run preview:local` seeds a disposable database, builds and starts
the v2 process, and starts the v1 dev server. It prints both local URLs. During `npm run dev`
from the repository root, Nitro proxies `/v2` and `/v2/**` to `127.0.0.1:3001`, so the v1 dev
server can preview the separate v2 process at `http://localhost:3000/v2`. This development
proxy is not part of the production v1 bundle; deployment routing remains the separate
Traefik/Coolify service.

Compare the two UIs with Playwright screenshots after `preview:local`:

```sh
npm run visual:compare -- --route /watchlists
npm run visual:compare -- --route /watchlists --click "Create New List"
npm run visual:compare -- --route /watchlists/1 \
  --scroll 600 \
  --click-v1 "button=Watchlist actions" \
  --click-v1 "menuitem=Edit watchlist" \
  --click-v2 "button=Edit watchlist" \
  --wait ":is(dialog,[role=dialog]):visible" \
  --assert-in-viewport ":is(dialog,[role=dialog]):visible"
```

The second command opens the dialog in both versions and writes `-v1.png` and `-v2.png`
under the system temporary directory. Repeat `--click` to run a click sequence in both
versions, or use `--click-v1` and `--click-v2` for version-specific controls. A
`role=accessible name` prefix targets a role instead of page text. `--scroll` positions the
page before clicking, `--wait` holds until a selector is visible, and `--assert-in-viewport`
fails when the selector leaves the viewport. Inspect both images rather than relying on
measured values alone. If no Chromium build is available, run
`npx playwright-core install chromium` once (or set `PLAYWRIGHT_CHROMIUM` to an existing
executable).

Tests require root `npm ci` under a supported Node version because their disposable SQLite
files are created by the actual v1 Drizzle migrator. From the repository root, `npm run test:v2`
pins `JANUS_TEST_NODE` to the `.tool-versions` Node and appends arguments to `cargo test
--locked`. Set `JANUS_TEST_NODE` yourself to override that choice. Node is a test fixture
dependency only.

`JANUS_V2_BIND` defaults to `127.0.0.1:3001`. `DATABASE_URL` is a required filesystem path,
as in v1. Missing files, incompatible schema and unsupported stored values fail startup.
The connection supports reorder writes, never creates a file, and leaves journal mode unchanged.
The pool has at most two connections, a five-second connect/acquire timeout and two-second
SQLite busy timeout. V1 alone owns migrations. No schema-sync/migration features are enabled.
The existing directory must be mounted, including WAL/SHM sidecars.

- `/v2`: development landing page.
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
watched runs spanning years, empty results and unwatched-only filtering; HTTP and HTMX
regressions remain covered by the fixture-backed `cargo test` suite and
`node --test v2/tests/reorder-browser.cjs`.

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
paused dates. `snapshot.rs` reads the home summaries in one transaction with grouped counts
and mode-specific ranked selections instead of loading every item or issuing per-list
queries. `web.rs` chooses the full page or the grid fragment;
HTMX search and pagination swap only `#watchlist-browse` and push the new URL. A
shared layout provides the v1 bottom navigation on the home and detail pages. Create, edit,
delete and merge controls remain with their own slices.

Reorder writes renumber the complete displayed sequence, keeping ranks contiguous even
when v1 deletions left gaps. Watchlist creation writes v1's pause and rotation defaults;
updates set `updated_at` explicitly because SeaORM does not supply Drizzle's application-side
hook. Omitted creation fields keep stored defaults, and updates treat an empty description as
null. Web dialogs validate, announce pending/failed requests, restore focus and refresh their
list or detail surface through HTMX. See [PARITY.md](PARITY.md) for evidence and outstanding
acceptance.

Reorder DOM regression: `node --test v2/tests/reorder-browser.cjs` (Node 24.12 or later
with npm dependencies). Dialog DOM regression: `node --test v2/tests/watchlist-form-browser.cjs`.
Dialog viewport layout: `node --test v2/tests/dialog-layout-browser.cjs` (requires Chromium;
set `PLAYWRIGHT_BROWSERS=chromium,webkit` to also cover WebKit).
Browse card sizing: `node --test v2/tests/browse-browser.cjs`.
