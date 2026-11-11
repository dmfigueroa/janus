# ADR 0002: Replace The Web Stack In Janus V2

Janus shares a resource-constrained deployment machine with multiple applications. V2 will use Rust and minimize deployment resource use without a fixed numeric budget. Rust compilation will happen outside the deployment machine. The frontend will use Rust-rendered HTML, htmx, SortableJS, plain CSS, and small JavaScript modules without frontend compilation. Pinned browser-ready libraries will be served locally. Validate the hardest watchlist interactions before implementing the full replacement.

V2 replaces the web stack while preserving v1 features, stored data, domain behavior, and supported integrations, including MCP. V1 must remain operational until v2 is ready to replace it. Both applications will run on the same host and access the same local SQLite database. V2 must preserve the schema and stored-value semantics until v1 is completely deprecated. A separate production data copy and final data transfer are not the rollout model. Connection coordination, cutover, and rollback mechanisms remain undecided.

The parity baseline is the v1 version running when v2 implementation begins. Subsequent v1 changes must be explicitly added to the v2 parity checklist. The exact baseline revision must be recorded at implementation start.

V2 will live alongside v1 under `v2/` in this repository, with independent build and deployment commands. Preserve the current appearance, navigation, and interaction behavior, allowing small differences from replacing Chakra. Substantial redesign requires a separate decision.

V1 remains available until v2 passes a documented parity checklist covering web workflows, MCP, provider integrations, PWA behavior, and shared-database compatibility. The user's acceptance of the actual application is required before retiring v1; automated test results alone do not authorize retirement.

One Rust application will serve web pages, static assets, and MCP. Web and MCP will call the same business operations. While the versions coexist, v1 is the sole owner of schema migrations; v2 checks database compatibility at startup and never changes the schema. V2 may update application data.

Use SeaORM for v2 database access, conditional on proving compatibility with the existing schema and stored values, including timestamps, nullable booleans, JSON fields, Unicode matching, and transactions. Disable schema creation and migrations in v2. Preserve externally observable MCP tool names, inputs, outputs, and error behavior. Compatibility with v1 web URLs or its internal request protocol is not required.

V2 must be deployed during the transition in the same Coolify application as v1. Use Compose with separate v1 and v2 services, both mounting the existing database directory. Verify the existing volume mapping before changing deployment configuration. Existing MCP clients initially continue using v1, with a separate v2 MCP endpoint for compatibility testing. Cutover and rollback planning are explicitly out of scope until v2 is done.

Open v2 pages need not receive automatic background updates for changes made through v1 or MCP. Changes may appear on the next navigation, refresh, or relevant action. Actions must validate current database state and reconcile their displayed results.

Use Axum and Tokio for HTTP, Askama for server-rendered HTML templates, and the official `rmcp` SDK for MCP. Askama template compilation happens during the off-host Rust build; browser JavaScript and CSS require no frontend compilation. Verify existing MCP session and response behavior before declaring compatibility.

Start with one Rust crate under `v2/`, organized by feature. Thin web and MCP handlers call shared feature operations; ORM entities and provider adapters stay behind those operations. Split crates only when a concrete need appears. This extends the repository's feature ownership model to v2 without carrying over TanStack-specific boundaries.

The first validation slice must prove database compatibility and a complete watchlist-reordering flow through web and MCP before porting the remaining features. Cover filtered lists, touch and keyboard interaction, failed-save recovery, and writes from both versions. Automated tests use disposable databases with v1's schema; deployed v2 uses the shared production database. This test arrangement does not change the agreed deployment model.

Rust is a firm requirement rather than an option conditional on benchmarking. Actual resource savings remain to be measured. This decision supersedes ADR 0001's Chakra UI requirement for v2; ADR 0001 continues to govern v1. Preserve existing interaction behavior and accessibility in the replacement UI.
