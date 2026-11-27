#!/usr/bin/env bash
# Generate path-filtered release notes for a Janus SemVer line (v1 or v2).
#
# Usage:
#   bash tools/release-notes.sh <v1|v2> [to-ref]
#
# Examples:
#   bash tools/release-notes.sh v1              # since previous v1/* tag .. HEAD
#   bash tools/release-notes.sh v2 v2/2.0.0     # notes for that tag since the prior v2/* tag
#   bash tools/release-notes.sh v1 HEAD | gh release create v1/1.1.0 --notes-file -
#
# Path filters match the publish workflows so each line's notes track the
# commits that affect that image. Requires git-cliff (or Docker).

set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$root"

line="${1:-}"
to_ref="${2:-HEAD}"

if [[ "$line" != "v1" && "$line" != "v2" ]]; then
  printf 'Usage: %s <v1|v2> [to-ref]\n' "$(basename "$0")" >&2
  exit 2
fi

if ! git rev-parse --verify "$to_ref" >/dev/null 2>&1; then
  printf 'Unknown git ref: %s\n' "$to_ref" >&2
  exit 1
fi

same_line_tags() {
  git tag -l "${line}/*" --sort=-creatordate
}

# Previous tag on this line before to-ref.
# If to-ref is itself a same-line tag name, use the next older tag.
# Otherwise (HEAD/commit), use the newest same-line tag.
previous_same_line_tag() {
  local tags=()
  local tag
  while IFS= read -r tag; do
    [[ -n "$tag" ]] && tags+=("$tag")
  done < <(same_line_tags)

  if ((${#tags[@]} == 0)); then
    return 0
  fi

  local index
  for index in "${!tags[@]}"; do
    if [[ "${tags[$index]}" == "$to_ref" ]]; then
      if ((index + 1 < ${#tags[@]})); then
        printf '%s\n' "${tags[$((index + 1))]}"
      fi
      return 0
    fi
  done

  printf '%s\n' "${tags[0]}"
}

display_version() {
  if [[ "$to_ref" == v1/* ]]; then
    printf '%s\n' "${to_ref#v1/}"
  elif [[ "$to_ref" == v2/* ]]; then
    # Image tags append -beta while v2 is prerelease.
    printf '%s-beta\n' "${to_ref#v2/}"
  else
    printf 'Unreleased\n'
  fi
}

run_git_cliff() {
  if command -v git-cliff >/dev/null 2>&1; then
    git-cliff "$@"
    return
  fi

  if command -v docker >/dev/null 2>&1 && docker info >/dev/null 2>&1; then
    docker run --rm -v "$root:/app" -w /app orhunp/git-cliff:2.8.0 "$@"
    return
  fi

  printf 'git-cliff is required to generate release notes.\n' >&2
  printf 'Install from https://git-cliff.org or use Docker (orhunp/git-cliff:2.8.0).\n' >&2
  exit 1
}

previous="$(previous_same_line_tag || true)"
to_commit="$(git rev-parse "${to_ref}^{commit}")"

include_paths=()
case "$line" in
  v1)
    include_paths=(
      --include-path 'Dockerfile'
      --include-path '.dockerignore'
      --include-path 'package.json'
      --include-path 'pnpm-lock.yaml'
      --include-path '.npmrc'
      --include-path 'tsconfig.json'
      --include-path 'vite.config.ts'
      --include-path 'drizzle.config.ts'
      --include-path 'src/**'
      --include-path 'public/**'
      --include-path 'drizzle/**'
      --include-path 'test/**'
      --include-path 'tools/**'
      --include-path '.github/workflows/publish-v1.yml'
      --include-path '.github/workflows/ci.yml'
    )
    pathspec=(
      Dockerfile .dockerignore package.json pnpm-lock.yaml .npmrc
      tsconfig.json vite.config.ts drizzle.config.ts
      src public drizzle test tools
      .github/workflows/publish-v1.yml .github/workflows/ci.yml
    )
    ;;
  v2)
    include_paths=(
      --include-path 'v2/**'
      --include-path '.dockerignore'
      --include-path '.github/workflows/publish-v2.yml'
      --include-path '.github/workflows/v2.yml'
    )
    pathspec=(
      v2 .dockerignore
      .github/workflows/publish-v2.yml .github/workflows/v2.yml
    )
    ;;
esac

cliff_args=(
  --config "$root/cliff.toml"
  --strip all
  "${include_paths[@]}"
)

if [[ -n "$previous" ]]; then
  previous_commit="$(git rev-parse "${previous}^{commit}")"
  range="${previous_commit}..${to_commit}"
  range_label="${previous}..${to_ref}"
else
  root_commit="$(git rev-list --max-parents=0 "${to_commit}" | tail -n1)"
  range="${root_commit}..${to_commit}"
  range_label="${range} (no prior ${line}/* tag)"
fi

printf '<!-- Janus %s release notes: %s -->\n' "$line" "$range_label" >&2

# Empty range (re-running notes for the tip tag with nothing newer): say so and exit.
if [[ -n "$previous" && "$previous_commit" == "$to_commit" ]]; then
  printf '## %s\n\n_No %s path-filtered commits since %s._\n' "$(display_version)" "$line" "$previous"
  exit 0
fi

# Avoid `git log | grep -q` under `pipefail`: grep closes early and git log's
# SIGPIPE makes the pipeline look empty when commits exist.
commits="$(git log --oneline "$range" -- "${pathspec[@]}")"
if [[ -z "$commits" ]]; then
  printf '## %s\n\n_No %s path-filtered commits in range %s._\n' "$(display_version)" "$line" "$range_label"
  exit 0
fi

printf '## %s\n\n' "$(display_version)"
run_git_cliff "${cliff_args[@]}" "$range"
