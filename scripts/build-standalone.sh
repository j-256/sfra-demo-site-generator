#!/bin/bash
set -euo pipefail

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT=""
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

"$SCRIPT_DIR/check-deno-version.sh"

output_path="${1:-dist/sfra-demo-site-generator}"
case "$output_path" in
  /*) ;;
  *) output_path="$REPO_ROOT/$output_path" ;;
esac

mkdir -p "$(dirname "$output_path")"
rm -f "$output_path"

cd "$REPO_ROOT"
deno compile \
  --quiet \
  --no-config \
  --no-lock \
  --no-npm \
  --no-remote \
  --allow-read \
  --allow-write \
  --include src \
  --output "$output_path" \
  standalone.mjs

echo "Built $output_path"
