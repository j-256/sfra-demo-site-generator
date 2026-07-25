# SFRA Demo Data Generator

Generate an isolated, referentially-valid SFRA demo-data site-import archive under a chosen token, so multiple people can run independent RefArch demo sites on one shared B2C Commerce instance. Cache settings are corrected out of the box (development and production page-cache ON, staging OFF).

## Why

The OOTB SFRA import always creates the fixed `RefArch` / `RefArchGlobal` sites - no isolation on a shared instance, and no OOTB import path on Staging at all. This tool appends your token to every identifier (sites, catalogs, products, pricebooks, inventory, library, customer list, stores) so the generated dataset coexists with others without collision.

## Requirements

- Node.js 18+ (uses only the standard library)
- `zip` and `unzip` on PATH
- `xmllint` (for the test suite's well-formedness check)

## Usage

    node generate.mjs --token <token> [--only primary|global] [--keep-allocation-timestamps] [--out <dir>] [--force]

Examples:

    node generate.mjs --token alice
    # -> out/demo_data_sfra_Alice.zip  (sites RefArchAlice + RefArchGlobalAlice)
    #    out/inventory_Alice.zip        (import separately)

The token's first letter is auto-capitalized. Allowed: [A-Za-z0-9_-], max 19 characters.

## Import order

1. Import `demo_data_sfra_<token>.zip` via Business Manager > Administration > Site Development > Site Import & Export (or via WebDAV + the ImportSiteArchive job).
2. Import `inventory_<token>.zip` (inventory lists import cleanly on their own; the standalone zip is provided for that workflow).
3. Assign the cartridge path for the new site(s) and run a search index rebuild.

## Inventory list cleaning

Inventory lists are cleaned as they are tokenized:

- The read-only record-level fields `ats`, `on-order`, and `turnover` are always stripped - the schema marks them non-importable. This is distinct from the header-level `<on-order>` element, which is an importable boolean config flag ("On Order Inventory") and is always preserved.
- `allocation-timestamp` is stripped by default. Pass `--keep-allocation-timestamps` to keep it.

## What it does NOT touch

`active-data/*.csv`, `active-data-lite/*.csv`, `meta/*.xml`, `*.sample`, `urls/*`, `geolocations/*`, and all images are copied verbatim - they carry no site-scoped IDs that need isolation.

## Refreshing the source data

The OOTB data is vendored under `src/` (see PROVENANCE.md). Run `scripts/refresh-source.sh` to re-pull upstream, then review and commit deliberately.
