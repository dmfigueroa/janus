#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

database="${DATABASE_URL:-/tmp/janus-preview.sqlite}"
v1_pid=""
v2_pid=""

cleanup() {
  [ -n "$v1_pid" ] && kill "$v1_pid" 2>/dev/null || true
  [ -n "$v2_pid" ] && kill "$v2_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

DATABASE_URL="$database" SEED_ON_STARTUP=true npx -y tsx src/db/Migrate.ts
DATABASE_URL="$database" SEED_ON_STARTUP=true npx -y tsx src/db/Seed.ts

(cd v2 && cargo build --locked --release)
(
  cd v2
  JANUS_V2_BIND=127.0.0.1:3001 DATABASE_URL="$database" ./target/release/janus-v2
) &
v2_pid=$!

DATABASE_URL="$database" npm run dev &
v1_pid=$!

printf 'v1: http://localhost:3000\nv2: http://localhost:3001/v2\ndb: %s\n' "$database"
wait
