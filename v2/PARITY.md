# V2 parity baseline

Source: b86d920c7faa347a3af04ffda13f163f461e0616 (2026-11-11).
Deployed revision: unverified; deployment/source reconciliation is an outstanding gate.
This source inventory must be amended when v1 changes. No product parity is claimed.

## Setup evidence

- [x] Independent Rust crate, rendered smoke page, local assets and mounted MCP.
- [ ] Database compatibility readiness (setup deliberately returns 503).
- [ ] Deployed revision reconciliation and protected routing.

## Workflow checklist

- [ ] Watchlist listing, search, create, edit, delete and merge.
- [ ] Details, filters, release/custom order, grouping, hidden-item-safe reorder.
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

Each tool remains unported. Contracts live in src/app/mcp at the source revision above.

- [ ] add_custom_items_to_watchlists
- [ ] add_media_to_watchlists
- [ ] create_lineups
- [ ] create_watchlists
- [ ] delete_lineups
- [ ] delete_watchlists
- [ ] edit_watchlist_items
- [ ] find_watchlist_items
- [ ] get_lineup
- [ ] get_watchlist
- [ ] list_lineups
- [ ] list_watchlists
- [ ] merge_watchlists
- [ ] move_watchlist_items
- [ ] move_watchlist_parents
- [ ] remove_watchlist_items
- [ ] remove_watchlist_parents
- [ ] reorder_lineups
- [ ] reorder_watchlist_items
- [ ] search_media
- [ ] search_watchlists
- [ ] set_lineup_watchlists
- [ ] set_watchlist_items_watched
- [ ] set_watchlist_order
- [ ] skip_watchlists
- [ ] update_lineups
- [ ] update_watchlists
