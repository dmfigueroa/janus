# Transition deployment (#252)

Inspected through Coolify on 2026-11-11:

- Existing application: h8gsos0k40kk8s8oo8o4ko0w, on ryumi.
- Existing routing: https://janus.dmfigueroa.com, port 3000; Dockerfile build from main.
- Configured persistent volume: h8gsos0k40kk8s8oo8o4ko0w-DB, mounted at /app/storage/.
- Runtime DATABASE_URL: /app/storage/sqlite.db (confirmed via configuration).
- Latest finished deployment: 66bc894630f2360296c3fd089dd1d01c92b6ff60.

The Compose file explicitly requires the existing external volume. Docker must fail if
it is absent; it must never create a replacement. Mount the directory, including SQLite
sidecar files. Both images currently use the default root identity, preserving the v1
image identity; actual file permissions and running mounts are not yet verified.
No chmod, chown, schema migration transfer, or database initialization is introduced.
V1 retains its image startup command and migration ownership.

Coolify manages builds, image publishing/retrieval, and deployment using its existing
build server and separate deployment server. Compose defines the v1 and v2 Dockerfile
builds independently, with repository-root build contexts. There is no GitHub Actions
image publishing workflow or manually supplied image-reference environment variable.
Use the existing Coolify pipeline and registry configuration.

Before activating Compose in the SAME Coolify application:

1. Confirm existing volume identity and non-destructively inspect the database file,
   directory permissions, and sidecar access with the intended image identity.
2. Preserve v1's existing hostname and port 3000 mapping. Route Host(`janus.dmfigueroa.com`) with Path(`/v2`) or PathPrefix(`/v2/`)
   to v2 port 3001 with higher priority than v1. Preserve the prefix (no stripping).
   The MCP testing endpoint is /v2/mcp. The existing hostname is reused; deployed Access coverage remains to be verified.
   Confirm Cloudflare Access protects both paths before exposing them. Do not point
   existing MCP clients at v2. No host ports are published by this file.
3. Configure existing application Compose location /deploy/compose.yaml using the repository root as the build context, retain existing provider environment values, then deploy.
4. Verify v1 web and MCP remain reachable, v2 smoke and local assets respond, unauthorized
   v2 web/MCP requests are blocked by Access, and authorized requests reach v2.
5. Record image digests, routing, mounts, permissions, and deployed results here and in
   v2/PARITY.md. No deployed verification has been completed by this configuration change.

V2 /v2/health/live is smoke liveness. /v2/health/ready deliberately returns 503 until #253.
Do not use readiness as a proxy routing check yet or claim database/feature readiness.
No final cutover or v1 retirement is included.
