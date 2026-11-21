#!/usr/bin/env bash
# Runs a command with the Node version pinned in .tool-versions.
#
# This is the host fallback when the devcontainer cannot start. A bare `node`
# on the host may be a newer major, which has no `better-sqlite3` prebuilt
# binary and is outside the `engines` range, so dependency installs and the
# v2 Rust fixture tests must use the pinned version. See "Running Commands"
# in AGENTS.md.
#
# Usage: bash tools/pinned-node.sh <command> [arguments...]
# Example: bash tools/pinned-node.sh pnpm install --frozen-lockfile

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
node_version="$(awk '$1 == "nodejs" { print $2; exit }' "$root/.tool-versions")"

if [ -z "$node_version" ]; then
  printf 'No nodejs entry in %s/.tool-versions.\n' "$root" >&2
  exit 1
fi

if ! command -v mise >/dev/null 2>&1; then
  printf 'mise is required to select Node %s on the host.\n' "$node_version" >&2
  printf 'Install mise from https://mise.jdx.dev, or use the devcontainer path in AGENTS.md.\n' >&2
  exit 1
fi

exec mise exec "node@$node_version" -- "$@"
