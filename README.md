# SFRA Demo Site Generator

Generate an isolated, referentially-valid SFRA demo site archive under a token of your choosing, so several people can each run their own RefArch demo site on one shared B2C Commerce instance.

    ./generate --token alice
    # -> out/demo_data_sfra_alice.zip   sites RefArchalice + RefArchGlobalalice
    #    out/inventory_alice.xml        the inventory list, imported separately
    #    out/inventory_alice.zip        the same document, zipped for transport

Zero runtime dependencies. The OOTB demo data is vendored in this repo, so a clone is all you need – no network access and nothing to supply by hand.

## Why

**The OOTB SFRA import gives everyone the same site.** It always creates `RefArch` and `RefArchGlobal` with fixed resource ids, so a second person importing onto the same instance collides with the first. There is no supported way to pick different names.

**Ready-made SFRA demo data is only offered on sandboxes.** On Staging you supply the files yourself, and the usual workaround is a round trip: import the data on a sandbox, export it from there, then import that archive into Staging.

**Nothing here assumes what is already on the instance.** Every id is derived from your token alone, so the archive imports the same way onto a bare Staging instance as onto a sandbox that already has a RefArch site. That is the property that makes it safe to hand to someone else.

## What gets renamed, and what does not

Your token is appended to every **org-scoped** identifier, because those share one namespace instance-wide and would otherwise collide:

sites, catalogs, products, pricebooks, inventory lists, the shared library, the customer list, stores, jobs.

**Site-scoped** objects are deliberately left alone: coupons, campaigns, promotions, slots, customer groups, shipping and payment methods, search and sort rules, page-meta-tag rules. Each site owns its own namespace for these, so a second site's copy cannot collide with the first's. Categories and content assets are likewise untouched, because the catalog and library that contain them are renamed.

## Every archive is verified before it is written

A referentially-valid dataset is the whole point, so the generator refuses to produce an archive it cannot vouch for. After transforming, it walks the output and checks that every reference resolves – site preferences, store-to-inventory links, pricebook parents, promotion product references. If anything dangles it prints the offending ids, exits non-zero, and writes no zip.

This is not decorative. Doing this by hand is what motivated the tool: a hand-edited dataset silently shipped eleven stores pointing at inventory lists that did not exist, and nothing surfaced it until the storefront misbehaved. The verifier is regression-tested against that exact dataset.

## Cache settings are corrected

The OOTB data ships page caching **disabled on development** and **enabled on staging**, which is backwards for how the instances actually relate: Development and Production are copies of Staging, so Staging is the one you edit against and the one that wants caching off.

A cache-settings file always carries all three blocks, and every instance imports and stores all three of them. What differs is which block an instance actually **obeys**: only the one matching its own role has any effect. The other two sit there, editable and inert – you can change the production settings from a sandbox and they will save perfectly happily, they just will not do anything there.

So there is no way to ship "just the staging setting". The archive necessarily states a value for every environment, which makes the default deliberately conservative: **caching is enabled for production only.**

| Block | Default | Obeyed by |
|---|---|---|
| `development` | OFF | Development, **and sandboxes** |
| `staging` | OFF | Staging |
| `production` | ON | Production |

Opt an environment back in with `--cache`, which is repeatable:

    ./generate --token alice --cache stg          # staging on, sandboxes still off
    ./generate --token alice -c stg -c dev        # both on

**Why development is off by default.** A sandbox obeys the `development` block. Turning caching on there is rarely what you want while iterating, and it fails in a confusing way: template and content edits simply stop appearing. Since sandboxes are the most common target for a generated demo site, the default protects that case and Staging opts in explicitly.

Existing `<page-cache-partitions>` in the source are preserved untouched.

## Requirements

- Node.js 18+ (standard library only)
- `zip` on PATH
- `unzip` and `xmllint`, for the test suite only

## Options

| Flag | Effect |
|---|---|
| `-t, --token <t>` | Required. The isolation token, used exactly as supplied with case preserved. `[A-Za-z0-9_-]`, 19 chars max |
| `-c, --cache <env>` | Enable page caching for an environment. Repeatable. Accepts `production`, `staging`, `development` and the aliases `prd`, `stg`, `dev` |
| `-O, --only primary\|global` | Emit just one of the two sites instead of both |
| `-k, --keep-allocation-timestamps` | Retain `allocation-timestamp` in inventory records |
| `-o, --out <dir>` | Output directory (default `out`) |
| `-f, --force` | Regenerate over an existing output tree |
| `-h, --help` | Show usage |

Long options also accept an `=` joined value (`--token=alice`), and short flags bundle (`-kf`) and glue (`-talice`). `./generate --help` is self-contained, so the tool is usable without this README.

Exit codes: `0` success, `1` runtime failure (including a dangling reference that blocked archiving), `2` usage error.

The 19-character cap comes from the platform: `site-id` is limited to 32 characters and `RefArchGlobal` already uses 13.

## Importing

**1. The site archive.** Business Manager > Administration > Site Development > Site Import & Export, then upload and import `demo_data_sfra_<token>.zip`.

To script it instead, upload the zip to `Impex/src/instance/` over WebDAV and trigger the import job through the OCAPI Data API:

    PUT  /on/demandware.servlet/webdav/Sites/Impex/src/instance/demo_data_sfra_<token>.zip
    POST /s/-/dw/data/<version>/jobs/sfcc-site-archive-import/executions
         {"file_name": "demo_data_sfra_<token>.zip", "mode": "merge"}

Both accept an Account Manager access token as a plain `Authorization: Bearer` header; the client needs the `sfcc.jobs.rw` scope to run the job. Poll the returned execution for `execution_status`. A full archive takes several minutes.

**2. The inventory list,** separately: Merchant Tools > Product and Catalogs > Import & Export > Upload, then Import Inventory Lists. That screen takes a raw XML file, so upload `inventory_<token>.xml`. The `.zip` beside it wraps the same document for transport and is not a documented input to that screen.

**3. Afterwards,** assign the cartridge path for the new site or sites and run a search index rebuild. The archive includes disabled `RebuildURLs<Token>` and `Reindex<Token>` jobs you can run for the latter.

## Inventory list cleaning

Inventory records are cleaned as they are tokenized:

- `ats`, `on-order`, and `turnover` at the **record** level are always stripped, because the schema documents them as read-only and non-importable. The **header-level** `<on-order>` element is a different field – an importable boolean config flag – and is always preserved.
- `allocation-timestamp` is stripped by default; `--keep-allocation-timestamps` retains it.

## What passes through untouched

`active-data/*.csv`, `active-data-lite/*.csv`, `meta/*.xml`, `*.sample`, `urls/*`, `geolocations/*`, `version.txt`, the shared library's one `.css` asset, and every image are copied byte for byte.

One consequence is worth stating plainly. The active-data CSVs do carry product ids, in their `productID` column, and those are **not** renamed while the catalog's product ids are. The mismatch is intentional, but it means the imported Active Data never matches the tokenized catalog, so an activeData-driven sort rule (`most-popular`, `top-sellers`) has nothing to sort by and will not reorder results in the generated site.

## Refreshing the vendored data

The OOTB data lives under `src/` and its origin is recorded in PROVENANCE.md. Run `scripts/refresh-source.sh` to re-pull upstream, then review the diff and commit deliberately. The script needs `git` and `rsync` on PATH, and leaves the hand-maintained `src/cache-settings.xml` alone.

## Tests

    npm test

Unit tests per module, plus end-to-end tests that run the real pipeline over the full vendored dataset and assert on the result: site isolation, corrected cache settings, byte-identical passthrough files, well-formed output, and that a dangling reference produces no archive.
