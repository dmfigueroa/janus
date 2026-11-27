# V1 to V2 UI map

Navigation aid for visual parity work. It points from a v1 UI area to the v1 components
that define it and the v2 templates, styles and presentation code that mirror it. It is not
a design spec and does not restate `README.md` or `PARITY.md`.

## Read order

1. [`README.md`](README.md) first for `pnpm run preview:local`, the screenshot commands and the
   parity layout rule.
2. This map second to find the v1 reference and v2 target for one area.
3. [`PARITY.md`](PARITY.md) before making a parity claim, to check the v1 baseline revision and
   outstanding acceptance, and to record the evidence afterwards.

V1 is the reference implementation. Typography, colors and design tokens live in
`src/app/Theme.ts`; v1 components use Chakra props rather than a stylesheet, so the geometry
must be read from the component source and then measured in the browser.

## Shared shell and bottom navigation

| What                            | V1 reference                                                | V2 target                                                                                                           |
| ------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Document shell, page bodies     | `src/routes/__root.tsx`                                     | `v2/templates/layout.html`                                                                                          |
| Bottom navigation and its items | `src/components/BottomNav.tsx`                              | `v2/templates/bottom-nav.html`, `v2/static/app.css` `.bottom-nav`, `.nav-item`                                      |
| Toast/notification surfaces     | `src/app/Toaster.tsx`, `src/components/PwaUpdatePrompt.tsx` | `v2/templates/layout.html` `#notification`, `#request-error`, `v2/static/app.css` `.notification`, `.request-error` |

The v2 shell is server-rendered: templates own markup, `v2/static/app.js` owns request and
notification behavior, and class names in `v2/static/app.css` are the styling layer.

## Watchlist home grid and cards

| What                                        | V1 reference                                                                                                           | V2 target                                                                                                                                                                     |
| ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Home route and page frame                   | `src/routes/watchlists.index.tsx`, `src/features/watchlists/home/HomeHeader.tsx`                                       | `v2/templates/watchlists.html`, `.home`, `.home-header`, `.home-title`, `.home-totals`                                                                                        |
| Home data shape, section order and totals   | `src/features/watchlists/home/WatchlistHome.ts`, `src/features/watchlists/home/AllWatchlistsSection.tsx`               | `v2/src/features/watchlists/browse.rs`, `v2/templates/watchlist-browse.html`                                                                                                  |
| Grid columns and card sizing                | `src/features/watchlists/home/WatchlistGrid.tsx`                                                                       | `v2/static/app.css` `.watchlist-grid`, `.watchlist-card`                                                                                                                      |
| Collapsible completed/empty/paused sections | `src/features/watchlists/home/WatchlistCollapsibleSection.tsx`                                                         | `v2/templates/watchlist-browse.html` `<details class="watchlist-section">`, `.chevron`                                                                                        |
| Card layout, cover, title and metadata      | `src/features/watchlists/components/WatchlistCard.tsx`, `WatchlistCardArtwork.tsx`, `WatchlistCardInfo.tsx`            | `v2/templates/watchlist-card.html`, `v2/static/app.css` `.card-cover`, `.cover-*`, `.card-info`, `.card-title`, `.card-meta`, `.card-progress*`, `.card-next`, `.card-paused` |
| Card menus and rotation actions             | `src/features/watchlists/components/WatchlistCardMenu.tsx`, `src/features/watchlists/rotation/CardRotationActions.tsx` | Not ported; v2 has no card menus yet. Do not style absent controls as parity.                                                                                                 |
| Create tile and floating button             | `src/features/watchlists/home/CreateWatchlistTile.tsx`, `CreateWatchlistFloatingButton.tsx`                            | `v2/templates/watchlist-create-tile.html`, `.create-watchlist-floating`, `v2/static/app.css` `.create-tile`                                                                   |
| Create/edit watchlist dialog and form       | `src/features/watchlists/components/WatchlistFormDialog.tsx`, `useWatchlistForm.ts`                                    | `v2/templates/watchlist-dialog.html`, `v2/templates/watchlist-form.html`, `v2/static/watchlist-dialog.js`, `v2/src/features/watchlists/dialog.rs`                             |
| Search field and pagination                 | v2 additions, no v1 home equivalent                                                                                    | `v2/templates/watchlists.html` `.watchlist-search`, `watchlist-browse.html` `.pagination`, `v2/static/browse.js`, `v2/static/app.css` `.watchlist-search`, `.pagination`      |

Card preference and progress labels come from `v2/src/features/watchlists/summary.rs`; the v1
counterparts are `src/features/watchlists/list/WatchlistSummaryBuilder.server.ts` and
`src/features/watchlists/NextItemLabel.ts`.

## Watchlist detail header and timeline

| What                                             | V1 reference                                                                                                                                              | V2 target                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detail route and screen frame                    | `src/routes/watchlists/$watchlistId.tsx`, `src/features/watchlists/detail/WatchlistDetailScreen.tsx`                                                      | `v2/templates/watchlist.html`, `.watchlist`, `v2/static/app.css` `/* Watchlist detail */`                                                                                                                                                                                                                                     |
| Header, title, description, progress and actions | `src/features/watchlists/components/WatchlistHeader.tsx`, `WatchlistTitle.tsx`, `WatchlistActions.tsx`, `ExpandableWatchlistDescription.tsx`              | `v2/templates/watchlist.html` `.watchlist-header`, `.watchlist-title`, `.watchlist-progress*`, `.progress-track`, `.progress-fill`, `.badge`, `.watchlist-edit`                                                                                                                                                               |
| Filter and search toolbar                        | `src/features/watchlists/components/WatchlistHeader.tsx` filter controls                                                                                  | `v2/templates/watchlist.html` `.watchlist-toolbar`, `.item-search`, `v2/static/app.css` `.watchlist-toolbar`                                                                                                                                                                                                                  |
| Timeline rows, posters and metadata              | `src/features/watchlists/components/WatchlistTimeline.tsx`, `TimelineItem.tsx`, `TimelineItemPresentation.tsx`, `TimelineRowShell.tsx`, `ItemPreview.tsx` | `v2/templates/timeline.html`, `v2/templates/timeline-items.html` `article`, `.item-content`, `.poster`; `v2/static/app.css` `.watchlist article`, `.item-content`, `.poster`, `.placeholder`                                                                                                                                  |
| Year headings                                    | `src/features/watchlists/components/TimelineYearHeading.tsx`                                                                                              | `v2/templates/timeline-items.html` `<h2>`; `v2/static/app.css` `.watchlist h2`                                                                                                                                                                                                                                                |
| Collapsed watched runs                           | `src/features/watchlists/components/WatchedRunDisclosure.tsx`                                                                                             | `v2/templates/timeline-items.html` `<details class="watched-run">`, `.watchlist summary`                                                                                                                                                                                                                                      |
| Reorder handles and drag state                   | `src/features/watchlists/components/ReorderableTimelineRow.tsx`, `DragOverlayTimelineRow.tsx`                                                             | `v2/templates/timeline.html` `<watchlist-reorder>`, `v2/templates/timeline-items.html` `.reorder-handle`; `v2/static/app.css` `.reorder-handle`, `.sortable-ghost`                                                                                                                                                            |
| Row action menu and item edit dialog             | `src/features/watchlists/components/TimelineItemActionMenu.tsx`, `EditWatchlistItemDialog.tsx`, `EditWatchlistItemForm.tsx`, `ReleaseDateField.tsx`       | `v2/templates/timeline-items.html` `.item-actions*`, `v2/templates/item-edit-dialog.html`, `v2/templates/item-edit-form.html`, `v2/src/features/watchlists/item_dialog.rs`, `v2/static/item-edit-dialog.js`, `v2/static/item-edit-fields.js`, `v2/static/app.css` `.item-actions*`, `.date-field-control`, `.poster-preview*` |
| Ordering, grouping and filters                   | `src/features/watchlists/components/WatchlistTimeline.model.ts`, `src/features/watchlists/detail/Reorder.ts`                                              | `v2/src/features/watchlists/timeline.rs`, `v2/src/features/watchlists/item_order.rs`, `v2/static/watchlist-reorder.js`, `v2/static/watchlist-reorder-groups.js`                                                                                                                                                               |

Unported detail controls such as watched toggles, remove/move menu items, and watch-later actions stay in
`src/features/watchlists/components/`; their absence in v2 is an outstanding workflow gap,
not a styling difference.

## Media search and addition

| What                              | V1 reference                                                                                                          | V2 target                                                                                                                                                    |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Search route and discovery chrome | `src/features/search/SearchDiscoveryScreen.tsx`, `src/features/search/SearchInput.tsx`                                | `v2/templates/search.html`, `v2/templates/search-screen.html`, `v2/static/app.css` `.search-page`, `.search-form`, `.search-field`, `.search-tabs`           |
| Result grid and continuation      | `src/features/search/SearchResults.tsx`, `src/features/search/SearchMediaCard.tsx`, `useSearchResults.ts`             | `v2/templates/search-results.html`, `v2/static/app.css` `.search-grid`, `.search-hit`, `#search-more`; HTMX `revealed` append (no Previous/Next pager)       |
| Hit detail sheet and add controls | `src/features/search/SearchMediaDetailSheet.tsx`, `SearchMediaWatchlistControls.tsx`, `SearchMediaAdditionNotice.tsx` | `v2/templates/search-detail.html`, `v2/templates/search-add-alert.html`, `v2/static/search-dialog.js`, `v2/static/app.css` `#search-dialog`, `.search-sheet` |
| Destination watchlist picker      | `src/features/search/SearchWatchlistSelector.tsx`, `SearchWatchlistCombobox.tsx`                                      | `v2/templates/search-detail.html` combobox markup, `v2/static/search-watchlist-combobox.js`, `v2/static/app.css` `.watchlist-combobox*`                      |

Do not invent search controls without a row above (or an explicit user request). Pagination must accumulate like v1 infinite scroll; destination picking must stay searchable.

## Finding more

Search a v1 component name inside `v2/templates/` for markup equivalents, and inside
`v2/static/app.css` for selectors. `v2/src/features/watchlists/timeline.rs` and `browse.rs`
own the values passed into templates when a label or grouping looks wrong.
