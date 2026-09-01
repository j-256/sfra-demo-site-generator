# Repository instructions

## Read first

Read `README.md` before changing generator behavior. Read `PROVENANCE.md` before refreshing vendored data, and read `ALIASES.md` before changing either maintained hostname-alias starter.

The product is an offline, self-contained generator. It creates import artifacts but does not connect to or mutate a Commerce instance.

## Preserve generation correctness

- Treat isolation and referential validity as the core contract. Every org-scoped identifier and every reference to it must use the same deterministic suffix mapping.
- Do not replace identifiers with a global text substitution. B2C Commerce XML reuses attribute and element names in different scopes; harvest, rename, transform, and verification logic must distinguish definitions, references, and unrelated site-scoped values.
- Keep site-scoped identifiers, category and library-folder relationships, and documented passthrough files unchanged. Byte-preserving paths must remain byte-identical even when a filename ends in `.xml`.
- Keep referential verification before archive creation. A dangling reference must fail the run and must not produce a new site archive.
- Preserve inventory-cleaning distinctions: record-level read-only fields are removed, header-level configuration remains, and allocation timestamps are controlled only by the documented option.
- Preserve the conservative cache model: all environment blocks are emitted, production caching remains enabled, development and staging are opt-in, and existing cache partitions survive the overlay.
- Keep `--force` scoped to the exact generated output tree. Do not broaden deletion to the output root or unrelated sibling artifacts.

## Vendored data and maintained overlays

- `src/demo_data_sfra/` is a reviewed vendored snapshot. Refresh it only through `scripts/refresh-source.sh` during an intentional upstream-data update; the script uses `rsync --delete`.
- After a refresh, inspect the complete diff, record the new upstream versions in `PROVENANCE.md`, and run the full suite over the vendored corpus.
- Preserve the hand-maintained `src/cache-settings.xml` and both `sites/*/urls/aliases` starters. The refresh workflow deliberately excludes them from replacement.
- Keep every example hostname in the alias starters commented so independently generated sites do not claim a shared literal hostname.
- Do not commit `out/`, `dist/`, generated archives, or temporary extraction trees.

## Source and standalone parity

- Keep `generate`, `generate.mjs`, and the compiled Deno entrypoint behaviorally equivalent, including help text, exit statuses, output layout, and archive contents.
- Preserve the standalone executable's offline contract: embedded source data, no runtime package install, no remote imports, and only the filesystem permissions required to read inputs and write outputs.
- Use the Deno version pinned in `.deno-version`. Validate a changed standalone executable with `npm run standalone:validate`, which compares it with the Node source CLI while `PATH` is unavailable to the executable.

## Verification and release boundaries

- Run a focused `node --test test/<file>.test.mjs` target while iterating, then run `npm test`. Generator or vendored-data changes require the full end-to-end corpus tests.
- Add regression coverage for both sides of a transformation rule: the intended identifier or reference changes, while a structurally similar site-scoped or passthrough value remains unchanged.
- Build and validate standalone artifacts when changing entrypoints, filesystem use, archive behavior, embedded data, or runtime compatibility.
- Treat `npm version` as a publishing operation, not a local version edit: its hooks test, build, tag, push remote refs, and create hosted releases. Do not run it without explicit release and push authorization.
- `npm run release:deploy` and `npm run release:publish` also mutate remote state. Use the guarded release workflow rather than manually changing versions, tags, or hosted assets.
