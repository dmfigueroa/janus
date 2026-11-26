# V2 parity baseline

For visual work, [V1-UI-MAP.md](V1-UI-MAP.md) maps each parity-relevant v1 UI area to its v2 template and stylesheet counterpart. Use [README.md](README.md) for commands and test suites, [`../deploy/README.md`](../deploy/README.md) for container coexistence and routing, and this ledger for baseline revision, parity checklists, and outstanding acceptance.

## V1 parity baseline

- **Source baseline:** `456a15aa6c6c90b970d16e1661d027ee20986238` (2026-11-16, latest commit touching `src/`, `public/`, or `drizzle/`).
- **Previous baseline:** `669a385b8efa855adfad93f73b734cc5c9a4e709` (2026-11-11).
- **Schema contract:** zero changes to `drizzle/` or `public/` between `669a385` and `456a15a`. V2 validates existing databases against `v2/src/database/v1-schema.json`.

### Reconciled v1 deltas (`669a385` → `456a15a`)

- `#286` (`69262d3`), `#288` (`74ae825`), `#290` (`5d4b244`), `#291` (`4195573`), `#300` (`ac193d3`), `#302` (`867e18d`), `#310` (`2c51ba9`): internal v1 refactors (lifecycle/cache sharing, lineup configuration transactions, optimistic detail cache, item/title discovery modules, Ky provider client, date-fns release-date parsing, reorder hook consolidation). No schema or external contract change.
- `#287` (`161dcac`): discriminated `MediaSearch` outcomes shared across search route and MCP `search_media`; preserve when porting provider search.
- `#289` (`8008b5a`): custom additions now reject anchored insertion on release-ordered watchlists (matching provider additions); preserve when porting custom additions.
- `#304` (`7908ca2`): v1 timeline virtualization (no v2 impact) plus custom reorder ordering against displayed order and full list renumbering (already matched by v2 `#254`).
- `#309` (`44db26d`): structured provider and MCP observability logging in v1.
- `#311` (`456a15a`): opt-in `SEED_ON_STARTUP=true` preview seeding (`src/db/Seed.ts`); v2 compatibility unaffected.

For each later v1 commit, inspect `git diff <baseline>..<new revision> -- src public drizzle`, append the revision and behavioral delta here, update affected checklist rows, and re-verify before advancing the baseline. Schema deltas require compatibility reconciliation and regeneration of `v2/src/database/v1-schema.json`.

## Setup evidence

- [x] Independent Rust crate, rendered smoke page, local assets, and mounted MCP.
- [x] Local fail-closed database compatibility and readiness.
- [x] Deployed v1/v2 revision reconciliation and shared-volume inspection (`#253`, 2026-11-11).
- [ ] Complete Cloudflare Access-authenticated routing/client verification.

## Workflow checklist

- [x] Watchlist listing and name search through web/MCP reads (`#253`, `#256`, `#307`).
- [x] Watchlist create and edit (`#257`, `#318`); delete and merge remain outstanding.
- [x] Existing detail reads, text filters, stored release/custom order, and release-year/watched grouping (`#253`).
- [x] Hidden-item-safe custom reorder with contiguous full renumbering (`#254`, `#364`).
- [x] Order-mode changes (`#365`, `#369`, `#375`): switching `release` → `custom` initializes contiguous custom ranks in v1 release order (`release_date` empty/null last, `release_date ASC`, `id ASC`) atomically in both v1 and v2 when no saved ranks exist (and opportunistically repairs legacy all-NULL custom watchlists when saved in `custom` mode); switching back preserves ranks while release ordering resumes; detail `#watchlist-refresh` reconciles `#watchlist-form` out-of-band (`hx-select-oob="#watchlist-form"`).
- [ ] Provider search/details/pagination and additions; TV/comic expansions.
  - [x] TMDB movie and TV search, detail, pagination, and episode expansion (`#269`). ComicVine expansion remains outstanding.
- [ ] Custom additions, anchored insertion, duplicates, and partial outcomes (including `#289` release-mode anchor rejection).
  - [x] TMDB additions cover duplicates, `no_new_items`, destination failures, and a failed season that does not insert (`#269`). Custom-item creation remains outstanding. The search sheet offers beginning and end on custom lists; MCP still accepts `before` and `after`.
- [ ] Edited metadata, item/parent removal, and movement.
  - [x] Watchlist item metadata editing (`#260`): shared domain primitives (`ItemTitle`, `ReleaseDate`, `PosterPath`, `FieldPatch`, `WatchlistItemChanges`) and atomic `UPDATE watchlist_items ... WHERE id = ? AND watchlist_id = ? RETURNING id` write serving both content-negotiated web endpoints (`GET /v2/watchlists/{id}/items/{item_id}/edit`, `POST /v2/watchlists/{id}/items/{item_id}`) and MCP `edit_watchlist_items`; v1-matching row action trigger (`More actions for <title>` → `Edit`, `44x44` on both v1 and v2), native modal `<dialog id="item-edit-dialog">` with live `no-referrer` poster preview, `YYYY`/`YYYY-MM-DD` date entry and clear, `aria-busy` locking, draft retention on failure, detail reconciliation via `HX-Trigger`, and focus restoration (with `#query` fallback when filtered out). Measured against live v1 and v2 on `/watchlists/1` (`/v2/watchlists/1`) at `390x844` (v1 dialog `358x498`, v2 dialog `356x442`) and `1280x800` (v1 dialog `512x422`, v2 dialog `384x442`), screenshots in `/tmp/janus-issue260-evidence/`. Item/parent removal (`#265`) and movement (`#266`) remain outstanding.
- [ ] Watch, quiet watch, unwatch, idempotence, and rotation recency.
- [ ] Watch Now, skip, pause, derived completion, and empty watchlists.
- [ ] Automatic/custom lineups, membership, enablement, and ordering.
- [ ] Navigation, theme, dialogs, notifications, and confirmations.
- [ ] Focus/scroll/filter preservation; keyboard, touch, and failed-save recovery.
- [ ] Clipboard, installation, service-worker updates, and caching.
- [ ] Provider mappings/configuration errors/unavailable categories, deterministic fixtures.
- [ ] Shared v1-created SQLite round trips, schema preservation, locks, and rollback.
- [ ] MCP schemas/envelopes/defaults/annotations/pagination/batch isolation.
- [ ] MCP initialization, sessions, termination, and expiry.
- [ ] Local browser checks, deployed Access checks, real-client, and real-device acceptance.
- [ ] Resource measurements and owner acceptance before v1 retirement.

## MCP source inventory

10 of 27 tools are implemented in v2 (`v2/src/features/watchlists/mcp/`); the remaining 17 are unported and tracked in the machine-enforced manifest [`contracts/mcp-watchlists.json`](../contracts/mcp-watchlists.json) (gated by `test/integrations/McpCompliance.test.ts`, `v2/tests/mcp_compliance.rs`, and `pnpm run test:parity`). Reference contracts live in `src/app/mcp/`.

- [ ] `add_custom_items_to_watchlists`
- [x] `add_media_to_watchlists`
- [ ] `create_lineups`
- [x] `create_watchlists`
- [ ] `delete_lineups`
- [ ] `delete_watchlists`
- [x] `edit_watchlist_items`
- [x] `find_watchlist_items`
- [ ] `get_lineup`
- [x] `get_watchlist`
- [ ] `list_lineups`
- [x] `list_watchlists`
- [ ] `merge_watchlists`
- [ ] `move_watchlist_items`
- [ ] `move_watchlist_parents`
- [ ] `remove_watchlist_items`
- [ ] `remove_watchlist_parents`
- [ ] `reorder_lineups`
- [x] `reorder_watchlist_items`
- [x] `search_media`
- [x] `search_watchlists`
- [ ] `set_lineup_watchlists`
- [ ] `set_watchlist_items_watched`
- [ ] `set_watchlist_order`
- [ ] `skip_watchlists`
- [ ] `update_lineups`
- [x] `update_watchlists`

## Provider inventory at the baseline

Sources: `src/features/search/search/MediaSearch.server.ts`, `src/server/providers/*`, `src/server/Media.ts`, and `src/features/watchlists/add/*`. Game, book, and comic search return `provider_unavailable` without HTTP. Additions for those providers return `provider_not_configured` when the key is empty and `provider_unavailable` when a key is present, still without calling the provider. Anime and manga stay unsupported. No live provider was called.

- [x] TMDB movies and TV (`#269`): fixture-backed search paging, hit detail sheet, TV-to-episode expansion, poster paths, missing-key and malformed-body failures, duplicates, `no_new_items`, and partial season failures. Web `/v2/search` and MCP `search_media` / `add_media_to_watchlists`. Live TMDB was not called. Layout was not measured against v1 at `390x844` or `1280x800`, so visual parity is not claimed. Creating a custom item from search remains outstanding.
- [ ] RAWG games: configured-key failures, search paging, details, and additions.
- [ ] Google Books: identifiers/ISBNs, authors, optional metadata, search paging, and additions.
- [ ] ComicVine: configured-key failures, volumes/issues, paging, and volume expansion.
- [ ] AniList anime/manga: preserve deliberate unavailable-category outcomes; do not enable the dormant provider adapter simply because its implementation exists.

## PWA inventory at the baseline

Sources: `vite.config.ts`, `src/lib/PwaRegistration.ts`, `src/components/PwaUpdatePrompt.tsx`. No v2 PWA port or PWA acceptance is claimed yet.

- [ ] Manifest: Janus name/icons, standalone display, root start URL, pink theme/dark background.
- [ ] Credential-aware service-worker registration, prompt-based updates, and startup update checks.
- [ ] Existing waiting-worker detection, persistent Update toast, reload after activation, and visible/reportable registration/update failures.
- [ ] Existing cache behavior and absent navigation fallback; no new offline-write semantics.
- [ ] Install and update behavior on actual devices, independently of emulated viewport checks.

## Current verification & coverage summary

- **Rust & disposable-SQLite integration (`pnpm run test:v2`):** validates fail-closed startup, schema/byte/WAL preservation, bounded locks, reads after v1 writes, v1 reads after v2 writes, Unicode name matching, bound cursors, order-token SHA-256 parity, create/update defaults & timestamps (including Drizzle-matching `updated_at` on create), release↔custom order-mode transitions (tie-breaks, mixed ranked/unranked preservation, atomic rollback, `orderToken`/`nextUnwatched` updates, and `not_custom_mode` rejection), gapped/duplicate/null-rank full renumbering (including opportunistic repair on no-op reorders), mid-write rollback, item metadata tri-state merge patch/boundary parsing/atomic writes/content negotiation (`HX-Trigger`, `303` PRG, `Vary: HX-Request, Accept`)/v1↔v2 round trips, and shared MCP contract compliance + SQLite `checkRep` + pending 17-tool gating (`v2/tests/mcp_compliance.rs`). TMDB movie and TV search and additions are covered by fixture transports in `v2/tests/media_search.rs`, `v2/tests/media_add.rs`, `v2/tests/media_tv.rs`, and `v2/tests/search_web.rs`.
- **Differential & shared-DB stateful MCP gate (`pnpm run test:parity`, `.github/workflows/v2.yml`):** executes [`contracts/mcp-watchlists.json`](../contracts/mcp-watchlists.json) against live v1 and v2 MCP endpoints over identical migrated SQLite fixtures, diffing `tools/list` declarations (metadata + schemas), canonicalized `tools/call` responses (exact `orderToken`, structural cursor payloads, validated timestamps, coercion and error envelopes), SQLite `checkRep` invariants and canonicalized post-state diffs after every mutating case, plus interleaved `v1 → v2 → v1 → v2` sequences against a single shared SQLite database.
- **DOM & headless browser suites (`.github/workflows/v2.yml`):**
  - `pnpm run test:v2:dom`: jsdom HTMX swaps, `#watchlist-refresh` OOB edit-dialog reconciliation, optimistic keyboard reorder, drop anchors, swap suppression and row action trigger disabling during drags/saves, failed-save reconciliation, item action menu and `#item-edit-dialog` modal/live `no-referrer` poster preview/date clear/`aria-busy`/draft preservation/focus restoration (including filtered-out fallback), and filter/scroll/focus restoration.
  - `v2/tests/watchlist-form-browser.cjs` & `dialog-layout-browser.cjs`: dialog opening/cancel focus restoration, validation, pending/error states, and Chromium/WebKit viewport containment.
  - `v2/tests/browse-browser.cjs`, `layout-browser.cjs` (against `v2/tests/v1-layout-baseline.json` at `390x844` and `1280x800`), `watchlists-home-browser.cjs` (`320x568`, `390x844`, `768x1024`, `1280x800`), and `reorder-lifecycle-browser.cjs` (`<watchlist-reorder>` upgrade, inner-fragment swap, stale-listener cleanup).
- **Explicit non-v1 additions:** the watchlist search bar on `/v2/watchlists` is a v2 addition (no v1 home equivalent) and is not claimed as v1 parity.
- **Outstanding acceptance gates (not yet claimed):** deployed write verification, Cloudflare Access-authenticated external web/MCP client checks, real-browser pointer/touch drag parity, physical iOS/Android device checks, full PWA verification, resource measurements, and final owner acceptance.
