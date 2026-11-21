# Browse and search watchlists

Browsing watchlists lets a user see all watchlists with progress and next-up metadata on v1 and v2, filter watchlists by name on v2 with live URL-synced search, clear an active query, and open a watchlist detail page.

## Sub-features

- `browse-v1-home` renders the seeded watchlists and totals on `/watchlists`.
- `browse-v2-home` renders the seeded watchlists, totals, and cards on `/v2/watchlists`.
- `browse-v2-search` filters v2 cards via HTMX search and updates the URL query parameter.
- `browse-v2-empty` shows the empty search state and clear link when no watchlist matches.
- `browse-v2-clear` clears the search query and restores the full seeded grid.
- `browse-open-detail` opens a watchlist detail view by choosing a card.

## How to get to it (user POV)

- Choose `My Lists` in the bottom navigation bar (`Primary navigation`) on v1 or v2.
- Visit `/watchlists` (v1) or `/v2/watchlists` (v2) directly.
- Choose `Search` in the v2 bottom navigation bar to jump to `#watchlist-search` on `/v2/watchlists`.
- Call `GET /v2/watchlists` with `Accept: application/json` for the content-negotiated JSON summary.

## Driving it with verify-janus

Preconditions:

- Run `.agents/skills/verify/scripts/verify-janus launch --run-id browse` and `.agents/skills/verify/scripts/verify-janus doctor --run-id browse` with exit code `0`.
- The disposable database contains the four seeded watchlists (`Marvel Cinematic Universe`, `Star Wars`, `Anime & Manga`, `Reading List`).

- **Browse v1 home.** Open `/watchlists` on v1 and verify all four seeded watchlists and the `My Lists` heading appear. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus drive --run-id browse --target v1 --viewport 1280x800 --feature watchlists-browse-and-search --evidence-name v1-home <<'EOF'
  [
    { "op": "goto", "path": "/watchlists" },
    { "op": "expectText", "target": "role=heading,name=My Lists", "text": "My Lists" },
    { "op": "expectText", "text": "Marvel Cinematic Universe" },
    { "op": "expectText", "text": "Star Wars" },
    { "op": "expectText", "text": "Anime & Manga" },
    { "op": "expectText", "text": "Reading List" },
    { "op": "aria", "file": "v1-home.aria.txt" },
    { "op": "screenshot", "file": "v1-home.png" }
  ]
  EOF
  ```
  The transcript reports `ok: true` and `v1-home.png` / `v1-home.aria.txt` show `My Lists`, `4 watchlists, 27 items`, and all four cards.
- **Search, empty state, clear, and open detail on v2.** Open `/v2/watchlists`, search for `star`, test an unmatched query `volcano`, clear the search, and open `Star Wars`. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus drive --run-id browse --target v2 --viewport 1280x800 --feature watchlists-browse-and-search --evidence-name v2-search <<'EOF'
  [
    { "op": "goto", "path": "/v2/watchlists" },
    { "op": "expectText", "target": "role=heading,name=My Lists", "text": "My Lists" },
    { "op": "aria", "file": "v2-home-before.aria.txt" },
    { "op": "screenshot", "file": "v2-home-before.png" },
    { "op": "fill", "target": "role=searchbox,name=Search watchlists", "value": "star" },
    { "op": "expectUrl", "contains": "query=star" },
    { "op": "expectText", "target": "css=#watchlist-browse", "text": "Star Wars" },
    { "op": "expectNoText", "target": "css=#watchlist-browse", "text": "Reading List" },
    { "op": "aria", "file": "v2-search-star.aria.txt" },
    { "op": "screenshot", "file": "v2-search-star.png" },
    { "op": "fill", "target": "role=searchbox,name=Search watchlists", "value": "volcano" },
    { "op": "expectText", "target": "css=#watchlist-browse", "text": "Clear search" },
    { "op": "screenshot", "file": "v2-search-empty.png" },
    { "op": "click", "target": "role=link,name=Clear search" },
    { "op": "expectText", "target": "css=#watchlist-browse", "text": "Reading List" },
    { "op": "click", "target": "role=link,name=Star Wars" },
    { "op": "expectUrl", "contains": "/v2/watchlists/2" },
    { "op": "expectText", "target": "role=heading,name=Star Wars", "text": "Star Wars" },
    { "op": "aria", "file": "v2-detail-star-wars.aria.txt" },
    { "op": "screenshot", "file": "v2-detail-star-wars.png" }
  ]
  EOF
  ```
  Search swaps `#watchlist-browse` in place, updates the URL, shows an empty state for `volcano`, restores all four watchlists on `Clear search`, and navigates to `/v2/watchlists/2`.
- **Verify JSON content negotiation.** Request `/v2/watchlists?query=star` as JSON. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus http --run-id browse --target v2 --header "Accept: application/json" --save watchlists-browse-and-search/v2-search.json "/v2/watchlists?query=star"
  ```
  HTTP status is `200` and the JSON response lists `Star Wars` without `Reading List`.
- **Confirm stored baseline in SQLite.** Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus db --run-id browse --save watchlists-browse-and-search/db-watchlists.json "SELECT id, name, item_order_mode FROM watchlists ORDER BY id"
  ```
  Returns four rows matching the seeded watchlists.

## Gotchas

- v1 `/watchlists` does not have a watchlist-name search box; home search is a v2 feature. Do not fail v1 for lacking `#watchlist-search`.
- v2 search debounces input by `300ms` (`hx-trigger="submit, input changed delay:300ms from:#query"`). Always wait with `expectUrl` or `expectText` instead of assuming immediate swap.
- Each v2 card has two links pointing to `/v2/watchlists/{id}` (`.card-cover` with `aria-label="{{card.name}}"` and `.card-info` containing the `<h3>`). `role=link,name=Star Wars` selects the first visible link cleanly.
- On mobile (`390x844`), `Create New List` tile is hidden and replaced by the floating `Create watchlist` button; both surfaces switch from 4 desktop columns to 2 mobile columns.
