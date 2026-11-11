# Janus V2 Specification

Status: agreed design, ready for implementation planning. No application implementation is included in this document.

## Purpose

Replace Janus's web stack with Rust and a frontend without compilation, minimizing resource use on a host shared with other applications. Preserve the application: features, stored data, domain behavior, supported integrations, appearance, navigation, and interaction quality. Rust is required; there is no numeric resource budget. Resource savings must be measured rather than assumed.

The architectural decisions are recorded in [ADR 0002](adr/0002-rust-v2-stack-replacement.md). [CONTEXT.md](../CONTEXT.md) owns domain terminology. The [frontend feasibility investigation](v2-frontend-feasibility.md) explains the interaction approach and its unverified areas.

## Scope And Baseline

V2 lives alongside v1 under `v2/` in this repository. V1 remains operational during development and deployment of v2. V2 must be feature equivalent to v1 before replacement; the first validation slice is deliberately smaller than the completed application.

At implementation start, record the deployed v1 revision and the corresponding source revision used for parity. Reconcile any difference explicitly. Inventory all supported workflows, MCP tools, provider behaviors, PWA behavior, and existing tests against that baseline. Later v1 changes must be added explicitly to the parity checklist. This spec's coverage list is a starting inventory, not permission to omit behavior discovered in the baseline.

In scope:

- Watchlist listing, search, creation, editing, deletion, merging, detail views, filters, ordering modes, and custom ordering.
- Watchlist item and parent operations: additions and expansion, edited metadata, watched state, quiet watch, removal, movement, and anchored insertion where supported by v1.
- Watch Now, global rotation, skipping, pause/resume, completion and empty-state behavior, and automatic and custom lineups with management and ordering.
- Provider search, details, additions, pagination, configuration failures, deliberately unavailable categories, and partial batch outcomes.
- MCP discovery, tools, schemas, result envelopes, structured outcomes, and transport behavior observable by existing clients.
- Responsive UI, keyboard and touch interaction, focus management, announcements, feedback, theme behavior, and existing PWA capabilities.
- Shared-database coexistence and a deployed v2 instance in the existing Coolify application.

Out of scope:

- Product redesign, new features, new account systems, or deliberate changes to domain rules.
- Database schema changes until v1 is completely deprecated.
- Compatibility with v1 web URLs or TanStack's internal request protocol.
- Automatic background synchronization of open pages with external writes.
- Cutover and rollback planning or execution; revisit these only after v2 is done.
- Retiring v1 as part of implementation without the user's acceptance.

## Stack And Ownership

| Concern                             | Choice                                                        |
| ----------------------------------- | ------------------------------------------------------------- |
| HTTP and runtime                    | Axum and Tokio                                                |
| Server-rendered pages and fragments | Askama                                                        |
| Database mapping                    | SeaORM, conditional on compatibility validation               |
| MCP                                 | Official `rmcp` SDK                                           |
| Server-driven browser updates       | htmx                                                          |
| Pointer and touch reordering        | SortableJS plus application behavior                          |
| Styling and local interactions      | Plain CSS and small JavaScript modules                        |
| Deployment                          | Separate Compose services within the same Coolify application |

Start with one Rust crate. Organize modules by feature, with thin HTTP and MCP handlers calling the same feature-owned business operations. Keep ORM entities and provider adapters behind those operations. Do not introduce a generic service hierarchy or split crates without a concrete need. Apply the ownership principles of [ARCHITECTURE.md](../ARCHITECTURE.md) to Rust; TanStack-specific file suffixes and server functions apply to v1 only.

One Rust process serves web pages, fragments, static assets, and MCP. The v2 runtime must not depend on a running v1 Node process for its business operations. V1 is a coexistence dependency during development, not the implementation of v2.

Rust and Askama compile outside the deployment host. Browser JavaScript and CSS require no frontend compilation or bundling. Pin and serve browser-ready dependencies locally. Do not require a production CDN or Node runtime for v2. Exact dependency versions, CI image publishing, and detailed module paths are implementation choices to verify against current supported releases.

## Shared SQLite Contract

Both applications run on the same host and open the same local SQLite database, mounted as the existing database directory in both Compose services. Preserve the actual volume identity and file path; an accidentally created empty database is not a successful deployment.

V1 remains the sole owner of schema migrations. V2 must not create tables, auto-synchronize entities, run migrations, or add ORM migration metadata. It checks compatibility at startup and reports an incompatible or missing database without silently creating a replacement. Compatibility checks must use the existing schema and metadata rather than require new schema objects.

Validate SeaORM against the existing database before broader feature porting. Entity generation alone does not prove compatibility. Verify:

- Column names, integer identifiers, nullability, uniqueness, defaults, relationships, and persisted ordering.
- Timestamp text representations and v1 application-side update behavior, including Drizzle's update hooks; these do not automatically transfer to another ORM.
- Nullable integer booleans, JSON text, provider identifiers, and existing records with optional fields.
- Unicode normalization and lowercasing behavior used by `unicode_case_fold`; preserve query behavior without adding persisted schema objects.
- Transaction boundaries, affected counts, duplicate handling, partial batch isolation, and failure atomicity.
- Connection settings, foreign-key behavior, file permissions, and lock contention between v1 and v2.

Keep transactions short and avoid holding write transactions over provider HTTP requests. Configure bounded connection use and bounded handling of SQLite lock contention. Do not blindly retry a whole mutation after an ambiguous commit. Exact timeout and pool values are implementation choices to validate with coexistence tests. Do not silently change persisted journal settings as an incidental ORM default.

Writes made by either application must remain readable and meaningful to the other. Repeated explicit watched-state operations must preserve v1's recency semantics. Existing rotation, pause, completion, lineup, addition, and movement rules remain authoritative.

## Browser Behavior

Render pages and update fragments on the server. Use JavaScript where local interaction requires it. Preserve the current visual language and navigation, allowing small differences from replacing Chakra. ADR 0001 continues to govern v1; ADR 0002 replaces its component-library requirement for v2.

For custom watchlist ordering:

1. Enable ordering only in the same conditions as v1, including custom order mode and conflicting pending operations.
2. Give immediate visual feedback during and after a drag without waiting for the network.
3. Send the moved watchlist item, reference watchlist item, and before/after intent. Never replace the complete stored order using only items visible in a filtered view.
4. Validate current database state on the server and apply the operation atomically.
5. Prevent conflicting local mutations while saving and reconciling. On success, reconcile with authoritative server state; on failure, restore or reload authoritative order and announce the failure.
6. Preserve touch scrolling, keyboard operation where supported, focus, scroll position, filters, grouping, and accessible feedback. Keyboard ordering must be implemented explicitly; choosing SortableJS does not establish it.

Coordinate fragment replacement with active interactions. Avoid duplicate event initialization after swaps, stale handlers, and focus loss. Apply equivalent pending, success, failure, and reconciliation behavior to other mutations. Preserve dialogs, clipboard workflows, search interactions, and destructive-action confirmations from the baseline.

Changes made through v1 or MCP need not appear automatically in an already-open page. They may appear on navigation, refresh, or a relevant action. Actions must validate current state and reconcile displayed results rather than trust stale browser state.

Inventory and reproduce existing PWA installation, update, and caching behavior. A hand-authored service worker is possible without a frontend build, but adding one alone is not parity. Do not add new offline-write semantics as part of the rewrite.

## MCP And Providers

Preserve existing tool names, inputs, defaults, validation, output schemas, structured results, error behavior, annotations, pagination, ordering, and batch isolation. Preserve stable database IDs exposed to clients. Use existing protocol tests and baseline tool discovery as the contract inventory; do not infer compatibility from matching function names.

V1 currently uses Streamable HTTP with sessions, JSON responses, and idle expiration. Verify those behaviors with `rmcp`, including initialization, session headers, missing and expired sessions, and session termination. SDK defaults must not silently change the client's contract. Select a supported SDK release and test existing clients.

Existing MCP clients continue using v1 during development. V2 exposes a separate endpoint for compatibility testing. Preserve the existing Cloudflare Access boundary described in [docs/mcp.md](mcp.md) for exposed v2 surfaces; no new application identity system is introduced. Local protocol tests do not establish deployed Access or real-client acceptance.

Provider adapters preserve current configuration, mapping, expansions, ordering, and availability restrictions. Do not enable a deliberately unavailable category merely because the Rust adapter supports it. Preserve authoritative addition outcomes and affected counts; messages remain presentation text. An individual batch failure must not prevent subsequent independent entries from being processed according to the baseline contract.

## Deployment During Development

Use one Coolify application with Compose services for v1 and v2, mounting the same existing SQLite directory. V2 must be deployable while v1 remains available. Give v2 separately routable web and MCP surfaces for testing while preserving existing v1 traffic. The exact testing hostname and proxy configuration must be taken from the actual deployment configuration.

Build images outside the deployment host. Keep independent build, startup, and health-check commands. V1 retains migration ownership; v2 startup checks database compatibility. Confirm storage permissions and application readiness before claiming a successful deployment. Never treat a newly created empty database as a healthy replacement for the existing volume.

No live deployment configuration is changed by this specification. Inspect the current Coolify resource and volume configuration before implementation changes to deployment. Final traffic switching, rollback procedures, and v1 removal remain deferred.

## First Validation Slice

Prove a complete path through the selected stack before porting the rest of Janus:

1. Record the v1 parity baseline and create the initial workflow/tool checklist.
2. Establish the Rust crate, database compatibility check, entity mappings, and shared feature operation for custom watchlist reordering.
3. Provide a watchlist detail page with no-build interactions and the matching MCP reorder operation, including prerequisite read/discovery behavior needed to exercise it.
4. Validate filtered and grouped lists, pointer and touch interactions, keyboard behavior, failed-save recovery, and reconciliation after external writes.
5. Demonstrate v1/v2 shared-file reads and writes using disposable databases created through v1 migrations, without schema changes from v2.
6. Package and deploy the slice alongside v1 in the same Coolify application using the shared production volume after local compatibility validation. Clearly mark the slice as incomplete; it does not authorize replacement of v1.

If the slice exposes a compatibility failure in SeaORM, `rmcp`, or the no-build interaction approach, resolve it or revisit the affected decision explicitly before broader porting. Do not silently replace selected technologies or reduce feature scope.

## Verification And Acceptance

Maintain a parity checklist that links each baseline workflow and MCP tool to its implementation and evidence. For each item, distinguish automated tests, local browser verification, deployed checks, real-client checks, and user acceptance. Record unsupported or unverified cases explicitly.

Required evidence includes:

- Rust formatting, linting, tests, and release build; v1 checks continue to pass for touched v1/configuration areas.
- SQLite integration tests against v1-created disposable databases, including both versions writing the same file, rollback on failures, filtered ordering, stored-value round trips, and unchanged schema.
- MCP contract tests for tools and transport, plus an actual deployed client check through the existing access boundary.
- Browser checks for responsive layouts, keyboard operation, touch interactions, focus, notifications, pending states, slow/failed requests, and PWA behavior. Label emulation separately from real-device checks.
- Provider tests distinguishing deterministic fixtures from live provider verification.
- Evidence that deployed v1 remains available and v2 uses the existing database volume.
- Comparative measurements using the same dataset and documented workloads: idle and active process/container memory, CPU use, startup behavior, and image size. Separate application runtime, build costs, and combined transition overhead. No fixed numeric target or savings claim is implied.

The first slice is complete only when its compatibility and interaction gates pass with clearly identified limits. V2 is ready for replacement consideration only when the complete baseline parity checklist passes and the user accepts the actual application. Completing this specification or passing automated checks does not authorize retiring v1.

## Deferred Decisions

Cutover, rollback, the final public routing change, and v1 retirement are out of scope until v2 is done. Dependency versions, exact connection limits/timeouts, image publishing details, and testing hostnames must be resolved during implementation from current documentation and actual deployment facts. These details must honor the decisions above and are not reasons to reopen settled product scope.
