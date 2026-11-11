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
