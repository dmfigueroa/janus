# Janus v2 setup

Independent Rust crate for issue #251 and ADR 0002. V1 remains the production application.
Requires Rust 1.94.0 and a native C compiler (SQLite); no Node installation is needed.

From v2/:

- Develop: cargo run --locked
- Check: cargo check --locked
- Validate: cargo fmt --check; cargo clippy --locked --all-targets -- -D warnings; cargo test --locked
- Build: cargo build --locked --release
- Start: ./target/release/janus-v2

JANUS_V2_BIND accepts a socket address, default 127.0.0.1:3001. Invalid values fail startup.
Static assets and templates are embedded, so startup is independent of the working directory.
GET /v2 and GET /v2/health/live confirm liveness only. GET /v2/health/ready always returns 503:
database compatibility is not implemented in this setup slice. No database configuration is
consumed and no database is opened, created, or migrated, even if DATABASE_URL is present.
Issue #253 must supply fail-closed compatibility validation before readiness can succeed.

POST /v2/mcp mounts the official SDK transport with no product tools. Its defaults are a
feasibility probe, not evidence of v1 transport compatibility. Keep existing clients on v1.
Only expose this development service behind the existing Access boundary (deployment #252).

Direct pins: Axum 0.8.9, Tokio 1.54.1, Askama 0.16.1, SeaORM 2.0.4, rmcp 3.9.0.
Cargo.lock pins the full graph. SeaORM is available with SQLite support but is deliberately
not connected until compatibility is proved. See docs.rs for each pinned crate's API.
Browser assets: htmx 2.0.8 and SortableJS 1.15.6, vendored from their versioned npm
distribution through unpkg. These are local production assets, with no runtime CDN requests.
See static/vendor/README.md for provenance and licenses.

## Parity evidence

Source baseline: b86d920c7faa347a3af04ffda13f163f461e0616.
The deployed v1 revision has not been verified; reconciliation remains pending.
This ticket establishes HTTP/static/MCP mounting only. It supplies no watchlist behavior,
database compatibility, keyboard reordering, PWA parity, resource measurements, deployed
Access checks, real MCP client acceptance, device checks, or owner acceptance.
The initial source inventory is in [PARITY.md](PARITY.md). Track those gates in #253–#273 and parent #250; v1 retirement remains unauthorized.
