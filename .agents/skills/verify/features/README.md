# Janus verification map

This directory is the maintained source for verifying user-facing behavior in Janus across v1 (TanStack Start) and v2 (Rust/HTMX). Read this index before driving the app, then follow the matching feature file.

## Baseline preconditions

- Launch an isolated stack with `.agents/skills/verify/scripts/verify-janus launch --run-id <run-id>`.
- Confirm a healthy run with `.agents/skills/verify/scripts/verify-janus doctor --run-id <run-id>` before driving any feature.
- Baseline runs use a disposable SQLite database at `/tmp/janus-verify-<run-id>/janus.sqlite` seeded by `src/db/Seed.ts` with four watchlists:
  - `Marvel Cinematic Universe` (id `1`, `release`, 9 movies, 6 watched / 3 unwatched)
  - `Star Wars` (id `2`, `release`, 7 movies, 3 watched / 4 unwatched)
  - `Anime & Manga` (id `3`, `release`, 7 items, 1 watched / 6 unwatched)
  - `Reading List` (id `4`, `custom`, 4 books, `custom_rank` `1..4`, 1 watched / 3 unwatched)
- Never drive a developer's pre-existing server on port `3000` or `3001` that was not started by this run.
- Always target v2 via `--target v2` (its direct `v2Url`), never through v1's `/v2` devProxy.

## Driving conventions

- Start every recipe from a clean baseline run unless its preconditions say otherwise.
- Prefer ARIA roles and accessible names (`role=button,name=...`) or form labels (`label=...`) over CSS selectors or DOM positions.
- Treat every command and step payload as literal; keep quoted names and flags unchanged.
- Use `.agents/skills/verify/scripts/verify-janus drive` for browser journeys, `http` for JSON/MCP checks, and `db` for read-only SQLite side-effect verification.
- Run `.agents/skills/verify/scripts/verify-janus cleanup --run-id <run-id>` after every run, including failed runs. Cleanup removes the disposable DB and server processes while preserving `/tmp/janus-verify-evidence/<run-id>/`.

## Proof and skip reporting

- Capture both the user action and the resulting state (`transcript.json` + `.aria.txt` + `.png`).
- Mutation proofs must confirm persistence after a reload (or from the sibling v1/v2 surface) and verify stored rows with `verify-janus db`.
- Record the feature ID, target (`v1` or `v2`), viewport, and entry point used with every artifact.
- Report any unreachable entry point with the attempted command and the exact unmet precondition (for example, missing `TMDB_API_KEY` for `/search`).
- Do not claim an untested entry point is verified because another entry point passed.

## Feature entry contract

Each feature file starts with an H1 title and one paragraph describing the user-visible behavior. It then uses exactly four H2 sections in this order:

1. `Sub-features` lists short IDs with one line for each behavior.
2. `How to get to it (user POV)` lists every user entry point.
3. `Driving it with verify-janus` starts with `Preconditions:` and uses labeled bullets pairing each user action with an exact command and observable result.
4. `Gotchas` lists traps that can waste or invalidate a verification run.

Keep implementation details out of the map. Name only user paths, stable handles, required state, commands, and observable proof.

## Features

- [Browse and search watchlists](./watchlists-browse-and-search.md) covers v1 and v2 home grids, totals, v2 HTMX Unicode search, clear search, and navigation to a detail page.
- [Create and edit a watchlist](./create-and-edit-watchlist.md) covers desktop tile, mobile floating button, v2 native dialog, validation/cancel, edit metadata/order mode, and cross-surface persistence.
- [Watchlist timeline and progress](./watchlist-timeline-and-progress.md) covers v1 and v2 detail timelines, title search, watched-run disclosures, unwatched filters, and v1 watched-state toggling with DB and v2 verification.
- [Custom-order item reordering](./custom-order-reorder.md) covers custom-order keyboard reordering on v2 with HTMX updates, live status announcements, reload persistence, and SQLite rank verification.
- [Watch Now and custom lineups](./watch-now-and-lineups.md) covers the v1 Watch Now landing screen, navigating to Manage Lineups, creating a custom lineup, and confirming it renders on Watch Now and persists in SQLite.
