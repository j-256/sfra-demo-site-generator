#!/bin/bash
set -euo pipefail

RELEASE_BRANCH="main"
RELEASE_REMOTES=("origin" "soma")

usage() {
  cat <<'EOF'
Usage: scripts/deploy-release.sh [options]

Atomically push the package version's commit and tag to every release remote,
then create or complete the matching release on each host.

Options:
  -n, --dry-run            Preflight and dry-run Git pushes without publishing
  -N, --notes-file <path>  Use release notes from this file
  -h, --help               Show this help message

Preconditions:
  Run from a clean main branch whose HEAD has an annotated vX.Y.Z tag and whose
  package version and release artifacts match that tag. Configure origin and
  soma as the release remotes. Publishing requires gh access to both hosts.

Dependencies:
  git and node; gh unless --dry-run is used

Exit status:
  0  Success
  1  Runtime or remote-state failure
  2  Usage or local-state error
  3  Missing dependency
EOF
}

usage_error() {
  printf '%s\n' "$1" >&2
  printf '%s\n' "Run 'scripts/deploy-release.sh --help' for usage" >&2
  exit 2
}

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

missing_dependency() {
  printf '%s\n' "$1 is required to deploy a release" >&2
  exit 3
}

_expand_short_opts() {
  # $1 = string of short-opt letters that take a value (e.g. "nXHd"); "" for flag-only scripts
  # $2..$N = "$@"
  # Populates _EXPANDED; caller does: set -- "${_EXPANDED[@]}"; unset _EXPANDED
  local value_opts="$1"; shift
  _EXPANDED=()
  local passthru=""
  local arg
  local rest
  local c
  for arg in "$@"; do
    if [ -n "$passthru" ]; then _EXPANDED+=("$arg"); continue; fi
    case "$arg" in
      --)       passthru=1; _EXPANDED+=("$arg") ;;
      --*|-|"") _EXPANDED+=("$arg") ;;
      -[a-zA-Z]?*)
        rest="${arg#-}"
        while [ -n "$rest" ]; do
          c="${rest%"${rest#?}"}"; rest="${rest#?}"
          _EXPANDED+=("-$c")
          case "$value_opts" in *"$c"*)
            [ -n "$rest" ] && _EXPANDED+=("$rest")
            rest="" ;;
          esac
        done ;;
      *)        _EXPANDED+=("$arg") ;;
    esac
  done
}

repo_spec_for_remote() {
  local remote="$1"
  local url
  local repo_spec
  local host
  local path
  local remainder
  local owner
  local repo

  url="$(git -C "$REPO_ROOT" remote get-url "$remote")"
  case "$url" in
    https://*) repo_spec="${url#https://}" ;;
    http://*) repo_spec="${url#http://}" ;;
    ssh://git@*) repo_spec="${url#ssh://git@}" ;;
    git@*:*)
      host="${url%%:*}"
      host="${host#git@}"
      path="${url#*:}"
      repo_spec="$host/$path"
      ;;
    *)
      fail "Cannot derive a release repository from $remote URL: $url"
      ;;
  esac
  repo_spec="${repo_spec%.git}"

  host="${repo_spec%%/*}"
  remainder="${repo_spec#*/}"
  owner="${remainder%%/*}"
  repo="${remainder#*/}"
  if [ -z "$host" ] || [ -z "$owner" ] || [ -z "$repo" ] || [ "$repo" != "${repo#*/}" ]; then
    fail "Release remote $remote must resolve to host/owner/repo, got: $repo_spec"
  fi
  printf '%s\n' "$repo_spec"
}

remote_tag_object() {
  local remote="$1"
  local tag="$2"
  local line

  if ! line="$(git -C "$REPO_ROOT" ls-remote --tags "$remote" "refs/tags/$tag")"; then
    fail "Could not inspect tag $tag on $remote"
  fi
  printf '%s\n' "${line%%[[:space:]]*}"
}

verify_remote_refs() {
  local remote="$1"
  local tag="$2"
  local expected_head="$3"
  local expected_tag_object="$4"
  local head_line
  local actual_head
  local actual_tag_object

  if ! head_line="$(git -C "$REPO_ROOT" ls-remote --heads "$remote" "refs/heads/$RELEASE_BRANCH")"; then
    fail "Could not verify $RELEASE_BRANCH on $remote"
  fi
  actual_head="${head_line%%[[:space:]]*}"
  actual_tag_object="$(remote_tag_object "$remote" "$tag")"
  if [ "$actual_head" != "$expected_head" ] || [ "$actual_tag_object" != "$expected_tag_object" ]; then
    fail "$remote did not reach the expected $RELEASE_BRANCH and $tag refs"
  fi
}

if [ "$#" -gt 0 ]; then
  _expand_short_opts "N" "$@"
  set -- "${_EXPANDED[@]}"; unset _EXPANDED
fi

dry_run=false
notes_file=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -n|--dry-run)
      dry_run=true
      shift
      ;;
    -N|--notes-file)
      [ "$#" -ge 2 ] || usage_error "$1 requires a path"
      notes_file="$2"
      shift 2
      ;;
    --notes-file=*)
      notes_file="${1#*=}"
      [ -n "$notes_file" ] || usage_error "--notes-file requires a path"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    --)
      shift
      [ "$#" -eq 0 ] || usage_error "Unexpected positional argument: $1"
      ;;
    -*) usage_error "Unknown option: $1" ;;
    *) usage_error "Unexpected positional argument: $1" ;;
  esac
done

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT=""
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

for command_name in git node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    missing_dependency "$command_name"
  fi
done
if [ "$dry_run" = false ] && ! command -v gh >/dev/null 2>&1; then
  missing_dependency gh
fi

if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
  usage_error "The worktree must be clean before deployment"
fi

branch=""
branch="$(git -C "$REPO_ROOT" symbolic-ref --quiet --short HEAD 2>/dev/null || true)"
if [ "$branch" != "$RELEASE_BRANCH" ]; then
  usage_error "Release deployment requires branch $RELEASE_BRANCH, found: ${branch:-detached HEAD}"
fi

package_version=""
package_version="$(node -p "require(process.argv[1]).version" "$REPO_ROOT/package.json")"
tag="v$package_version"
head_commit=""
head_commit="$(git -C "$REPO_ROOT" rev-parse HEAD)"
tag_commit=""
tag_commit="$(git -C "$REPO_ROOT" rev-list -n 1 "$tag" 2>/dev/null || true)"
if [ "$tag_commit" != "$head_commit" ]; then
  usage_error "Annotated tag $tag must exist and point to HEAD"
fi
tag_type=""
tag_type="$(git -C "$REPO_ROOT" cat-file -t "refs/tags/$tag" 2>/dev/null || true)"
if [ "$tag_type" != "tag" ]; then
  usage_error "Release tag $tag must be annotated"
fi
local_tag_object=""
local_tag_object="$(git -C "$REPO_ROOT" rev-parse "refs/tags/$tag")"

release_dir="$REPO_ROOT/dist/releases/$tag"
assets=(
  "$release_dir/sfra-demo-site-generator-$tag-macos-arm64.tar.gz"
  "$release_dir/sfra-demo-site-generator-$tag-macos-x64.tar.gz"
  "$release_dir/sfra-demo-site-generator-$tag-linux-arm64.tar.gz"
  "$release_dir/sfra-demo-site-generator-$tag-linux-x64.tar.gz"
  "$release_dir/sfra-demo-site-generator-$tag-windows-x64.exe"
)
for asset in "${assets[@]}"; do
  [ -f "$asset" ] || usage_error "Release artifact not found: $asset"
done

remote_states=()
repo_specs=()
for remote in "${RELEASE_REMOTES[@]}"; do
  if ! git -C "$REPO_ROOT" remote get-url "$remote" >/dev/null 2>&1; then
    usage_error "Release remote is not configured: $remote"
  fi
  if ! git -C "$REPO_ROOT" fetch --quiet --no-tags "$remote" \
    "+refs/heads/$RELEASE_BRANCH:refs/remotes/$remote/$RELEASE_BRANCH"; then
    fail "Could not fetch $RELEASE_BRANCH from $remote"
  fi

  remote_head=""
  remote_head="$(git -C "$REPO_ROOT" rev-parse "refs/remotes/$remote/$RELEASE_BRANCH")"
  remote_tag=""
  remote_tag="$(remote_tag_object "$remote" "$tag")"
  if [ "$remote_head" = "$head_commit" ] && [ "$remote_tag" = "$local_tag_object" ]; then
    remote_states+=("exact")
  elif git -C "$REPO_ROOT" merge-base --is-ancestor "$remote_head" "$head_commit" && [ -z "$remote_tag" ]; then
    remote_states+=("pending")
  else
    fail "$remote has a conflicting or partial $RELEASE_BRANCH/$tag state"
  fi

  if [ "$dry_run" = false ]; then
    repo_spec=""
    repo_spec="$(repo_spec_for_remote "$remote")"
    repo_specs+=("$repo_spec")
    repo_host="${repo_spec%%/*}"
    repo_path="${repo_spec#*/}"
    if ! gh api --hostname "$repo_host" "repos/$repo_path" --silent; then
      fail "Cannot access release repository: $repo_spec"
    fi
  fi
done

if [ -z "$notes_file" ]; then
  notes_file="$release_dir/RELEASE_NOTES.md"
  previous_tag=""
  previous_tag="$(git -C "$REPO_ROOT" describe --tags --abbrev=0 "${tag}^" 2>/dev/null || true)"
  {
    if [ -n "$previous_tag" ]; then
      printf 'Changes since %s:\n\n' "$previous_tag"
      git -C "$REPO_ROOT" log --reverse --format='- %s' "$previous_tag..${tag}^"
    else
      printf 'Changes:\n\n'
      git -C "$REPO_ROOT" log --reverse --format='- %s' "${tag}^"
    fi
  } > "$notes_file"
elif [ ! -f "$notes_file" ]; then
  usage_error "Release notes file not found: $notes_file"
fi

for index in "${!RELEASE_REMOTES[@]}"; do
  remote="${RELEASE_REMOTES[$index]}"
  state="${remote_states[$index]}"
  if [ "$state" = "exact" ]; then
    printf '%s\n' "$remote already has $RELEASE_BRANCH and $tag"
    continue
  fi

  push_args=(--atomic)
  if [ "$dry_run" = true ]; then
    push_args+=(--dry-run)
  fi
  git -C "$REPO_ROOT" push "${push_args[@]}" "$remote" \
    "HEAD:refs/heads/$RELEASE_BRANCH" "refs/tags/$tag:refs/tags/$tag"
  if [ "$dry_run" = false ]; then
    verify_remote_refs "$remote" "$tag" "$head_commit" "$local_tag_object"
  fi
done

if [ "$dry_run" = true ]; then
  printf '%s\n' "Dry run complete; no refs or releases were changed"
  exit 0
fi

for repo_spec in "${repo_specs[@]}"; do
  "$SCRIPT_DIR/publish-release.sh" --yes "$tag" "$repo_spec" "$notes_file"
done

printf '%s\n' "Deployed $tag to ${RELEASE_REMOTES[*]}"
