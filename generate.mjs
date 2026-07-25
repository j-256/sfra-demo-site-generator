#!/usr/bin/env node
// generate.mjs
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { existsSync, rmSync, mkdirSync, readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { parseOptions } from './lib/options.mjs';
import { harvestIds } from './lib/harvest.mjs';
import { buildRenameMap } from './lib/rename-map.mjs';
import { transformTree } from './lib/transform.mjs';
import { overlayCacheSettings } from './lib/cache-overlay.mjs';
import { zipDir, makeInventoryDoc } from './lib/archive.mjs';
import { verifyTree } from './lib/verify.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const SRC = join(here, 'src', 'demo_data_sfra');
const CORRECTED_CACHE = join(here, 'src', 'cache-settings.xml');

export function run(argv) {
  const opts = parseOptions(argv);
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
  const rename = buildRenameMap(ids, token, opts.only);
  transformTree(SRC, outTree, rename, { only: opts.only, keepAllocationTimestamps: opts.keepAllocationTimestamps });

  // overlay corrected cache settings into each emitted site
  const corrected = readFileSync(CORRECTED_CACHE, 'utf8');
  const sitesDir = join(outTree, 'sites');
  for (const site of readdirSync(sitesDir)) {
    const cs = join(sitesDir, site, 'cache-settings.xml');
    if (existsSync(cs)) writeFileSync(cs, overlayCacheSettings(readFileSync(cs, 'utf8'), corrected));
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

// CLI entry
if (process.argv[1] && process.argv[1].endsWith('generate.mjs')) {
  try {
    run(process.argv.slice(2));
  } catch (e) {
    console.error(String(e.message || e));
    process.exit(1);
  }
}
