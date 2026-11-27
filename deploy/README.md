# Deployment

Janus runs as two independently versioned container images built from the repository root and published to GHCR:

| Component                                   | Dockerfile      | Image                         | Channel tag | SemVer tags              |
| ------------------------------------------- | --------------- | ----------------------------- | ----------- | ------------------------ |
| v1 (TanStack Start / Node, port `3000`)     | `Dockerfile`    | `ghcr.io/dmfigueroa/janus-v1` | `latest`    | from git tags `v1/x.y.z` |
| v2 (Rust / HTMX, port `3001`, `/v2` prefix) | `v2/Dockerfile` | `ghcr.io/dmfigueroa/janus-v2` | `next`      | from git tags `v2/x.y.z` |

GitHub Actions workflows [`.github/workflows/publish-v1.yml`](../.github/workflows/publish-v1.yml) and [`.github/workflows/publish-v2.yml`](../.github/workflows/publish-v2.yml) build and push on path-filtered pushes to `main`, on matching SemVer tags, and via `workflow_dispatch`. Every publish also tags `sha-<shortsha>`. PR CI still builds images without pushing (`ci.yml` / `v2.yml`) so a broken Dockerfile fails before merge.

Path filters (shared `.dockerignore` changes publish both):

- **v1:** `Dockerfile`, app manifests, `src/`, `public/`, `drizzle/`, `test/`, `tools/`, and related root build configs.
- **v2:** `v2/**`.

Both images build with context at the repository root and share the root `.dockerignore`:

```bash
docker build -f Dockerfile -t janus-v1 .
docker build -f v2/Dockerfile -t janus-v2 .
```

Keep `v2/`, `test/`, and `tools/` in the context. Keep `v2/target` ignored.

## Pull-to-deploy

Production uses `deploy/compose.yaml`, which pulls channel tags (`janus-v1:latest`, `janus-v2:next`) with `pull_policy: always`. Coolify (or any self-host Compose) injects runtime environment variables; nothing application-secret is baked into the images.

Local or PR-preview **source builds** use the additive overlay:

```bash
docker compose -f deploy/compose.yaml -f deploy/compose.build.yaml up --build
```

## Runtime configuration (twelve-factor)

Inject at runtime. Do not add these as `ENV`/`ARG` defaults containing secrets in the Dockerfiles.

| Variable               | Service | Notes                                                                   |
| ---------------------- | ------- | ----------------------------------------------------------------------- |
| `DATABASE_URL`         | v1, v2  | Filesystem path to SQLite; Compose sets `/app/storage/sqlite.db`        |
| `TMDB_API_KEY`         | v1      | Provider key                                                            |
| `COMICVINE_API_KEY`    | v1      | Provider key                                                            |
| `RAWG_API_KEY`         | v1      | Provider key                                                            |
| `GOOGLE_BOOKS_API_KEY` | v1      | Provider key                                                            |
| `SEED_ON_STARTUP`      | v1      | `true` only on disposable preview/demo volumes                          |
| `JANUS_V2_BIND`        | v2      | Defaults to `0.0.0.0:3001` in image; override if needed                 |
| `PORT`                 | v1      | Node listen port if the host overrides (image defaults to Nitro/`3000`) |

## Coexistence & Routing

Both containers mount the same SQLite storage directory at `/app/storage` (database file `/app/storage/sqlite.db`) so SQLite WAL/SHM sidecar files remain accessible to both processes:

- **V1 owns migrations:** On startup, v1 runs `.output/server/migrate.mjs`, optionally runs `.output/server/seed.mjs` (no-op unless `SEED_ON_STARTUP=true`), and starts the Node server. In Compose, `v2` waits for `v1` (`depends_on: v1: condition: service_healthy`) so migrations complete before v2 validates the schema or opens connections.
- **V2 validates compatibility without migrating:** V2 opens the existing SQLite file read-write (`create_if_missing(false)`, `read_only(false)`, `foreign_keys(true)`, `busy_timeout(5s)` in `v2/src/database/mod.rs`) and fails startup if the file is missing, fails `PRAGMA foreign_key_check`, or its schema/stored values do not match `v2/src/database/v1-schema.json`.
- **Two-phase orphan scrub for existing databases:** Before restarting v2 on an existing production database that may contain pre-existing orphaned rows, inspect and scrub orphans with `.output/server/scrub-orphans.mjs` (idempotent; runs `PRAGMA foreign_key_check` before and after):
  - Dry run (read-only): `node .output/server/scrub-orphans.mjs --database /app/storage/sqlite.db`
  - Apply cleanup: `node .output/server/scrub-orphans.mjs --database /app/storage/sqlite.db --apply`
- **Health checks:** `/v2/health/live` checks process liveness; `/v2/health/ready` reports startup schema and compatibility validation.
- **Reverse proxy routing:** Route `/v2` and `/v2/*` (preserving the `/v2` prefix) to the v2 container on port `3001`, and all other paths to v1 on port `3000`. A v1 `404` on `/v2` indicates the reverse proxy is not routing `/v2` to the v2 container (the local `pnpm run dev` proxy is development-only).
- **Authentication:** Janus expects an external authentication proxy (such as Cloudflare Access) in front of both web and MCP endpoints rather than managing application user accounts. See [`../docs/mcp.md`](../docs/mcp.md) for Managed OAuth setup.

`deploy/compose.yaml` mounts the production external volume `h8gsos0k40kk8s8oo8o4ko0w-DB` and configures Traefik labels for `/v2` on `janus.dmfigueroa.com`. Mount the full database directory and configure external volumes so a missing volume fails rather than silently initializing an empty database.

## Demo & Preview Seeding

`src/db/Seed.ts` seeds demo watchlists and items into an empty database. It is compiled to `.output/server/seed.mjs` in the v1 image and runs at container startup between `migrate.mjs` and `index.mjs`. It is a no-op unless `SEED_ON_STARTUP=true`.

To enable seeding in a preview or demo environment:

1. Set `SEED_ON_STARTUP=true` in the v1 container environment.
2. Mount a **disposable** database volume. Never point a seeded or preview instance at a production database.
3. Prefer source builds via `compose.build.yaml` or Coolify Dockerfile build mode so the preview matches the PR commit without waiting on GHCR channel tags.

Behavior:

- **Idempotent:** Skips seeding whenever the `watchlists` table already contains rows, so container restarts do not duplicate data.
- **Scope:** Seeds `watchlists` and `watchlist_items` only. The five system lineups are created lazily by `src/features/lineups/manage/LineupConfiguration.server.ts` on first read.
- **Demo data:** Seeds four watchlists — Marvel Cinematic Universe, Star Wars, Anime & Manga (release order), and Reading List (custom order) — with empty poster paths so no external provider API keys are required.

Local run against a disposable database:

```bash
SEED_ON_STARTUP=true DATABASE_URL=/tmp/janus-preview.sqlite pnpm run migrate
SEED_ON_STARTUP=true DATABASE_URL=/tmp/janus-preview.sqlite pnpm run seed
```

## Coolify dashboard steps (manual)

These cannot be applied from the repo alone. David (or whoever operates Coolify) should:

1. **Production app, switch to pull-to-deploy.** For the existing Janus Coolify application that uses `deploy/compose.yaml`, change each service from Dockerfile `build:` mode to Docker Image mode pointing at `ghcr.io/dmfigueroa/janus-v1:latest` and `ghcr.io/dmfigueroa/janus-v2:next`. Redeploying the updated compose file alone also switches services to `image:` pull.
2. **GHCR authentication.** If the packages are private, add a GHCR pull credential (PAT or deploy token with `read:packages`) on Coolify or the host so pulls succeed. Public packages need no auth for pull.
3. **Keep runtime env.** Confirm `DATABASE_URL`, provider API keys, and optional `SEED_ON_STARTUP` and `JANUS_V2_BIND` remain set on the Coolify service environment, not in the image.
4. **Preserve coexistence.** Do not change the external volume name `h8gsos0k40kk8s8oo8o4ko0w-DB` or the Traefik `/v2` routing labels unless you are intentionally migrating hosts.
5. **PR previews.** Leave preview applications on Dockerfile source-build mode. Use `compose.build.yaml` or Coolify build-from-PR. Give each preview its own disposable storage volume and set `SEED_ON_STARTUP=true` only there.
6. **Cutting a SemVer release.** Tag and push `v1/x.y.z` or `v2/x.y.z` on `main` after the path-filtered publish commit. The matching workflow pushes SemVer tags alongside the channel tag. Re-run `workflow_dispatch` on the publish workflow if a tag push needs a manual retry.

## Cutting releases

```bash
# After the desired commit is on main:
git tag v1/1.2.3
git push origin v1/1.2.3

git tag v2/0.2.0
git push origin v2/0.2.0
```

Channel tags move on every successful path-filtered publish to `main` and on SemVer tag publishes. Pin production to a SemVer digest in Coolify if you need a freeze. Otherwise `latest` and `next` track `main`.
