#!/bin/bash
set -euo pipefail

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT=""
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

binary_path="${1:-dist/sfra-demo-site-generator}"
case "$binary_path" in
  /*) ;;
  *) binary_path="$REPO_ROOT/$binary_path" ;;
esac

if [ ! -x "$binary_path" ]; then
  echo "Standalone executable not found or not executable: $binary_path" >&2
  exit 1
fi

for command_name in node cmp diff unzip; do
  if ! command -v "$command_name" >/dev/null 2>&1; then
    echo "$command_name is required to validate a standalone executable" >&2
    exit 1
  fi
done

node_bin=""
node_bin="$(command -v node)"
unzip_bin=""
unzip_bin="$(command -v unzip)"
work_dir=""
work_dir="$(mktemp -d "${TMPDIR:-/tmp}/sfra-standalone-validation.XXXXXX")"
trap 'rm -rf "$work_dir"' EXIT

"$node_bin" "$REPO_ROOT/generate.mjs" --help > "$work_dir/source-help.txt"
PATH=/path-that-does-not-exist "$binary_path" --help > "$work_dir/standalone-help.txt"
cmp "$work_dir/source-help.txt" "$work_dir/standalone-help.txt"

set +e
"$node_bin" "$REPO_ROOT/generate.mjs" > "$work_dir/source-missing.stdout" 2> "$work_dir/source-missing.stderr"
source_status=$?
PATH=/path-that-does-not-exist "$binary_path" > "$work_dir/standalone-missing.stdout" 2> "$work_dir/standalone-missing.stderr"
standalone_status=$?
set -e

if [ "$source_status" -ne 2 ] || [ "$standalone_status" -ne "$source_status" ]; then
  echo "Standalone usage-error exit status does not match the source CLI" >&2
  exit 1
fi
cmp "$work_dir/source-missing.stdout" "$work_dir/standalone-missing.stdout"
cmp "$work_dir/source-missing.stderr" "$work_dir/standalone-missing.stderr"

source_out="$work_dir/source"
standalone_out="$work_dir/standalone"
token="Standalone"
tree_name="demo_data_sfra_$token"

"$node_bin" "$REPO_ROOT/generate.mjs" --token "$token" --out "$source_out"
PATH=/path-that-does-not-exist "$binary_path" --token "$token" --out "$standalone_out"

diff -qr "$source_out/$tree_name" "$standalone_out/$tree_name"
cmp "$source_out/inventory_$token.xml" "$standalone_out/inventory_$token.xml"
"$unzip_bin" -tqq "$standalone_out/$tree_name.zip"
"$unzip_bin" -tqq "$standalone_out/inventory_$token.zip"

site_extract="$work_dir/site-extract"
inventory_extract="$work_dir/inventory-extract"
mkdir -p "$site_extract" "$inventory_extract"
"$unzip_bin" -qq "$standalone_out/$tree_name.zip" -d "$site_extract"
"$unzip_bin" -qq "$standalone_out/inventory_$token.zip" -d "$inventory_extract"
diff -qr "$standalone_out/$tree_name" "$site_extract/$tree_name"
cmp "$standalone_out/inventory_$token.xml" "$inventory_extract/inventory_$token.xml"

echo "Validated $binary_path"
