# Watchlist timeline and progress

The watchlist detail timeline lets a user view items in release or custom order, filter titles by search text, toggle collapsed watched runs, and (on v1) mark items watched or unwatched with immediate progress updates persisted to SQLite.

## Sub-features

- `timeline-v1-view` displays progress (`6/9 Watched`, `67% Complete`) and unwatched items for `Marvel Cinematic Universe`.
- `timeline-watched-run` collapses consecutive watched items behind a disclosure (`6 watched items hidden` in v1, `6 watched items` `<summary>` in v2) that expands on click.
- `timeline-search-filter` narrows visible timeline items by title on both v1 and v2.
- `timeline-toggle-watched` marks an unwatched item watched on v1, updates progress (`7/9 Watched`), persists to SQLite, and reflects on v2.

## How to get to it (user POV)

- Open `/watchlists` (v1) or `/v2/watchlists` (v2) and choose a watchlist card such as `Marvel Cinematic Universe`.
- Visit `/watchlists/1` (v1) or `/v2/watchlists/1` (v2) directly.

## Driving it with verify-janus

Preconditions:

- Run `.agents/skills/verify/scripts/verify-janus launch --run-id timeline` and `.agents/skills/verify/scripts/verify-janus doctor --run-id timeline` with exit code `0`.
- `Marvel Cinematic Universe` (id `1`) starts with 6 watched films (`Iron Man` through `The Avengers`) and 3 unwatched films (`Black Panther`, `Avengers: Endgame`, `Captain America: Brave New World`).

- **Filter and toggle watched state on v1.** Open `/watchlists/1`, verify initial progress `6/9 Watched`, expand the watched run, search for `Black Panther`, and mark `Black Panther` watched. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus drive --run-id timeline --target v1 --viewport 1280x800 --feature watchlist-timeline-and-progress --evidence-name v1-timeline <<'EOF'
  [
    { "op": "goto", "path": "/watchlists/1" },
    { "op": "expectText", "target": "role=heading,name=Marvel Cinematic Universe", "text": "Marvel Cinematic Universe" },
    { "op": "expectText", "text": "6/9 Watched" },
    { "op": "aria", "file": "v1-before.aria.txt" },
    { "op": "screenshot", "file": "v1-before.png" },
    { "op": "click", "target": "role=button,name=6 watched items hidden" },
    { "op": "expectText", "text": "Iron Man" },
    { "op": "fill", "target": "role=searchbox,name=Search titles", "value": "Black Panther" },
    { "op": "expectText", "text": "Black Panther" },
    { "op": "expectNoText", "text": "Avengers: Endgame" },
    { "op": "click", "target": "role=button,name=Mark Black Panther watched" },
    { "op": "expectText", "text": "7/9 Watched" },
    { "op": "aria", "file": "v1-after-toggle.aria.txt" },
    { "op": "screenshot", "file": "v1-after-toggle.png" }
  ]
  EOF
  ```
  Progress updates from `6/9 Watched` to `7/9 Watched` (`78% Complete`) and the button flips to `Mark Black Panther unwatched`.
- **Confirm persistence on v2 and filter v2 timeline.** Open `/v2/watchlists/1`, verify `7/9 Watched`, switch `Watched items` to `Show all`, and apply filters. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus drive --run-id timeline --target v2 --viewport 1280x800 --feature watchlist-timeline-and-progress --evidence-name v2-timeline <<'EOF'
  [
    { "op": "goto", "path": "/v2/watchlists/1" },
    { "op": "expectText", "text": "7/9 Watched" },
    { "op": "select", "target": "label=Watched items", "value": "false" },
    { "op": "click", "target": "role=button,name=Apply filters" },
    { "op": "expectUrl", "contains": "unwatched=false" },
    { "op": "expectText", "text": "Black Panther" },
    { "op": "expectText", "text": "Iron Man" },
    { "op": "aria", "file": "v2-after-toggle.aria.txt" },
    { "op": "screenshot", "file": "v2-after-toggle.png" }
  ]
  EOF
  ```
  v2 shows `7/9 Watched` and renders `Iron Man` and `Black Panther` uncollapsed when `Show all` is applied.
- **Verify stored row in SQLite.** Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus db --run-id timeline --save watchlist-timeline-and-progress/db-item.json "SELECT id, title, is_watched FROM watchlist_items WHERE watchlist_id = 1 AND title = 'Black Panther'"
  ```
  Returns `is_watched: 1`.

## Gotchas

- v2 does not yet render watched-toggle buttons (marking items watched/unwatched is a v1 write workflow). Always test watched toggles on v1 and verify read reflection on v2.
- v2 detail filters submit via the `Apply filters` button (standard `GET` form), whereas v1 filters update client-side as you type or toggle `All` / `Unwatched`.
- v1 defaults to showing `All` items with consecutive watched runs collapsed (`6 watched items hidden`). Choosing `Unwatched` hides watched rows completely.
