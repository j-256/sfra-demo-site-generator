// test/verify.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyTree } from '../lib/verify.mjs';
import { harvestIds } from '../lib/harvest.mjs';
import { buildRenameMap } from '../lib/rename-map.mjs';
import { transformTree } from '../lib/transform.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

// The real hand-built dataset that motivated this whole module: a human find/replaced a J token
// across a copy of demo_data_sfra and silently produced 11 broken store->inventory references
// Lives outside this repo (vendoring source only), so every test that touches it must stay
// green when the path is absent - guarded with existsSync + t.skip(), never a hard dependency
const REAL_BROKEN_CORPUS = '/dtop/realmdata/storefrontdata-j/demo_data_sfra_j';

function tree(files) {
  const dir = mkdtempSync(join(tmpdir(), 'verify-'));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(dir, rel);
    mkdirSync(join(abs, '..'), { recursive: true });
    writeFileSync(abs, content);
  }
  return dir;
}

test('passes when store inventory ref matches a defined list', () => {
  const dir = tree({
    'sites/RefArchJ/stores.xml': '<stores><store store-id="s1"><custom-attributes><custom-attribute attribute-id="inventoryListId">inv_store1J</custom-attribute></custom-attributes></store></stores>',
    'inventory-lists/inv_store1J.xml': '<inventory><inventory-list><header list-id="inv_store1J"></header></inventory-list></inventory>',
  });
  const r = verifyTree(dir);
  assert.equal(r.ok, true, JSON.stringify(r.dangling));
  rmSync(dir, { recursive: true });
});

test('FAILS with dangling ref (reproduces the manual J bug shape)', () => {
  const dir = tree({
    'sites/RefArchJ/stores.xml': '<stores><store store-id="s1"><custom-attributes><custom-attribute attribute-id="inventoryListId">inv_store1J</custom-attribute></custom-attributes></store></stores>',
    'inventory-lists/inv_store1.xml': '<inventory><inventory-list><header list-id="inv_store1"></header></inventory-list></inventory>',
  });
  const r = verifyTree(dir);
  assert.equal(r.ok, false);
  assert.ok(r.dangling.includes('inv_store1J'));
  rmSync(dir, { recursive: true });
});

test('scoping regression: a category <parent> pointing at an undefined id is not reported as dangling', () => {
  // catalog <category> elements reuse the SAME bare <parent> tag as a pricebook's parent link,
  // but for their own (out-of-scope) category hierarchy. "does-not-exist-anywhere" is
  // deliberately undefined anywhere in this tree: an UNSCOPED <parent> collector would add it to
  // referenced and report it dangling; the correct, header-scoped collector must never see it at
  // all, because it never occurs inside a pricebook <header pricebook-id="..."> block. Verified
  // (via a throwaway probe, not shipped here) that this exact case goes red against an unscoped
  // <parent> regex, and that the real vendored data hits this shape 174 of 179 times
  const dir = tree({
    'catalogs/apparel-m-catalog/catalog.xml': '<catalog catalog-id="apparel-m-catalog"><category category-id="mens"><parent>does-not-exist-anywhere</parent></category></catalog>',
  });
  const r = verifyTree(dir);
  assert.equal(r.ok, true, JSON.stringify(r.dangling));
  assert.ok(!r.dangling.includes('does-not-exist-anywhere'));
  rmSync(dir, { recursive: true });
});

test('a library folder <parent> pointing at an undefined id is not reported as dangling (same scoping regression, library shape)', () => {
  const dir = tree({
    'libraries/RefArchSharedLibrary/library.xml': '<library library-id="RefArchSharedLibrary"><folder folder-id="about-us"><parent>root-does-not-exist</parent></folder></library>',
  });
  const r = verifyTree(dir);
  assert.equal(r.ok, true, JSON.stringify(r.dangling));
  assert.ok(!r.dangling.includes('root-does-not-exist'));
  rmSync(dir, { recursive: true });
});

test('single-quoted definition plus a reference to it must yield ok:true (real vendored data mixes quote styles)', () => {
  // electronics-m-catalog/catalog.xml uses catalog-id='...' and product product-id='...' with
  // single quotes, which harvest.mjs and transform.mjs already handle via the same backreference
  // approach. A double-quote-only DEFINED collector here would miss this definition entirely and
  // report referentially-valid data as dangling - the exact cry-wolf failure mode this module
  // must never have, since a false alarm trains people to ignore the guard
  const dir = tree({
    'catalogs/c.xml': "<catalog catalog-id='single-quoted-cat'></catalog>",
    'sites/S/preferences.xml': '<preference preference-id="SiteCatalog">single-quoted-cat</preference>',
  });
  const r = verifyTree(dir);
  assert.equal(r.ok, true, JSON.stringify(r.dangling));
  rmSync(dir, { recursive: true });
});

test('real pipeline output (harvestIds -> buildRenameMap -> transformTree over src/demo_data_sfra) is referentially valid', () => {
  // THE positive case: run the tool's own generator end to end and prove its OWN output has
  // zero dangling references. This is what makes the verifier trustworthy as a release gate -
  // it must never cry wolf on data the generator produced correctly
  const srcDir = join(here, '..', 'src', 'demo_data_sfra');
  const outDir = mkdtempSync(join(tmpdir(), 'verify-pipeline-out-'));
  const rename = buildRenameMap(harvestIds(srcDir), 'J', null);
  transformTree(srcDir, outDir, rename, { only: null, keepAllocationTimestamps: false });

  const r = verifyTree(outDir);
  assert.equal(r.ok, true, JSON.stringify(r.dangling));
  assert.deepEqual(r.dangling, []);

  rmSync(outDir, { recursive: true });
});

test('real hand-built broken corpus: reports exactly the 11 known dangling store inventory refs', (t) => {
  if (!existsSync(REAL_BROKEN_CORPUS)) {
    t.skip(`real corpus not present at ${REAL_BROKEN_CORPUS}`);
    return;
  }
  // THE single most valuable test in the project: this real dataset is what motivated the whole
  // module. Its stores reference inventory lists named "inventory_mj_store_storeNj" (trailing j)
  // while the actual list headers are "inventory_mj_store_storeN" (no trailing j), for N = 1..11
  // Only german_store resolves. Assert the EXACT set, not just a subset match, so a scoping
  // regression that reintroduces phantom category/folder dangling ids cannot hide among them
  const r = verifyTree(REAL_BROKEN_CORPUS);
  assert.equal(r.ok, false);
  const expected = [
    'inventory_mj_store_store1j', 'inventory_mj_store_store2j', 'inventory_mj_store_store3j',
    'inventory_mj_store_store4j', 'inventory_mj_store_store5j', 'inventory_mj_store_store6j',
    'inventory_mj_store_store7j', 'inventory_mj_store_store8j', 'inventory_mj_store_store9j',
    'inventory_mj_store_store10j', 'inventory_mj_store_store11j',
  ];
  assert.deepEqual(r.dangling.slice().sort(), expected.slice().sort());
});
