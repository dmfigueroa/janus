# V2 Frontend Without Compilation: Feasibility

Investigation date: 2026-11-11. This is source and documentation research, not a tested v2 implementation. The candidate direction was subsequently accepted in ADR 0002, subject to validating the hardest interactions.

## Finding

Frontend compilation is not required for rich interactions. Server-rendered HTML, browser-ready JavaScript libraries, application-owned JavaScript modules, and plain CSS can support Janus's current interaction patterns. This requires client code; avoiding compilation does not eliminate interaction complexity or establish a production memory saving.

Candidate: Rust-rendered pages and fragments, htmx for server-driven updates, SortableJS for pointer/touch ordering, and small JavaScript modules for local state. Vendor pinned browser-ready assets and serve them locally. Rust/template compilation remains an off-host build step.

## Existing Behavior To Preserve

- Watchlist ordering is enabled only in custom mode. Mouse and touch dragging update the display optimistically, prevent overlapping mutations, restore state on failure, and reconcile with the server. See `src/features/watchlists/components/useWatchlistTimelineReorder.ts` and `src/features/watchlists/detail/useReorderWatchlistItemsMutation.ts`.
- Reordering sends a moved item, reference item, and before/after placement. The server applies that intent against the complete stored order. Preserve this contract rather than replacing the full order with only visible items from a filtered page. See `src/features/watchlists/detail/Reorder.ts` and `src/features/watchlists/reorder/Mutation.server.ts`.
- Lineup ordering supports pointer dragging, keyboard dragging, arrow controls, and live announcements. A pointer-oriented sortable library alone does not establish equivalent keyboard behavior. See `src/features/lineups/manage/ManageLineups.tsx`.
- Optimistic watched toggles, removals, movement, search details, dialogs, clipboard actions, and PWA behavior also need an explicit parity inventory. This investigation does not certify every existing workflow.

## Implementation Requirements

On drop, keep the locally updated order visible, disable conflicting mutations, send the anchor-based intent, then reconcile the affected fragment from authoritative server state. On rejection or network failure, restore or reload the authoritative order and announce the failure. Coordinate fragment replacement with active drags, restore focus, avoid duplicate event initialization, and preserve filters and scroll position.

Keep keyboard reordering and announcements as explicit application behavior. Test touch scrolling versus dragging, filtered and grouped timelines, slow and failed saves, repeated actions, and external MCP changes. Validate PWA installation, update, and caching behavior separately; no-build JavaScript can implement a service worker but does not automatically reproduce the existing setup.

## Primary Sources

- [htmx documentation](https://htmx.org/docs/): direct script installation without a build system and HTML fragment updates.
- [SortableJS documentation](https://github.com/SortableJS/Sortable): direct script installation, touch options, handles, drop callbacks, and disabling interaction.
- [htmx sortable example](https://htmx.org/examples/sortable/): integration with SortableJS, persistence after drop, and disabling sorting during a request. The example is a starting point, not Janus's filtered-order or failure-handling implementation.

## Validation Gate

The frontend direction is accepted in ADR 0002. Before implementing the full replacement, validate the hardest watchlist reorder interaction with a small isolated prototype and explicit parity checks. This research alone does not establish runtime resource savings or complete feature parity.
