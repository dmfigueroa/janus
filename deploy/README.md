# Deployment

Janus runs as two container images built from the repository root:

- **v1 (`Dockerfile`):** TanStack Start / Node.js application on port `3000`. Owns SQLite schema migrations (`drizzle/`), unported writes, and `/mcp`.
- **v2 (`v2/Dockerfile`):** Rust application on port `3001`, mounted under the `/v2` path prefix. Serves ported watchlist web routes (`/v2/watchlists`), `/v2/mcp`, `/v2/health/live`, and `/v2/health/ready`.

## Coexistence & Routing

Both containers mount the same SQLite storage directory at `/app/storage` (database file `/app/storage/sqlite.db`) so SQLite WAL/SHM sidecar files remain accessible to both processes:

- **V1 owns migrations:** On startup, v1 runs `.output/server/migrate.mjs`, optionally runs `.output/server/seed.mjs` (no-op unless `SEED_ON_STARTUP=true`), and starts the Node server.
- **V2 validates compatibility without migrating:** V2 opens the existing SQLite file read-write (`create_if_missing(false)`, `read_only(false)`, `foreign_keys(true)`, `busy_timeout(5s)` in `v2/src/database/mod.rs`) and fails startup if the file is missing, fails `PRAGMA foreign_key_check`, or its schema/stored values do not match `v2/src/database/v1-schema.json`.
- **Two-phase orphan scrub for existing databases:** Before restarting v2 on an existing production database that may contain pre-existing orphaned rows, inspect and scrub orphans with `.output/server/scrub-orphans.mjs` (idempotent; runs `PRAGMA foreign_key_check` before and after):
  - Dry run (read-only): `node .output/server/scrub-orphans.mjs --database /app/storage/sqlite.db`
  - Apply cleanup: `node .output/server/scrub-orphans.mjs --database /app/storage/sqlite.db --apply`
- **Health checks:** `/v2/health/live` checks process liveness; `/v2/health/ready` reports startup schema and compatibility validation.
- **Reverse proxy routing:** Route `/v2` and `/v2/*` (preserving the `/v2` prefix) to the v2 container on port `3001`, and all other paths to v1 on port `3000`. A v1 `404` on `/v2` indicates the reverse proxy is not routing `/v2` to the v2 container (the local `pnpm run dev` proxy is development-only).
- **Authentication:** Janus expects an external authentication proxy (such as Cloudflare Access) in front of both web and MCP endpoints rather than managing application user accounts. See [`../docs/mcp.md`](../docs/mcp.md) for Managed OAuth setup.

`deploy/compose.yaml` provides a transition Docker Compose stack running both services against a shared database volume. Mount the full database directory and configure external volumes so a missing volume fails rather than silently initializing an empty database.

## Demo & Preview Seeding

`src/db/Seed.ts` seeds demo watchlists and items into an empty database. It is compiled to `.output/server/seed.mjs` in the v1 image and runs at container startup between `migrate.mjs` and `index.mjs`. It is a no-op unless `SEED_ON_STARTUP=true`.

To enable seeding in a preview or demo environment:

1. Set `SEED_ON_STARTUP=true` in the v1 container environment.
2. Mount a **disposable** database volume — never point a seeded or preview instance at a production database.

Behavior:

- **Idempotent:** Skips seeding whenever the `watchlists` table already contains rows, so container restarts do not duplicate data.
- **Scope:** Seeds `watchlists` and `watchlist_items` only. The five system lineups are created lazily by `src/features/lineups/manage/LineupConfiguration.server.ts` on first read.
- **Demo data:** Seeds four watchlists — Marvel Cinematic Universe, Star Wars, Anime & Manga (release order), and Reading List (custom order) — with empty poster paths so no external provider API keys are required.

Local run against a disposable database:

```bash
SEED_ON_STARTUP=true DATABASE_URL=/tmp/janus-preview.sqlite pnpm run migrate
SEED_ON_STARTUP=true DATABASE_URL=/tmp/janus-preview.sqlite pnpm run seed
```
