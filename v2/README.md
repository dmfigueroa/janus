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

Tests require root `pnpm install --frozen-lockfile` under a supported Node version because their
disposable SQLite files are created by the actual v1 Drizzle migrator. Set `JANUS_TEST_NODE` to
that Node executable when it differs from PATH. Node is a test fixture dependency only.

`JANUS_V2_BIND` defaults to `127.0.0.1:3001`. `DATABASE_URL` is a required filesystem path,
as in v1. Missing files, incompatible schema and unsupported stored values fail startup.
The connection supports reorder writes, never creates a file, and leaves journal mode unchanged.
The pool has at most two connections, a five-second connect/acquire timeout and two-second
SQLite busy timeout. V1 alone owns migrations. No schema-sync/migration features are enabled.
The existing directory must be mounted, including WAL/SHM sidecars.

- `/v2`: development landing page.
- `/v2/watchlists`: paginated watchlist discovery and Unicode name search.
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

Reorder writes renumber the complete displayed sequence, keeping ranks contiguous even
when v1 deletions left gaps. Other future writes must explicitly preserve Drizzle's
application-side `updatedAt` hook; SeaORM does not supply it automatically. Reordering uses
the shared web/MCP operation; other writes belong to following slices. See
[PARITY.md](PARITY.md) for evidence and outstanding acceptance.

Reorder DOM regression: `node --test v2/tests/reorder-browser.cjs` (Node 24.12 or later
with pnpm dependencies).
