# V2 parity baseline

For visual work, [V1-UI-MAP.md](V1-UI-MAP.md) maps each parity-relevant v1 UI area to its v2
template and stylesheet counterpart. Use it to locate files; use this ledger for baseline
revision, evidence and outstanding acceptance.

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
- [x] Watchlist create and edit; delete and merge remain outstanding.
- [x] Existing detail reads, text filters, stored release/custom order and release-year/watched grouping.
- [x] Hidden-item-safe custom reorder.
- [x] Order-mode changes: web updates and MCP `update_watchlists` share the metadata write; switching release to custom initializes contiguous custom ranks in release order, and switching back retains ranks while release ordering resumes. The detail read reprojects grouping, filters and reorder availability from the stored mode. Web and MCP integration coverage uses disposable v1-migrated SQLite databases and verifies round trips and persisted ranks; no schema change.
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

The four prerequisite read tools, `create_watchlists`, `update_watchlists` and
`reorder_watchlist_items` are implemented; the other
tools are unported. Contracts live in src/app/mcp at the source revision above.

- [ ] add_custom_items_to_watchlists
- [ ] add_media_to_watchlists
- [ ] create_lineups
- [x] create_watchlists
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
- [x] update_watchlists

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

`browse.rs` owns summary ordering (v1 recency), NFC plus
lowercase name matching, page cursors bound to the query, section grouping and card
labels. `snapshot.rs` reads every summary in one transaction using grouped counts and
mode-specific ranked item selections, reducing the home read from per-watchlist queries to
four statements. Search and pagination use
HTMX, swap only `#watchlist-browse`, push the URL, announce pending/failed loads, and keep a
non-JavaScript link fallback. Empty search results offer a clear action. These web controls are
the web projection of the MCP discovery contract; v1's home itself only ordered by recency, and
v1's `list_watchlists`/`search_watchlists` inputs and ordering are unchanged.

Automated coverage: browse unit tests for recency ordering, Unicode matching, bound
cursors, lifecycle grouping, next-item markers, cover URLs and paused dates; fixture-backed
HTTP tests for home cards, totals, cover placeholders, escaped labels, navigation, search,
HTMX fragment-only swaps, continuation links, JSON content negotiation, bulk summary
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

### Reorder interaction ownership

Custom-order timelines are server-rendered as a Light DOM `<watchlist-reorder>` element;
release-order timelines remain ordinary `<div>` markup. HTMX owns the rendered rows,
filter state and recovery response. The element owns Sortable setup/teardown, keyboard
intents, busy state and status announcements. It unregisters document listeners and destroys
Sortable instances on disconnect, and it suppresses swaps only when the target intersects
its own subtree or would detach it. The separate recovery trigger remains page-owned.

Added coverage verifies the server markup contract, reorder behavior in the DOM suite, and
Chromium custom-element upgrade, inner-fragment replacement, stale-listener cleanup and
target-scoped swap suppression. Pointer/touch drag behavior remains covered only by the
existing Sortable interaction code; this refactor adds no real-browser drag simulation, so
DOM tests do not establish pointer/touch parity. No additional v1 visual parity claim is made.

## Issue #256 visual parity follow-up

The shared shell now follows v1 measurements more closely. The bottom navigation keeps
v1's space-around item row capped at 28rem, 4rem height, 5rem items, rounded
hover surface and 300ms ease-out transition. The browse grid keeps v1's two mobile columns, four desktop columns,
220px card cap, 1.125rem card titles and the "1 of 3 watched • 33%" meta separator; the
"Watchlists" heading is visible again and collapsed sections use v1's 20px chevron.

The detail header reuses v1's "watched/total Watched" and "complete" progress labels, an
8px progress bar, pill year headings and a sticky filter row. The watchlist search bar is
retained as a v2 addition because v2 has no media search page; it is not presented as v1
parity. `cargo fmt --check`, Clippy and all Rust tests pass against disposable v1 databases.
No deployed, browser, physical-device or owner acceptance is claimed for this style pass.

## Issue #257 create/edit evidence

Web and MCP call the same create and update operations. Creation keeps v1's insert defaults:
omitted order mode stores `release`, pause stays null, `created_at` comes from SQLite and the
new list joins the back of the rotation through the same millisecond-monotonic expression as
watched/skipped lists. Updates write only submitted fields and set `updated_at` to
`CURRENT_TIMESTAMP`, standing in for Drizzle's application-side `updatedAt` hook. Clearing a
description stores null; creation preserves an explicitly empty description exactly as v1's
web form does.

The home create tile and mobile button open a native dialog. The tile remains available in
search results and when the collection is empty. The detail header exposes the edit dialog.
Both forms support inline validation, pending and error states, focus restoration to the exact
opening control, dismissal through Cancel, Escape or the backdrop, and a success announcement.
Server failures keep the dialog open with an inline message. A successful HTMX write raises one
event that re-reads the current URL and replaces only the grid or detail surface, preserving
search and pagination; JSON callers receive structured outcomes. MCP `create_watchlists` and
`update_watchlists` keep input order, isolate invalid or missing entries and return structured
batch results. Null names, null update order modes and null creation descriptions are rejected
as in v1's Zod contracts.

Automated coverage: disposable v1-migrated SQLite tests verify validation, creation defaults,
editable fields, timestamps, schema preservation, ordered MCP batches, independent outcomes,
and reads through v1's tooling after v2 writes. HTTP tests assert the refresh hooks and
validation/success headers; dialog DOM tests cover opening focus, cancel focus restoration,
success announcements and pending/error state. `cargo fmt --check`, Clippy
and all Rust tests pass, and the reorder/dialog browser suites pass locally. No deployed,
Access-authenticated client, physical-device or owner acceptance is claimed for this slice.

## Issue #330 layout regression evidence

`node --test v2/tests/layout-browser.cjs` builds the v2 debug binary, creates a disposable
v1-migrated database through the existing `create_v1_fixture.cjs` helper plus extra rotation
cards, starts its own v2 process on a free port, renders `/v2/watchlists` in headless Chromium
at `390x844` and `1280x800`, then stops the process and removes the fixture. It needs no
deployed preview and no manually started server.

Expected geometry is the v1 home measured in this worktree and stored in
`v2/tests/v1-layout-baseline.json`:

- `390x844`: three footer items on one row at `38.33..118.33`, `155..235` and
  `271.66..351.66`; two grid columns; 220px card cap; visible "Watchlists" heading.
- `1280x800`: the same three items on one row at `464..544`, `600..680` and `736..816`;
  four grid columns; 220px card cap; visible "Watchlists" heading.

The check fails with measured and expected values when footer items stack or drift more than
1px horizontally, when the column count or the 220px cap changes, or when the heading is hidden
or retitled. Local negative checks confirmed failures for a column-direction footer, a
three-column desktop grid, a removed card cap and a hidden heading. Refresh the baseline from a
running v1 with `JANUS_LAYOUT_RECORD=1 node --test v2/tests/layout-browser.cjs` after
`npm run preview:local`.

This is emulated Chromium geometry at two viewports, not physical-device or full visual parity.

## Issue #329 watchlists home check evidence

`npm run test:v2:home` (`node --test v2/tests/watchlists-home-browser.cjs`) reuses the
disposable v1-migrated fixture database and v2 process from the layout check, renders
`/v2/watchlists` at `320x568`, `390x844`, `768x1024` and `1280x800`, then removes the process and
fixture. The check launches only the Chromium executable resolved from the pinned
`playwright-core` `1.65.1` dependency, so a differently cached Playwright browser does not change
the result, and it needs neither the in-app browser connection nor a deployed preview.

For every width it asserts the expected grid density (two columns and four rows on phones, four
columns and two rows on tablet and desktop for the eight-card fixture home), no horizontal
document, body or card overflow, the absence of any sort control on the home, and the
"Watchlists" heading. After typing `Layout` it asserts the search-results heading, the same
density and overflow rules, and that the clear-search control is hidden while the field is empty
and, once populated, sits inside the search field on its trailing side, vertically centered.

The four-viewport pass is recorded locally. Local negative checks confirmed that a three-column
mobile grid fails with measured versus expected columns and overflows the 320px viewport at
`323px`, and that each failing viewport writes a full-page screenshot under
`v2/tests/artifacts/watchlists-home` (overridable with `JANUS_VISUAL_ARTIFACTS`) while exiting
non-zero. CI runs the file with the other browser tests and uploads that directory as the
`v2-browser-failure-screenshots` artifact when the job fails.

This is emulated Chromium geometry at four viewports, not physical-device or full visual parity.

## Issue #258 order-mode evidence

Web updates (`POST /v2/watchlists/{id}`) and MCP `update_watchlists` share `Watchlists::update_watchlist`
inside one SQLite writer transaction. Switching `release -> custom` initializes contiguous
`custom_rank` values `1..N` in v1's release order (`release_date IS NULL OR release_date=''` last,
`release_date ASC`, `id ASC`) only when no saved custom ranks exist; switching `custom -> release`
preserves existing ranks while release ordering resumes, and returning to `custom` keeps saved ranks
intact even if unranked items were added in release mode. Mid-write failures roll back both the mode
change and rank writes atomically, and the SQLite schema remains unchanged.

On `/v2/watchlists/{id}`, `#watchlist-refresh` swaps `.watchlist` and updates `#watchlist-form`
out-of-band (`hx-select-oob="#watchlist-form"`), reconciling displayed items, active filters,
release-year versus cross-year watched grouping, `<watchlist-reorder>` / `.reorder-handle`
availability, and the edit dialog's persisted defaults without stealing focus while closed.
`WatchlistForm::name_invalid` flags `#watchlist-name` only for name validation errors, leaving
order-mode, missing-watchlist and internal errors linked through `aria-describedby`.

Automated coverage: disposable v1-migrated SQLite tests verify release tie-breaks (equal dates,
empty-string and null dates), mixed ranked/unranked preservation, atomic rollback, unchanged schema,
v1 SQLite reads of stored order modes and ranks, web HTML reconciliation and validation, and MCP
`update_watchlists` / `get_watchlist` / `reorder_watchlist_items` contracts (invalid modes,
independent batches, `orderToken` and `nextUnwatched` updates, and `not_custom_mode` rejection).
Real-HTMX DOM coverage verifies `#watchlist-refresh` OOB dialog updates and focus restoration, and
local live v1/v2 Chromium verification exercises full round trips across both surfaces sharing one
disposable database. Deployed, Access-authenticated client, physical-device and owner acceptance
remain independent gates.
