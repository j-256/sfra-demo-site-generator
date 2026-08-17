#!/bin/bash
set -euo pipefail

usage() {
  echo "Usage: $0 <tag> <host/owner/repo> <notes-file>" >&2
  exit 2
}

if [ "$#" -ne 3 ]; then
  usage
fi

tag="$1"
repo_spec="$2"
notes_file="$3"

host="${repo_spec%%/*}"
repo_remainder="${repo_spec#*/}"
owner="${repo_remainder%%/*}"
repo_name="${repo_remainder#*/}"
if [ -z "$host" ] || [ -z "$owner" ] || [ -z "$repo_name" ] || [ "$repo_name" != "${repo_name#*/}" ]; then
  usage
fi

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT=""
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

for command_name in git gh grep node; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required to publish a release" >&2
    exit 1
  fi
done

if [ ! -f "$notes_file" ]; then
  echo "Release notes file not found: $notes_file" >&2
  exit 1
fi

package_version=""
package_version="$(node -p "require(process.argv[1]).version" "$REPO_ROOT/package.json")"
if [ "$tag" != "v$package_version" ]; then
  echo "Release tag $tag does not match package version v$package_version" >&2
  exit 1
fi

if [ -n "$(git -C "$REPO_ROOT" status --porcelain)" ]; then
  echo "The worktree must be clean before publishing" >&2
  exit 1
fi

head_commit=""
head_commit="$(git -C "$REPO_ROOT" rev-parse HEAD)"
tag_commit=""
tag_commit="$(git -C "$REPO_ROOT" rev-list -n 1 "$tag" 2>/dev/null || true)"
if [ -z "$tag_commit" ]; then
  echo "Local tag not found: $tag" >&2
  exit 1
fi
if [ "$tag_commit" != "$head_commit" ]; then
  echo "Local tag $tag does not point to HEAD" >&2
  exit 1
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
    echo "Release artifact not found: $asset" >&2
    exit 1
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
if [ "$release_status" -eq 0 ]; then
  echo "Release already exists: $repo_spec $tag" >&2
  exit 1
fi
if ! printf '%s\n' "$release_error" | grep -q 'HTTP 404'; then
  printf '%s\n' "$release_error" >&2
  exit "$release_status"
fi

echo "Repository: $repo_spec"
echo "Tag:        $tag"
echo "Notes:      $notes_file"
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

gh release create "$tag" "${assets[@]}" \
  --repo "$repo_spec" \
  --verify-tag \
  --notes-file "$notes_file"
