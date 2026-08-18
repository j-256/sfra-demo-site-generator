#!/bin/bash
# Deliberately re-pull upstream SFRA demo data into src/ and preserve maintained overlays
set -euo pipefail

REPO="https://github.com/SalesforceCommerceCloud/storefrontdata.git"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
DEST="$(cd "$(dirname "$0")/.." && pwd)/src/demo_data_sfra"

echo "Cloning $REPO ..."
git clone --depth 1 "$REPO" "$TMP"

if [ ! -d "$TMP/demo_data_sfra" ]; then
  echo "ERROR: expected demo_data_sfra/ in upstream repo" >&2
  exit 1
fi

echo "Syncing into $DEST ..."
rsync -a --delete \
  --exclude='.DS_Store' \
  --exclude='sites/RefArch/urls/aliases' \
  --exclude='sites/RefArchGlobal/urls/aliases' \
  "$TMP/demo_data_sfra/" "$DEST/"
echo "Done. Review 'git diff' and note the new upstream version in PROVENANCE.md before committing."
echo "NOTE: the corrected src/cache-settings.xml and site alias starters are maintained by hand"
echo "and are NOT overwritten."
