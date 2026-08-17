#!/bin/bash
set -euo pipefail

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT=""
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

"$SCRIPT_DIR/check-deno-version.sh"

if ! command -v tar >/dev/null 2>&1; then
  echo "tar is required to build release archives" >&2
  exit 1
fi

package_version=""
package_version="$(node -p "require(process.argv[1]).version" "$REPO_ROOT/package.json")"
tag="${1:-v$package_version}"
if [ "$tag" != "v$package_version" ]; then
  echo "Release tag $tag does not match package version v$package_version" >&2
  exit 1
fi

release_dir="$REPO_ROOT/dist/releases/$tag"
build_dir="$release_dir/.build"
rm -rf "$release_dir"
mkdir -p "$release_dir" "$build_dir"
trap 'rm -rf "$build_dir"' EXIT

executable_name="sfra-demo-site-generator"

targets=(
  "aarch64-apple-darwin"
  "x86_64-apple-darwin"
  "aarch64-unknown-linux-gnu"
  "x86_64-unknown-linux-gnu"
  "x86_64-pc-windows-msvc"
)
platforms=(
  "macos-arm64"
  "macos-x64"
  "linux-arm64"
  "linux-x64"
  "windows-x64"
)
extensions=("" "" "" "" ".exe")

cd "$REPO_ROOT"
for index in "${!targets[@]}"; do
  platform="${platforms[$index]}"
  output_path="$build_dir/$platform${extensions[$index]}"
  echo "Building ${platforms[$index]}"
  deno compile \
    --quiet \
    --no-config \
    --no-lock \
    --no-npm \
    --no-remote \
    --allow-read \
    --allow-write \
    --include src \
    --target "${targets[$index]}" \
    --output "$output_path" \
    standalone.mjs

  if [ "$platform" = "windows-x64" ]; then
    cp "$output_path" "$release_dir/$executable_name-$tag-$platform.exe"
    continue
  fi

  package_dir="$build_dir/package-$platform"
  archive_path="$release_dir/$executable_name-$tag-$platform.tar.gz"
  extracted_dir="$build_dir/extracted-$platform"
  mkdir -p "$package_dir" "$extracted_dir"
  cp "$output_path" "$package_dir/$executable_name"
  chmod 755 "$package_dir/$executable_name"
  COPYFILE_DISABLE=1 tar -czf "$archive_path" -C "$package_dir" "$executable_name"

  archive_entries=""
  archive_entries="$(tar -tzf "$archive_path")"
  if [ "$archive_entries" != "$executable_name" ]; then
    echo "Release archive contains unexpected entries: $archive_path" >&2
    exit 1
  fi
  tar -xzf "$archive_path" -C "$extracted_dir"
  if [ ! -x "$extracted_dir/$executable_name" ]; then
    echo "Release archive did not preserve executable mode: $archive_path" >&2
    exit 1
  fi
done

kernel=""
kernel="$(uname -s)"
architecture=""
architecture="$(uname -m)"
case "$kernel:$architecture" in
  Darwin:arm64) host_platform="macos-arm64" ;;
  Darwin:x86_64) host_platform="macos-x64" ;;
  Linux:aarch64|Linux:arm64) host_platform="linux-arm64" ;;
  Linux:x86_64) host_platform="linux-x64" ;;
  MINGW*:x86_64|MSYS*:x86_64) host_platform="windows-x64" ;;
  *)
    echo "Unsupported release-validation host: $kernel $architecture" >&2
    exit 1
    ;;
esac

host_binary="$build_dir/extracted-$host_platform/$executable_name"
if [ "$host_platform" = "windows-x64" ]; then
  host_binary="$release_dir/$executable_name-$tag-$host_platform.exe"
fi
"$SCRIPT_DIR/validate-standalone.sh" "$host_binary"

echo "Release artifacts are ready in $release_dir"
