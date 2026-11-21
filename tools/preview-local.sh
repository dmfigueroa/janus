#!/usr/bin/env bash
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

if [ ! -d node_modules/drizzle-orm ] || [ ! -d node_modules/.bin ]; then
  printf 'Root dependencies are missing. Run pnpm install from %s.\n' "$root" >&2
  exit 1
fi

database="${DATABASE_URL:-/tmp/janus-preview.sqlite}"
v1_pid=""
v2_pid=""

cleanup() {
  [ -n "$v1_pid" ] && kill "$v1_pid" 2>/dev/null || true
  [ -n "$v2_pid" ] && kill "$v2_pid" 2>/dev/null || true
}
trap cleanup EXIT INT TERM

wait_for_url() {
  local name="$1"
  local url="$2"
  local pid="$3"

  for ((attempt = 0; attempt < 120; attempt++)); do
    if curl -fsS "$url" >/dev/null 2>&1; then
      return 0
    fi
    if ! kill -0 "$pid" 2>/dev/null; then
      printf '%s exited before becoming ready at %s.\n' "$name" "$url" >&2
      return 1
    fi
    sleep 1
  done

  printf 'Timed out waiting for %s at %s.\n' "$name" "$url" >&2
  return 1
}

DATABASE_URL="$database" SEED_ON_STARTUP=true pnpm dlx tsx src/db/Migrate.ts
DATABASE_URL="$database" SEED_ON_STARTUP=true pnpm dlx tsx src/db/Seed.ts

(cd v2 && cargo build --locked --release)
(
  cd v2
  JANUS_V2_BIND=127.0.0.1:3001 DATABASE_URL="$database" ./target/release/janus-v2
) &
v2_pid=$!

DATABASE_URL="$database" pnpm run dev &
v1_pid=$!

wait_for_url "v2" "http://127.0.0.1:3001/v2/health/live" "$v2_pid"
wait_for_url "v1" "http://localhost:3000" "$v1_pid"

printf 'v1: http://localhost:3000\nv2: http://localhost:3001/v2\ndb: %s\npreview ready\n' "$database"
wait
