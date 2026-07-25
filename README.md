# SFRA Demo Data Generator

Generate an isolated, referentially-valid SFRA demo-data site-import archive under a chosen token, so multiple people can run independent RefArch demo sites on one shared B2C Commerce instance. Cache settings are corrected out of the box (development and production page-cache ON, staging OFF).

## Why

The OOTB SFRA import always creates the fixed `RefArch` / `RefArchGlobal` sites with fixed resource ids, so several people cannot each have their own isolated demo site on one shared instance. No ready-made SFRA demo data is offered on Staging (only on sandboxes), so the files have to be supplied by hand there – the usual workaround being to import the data on a sandbox, export it from there, then import that archive into Staging. This tool removes both problems at once: it appends your token to every identifier (sites, catalogs, products, pricebooks, inventory, library, customer list, stores) and hands you the resulting archive directly, so there is no sandbox round trip and no collision with anyone else's demo site.

## Requirements

- Node.js 18+ (uses only the standard library)
- `zip` on PATH
- `unzip` and `xmllint` (for the test suite)

## Usage

    node generate.mjs --token <token> [--only primary|global] [--keep-allocation-timestamps] [--out <dir>] [--force]

Examples:

    node generate.mjs --token alice
    # -> out/demo_data_sfra_Alice.zip  (sites RefArchAlice + RefArchGlobalAlice)
    #    out/inventory_Alice.xml        (upload this for the inventory list, see Import order below)
    #    out/inventory_Alice.zip        (the same document, zipped for convenience)

The token's first letter is auto-capitalized. Allowed: [A-Za-z0-9_-], max 19 characters.

## Import order

1. Import `demo_data_sfra_<token>.zip` via Business Manager > Administration > Site Development > Site Import & Export (or via WebDAV + the ImportSiteArchive job).
2. Import the inventory list separately via Business Manager > Merchant Tools > Product and Catalogs > Import & Export > Upload, then Import Inventory Lists. That documented Upload screen takes a raw XML file, so upload the sibling `inventory_<token>.xml` that sits next to the zip, not the zip itself. `inventory_<token>.zip` simply wraps that same document for convenience (e.g. transporting it as one compressed file); it is not a documented input to the Upload screen.
3. Assign the cartridge path for the new site(s) and run a search index rebuild.

## Inventory list cleaning

Inventory lists are cleaned as they are tokenized:

- The read-only record-level fields `ats`, `on-order`, and `turnover` are always stripped – the schema marks them non-importable. This is distinct from the header-level `<on-order>` element, which is an importable boolean config flag ("On Order Inventory") and is always preserved.
- `allocation-timestamp` is stripped by default. Pass `--keep-allocation-timestamps` to keep it.

## What it does NOT touch

`active-data/*.csv`, `active-data-lite/*.csv`, `meta/*.xml`, `*.sample`, `urls/*`, `geolocations/*`, `version.txt`, the one `.css` file under the shared library's static assets, and all images are copied verbatim – they carry no site-scoped IDs that need isolation.

## Refreshing the source data

The OOTB data is vendored under `src/` (see PROVENANCE.md). Run `scripts/refresh-source.sh` to re-pull upstream, then review and commit deliberately. The script needs `git` and `rsync` on PATH.
