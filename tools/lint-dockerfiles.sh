#!/usr/bin/env bash
# Lints the production Dockerfiles staged for commit. CI lints every Dockerfile
# with the same pinned hadolint release, so this hook is the fast local check.
set -euo pipefail

if command -v hadolint >/dev/null 2>&1; then
  exec hadolint "$@"
fi

if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
  # Mount the worktree at its own path: lint-staged passes absolute paths.
  exec docker run --rm -v "$PWD:$PWD" -w "$PWD" hadolint/hadolint:v2.12.0 hadolint "$@"
fi

echo "Skipping Dockerfile lint: hadolint is not installed and Docker is unavailable." >&2
echo "Install hadolint locally to run it in the pre-commit hook; CI lints Dockerfiles." >&2
