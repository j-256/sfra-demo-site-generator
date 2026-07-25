#!/bin/bash
# Deliberately re-pull upstream SFRA demo data into src/. Review the diff before committing
set -euo pipefail

REPO="https://github.com/SalesforceCommerceCloud/storefrontdata.git"
TMP="$(mktemp -d)"
DEST="$(cd "$(dirname "$0")/.." && pwd)/src/demo_data_sfra"

echo "Cloning $REPO ..."
git clone --depth 1 "$REPO" "$TMP"

if [ ! -d "$TMP/demo_data_sfra" ]; then
  echo "ERROR: expected demo_data_sfra/ in upstream repo" >&2
  exit 1
fi

echo "Syncing into $DEST ..."
rsync -a --delete --exclude='.DS_Store' "$TMP/demo_data_sfra/" "$DEST/"
rm -rf "$TMP"
echo "Done. Review 'git diff' and note the new upstream version in PROVENANCE.md before committing."
echo "NOTE: this refreshes only the site-archive data. The corrected src/cache-settings.xml is"
echo "maintained by hand and is NOT overwritten."
