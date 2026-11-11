# ADR 0002: Replace The Web Stack In Janus V2

Janus shares a resource-constrained deployment machine with multiple applications. V2 will use Rust and minimize deployment resource use without a fixed numeric budget. Rust compilation will happen outside the deployment machine. The frontend will use Rust-rendered HTML, htmx, SortableJS, plain CSS, and small JavaScript modules without frontend compilation. Pinned browser-ready libraries will be served locally. Validate the hardest watchlist interactions before implementing the full replacement.

V2 replaces the web stack while preserving v1 features, stored data, domain behavior, and supported integrations, including MCP. V1 must remain operational until v2 is ready to replace it. Both applications will run on the same host and access the same local SQLite database. V2 must preserve the schema and stored-value semantics until v1 is completely deprecated. A separate production data copy and final data transfer are not the rollout model. Connection coordination, cutover, and rollback mechanisms remain undecided.

The parity baseline is the v1 version running when v2 implementation begins. Subsequent v1 changes must be explicitly added to the v2 parity checklist. The exact baseline revision must be recorded at implementation start.

Rust is a firm requirement rather than an option conditional on benchmarking. Actual resource savings remain to be measured. Rust libraries remain undecided. This decision supersedes ADR 0001's Chakra UI requirement for v2; ADR 0001 continues to govern v1. Preserve existing interaction behavior and accessibility in the replacement UI.
