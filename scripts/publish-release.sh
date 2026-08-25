#!/bin/bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/publish-release.sh [options] <tag> <host/owner/repo> <notes-file>

Create one hosted release or complete its missing asset uploads.

Arguments:
  <tag>                Version tag in vX.Y.Z form
  <host/owner/repo>    GitHub or GitHub Enterprise repository
  <notes-file>         Markdown release notes

Options:
  -y, --yes   Publish without an interactive confirmation
  -h, --help  Show this help message

Dependencies:
  git, gh, grep, and node

Exit status:
  0  Success
  1  Runtime or remote-state failure
  2  Usage or local-state error
  3  Missing dependency
EOF
}

usage_error() {
  printf '%s\n' "$1" >&2
  printf '%s\n' "Run 'scripts/publish-release.sh --help' for usage" >&2
  exit 2
}

missing_dependency() {
  printf '%s\n' "$1 is required to publish a release" >&2
  exit 3
}

precondition_error() {
  printf '%s\n' "$1" >&2
  exit 2
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

if [ "$#" -gt 0 ]; then
  _expand_short_opts "" "$@"
  set -- "${_EXPANDED[@]}"; unset _EXPANDED
fi

assume_yes=false
positionals=()
passthru=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    -y|--yes)
      if [ "$passthru" = true ]; then
        positionals+=("$1")
      else
        assume_yes=true
      fi
      shift
      ;;
    -h|--help)
      if [ "$passthru" = false ]; then
        usage
        exit 0
      fi
      positionals+=("$1")
      shift
      ;;
    --)
      passthru=true
      shift
      ;;
    -*)
      [ "$passthru" = true ] || usage_error "Unknown option: $1"
      positionals+=("$1")
      shift
      ;;
    *)
      positionals+=("$1")
      shift
      ;;
  esac
done

if [ "${#positionals[@]}" -ne 3 ]; then
  usage_error "Expected a tag, repository, and release notes file"
fi

tag="${positionals[0]}"
repo_spec="${positionals[1]}"
notes_file="${positionals[2]}"

host="${repo_spec%%/*}"
repo_remainder="${repo_spec#*/}"
owner="${repo_remainder%%/*}"
repo_name="${repo_remainder#*/}"
if [ -z "$host" ] || [ -z "$owner" ] || [ -z "$repo_name" ] || [ "$repo_name" != "${repo_name#*/}" ]; then
  usage_error "Repository must use host/owner/repo format"
fi

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT=""
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

for command_name in git gh grep node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    missing_dependency "$command_name"
  fi
done

if [ ! -f "$notes_file" ]; then
  precondition_error "Release notes file not found: $notes_file"
fi

package_version=""
package_version="$(node -p "require(process.argv[1]).version" "$REPO_ROOT/package.json")"
if [ "$tag" != "v$package_version" ]; then
  precondition_error "Release tag $tag does not match package version v$package_version"
fi

if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
  precondition_error "The worktree must be clean before publishing"
fi

head_commit=""
head_commit="$(git -C "$REPO_ROOT" rev-parse HEAD)"
tag_commit=""
tag_commit="$(git -C "$REPO_ROOT" rev-list -n 1 "$tag" 2>/dev/null || true)"
if [ -z "$tag_commit" ]; then
  precondition_error "Local tag not found: $tag"
fi
if [ "$tag_commit" != "$head_commit" ]; then
  precondition_error "Local tag $tag does not point to HEAD"
fi

release_dir="$REPO_ROOT/dist/releases/$tag"
assets=(
  "$release_dir/sfra-demo-site-generator-$tag-macos-arm64.tar.gz"
  "$release_dir/sfra-demo-site-generator-$tag-macos-x64.tar.gz"
  "$release_dir/sfra-demo-site-generator-$tag-linux-arm64.tar.gz"
  "$release_dir/sfra-demo-site-generator-$tag-linux-x64.tar.gz"
  "$release_dir/sfra-demo-site-generator-$tag-windows-x64.exe"
)
for asset in "${assets[@]}"; do
  if [ ! -f "$asset" ]; then
    precondition_error "Release artifact not found: $asset"
  fi
done

remote_tag_object=""
remote_tag_object="$(gh api --hostname "$host" "repos/$owner/$repo_name/git/ref/tags/$tag" --jq '.object.sha')"
local_tag_object=""
local_tag_object="$(git -C "$REPO_ROOT" rev-parse "$tag")"
if [ "$remote_tag_object" != "$local_tag_object" ]; then
  echo "Remote tag $tag does not match the local tag" >&2
  exit 1
fi

release_error=""
release_status=0
set +e
release_error="$(gh api --hostname "$host" "repos/$owner/$repo_name/releases/tags/$tag" --silent 2>&1)"
release_status=$?
set -e
release_exists=false
if [ "$release_status" -eq 0 ]; then
  release_exists=true
elif ! printf '%s\n' "$release_error" | grep -q 'HTTP 404'; then
  printf '%s\n' "$release_error" >&2
  exit "$release_status"
fi

if [ "$release_exists" = true ]; then
  draft=""
  draft="$(gh api --hostname "$host" "repos/$owner/$repo_name/releases/tags/$tag" --jq '.draft')"
  prerelease=""
  prerelease="$(gh api --hostname "$host" "repos/$owner/$repo_name/releases/tags/$tag" --jq '.prerelease')"
  if [ "$draft" != "false" ] || [ "$prerelease" != "false" ]; then
    echo "Existing release must be published and non-prerelease: $repo_spec $tag" >&2
    exit 1
  fi

  asset_names=""
  asset_names="$(gh api --hostname "$host" "repos/$owner/$repo_name/releases/tags/$tag" --jq '.assets[].name')"
  missing_assets=()
  for asset in "${assets[@]}"; do
    asset_name="${asset##*/}"
    if ! printf '%s\n' "$asset_names" | grep -Fqx -- "$asset_name"; then
      missing_assets+=("$asset")
    fi
  done
  if [ "${#missing_assets[@]}" -eq 0 ]; then
    echo "Release already complete: $repo_spec $tag"
    exit 0
  fi

  echo "Repository: $repo_spec"
  echo "Tag:        $tag"
  echo "Missing:    ${#missing_assets[@]} asset(s)"
  if [ "$assume_yes" = false ]; then
    printf 'Upload the missing release assets? [y/N] '
    reply=""
    read -r reply
    case "$reply" in
      y|Y|yes|YES) ;;
      *)
        echo "Release assets not uploaded"
        exit 1
        ;;
    esac
  fi
  gh release upload "$tag" "${missing_assets[@]}" --repo "$repo_spec"
  asset_names="$(gh api --hostname "$host" "repos/$owner/$repo_name/releases/tags/$tag" --jq '.assets[].name')"
  for asset in "${assets[@]}"; do
    asset_name="${asset##*/}"
    if ! printf '%s\n' "$asset_names" | grep -Fqx -- "$asset_name"; then
      echo "Release asset upload did not complete: $repo_spec $asset_name" >&2
      exit 1
    fi
  done
  echo "Completed release assets: $repo_spec $tag"
  exit 0
fi

echo "Repository: $repo_spec"
echo "Tag:        $tag"
echo "Notes:      $notes_file"
if [ "$assume_yes" = false ]; then
  printf 'Publish this release? [y/N] '
  reply=""
  read -r reply
  case "$reply" in
    y|Y|yes|YES) ;;
    *)
      echo "Release not published"
      exit 1
      ;;
  esac
fi

gh release create "$tag" "${assets[@]}" \
  --repo "$repo_spec" \
  --verify-tag \
  --notes-file "$notes_file"

asset_names="$(gh api --hostname "$host" "repos/$owner/$repo_name/releases/tags/$tag" --jq '.assets[].name')"
for asset in "${assets[@]}"; do
  asset_name="${asset##*/}"
  if ! printf '%s\n' "$asset_names" | grep -Fqx -- "$asset_name"; then
    echo "Release asset upload did not complete: $repo_spec $asset_name" >&2
    exit 1
  fi
done
