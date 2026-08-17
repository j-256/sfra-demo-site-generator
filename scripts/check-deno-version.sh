#!/bin/bash
set -euo pipefail

SCRIPT_DIR=""
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
REPO_ROOT=""
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
VERSION_FILE="$REPO_ROOT/.deno-version"

if ! command -v deno >/dev/null 2>&1; then
  echo "Deno is required to build standalone executables" >&2
  exit 1
fi

required_version=""
required_version="$(sed -n '1p' "$VERSION_FILE")"
version_line=""
version_line="$(deno --version | sed -n '1p')"
actual_version=""
actual_version="${version_line#deno }"
actual_version="${actual_version%% *}"

if [ "$actual_version" != "$required_version" ]; then
  echo "Deno $required_version is required, found $actual_version" >&2
  exit 1
fi

echo "Deno $actual_version"
