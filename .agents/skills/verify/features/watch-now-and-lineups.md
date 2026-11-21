# Watch Now and custom lineups

Watch Now shows the user's active lineups and next-up watchlists on the v1 home screen (`/`), and Manage Lineups (`/rotations`) lets the user create, configure, and reorder custom lineups that immediately appear on Watch Now.

## Sub-features

- `watch-now-home` displays the `Watch Now` heading, `Customize` link, and active system lineups with eligible seeded watchlists.
- `lineups-create` creates a new custom lineup from `/rotations` with selected watchlists and persists it to SQLite.
- `lineups-reflect-watch-now` renders the newly created custom lineup as a section link on `/`.

## How to get to it (user POV)

- Visit `/` directly or choose `Watch Now` in the v1 bottom navigation bar.
- Choose `Customize` in the `Watch Now` header (or visit `/rotations`) to open `Manage Lineups`.
- Choose `Create lineup` on `/rotations` to open the lineup editor dialog.

## Driving it with verify-janus

Preconditions:

- Run `.agents/skills/verify/scripts/verify-janus launch --run-id lineups --v1-only` (or full launch) and `.agents/skills/verify/scripts/verify-janus doctor --run-id lineups` with exit code `0`.
- At least one seeded watchlist with unwatched items exists (`Marvel Cinematic Universe`, `Star Wars`, `Anime & Manga`, `Reading List`).

- **Visit Watch Now, navigate to Manage Lineups, and create a custom lineup.** Open `/`, choose `Customize`, create a lineup named `Weekend Binge` containing `Star Wars`, and return to `Watch Now`. Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus drive --run-id lineups --target v1 --viewport 1280x800 --feature watch-now-and-lineups --evidence-name v1-lineups <<'EOF'
  [
    { "op": "goto", "path": "/" },
    { "op": "expectText", "target": "role=heading,name=Watch Now", "text": "Watch Now" },
    { "op": "aria", "file": "watch-now-before.aria.txt" },
    { "op": "screenshot", "file": "watch-now-before.png" },
    { "op": "click", "target": "role=link,name=Customize" },
    { "op": "expectUrl", "contains": "/rotations" },
    { "op": "expectText", "target": "role=heading,name=Manage Lineups", "text": "Manage Lineups" },
    { "op": "click", "target": "role=button,name=Create lineup" },
    { "op": "fill", "target": "label=Name", "value": "Weekend Binge" },
    { "op": "click", "target": "text=Star Wars" },
    { "op": "screenshot", "file": "create-lineup-dialog.png" },
    { "op": "click", "target": "role=dialog >> role=button,name=Create lineup" },
    { "op": "expectText", "text": "Weekend Binge" },
    { "op": "aria", "file": "manage-lineups-after.aria.txt" },
    { "op": "click", "target": "role=link,name=Watch Now" },
    { "op": "expectText", "text": "Weekend Binge" },
    { "op": "aria", "file": "watch-now-after.aria.txt" },
    { "op": "screenshot", "file": "watch-now-after.png" }
  ]
  EOF
  ```
  `Weekend Binge` appears in `Manage Lineups` and as a linked section heading on `Watch Now`.
- **Confirm lineup persistence in SQLite.** Run:
  ```bash
  .agents/skills/verify/scripts/verify-janus db --run-id lineups --save watch-now-and-lineups/db-lineups.json "SELECT id, name, enabled FROM custom_lineups ORDER BY id"
  ```
  Returns a row with `name: "Weekend Binge"` and `enabled: 1`.

## Gotchas

- `Watch Now` (`/`) and `Manage Lineups` (`/rotations`) exist only in v1. On v2, the `Watch Now` bottom nav item points to `/v2` (the development landing page).
- Both the `/rotations` page and the lineup creation dialog have a button labeled `Create lineup`. Target the submit button inside the dialog (or use `css=[role="dialog"] button[type="submit"]`) so Playwright does not click the background trigger.
- A custom lineup appears on `Watch Now` only when it is enabled AND has at least one eligible watchlist with unwatched items. Creating an empty lineup or picking a completed watchlist hides it from `/`.
