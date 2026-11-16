# V2 parity baseline

Parity source and running v1 image: `669a385b8efa855adfad93f73b734cc5c9a4e709`
(verified 2026-11-11 through Coolify deployment history and Docker image inspection).
The previous source baseline was `b86d920c7faa347a3af04ffda13f163f461e0616`.
The intervening #275, #276 and #277 changes add v2 scaffold, Rust CI and deployment
configuration; they do not change v1 product behavior.

Running v1 mounts `h8gsos0k40kk8s8oo8o4ko0w-DB` at `/app/storage`; the database is
`/app/storage/sqlite.db`. Directory permissions are 755 root:root, database 644 root:root.
A separately deployed `janus-v2` read application also mounts this exact volume at the
same directory. Both images currently run as root. This differs from the parent spec's
same-application Compose topology: the checked-in Compose configuration remains prepared,
while live Coolify currently uses two Dockerfile applications. No topology change is claimed.

For each later v1 commit, inspect `git diff <baseline>..<new revision> -- src public drizzle`,
append the revision and behavioral delta here, update affected workflow/tool/provider/PWA
rows, and rerun their evidence before advancing the baseline. Schema deltas require explicit
compatibility reconciliation and regeneration of the v1 schema contract through migrations.

## Setup evidence

- [x] Independent Rust crate, rendered smoke page, local assets and mounted MCP.
- [x] Local fail-closed database compatibility and readiness.
- [x] Deployed v1/v2 revision reconciliation and shared-volume inspection.
- [ ] Complete Access-authenticated routing/client verification.

## Workflow checklist

- [x] Watchlist listing and name search through web/MCP reads.
- [ ] Watchlist create, edit, delete and merge.
- [x] Existing detail reads, text filters, stored release/custom order and release-year/watched grouping.
- [x] Hidden-item-safe custom reorder.
- [ ] Order-mode changes.
- [ ] Provider search/details/pagination and additions; TV/comic expansions.
- [ ] Custom additions, anchored insertion, duplicates and partial outcomes.
- [ ] Edited metadata, item/parent removal and movement.
- [ ] Watch, quiet watch, unwatch, idempotence and rotation recency.
- [ ] Watch Now, skip, pause, derived completion and empty watchlists.
- [ ] Automatic/custom lineups, membership, enablement and ordering.
- [ ] Navigation, theme, dialogs, notifications and confirmations.
- [ ] Focus/scroll/filter preservation; keyboard, touch and failed-save recovery.
- [ ] Clipboard, installation, service-worker updates and caching.
- [ ] Provider mappings/configuration errors/unavailable categories, deterministic fixtures.
- [ ] Shared v1-created SQLite round trips, schema preservation, locks and rollback.
- [ ] MCP schemas/envelopes/defaults/annotations/pagination/batch isolation.
- [ ] MCP initialization, sessions, termination and expiry.
- [ ] Local browser checks, deployed Access checks, real-client and real-device acceptance.
- [ ] Resource measurements and owner acceptance before v1 retirement.

## MCP source inventory

The four prerequisite read tools and `reorder_watchlist_items` are implemented; the other
tools are unported. Contracts live in src/app/mcp at the source revision above.

- [ ] add_custom_items_to_watchlists
- [ ] add_media_to_watchlists
- [ ] create_lineups
- [ ] create_watchlists
- [ ] delete_lineups
- [ ] delete_watchlists
- [ ] edit_watchlist_items
- [x] find_watchlist_items
- [ ] get_lineup
- [x] get_watchlist
- [ ] list_lineups
- [x] list_watchlists
- [ ] merge_watchlists
- [ ] move_watchlist_items
- [ ] move_watchlist_parents
- [ ] remove_watchlist_items
- [ ] remove_watchlist_parents
- [ ] reorder_lineups
- [x] reorder_watchlist_items
- [ ] search_media
- [x] search_watchlists
- [ ] set_lineup_watchlists
- [ ] set_watchlist_items_watched
- [ ] set_watchlist_order
- [ ] skip_watchlists
- [ ] update_lineups
- [ ] update_watchlists

## Issue #253 evidence

Local SQLite/HTTP integration tests create disposable files with v1's actual Drizzle migrator.
They cover missing/incompatible databases, schema and byte preservation, WAL preservation,
nullable watched values, JSON authors, timestamp strings, stable IDs, custom ordering,
HTML escaping, search/filtering, MCP discovery/envelopes/cursors/title grouping, session
termination, and visibility of subsequent v1 writes. A bounded exclusive-lock test covers
startup contention. These are local tests, not deployed or real-client acceptance.

The connection remains read-only in this slice. V2-to-v1 writes, mutation rollback and
reordering interaction evidence remain with #254/#255. No write compatibility is claimed.
Browser/PWA, real-client, real-device and owner acceptance remain independent gates.

## Provider inventory at the baseline

- [ ] TMDB movies and TV: search paging, details, TV-to-episode expansion, poster paths,
      configured-key failures, duplicate/no-new-item and partial addition outcomes.
- [ ] RAWG games: configured-key failures, search paging, details and additions.
- [ ] Google Books: identifiers/ISBNs, authors, optional metadata, search paging and additions.
- [ ] ComicVine: configured-key failures, volumes/issues, paging and volume expansion.
- [ ] AniList anime/manga: preserve deliberate unavailable-category outcomes; do not enable
      the dormant provider adapter simply because its implementation exists.

Sources: `src/features/search/search/MediaSearch.server.ts`, `src/server/providers/*`,
`src/server/Media.ts`, and addition feature operations at the baseline revision.
All provider ports and live-provider evidence remain outstanding.

## PWA inventory at the baseline

- [ ] Manifest: Janus name/icons, standalone display, root start URL, pink theme/dark background.
- [ ] Credential-aware service-worker registration, prompt-based updates and startup update checks.
- [ ] Existing waiting-worker detection, persistent Update toast, reload after activation,
      and visible/reportable registration/update failures.
- [ ] Existing cache behavior and absent navigation fallback; no new offline-write semantics.
- [ ] Install and update behavior on actual devices, independently of emulated viewport checks.

Sources: `vite.config.ts`, `src/lib/PwaRegistration.ts`, `src/components/PwaUpdatePrompt.tsx`.
No v2 PWA port or PWA acceptance is claimed by the read slice.

## Final read-slice verification

Runtime revision: `1f3297ecdd7095aa46086d373e200fe756010749`.
Local gates: 10 Rust tests, 483 v1 tests across 68 files, Rust formatting/Clippy,
v1 typechecking and the release build pass. A headless Chromium check at 390px and 1280px
passed rendering, horizontal-overflow and filter-navigation checks. This is emulated browser
evidence; it does not establish physical-device or full visual/PWA parity.

Coolify deployment `bhygmznuh9nkbb8cqfo3c9da` finished successfully on 2026-11-11
at 21:12:18 UTC. Running image ID:
`sha256:ed1c4748e55d74ab89762509582aedc78ab6538ee01e38b0bd4e391fc69bfde2`.
The service is healthy; independent readiness returns 200. Its source configuration was
restored to main/HEAD after testing; the verified PR image remains running.

Read-only deployment-host checks confirmed the exact shared volume in both containers.
The existing database contains 210 watchlists and 50,575 items. For watchlist 293,
v2 returned all 62 items and matching HTML item IDs; its complete MCP item results,
summary and SHA-256 order token matched the running v1 MCP endpoint. Initialization
and tool calls returned application/json with legacy session headers; termination passed.
These checks used the internal container network, not an Access-authenticated external client.

Schema hash before/after:
`f74fcb1b80662a7dea722dc51293e260333584195d7ca8e3b282980eb6153ca9`.
Drizzle migration-metadata hash before/after:
`aa8d7855b6b62554596aa5af6abc79052d5a336441ecd9401164269ce3be9939`.
Both are SHA-256 of the ordered SQLite schema/migration rows read by the same verifier.
Journal mode remains delete. V1 remained running and its MCP endpoint remained usable.
No production mutation test was run.

All six GitHub CI checks passed on the runtime revision. Standards/spec reviews led to
fixes for cursor/argument validation, duplicate ordering and quadratic watched-run grouping.
A Greek final-sigma concern did not reproduce against Rust/Node and has a public regression.
JSON-valued feature records remain a non-blocking design concern for later typed-interface work.
Unauthenticated external v1/v2 web/MCP requests returned 403; this alone does not verify
Access-authenticated or real-client behavior. Physical-device, full PWA, write/reorder and
owner acceptance gates remain outstanding in their respective slices.

## Issue #256 browse-home evidence

The web home now renders the v1 watchlist grid instead of a bare result list. Cards keep
cover selection, the watched/total and progress line, progress bar, next-item label and paused
date. Rotation lists stay in the stored recency order, while completed, empty and paused lists
stay in their v1 collapsible sections. A shared layout adds the v1 bottom navigation to the
home and existing detail page.

`browse.rs` owns summary ordering (`recency`, `createdAt`, `lastWatched`, `lastAdded`), NFC plus
lowercase name matching, page cursors bound to the query and sort, section grouping and card
labels. `snapshot.rs` reads every summary in one transaction using grouped counts and
mode-specific ranked item selections, reducing the home read from per-watchlist queries to
four statements. Search, sort and pagination use
HTMX, swap only `#watchlist-browse`, push the URL, announce pending/failed loads, and keep a
non-JavaScript link fallback. Empty search results offer a clear action. These web controls are
the web projection of the MCP discovery contract; v1's home itself only ordered by recency, and
v1's `list_watchlists`/`search_watchlists` inputs and ordering are unchanged.

Automated coverage: browse unit tests for recency and sort order, Unicode matching, bound
cursors, lifecycle grouping, next-item markers, cover URLs and paused dates; fixture-backed
HTTP tests for home cards, totals, cover placeholders, escaped labels, navigation, search,
sorting, HTMX fragment-only swaps, continuation links, JSON content negotiation, bulk summary
consistency and search empty states. `cargo fmt --check`, Clippy and all Rust tests pass with disposable v1 databases.
No deployed, real-client, physical-device or owner acceptance is claimed for this slice.
Create, edit, delete, merge, watch/skip/pause and their card menus remain outstanding in their
own slices.

## Issue #307 watchlist read-state evidence

Watchlist stored-row decoding and queries are private to `storage.rs`; `summary.rs` owns
progress, next-unwatched and cover selection; `snapshot.rs` composes typed record, item,
detail and summary reads and owns their transactions; `item_order.rs` owns the stored order
mode shared by reads and reorder. Summary reads still use counts plus selected rows rather
than loading every item. Reorder keeps its writer lock, complete renumber, rollback and
commit behavior and only imports the shared order-mode decoding.

Validation: `cargo fmt --check`, `cargo clippy --locked --all-targets -- -D warnings`, and
`cargo test --locked` pass under Node 24.18 for disposable v1 fixtures. The suite covers
empty/partial/completed progress, nullable watched state, decoded authors/timestamps,
release/custom/null-rank ordering, exact order-token bytes, summary/next-unwatched/cover
selection, reads after v1 writes, reorder rollback and HTMX/MCP contracts. No deployed or
real-client acceptance is claimed.

## Issue #254 reorder slice

Web and MCP call the same atomic custom-order operation. Intents identify moved and
reference IDs and before/after placement; filtered views never submit a replacement
order. Invalid anchors and release-mode writes reject before rank changes. SQLite
writer acquisition uses the existing two-second busy timeout; commits are not retried.
The browser provides pointer/touch handles and Alt+Up/Down keyboard controls, blocks
local reorder writes while saving, and reconciles from the current filtered URL after
success or failure. Expanded watched groups, focus and scroll are restored.

Moves are evaluated against the complete displayed order and the resulting sequence is
renumbered in full. Stored ranks therefore stay contiguous even when v1 deletions left
gaps, instead of v1's slice-only update producing a different order from the new ranks.

Automated coverage: disposable v1-migrated SQLite web/MCP success and invalid anchors,
independent batch results, durable reopened reads, v1 rank reads/writes, gapped-rank
renumbering, and forced mid-write rollback. DOM coverage exercises optimistic keyboard
movement, drop-intent anchors, blocked fragment swaps during drags and saves, failed-save
reconciliation, failed-reconcile refresh guidance, one write attempt, and filter/scroll/focus
restoration on success. DOM tests do not establish real browser pointer/touch behavior.
Existing database tests cover bounded locks and schema compatibility. No deployment,
Access-authenticated client, physical-device or owner acceptance evidence is claimed for
this change; those gates remain outstanding.
