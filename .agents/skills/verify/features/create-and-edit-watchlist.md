# Create and edit a watchlist

Creating and editing a watchlist lets a user add a new list with a name, optional description, and ordering mode (`Release order` or `Custom order`), cancel an unfinished form, update an existing watchlist's metadata, and see the persisted change across both v1 and v2.

## Sub-features

- `create-v2-desktop` opens the native create dialog from the `Create New List` tile on `/v2/watchlists`, saves via HTMX, and refreshes the grid.
- `create-v2-mobile` opens the same create dialog from the floating `Create watchlist` button at `390x844`.
- `create-v1-desktop` opens the Chakra create dialog from `Create New List` on `/watchlists` and saves a new list.
- `create-cancel` closes the create dialog without inserting a watchlist row.
- `edit-v2` opens `Edit watchlist` from the v2 detail header `Edit` button, updates metadata and order mode, and refreshes the detail header in place.
- `edit-v1` opens `Edit watchlist` from `Watchlist actions` -> `Edit watchlist` on a v1 detail page and saves changes.

## How to get to it (user POV)

- Desktop (`1280x800`): choose the `Create New List` tile on `/watchlists` (v1) or `/v2/watchlists` (v2).
- Mobile (`390x844`): choose the floating `Create watchlist` button on `/watchlists` (v1) or `/v2/watchlists` (v2).
- Edit on v2: open `/v2/watchlists/{id}` and choose the `Edit watchlist` button (`Edit`).
- Edit on v1: open `/watchlists/{id}`, choose `Watchlist actions`, then choose `Edit watchlist`.

## Driving it with verify-janus

Preconditions:

- Run `.agents/skills/verify/scripts/verify-janus launch --run-id crud` and `.agents/skills/verify/scripts/verify-janus doctor --run-id crud` with exit code `0`.
- No watchlist is named `Sci-Fi Classics` or `Discard Draft`.

- **Cancel a draft on v2.** Open the create dialog from `Create New List`, type `Discard Draft`, and choose `Cancel`. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus drive --run-id crud --target v2 --viewport 1280x800 --feature create-and-edit-watchlist --evidence-name v2-cancel <<'EOF'
  [
    { "op": "goto", "path": "/v2/watchlists" },
    { "op": "click", "target": "role=button,name=Create New List" },
    { "op": "wait", "target": "css=#watchlist-dialog", "state": "visible" },
    { "op": "fill", "target": "label=Name", "value": "Discard Draft" },
    { "op": "click", "target": "role=button,name=Cancel" },
    { "op": "wait", "target": "css=#watchlist-dialog", "state": "hidden" },
    { "op": "expectNoText", "target": "css=#watchlist-browse", "text": "Discard Draft" },
    { "op": "aria", "file": "v2-cancel.aria.txt" }
  ]
  EOF
  ```
  The dialog closes and `Discard Draft` does not appear in `#watchlist-browse`.
- **Create a custom-order watchlist on v2.** Open `Create New List`, fill `Name`, `Description`, select `Custom order`, submit `Create watchlist`, and reload. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus drive --run-id crud --target v2 --viewport 1280x800 --feature create-and-edit-watchlist --evidence-name v2-create <<'EOF'
  [
    { "op": "goto", "path": "/v2/watchlists" },
    { "op": "click", "target": "role=button,name=Create New List" },
    { "op": "wait", "target": "css=#watchlist-dialog", "state": "visible" },
    { "op": "fill", "target": "label=Name", "value": "Sci-Fi Classics" },
    { "op": "fill", "target": "label=Description", "value": "Curated science fiction films" },
    { "op": "click", "target": "role=radio,name=Custom order" },
    { "op": "screenshot", "file": "v2-create-dialog.png" },
    { "op": "click", "target": "role=button,name=Create watchlist" },
    { "op": "wait", "target": "css=#watchlist-dialog", "state": "hidden" },
    { "op": "expectText", "target": "css=#watchlist-browse", "text": "Sci-Fi Classics" },
    { "op": "goto", "path": "/v2/watchlists" },
    { "op": "expectText", "target": "css=#watchlist-browse", "text": "Sci-Fi Classics" },
    { "op": "aria", "file": "v2-after-create.aria.txt" },
    { "op": "screenshot", "file": "v2-after-create.png" }
  ]
  EOF
  ```
  The dialog closes, the grid refreshes via HTMX, and `Sci-Fi Classics` survives a full reload (in the collapsible `Empty` section or visible grid).
- **Edit the new watchlist on v2.** Open `/v2/watchlists/5`, choose `Edit watchlist`, rename to `Sci-Fi Essentials`, switch description, and save. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus drive --run-id crud --target v2 --viewport 1280x800 --feature create-and-edit-watchlist --evidence-name v2-edit <<'EOF'
  [
    { "op": "goto", "path": "/v2/watchlists/5" },
    { "op": "expectText", "target": "role=heading,name=Sci-Fi Classics", "text": "Sci-Fi Classics" },
    { "op": "click", "target": "role=button,name=Edit watchlist" },
    { "op": "wait", "target": "css=#watchlist-dialog", "state": "visible" },
    { "op": "fill", "target": "label=Name", "value": "Sci-Fi Essentials" },
    { "op": "fill", "target": "label=Description", "value": "Updated sci-fi list" },
    { "op": "click", "target": "role=button,name=Save changes" },
    { "op": "wait", "target": "css=#watchlist-dialog", "state": "hidden" },
    { "op": "expectText", "target": "role=heading,name=Sci-Fi Essentials", "text": "Sci-Fi Essentials" },
    { "op": "expectText", "text": "Updated sci-fi list" },
    { "op": "aria", "file": "v2-after-edit.aria.txt" },
    { "op": "screenshot", "file": "v2-after-edit.png" }
  ]
  EOF
  ```
  The detail header updates in place to `Sci-Fi Essentials` and `Updated sci-fi list`.
- **Cross-surface verification on v1 and SQLite.** Confirm the watchlist created and edited in v2 renders in v1 and matches the SQLite row. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus drive --run-id crud --target v1 --viewport 1280x800 --feature create-and-edit-watchlist --evidence-name v1-confirm <<'EOF'
  [
    { "op": "goto", "path": "/watchlists/5" },
    { "op": "expectText", "target": "role=heading,name=Sci-Fi Essentials", "text": "Sci-Fi Essentials" },
    { "op": "expectText", "text": "Updated sci-fi list" },
    { "op": "aria", "file": "v1-confirm.aria.txt" },
    { "op": "screenshot", "file": "v1-confirm.png" }
  ]
  EOF
  .agents/skills/verify/scripts/verify-janus db --run-id crud --save create-and-edit-watchlist/db-watchlists.json "SELECT id, name, description, item_order_mode FROM watchlists WHERE id = 5"
  ```
  v1 renders `Sci-Fi Essentials` with `Updated sci-fi list`, and SQLite returns `id: 5`, `name: "Sci-Fi Essentials"`, `description: "Updated sci-fi list"`, `item_order_mode: "custom"`, and zero rows for `Discard Draft`.

## Gotchas

- Newly created watchlists have 0 items, so on both v1 and v2 home screens they appear inside the collapsible `Empty` `<details>` section (`summary` text `Empty (1)`). The text still exists in `#watchlist-browse`, but clicking the card visually requires expanding `Empty` first or navigating to `/v2/watchlists/5`.
- On mobile (`390x844`), use `role=button,name=Create watchlist` instead of `role=button,name=Create New List` because the create tile is hidden below the `md` breakpoint.
- Submitting an empty description on edit stores `NULL` in SQLite (matching v1 semantics); assert `description === null`, not `""`.
- v2 does not yet implement delete or pause actions; test those on v1 (`Watchlist actions` menu on `/watchlists/{id}`).
