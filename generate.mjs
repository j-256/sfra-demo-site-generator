#!/usr/bin/env node
// generate.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseOptions } from './lib/options.mjs';
import { harvestIds } from './lib/harvest.mjs';
import { buildRenameMap } from './lib/rename-map.mjs';
import { transformTree } from './lib/transform.mjs';
import { overlayCacheSettings, buildSettingsBlock } from './lib/cache-overlay.mjs';
import { zipDir, makeInventoryDoc } from './lib/archive.mjs';
import { verifyTree } from './lib/verify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'src', 'demo_data_sfra');
const CORRECTED_CACHE = join(here, 'src', 'cache-settings.xml');

export function run(argv) {
  const opts = parseOptions(argv);
  if (opts.help) return { ok: true, help: helpText() };
  const token = opts.token;
  const outRoot = opts.out;
  const innerName = `demo_data_sfra_${token}`;
  const outTree = join(outRoot, innerName);

  // NOTE this clears only the unzipped output TREE. The zip archives are handled by zipDir,
  // which unlinks an existing archive before writing - necessary because `zip -r` merges into a
  // pre-existing zip and would otherwise retain entries whose source files are gone
  if (existsSync(outTree)) {
    if (!opts.force) throw new Error(`${outTree} exists; pass --force to overwrite`);
    rmSync(outTree, { recursive: true });
  }
  mkdirSync(outRoot, { recursive: true });

  const ids = harvestIds(SRC);
  const rename = buildRenameMap(ids, token);
  transformTree(SRC, outTree, rename, { only: opts.only, keepAllocationTimestamps: opts.keepAllocationTimestamps });

  // overlay the requested cache settings into each emitted site, preserving its partitions
  const settings = buildSettingsBlock(opts.cacheEnvs);
  const sitesDir = join(outTree, 'sites');
  for (const site of readdirSync(sitesDir)) {
    const cs = join(sitesDir, site, 'cache-settings.xml');
    if (existsSync(cs)) writeFileSync(cs, overlayCacheSettings(readFileSync(cs, 'utf8'), settings));
  }

  // verify referential integrity BEFORE zipping
  const { ok, dangling } = verifyTree(outTree);
  if (!ok) {
    console.error(`verification FAILED: ${dangling.length} dangling reference(s):`);
    for (const d of dangling) console.error(`  ${d}`);
    process.exitCode = 1;
    return { ok: false, dangling };
  }

  // standalone inventory zip
  const invDoc = makeInventoryDoc(outTree);
  const invPath = join(outRoot, `inventory_${token}.xml`);
  writeFileSync(invPath, invDoc);

  // archives
  // zipDir resolves zipPath relative to dirname(dir) and runs zip with cwd=dirname(dir), so pass
  // BARE FILENAMES for zipPath. Passing join(outRoot, ...) would double the outRoot segment
  // (out/out/demo_data_sfra_J.zip)
  zipDir(outTree, `${innerName}.zip`, innerName);
  // for the inventory archive, pass the doc's own path as dir: dirname() then lands on outRoot,
  // so the zip is written there and innerName is the file sitting in that same directory
  zipDir(invPath, `inventory_${token}.zip`, `inventory_${token}.xml`);

  console.log(`Generated ${innerName}.zip and inventory_${token}.zip in ${outRoot}`);
  return { ok: true, outTree };
}

// Everything a caller needs to invoke this correctly lives here, so the tool is usable from the
// file alone without the README: the token's accepted shape, the --cache/--only legal values, and
// the sandbox-reads-development trap
export function helpText() {
  const s = process.stdout.isTTY ? '[4m' : '';
  const r = process.stdout.isTTY ? '[24m' : '';
  return `NAME
  generate.mjs - generate an isolated SFRA demo site archive for a chosen token

SYNOPSIS
  node generate.mjs --token <${s}token${r}> [${s}options${r}]

DESCRIPTION
  Produces a site-import archive in which every org-scoped identifier carries your
  token, so several people can each run their own RefArch demo site on one shared
  B2C Commerce instance. Sites, catalogs, products, pricebooks, inventory lists,
  the shared library, the customer list, stores and jobs are all renamed. Objects
  that live inside a site (coupons, promotions, slots, customer groups, shipping
  and payment methods, search and sort rules) are left alone, because each site
  already owns its own namespace for them.

  Every id is derived from the token alone, so nothing is assumed about what is
  already on the target instance. The archive is checked for dangling references
  before it is written; if any reference does not resolve, nothing is archived.

OPTIONS
  -t, --token <token>              Required. Isolation token appended to every
                                   org-scoped id exactly as supplied; case is
                                   preserved.
                                   Accepts [A-Za-z0-9_-], ${MAX_TOKEN_HELP} chars max
  -c, --cache <env>                Enable page caching for an environment.
                                   Repeatable. production is always enabled.
                                   Accepts: production, staging, development
                                   (aliases prd, stg, dev)
  -O, --only primary|global        Emit only one of the two sites
  -k, --keep-allocation-timestamps Retain allocation-timestamp in inventory
  -o, --out <dir>                  Output directory (default: out)
  -f, --force                      Regenerate over an existing output tree
  -h, --help                       Show this help message

EXIT STATUS
  0  Success
  1  Runtime failure, including a dangling reference that blocked archiving
  2  Usage error (missing or invalid argument)

EXAMPLES
  node generate.mjs --token alice
  node generate.mjs -t alice -c stg
  node generate.mjs -t bob --only primary --out /tmp/bob

CAVEATS
  Every instance stores all three cache blocks and obeys only the one matching
  its own role. A sandbox obeys the development block, so --cache development
  turns page caching on for sandboxes as well as Development. That is usually
  not wanted while iterating on a sandbox.

  Inventory imports separately from the site archive. Upload the generated
  inventory_<token>.xml through Merchant Tools > Product and Catalogs >
  Import & Export; the site archive goes through Administration > Site
  Development > Site Import & Export.`;
}

// kept in sync with lib/options.mjs's MAX_TOKEN by the help-parity test
const MAX_TOKEN_HELP = 19;

// CLI entry
if (process.argv[1] && process.argv[1].endsWith('generate.mjs')) {
  try {
    const r = run(process.argv.slice(2));
    if (r && r.help) {
      console.log(r.help);
      process.exit(0);
    }
  } catch (e) {
    console.error(String(e.message || e));
    // usage errors are 2 so a caller can distinguish them from a runtime failure
    process.exit(e.exitCode || 1);
  }
}
