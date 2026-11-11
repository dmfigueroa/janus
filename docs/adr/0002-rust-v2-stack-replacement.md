# ADR 0002: Replace The Web Stack In Janus V2

Janus shares a resource-constrained deployment machine with multiple applications. V2 will use Rust and minimize deployment resource use without a fixed numeric budget. Rust compilation will happen outside the deployment machine. Avoiding frontend compilation is preferred, subject to preserving the application's interactions.

V2 replaces the web stack while preserving v1 features, stored data, domain behavior, and supported integrations, including MCP. V1 must remain operational until v2 is ready to replace it. The coexistence, data migration, cutover, and rollback mechanisms remain undecided.

Rust is a firm requirement rather than an option conditional on benchmarking. Actual resource savings remain to be measured. The frontend architecture and Rust libraries remain undecided; ADR 0001 continues to govern v1, and its replacement for v2 requires a separate decision.
