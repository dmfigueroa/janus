# Custom-order item reordering

Custom-order reordering lets a user move items up or down in a custom-ordered watchlist using drag handles or `Alt+ArrowDown`/`Alt+ArrowUp` keyboard shortcuts, announces the completed move, and persists contiguous `custom_rank` values in SQLite.

## Sub-features

- `reorder-handles-custom-only` renders `.reorder-handle` buttons on custom-order watchlists (`Reading List`, id `4`) and omits them on release-order watchlists (`Marvel Cinematic Universe`, id `1`).
- `reorder-keyboard-move` moves an item via `Alt+ArrowDown` or `Alt+ArrowUp` on its handle and swaps the updated timeline via HTMX.
- `reorder-persist` keeps the new item order after a full page reload and writes contiguous `custom_rank` values to SQLite.

## How to get to it (user POV)

- Open `/v2/watchlists` and choose `Reading List`, or visit `/v2/watchlists/4` directly.
- Focus an item's reorder handle (`Move <title>. Use Alt and arrow keys to reorder`) and press `Alt+ArrowDown` or `Alt+ArrowUp` (or drag the handle with a pointer).
- On v1, open `/watchlists/4` and drag or keyboard-reorder rows via the sortable handle.

## Driving it with verify-janus

Preconditions:

- Run `.agents/skills/verify/scripts/verify-janus launch --run-id reorder` and `.agents/skills/verify/scripts/verify-janus doctor --run-id reorder` with exit code `0`.
- `Reading List` (id `4`) is seeded in `custom` order:
  1. `The Name of the Wind` (`custom_rank` `1`, unwatched)
  2. `The Way of Kings` (`custom_rank` `2`, unwatched)
  3. `Dune` (`custom_rank` `3`, watched)
  4. `Project Hail Mary` (`custom_rank` `4`, unwatched)

- **Inspect initial order in SQLite.** Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus db --run-id reorder --save custom-order-reorder/db-before.json "SELECT id, title, custom_rank FROM watchlist_items WHERE watchlist_id = 4 ORDER BY custom_rank"
  ```
  Confirms `The Name of the Wind` has `custom_rank: 1` and `The Way of Kings` has `custom_rank: 2`.
- **Move `The Name of the Wind` down via keyboard on v2.** Open `/v2/watchlists/4?unwatched=false` (so all four items are visible), focus `The Name of the Wind`'s reorder handle, press `Alt+ArrowDown`, wait for the HTMX status announcement, and reload. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus drive --run-id reorder --target v2 --viewport 1280x800 --feature custom-order-reorder --evidence-name v2-reorder <<'EOF'
  [
    { "op": "goto", "path": "/v2/watchlists/4?unwatched=false" },
    { "op": "expectText", "target": "role=heading,name=Reading List", "text": "Reading List" },
    { "op": "aria", "file": "v2-before-reorder.aria.txt" },
    { "op": "screenshot", "file": "v2-before-reorder.png" },
    { "op": "press", "target": "role=button,name=Move The Name of the Wind. Use Alt and arrow keys to reorder", "key": "Alt+ArrowDown" },
    { "op": "expectText", "target": "css=#reorder-status", "text": "Moved" },
    { "op": "aria", "file": "v2-after-reorder.aria.txt" },
    { "op": "screenshot", "file": "v2-after-reorder.png" },
    { "op": "goto", "path": "/v2/watchlists/4?unwatched=false" },
    { "op": "aria", "file": "v2-after-reload.aria.txt" }
  ]
  EOF
  ```
  `#reorder-status` announces the move, `The Way of Kings` precedes `The Name of the Wind` in `v2-after-reorder.aria.txt`, and the order stays identical in `v2-after-reload.aria.txt`.
- **Verify contiguous ranks in SQLite.** Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus db --run-id reorder --save custom-order-reorder/db-after.json "SELECT id, title, custom_rank FROM watchlist_items WHERE watchlist_id = 4 ORDER BY custom_rank"
  ```
  Returns `The Way of Kings` at `custom_rank: 1`, `The Name of the Wind` at `custom_rank: 2`, `Dune` at `custom_rank: 3`, and `Project Hail Mary` at `custom_rank: 4`.

## Gotchas

- Release-order watchlists (`Marvel Cinematic Universe`, `Star Wars`, `Anime & Manga`) intentionally render `<div class="timeline">` with no `<watchlist-reorder>` element and no `.reorder-handle` buttons. Trying to reorder on id `1` fails by design.
- While a reorder request is in flight, `<watchlist-reorder>` sets `aria-busy="true"` and disables buttons until the HTMX swap completes. Wait on `#reorder-status` text before issuing a second move or reloading.
- Opening `/v2/watchlists/4` without `unwatched=false` collapses `Dune` (watched) inside a `<details class="watched-run">` disclosure; moving across collapsed runs behaves differently from moving within visible rows.
