# Transition deployment

## Verified live state (2026-11-11, issue #253)

V1 remains the application for writes and existing MCP clients. Coolify currently deploys
two Dockerfile applications on ryumi through its existing build/publish/deploy pipeline:

- V1 `h8gsos0k40kk8s8oo8o4ko0w`, source main, port 3000, revision
  `669a385b8efa855adfad93f73b734cc5c9a4e709`, host `https://janus.dmfigueroa.com`.
- V2 `5whktbve62r1oj2m3dp0efet`, `v2/Dockerfile`, port 3001, testing prefix `/v2`.
  The read slice is tested from PR #278; its source branch is restored to main after
  verification, while the tested image remains running pending the normal merge/deployment.

Docker inspection confirmed both applications mount the **same existing** volume,
`h8gsos0k40kk8s8oo8o4ko0w-DB`, at `/app/storage`. The file is
`/app/storage/sqlite.db`; directory permissions are 755 root:root, file permissions
644 root:root. Both images currently run as root. No chmod/chown, data initialization,
volume replacement or schema migration ownership change was performed.

V2 opens the existing SQLite file read-only. `/v2/health/live` is process liveness;
`/v2/health/ready` reports startup compatibility validation. The running service uses
its existing liveness healthcheck, while independent readiness is verified directly.

Local destructive/lock/round-trip tests run only on disposable v1-migrated databases.
Deployed checks use reads only. See `../v2/PARITY.md` for exact revision, data comparison,
schema/migration hashes, journal-mode and local-versus-deployed evidence.
Unauthenticated public requests to v1, v2 web and v2 MCP returned 403. An actual
Access-authenticated client flow remains unverified; internal container-network reads
are not evidence of that flow. Existing client destinations were not changed.

## Prepared same-application Compose configuration (#252)

`compose.yaml` describes separate v1/v2 services in the same Coolify application, with
independent Dockerfile builds and the existing external database volume. **That topology
is not active**: live Coolify uses the two applications described above. This discrepancy
with the parent spec remains explicit; issue #253 does not claim that topology migration.

The external volume declaration must fail when the volume is absent; it must never create
a replacement. Mount the entire directory, including SQLite sidecar files. V1 retains its
startup command and exclusive ownership of schema migrations.

If activating Compose later, inspect the current application/routing/mount configuration
again, retain v1 hostname/port mapping and provider configuration, and preserve the `/v2`
prefix when routing it to port 3001. Verify Access on both testing surfaces and keep
existing MCP clients on v1. Use the existing Coolify-managed build server and separate
deployment server; no separate GitHub Actions image-publishing pipeline is introduced.

No final traffic cutover, v1 retirement or schema ownership transfer is included.

## PR previews

Coolify creates one preview per Coolify application. A Janus PR therefore has two preview
resources when previews are enabled:

- V1: `https://dev-janus-<pr>.dmfigueroa.com`
- V2: `https://dev-janus-<pr>.dmfigueroa.com/v2`

The v2 preview runs the separate Rust application, not a V1 route. A V1 404 on `/v2`
means the v2 preview is missing, unhealthy or not routed; debug the v2 container rather
than the V1 router. The local `pnpm run dev` proxy is a convenience only and is not evidence
about a Coolify preview.

Inspect the preview resources, then the v2 image and container:

```bash
docker exec coolify-db psql -U coolify -d coolify -Atc \
  "select pull_request_id, fqdn, status from application_previews where pull_request_id=<pr> order by id"
ssh ryumi "docker ps -a --filter name=-pr-<pr> --format '{{.Names}} {{.Status}} {{.Image}}'"
ssh ryumi "docker exec <v2-container> ls -l /usr/local/bin/janus-v2"
```

The v2 binary is roughly 10 MB; a few hundred KB means the Docker build emitted the stub
crate, and `v2/Dockerfile` must force the copied sources newer than the stub artifacts.
Finish with public checks for `/v2`, `/v2/watchlists` and a detail page.

## Preview environment seeding

`src/db/Seed.ts` seeds demo watchlists and items into an empty database. It is compiled
to `.output/server/seed.mjs` in the image and runs after migrations at container start,
between `migrate.mjs` and `index.mjs`. It only writes when `SEED_ON_STARTUP=true`, so the
production app — which never sets that variable — is unaffected.

Enabling it on a Coolify preview deployment:

1. Set `SEED_ON_STARTUP=true` on the preview deployment's environment.
2. Point the preview at a **disposable** database. Do not mount the shared production volume
   `h8gsos0k40kk8s8oo8o4ko0w-DB`: seeding (and ordinary app writes) on that volume would
   modify production data. Give the preview its own empty volume.

Behavior:

- Idempotent: skips seeding when the `watchlists` table already has rows, so preview restarts
  do not duplicate data.
- Seeds only `watchlists` and `watchlist_items`. The five system lineups are created lazily by
  `LineupConfiguration.server.ts` on first read; system lineup membership is derived from each
  watchlist's next-unwatched media type, so no `lineup_watchlists` rows are required.
- Demo watchlists: Marvel Cinematic Universe, Star Wars, Anime & Manga (release order), and
  Reading List (custom order). Poster paths are left empty so previews do not depend on TMDB.

Local run against a disposable database:

```bash
SEED_ON_STARTUP=true DATABASE_URL=/tmp/janus-preview.sqlite pnpm run migrate
SEED_ON_STARTUP=true DATABASE_URL=/tmp/janus-preview.sqlite pnpm run seed
```
