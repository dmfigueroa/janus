# Janus v2 reorder slice

One Rust crate serves HTML, local assets and MCP. V1 remains the application for writes
other than watchlist item reordering. Requires Rust 1.94.0 and a native C compiler.
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

Tests require root `npm ci` under a supported Node version because their disposable SQLite
files are created by the actual v1 Drizzle migrator. Set `JANUS_TEST_NODE` to that Node
executable when it differs from PATH. Node is a test fixture dependency only.

`JANUS_V2_BIND` defaults to `127.0.0.1:3001`. `DATABASE_URL` is a required filesystem path,
as in v1. Missing files, incompatible schema and unsupported stored values fail startup.
The connection supports reorder writes, never creates a file, and leaves journal mode unchanged.
The pool has at most two connections, a five-second connect/acquire timeout and two-second
SQLite busy timeout. V1 alone owns migrations. No schema-sync/migration features are enabled.
The existing directory must be mounted, including WAL/SHM sidecars.

- `/v2`: development landing page.
- `/v2/watchlists`: v1-style home grid with covers, progress, next item, paused dates,
  lifecycle sections, Unicode name search and continuation pages. Search swaps only the grid
  through HTMX and keeps the URL in sync.
- `/v2/watchlists/{id}`: existing items in release/custom order, text filtering, release-year
  grouping, expandable watched runs, stable IDs and nullable metadata.
- `/v2/watchlists/{id}/reorder`: atomic custom-order moves from web drag or keyboard intents.
- `/v2/mcp`: `list_watchlists`, `search_watchlists`, `get_watchlist`, `find_watchlist_items`,
  `reorder_watchlist_items`.
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
when v1 deletions left gaps. Other future writes must explicitly preserve Drizzle's
application-side `updatedAt` hook; SeaORM does not supply it automatically. Reordering uses
the shared web/MCP operation; other writes belong to following slices. See
[PARITY.md](PARITY.md) for evidence and outstanding acceptance.

Reorder DOM regression: `node --test v2/tests/reorder-browser.cjs` (Node 24.12 or later
with npm dependencies).
