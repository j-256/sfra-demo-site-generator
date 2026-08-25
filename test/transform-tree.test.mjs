// test/transform-tree.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformTree } from '../lib/transform.mjs';
import { buildRenameMap } from '../lib/rename-map.mjs';
import { harvestIds } from '../lib/harvest.mjs';
import { mkdtempSync, readFileSync, existsSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// One fixture tree exercising every routing case: a catalog (dir rename + xml transform,
// category-id untouched), both sites (dir rename, site.xml <name> follows), the shared library
// (dir rename, library-id suffixed, page-title prose rebranded), a site's own PRIVATE nested
// library (its "library" directory segment is not a mapped id and must not be renamed, unlike
// the shared library's directory), a pricebook and an inventory FILE (both renamed, inventory
// additionally cleaned), and every category of byte-identical passthrough (csv, meta xml,
// geolocation xml, urls/*, a .sample file, and a non-xml "image")
function setupSrc() {
  const dir = mkdtempSync(join(tmpdir(), 'sfra-src-'));

  mkdirSync(join(dir, 'catalogs/apparel-m-catalog/static/default/images'), { recursive: true });
  writeFileSync(join(dir, 'catalogs/apparel-m-catalog/catalog.xml'),
    '<catalog catalog-id="apparel-m-catalog"><product product-id="008884303989M"/><category category-id="womens"/></catalog>');
  // a non-xml "image": arbitrary bytes, including a byte sequence that is not valid UTF-8, to
  // prove the copy is byte-for-byte rather than a text round-trip that happens to look the same
  writeFileSync(join(dir, 'catalogs/apparel-m-catalog/static/default/images/swatch.jpg'),
    Buffer.from([0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0xfe, 0xfd]));

  mkdirSync(join(dir, 'sites/RefArch/active-data'), { recursive: true });
  mkdirSync(join(dir, 'sites/RefArch/active-data-lite'), { recursive: true });
  mkdirSync(join(dir, 'sites/RefArch/urls'), { recursive: true });
  mkdirSync(join(dir, 'sites/RefArch/ocapi-settings'), { recursive: true });
  writeFileSync(join(dir, 'sites/RefArch/site.xml'),
    '<site site-id="RefArch"><name>RefArch</name></site>');
  writeFileSync(join(dir, 'sites/RefArch/active-data/product-Sites-RefArch.csv'),
    'productID\n008884303989M\n'); // must remain byte-identical
  // active-data-lite is a SEPARATE real directory from active-data (not a typo, not a subset);
  // the real tree also has 2 CSVs here. This file is deliberately XML (not .csv), so it is
  // untouched ONLY by the directory rule, never by the "csv/sample extension" rule - proving the
  // directory match itself covers "active-data" PREFIXED names, not just the exact segment
  writeFileSync(join(dir, 'sites/RefArch/active-data-lite/customer-Sites-RefArch.xml'),
    '<customer-export catalog-id="apparel-m-catalog"/>'); // must remain byte-identical
  writeFileSync(join(dir, 'sites/RefArch/urls/aliases'),
    '/mens\tp,,,Search-Show,,cgid,mens\n'); // must remain byte-identical (not xml at all)
  writeFileSync(join(dir, 'sites/RefArch/ocapi-settings/wapi_data_config.sample'),
    '{\n  "_v":"15.4"\n}\n'); // must remain byte-identical

  mkdirSync(join(dir, 'sites/RefArchGlobal/library'), { recursive: true });
  writeFileSync(join(dir, 'sites/RefArchGlobal/site.xml'),
    '<site site-id="RefArchGlobal"><name>RefArchGlobal</name></site>');
  // a site's OWN private library: no library-id attribute, directory literally named "library"
  // (not a harvested id) - must NOT be path-renamed, unlike libraries/RefArchSharedLibrary
  writeFileSync(join(dir, 'sites/RefArchGlobal/library/library.xml'),
    '<library><folder folder-id="root"><online-flag>true</online-flag></folder></library>');

  mkdirSync(join(dir, 'libraries/RefArchSharedLibrary'), { recursive: true });
  writeFileSync(join(dir, 'libraries/RefArchSharedLibrary/library.xml'),
    '<library library-id="RefArchSharedLibrary"><folder folder-id="root">'
    + '<online-flag site-id="RefArch">true</online-flag>'
    + '<page-title>RefArch Online Store</page-title></folder></library>');

  mkdirSync(join(dir, 'pricebooks'), { recursive: true });
  writeFileSync(join(dir, 'pricebooks/usd-m-list-prices.xml'),
    '<pricebooks><pricebook><header pricebook-id="usd-m-list-prices"><currency>USD</currency></header>'
    + '<price-tables><price-table product-id="008884303989M"><amount quantity="1">75.00</amount>'
    + '</price-table></price-tables></pricebook></pricebooks>');

  mkdirSync(join(dir, 'inventory-lists'), { recursive: true });
  writeFileSync(join(dir, 'inventory-lists/inventory_m_store_store1.xml'),
    '<inventory><inventory-list><header list-id="inventory_m_store_store1"><on-order>false</on-order></header>'
    + '<records><record product-id="008884303989M"><allocation>5</allocation><ats>5</ats>'
    + '<on-order>0</on-order><turnover>0</turnover>'
    + '<allocation-timestamp>2023-01-01T00:00:00.000Z</allocation-timestamp></record></records>'
    + '</inventory-list></inventory>');

  mkdirSync(join(dir, 'meta'), { recursive: true });
  writeFileSync(join(dir, 'meta/system-objecttype-extensions.xml'),
    '<metadata><default-value>usd-m-list-prices</default-value></metadata>'); // untouched

  mkdirSync(join(dir, 'geolocations'), { recursive: true });
  writeFileSync(join(dir, 'geolocations/us.xml'),
    '<geolocations country-code="US"><geolocation postal-code="00000"/></geolocations>'); // untouched despite .xml

  return dir;
}

function run(src, out, suffix, only, keepAllocationTimestamps = false) {
  const rename = buildRenameMap(harvestIds(src), suffix);
  transformTree(src, out, rename, { only, keepAllocationTimestamps });
  return rename;
}

test('renames catalog dir, transforms xml, category-id untouched', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  assert.ok(existsSync(join(out, 'catalogs/apparel-m-catalogJ/catalog.xml')));
  const cat = readFileSync(join(out, 'catalogs/apparel-m-catalogJ/catalog.xml'), 'utf8');
  assert.match(cat, /catalog-id="apparel-m-catalogJ"/);
  assert.match(cat, /product-id="008884303989MJ"/);
  assert.match(cat, /category-id="womens"/); // untouched

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('site dir renamed, name element follows resolved site id', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  const site = readFileSync(join(out, 'sites/RefArchJ/site.xml'), 'utf8');
  assert.match(site, /site-id="RefArchJ"/);
  assert.match(site, /<name>RefArchJ<\/name>/);

  const global = readFileSync(join(out, 'sites/RefArchGlobalJ/site.xml'), 'utf8');
  assert.match(global, /site-id="RefArchGlobalJ"/);
  assert.match(global, /<name>RefArchGlobalJ<\/name>/);

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('active-data csv is byte-identical despite containing a harvested id', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  const csv = readFileSync(join(out, 'sites/RefArchJ/active-data/product-Sites-RefArch.csv'), 'utf8');
  assert.equal(csv, 'productID\n008884303989M\n');

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('active-data-lite is untouched too, including a non-csv xml file inside it', () => {
  // regression: active-data-lite is a real, separate directory (not covered by an EXACT
  // segment-equals-"active-data" check). Using an .xml file here (rather than a .csv) isolates
  // the directory rule from the csv/sample extension rule - this file has no other reason to
  // survive untouched, so it only proves the fix if the directory match itself is prefix-aware
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  const xml = readFileSync(join(out, 'sites/RefArchJ/active-data-lite/customer-Sites-RefArch.xml'), 'utf8');
  assert.equal(xml, '<customer-export catalog-id="apparel-m-catalog"/>');

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('meta xml is byte-identical despite containing a mapped-looking substring', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  const meta = readFileSync(join(out, 'meta/system-objecttype-extensions.xml'), 'utf8');
  assert.equal(meta, '<metadata><default-value>usd-m-list-prices</default-value></metadata>');

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('renames pricebook file and transforms its header pricebook-id and price-table product-id', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  assert.ok(existsSync(join(out, 'pricebooks/usd-m-list-pricesJ.xml')));
  assert.ok(!existsSync(join(out, 'pricebooks/usd-m-list-prices.xml')));
  const pb = readFileSync(join(out, 'pricebooks/usd-m-list-pricesJ.xml'), 'utf8');
  assert.match(pb, /pricebook-id="usd-m-list-pricesJ"/);
  assert.match(pb, /product-id="008884303989MJ"/);

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('renames inventory file, transforms list-id and product-id, and strips read-only fields via cleanInventoryXml', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null); // keepAllocationTimestamps defaults to false

  assert.ok(existsSync(join(out, 'inventory-lists/inventory_m_store_store1J.xml')));
  const inv = readFileSync(join(out, 'inventory-lists/inventory_m_store_store1J.xml'), 'utf8');
  assert.match(inv, /list-id="inventory_m_store_store1J"/);
  assert.match(inv, /product-id="008884303989MJ"/);
  assert.match(inv, /<on-order>false<\/on-order>/, 'header config flag survives');
  assert.doesNotMatch(inv, /<ats>/);
  assert.doesNotMatch(inv, /<on-order>0<\/on-order>/, 'record read-only field stripped');
  assert.doesNotMatch(inv, /<turnover>/);
  assert.doesNotMatch(inv, /<allocation-timestamp>/, 'stripped by default');
  assert.match(inv, /<allocation>5<\/allocation>/, 'importable record field survives');

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('opts.keepAllocationTimestamps threads through transformTree to cleanInventoryXml', () => {
  // regression: every other test in this file hardcodes keepAllocationTimestamps to false (via
  // run()'s default), so nothing previously exercised the true branch through the FULL
  // transformTree path (as opposed to calling cleanInventoryXml directly, which Task 6 already
  // covers). This proves opts is passed through transformTree -> writeTransformedFile unchanged
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null, true);

  const inv = readFileSync(join(out, 'inventory-lists/inventory_m_store_store1J.xml'), 'utf8');
  assert.match(inv, /<allocation-timestamp>2023-01-01T00:00:00\.000Z<\/allocation-timestamp>/,
    'survives when keepAllocationTimestamps is true');
  // the always-stripped read-only fields must still be gone regardless of this flag
  assert.doesNotMatch(inv, /<ats>/);
  assert.doesNotMatch(inv, /<on-order>0<\/on-order>/);
  assert.doesNotMatch(inv, /<turnover>/);

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('shared library dir and file renamed, library-id suffixed, page-title prose rebranded', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  assert.ok(existsSync(join(out, 'libraries/RefArchSharedLibraryJ/library.xml')));
  const lib = readFileSync(join(out, 'libraries/RefArchSharedLibraryJ/library.xml'), 'utf8');
  assert.match(lib, /library-id="RefArchSharedLibraryJ"/);
  assert.match(lib, /<online-flag site-id="RefArchJ">/);
  assert.match(lib, /<page-title>RefArchJ Online Store<\/page-title>/);

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('a site private library keeps its "library" directory name unrenamed (not a harvested id)', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  assert.ok(existsSync(join(out, 'sites/RefArchGlobalJ/library/library.xml')), 'inner dir stays "library"');
  assert.ok(!existsSync(join(out, 'sites/RefArchGlobalJ/libraryJ')), 'must not have been renamed');
  const lib = readFileSync(join(out, 'sites/RefArchGlobalJ/library/library.xml'), 'utf8');
  assert.equal(lib, '<library><folder folder-id="root"><online-flag>true</online-flag></folder></library>',
    'no library-id and no site-id here, so content is unchanged even though it is routed through rebrand');

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('urls/aliases and a .sample file are byte-identical passthrough (not xml at all)', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  const aliases = readFileSync(join(out, 'sites/RefArchJ/urls/aliases'), 'utf8');
  assert.equal(aliases, '/mens\tp,,,Search-Show,,cgid,mens\n');

  const sample = readFileSync(join(out, 'sites/RefArchJ/ocapi-settings/wapi_data_config.sample'), 'utf8');
  assert.equal(sample, '{\n  "_v":"15.4"\n}\n');

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('geolocations xml is byte-identical passthrough despite the .xml extension', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  const geo = readFileSync(join(out, 'geolocations/us.xml'), 'utf8');
  assert.equal(geo, '<geolocations country-code="US"><geolocation postal-code="00000"/></geolocations>');

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('a non-xml "image" file is copied byte-identical regardless of content', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', null);

  const outPath = join(out, 'catalogs/apparel-m-catalogJ/static/default/images/swatch.jpg');
  assert.ok(existsSync(outPath));
  const bytes = readFileSync(outPath);
  assert.deepEqual([...bytes], [0xff, 0xd8, 0xff, 0x00, 0x01, 0x02, 0xfe, 0xfd]);

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('--only primary omits global site dir entirely', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', 'primary');

  assert.ok(existsSync(join(out, 'sites/RefArchJ')));
  assert.ok(!existsSync(join(out, 'sites/RefArchGlobalJ')), 'global omitted');

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});

test('--only global omits primary site dir entirely', () => {
  const src = setupSrc();
  const out = mkdtempSync(join(tmpdir(), 'sfra-out-'));
  run(src, out, 'J', 'global');

  assert.ok(existsSync(join(out, 'sites/RefArchGlobalJ')));
  assert.ok(!existsSync(join(out, 'sites/RefArchJ')), 'primary omitted');

  rmSync(src, { recursive: true });
  rmSync(out, { recursive: true });
});
