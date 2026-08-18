# SFRA Demo Site Generator

Generate an isolated, referentially-valid SFRA demo site archive under a token of your choosing, so several people can each run their own RefArch demo site on one shared B2C Commerce instance.

    ./generate --token alice --cache dev
    # -> out/demo_data_sfra_alice.zip   sites RefArchalice + RefArchGlobalalice
    #    out/inventory_alice.xml        the inventory list, imported separately
    #    out/inventory_alice.zip        the same document, zipped for transport

The standalone release executable has zero runtime dependencies. The OOTB demo data is embedded in it, so generation needs no network access and nothing to supply by hand.

## Why

**The OOTB SFRA import gives everyone the same site.** It always creates `RefArch` and `RefArchGlobal` with fixed resource ids, so a second person importing onto the same instance collides with the first. There is no supported way to pick different names.

**Ready-made SFRA demo data is only offered on sandboxes.** On Staging you supply the files yourself, and the usual workaround is a round trip: import the data on a sandbox, export it from there, then import that archive into Staging.

**Nothing here assumes what is already on the instance.** Every id is derived from your token alone, so the archive imports the same way onto a bare Staging instance as onto a sandbox that already has a RefArch site. That is the property that makes it safe to hand to someone else.

## Standalone executable

Download the artifact for your platform from the repository's Releases page. The macOS and Linux archives each contain an executable named `sfra-demo-site-generator`; Windows is distributed as an executable directly.

| Platform | Artifact suffix |
|---|---|
| macOS on Apple silicon | `macos-arm64.tar.gz` |
| macOS on Intel | `macos-x64.tar.gz` |
| Linux on ARM64 | `linux-arm64.tar.gz` |
| Linux on x64 | `linux-x64.tar.gz` |
| Windows on x64 | `windows-x64.exe` |

On macOS, extract the download and run the executable:

    tar -xzf sfra-demo-site-generator-vX.Y.Z-macos-arm64.tar.gz
    ./sfra-demo-site-generator --token alice --cache dev

On Linux, use the matching archive name in the extraction command. On Windows, run the downloaded `.exe` directly.

The macOS executables are ad hoc signed, not Developer ID signed or notarized. If Gatekeeper blocks a browser-downloaded executable, open it once through Finder's Open context menu or remove its quarantine attribute with `xattr -d com.apple.quarantine sfra-demo-site-generator`.

To run from a source checkout instead, use `./generate --token alice --cache dev` as shown throughout this README.

## What gets renamed, and what does not

Your token is appended to every **org-scoped** identifier, because those share one namespace instance-wide and would otherwise collide:

- Sites
- Catalogs
- Products
- Pricebooks
- Inventory lists
- The shared library
- The customer list
- Stores
- Jobs

**Site-scoped** objects are deliberately left alone:

- Coupons
- Campaigns
- Promotions
- Slots
- Customer groups
- Shipping and payment methods
- Search and sort rules
- Page-meta-tag rules

Each site owns its own namespace for these, so a second site's copy cannot collide with the first's. Categories and content assets are likewise untouched, because the catalog and library that contain them are renamed.

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

    ./generate --token alice --cache dev          # development and sandboxes on, Staging still off
    ./generate --token alice -c dev -c stg        # development, sandboxes, and Staging on

**Why development is off by default.** A sandbox obeys the `development` block. Turning caching on there is rarely what you want while iterating, and it fails in a confusing way: template and content edits simply stop appearing. Since sandboxes are the most common target for a generated demo site, the default protects that case and Staging opts in explicitly.

Existing `<page-cache-partitions>` in the source are preserved untouched.

## Requirements

- Standalone release: no runtime dependencies
- Source checkout: Node.js 18+ using only the standard library
- Standalone builds: the Deno version pinned in `.deno-version` and `tar`
- Test suite: `unzip` and `xmllint`

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

Each generated site includes a comprehensive commented hostname-alias reference. Both starters are corrected strict informational supersets of the OOTB files: they retain the valid HTTP/HTTPS defaults, permanent hostname redirects, host-only pipeline-plus-params, and multiple user-agent-condition patterns while correcting the false instruction to remove comments before import. `RefArch` adds root ownership, job hostnames, duplicate-homepage canonicalization, query-safe redirects, and two landing-page patterns. `RefArchGlobal` adds shared-host locale paths, a dedicated international hostname, locale-specific domains and job hostnames, and retired locale-domain redirects. Every example hostname remains commented, so separately generated sites cannot collide. Comments and trailing commas are valid in the B2C Commerce alias format and survive site import and export.

The [B2C Commerce Hostname Aliases Cheat Sheet](ALIASES.md) explains the parser quirks, evaluation model, overloaded terminology, entry-point behavior, copyable ownership patterns, redirect limitations, and storefront verification matrix behind those examples.

## Inventory list cleaning

Inventory records are cleaned as they are tokenized:

- `ats`, `on-order`, and `turnover` at the **record** level are always stripped, because the schema documents them as read-only and non-importable. The **header-level** `<on-order>` element is a different field – an importable boolean config flag – and is always preserved.
- `allocation-timestamp` is stripped by default; `--keep-allocation-timestamps` retains it.

## What passes through untouched

The following are copied byte for byte:

- `active-data/*.csv`
- `active-data-lite/*.csv`
- `meta/*.xml`
- `*.sample`
- `urls/*`
- `geolocations/*`
- `version.txt`
- The shared library's one `.css` asset
- Every image

One consequence is worth stating plainly. The active-data CSVs do carry product ids, in their `productID` column, and those are **not** renamed while the catalog's product ids are. The mismatch is intentional, but it means the imported Active Data never matches the tokenized catalog, so an activeData-driven sort rule (`most-popular`, `top-sellers`) has nothing to sort by and will not reorder results in the generated site.

## Refreshing the vendored data

The OOTB data lives under `src/` and its origin is recorded in PROVENANCE.md. Run `scripts/refresh-source.sh` to re-pull upstream, then review the diff and commit deliberately. The script needs `git` and `rsync` on PATH, and leaves the hand-maintained `src/cache-settings.xml` and hostname-alias starters alone.

## Tests

    npm test

Unit tests per module, plus end-to-end tests that run the real pipeline over the full vendored dataset and assert on the result: site isolation, corrected cache settings, byte-identical passthrough files, well-formed output, and that a dangling reference produces no archive.

## Building and publishing a release

The preparation command runs the test suite, builds every supported target, packages macOS and Linux executables in archives that retain executable mode, and validates the extracted executable for the build host with `PATH` disabled. It writes the artifacts under `dist/releases/<tag>/`.

Set `package.json` to the release version, then run:

    TAG=vX.Y.Z
    REPOSITORY=host/owner/repository
    npm run release:prepare -- "$TAG"
    git tag -a "$TAG" -m "${TAG#v}"
    git push origin "$TAG"
    npm run release:publish -- "$TAG" "$REPOSITORY" /path/to/release-notes.md

The publisher requires a clean worktree, a local tag pointing to `HEAD`, the same tag on the named remote repository, all expected artifacts, and no existing release for that tag. It displays the repository, tag, and notes path and requires confirmation immediately before creating the release. It never creates or pushes a tag.
