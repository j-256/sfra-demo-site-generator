// test/archive.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { zipDir, makeInventoryDoc } from '../lib/archive.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';

test('zipDir produces a zip containing the inner folder', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-'));
  const tree = join(work, 'demo_data_sfra_J');
  mkdirSync(join(tree, 'sites'), { recursive: true });
  writeFileSync(join(tree, 'sites/x.xml'), '<x/>');
  const zip = join(work, 'demo_data_sfra_J.zip');
  zipDir(tree, zip, 'demo_data_sfra_J');
  assert.ok(existsSync(zip));
  const listing = execFileSync('unzip', ['-l', zip], { encoding: 'utf8' });
  assert.match(listing, /demo_data_sfra_J\/sites\/x\.xml/);
  rmSync(work, { recursive: true });
});

// A relative zipPath resolves against dirname(dir), not the process cwd
test('zipDir resolves a relative zipPath against dirname(dir), not the process cwd', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-relzip-'));
  const tree = join(work, 'demo_data_sfra_J');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'f.xml'), '<f/>');
  const originalCwd = process.cwd();
  try {
    process.chdir(tmpdir()); // Keep the process cwd different from dirname(tree)
    const relZip = 'demo_data_sfra_J.zip';
    zipDir(tree, relZip, 'demo_data_sfra_J');
    const expected = join(dirname(tree), relZip);
    assert.ok(existsSync(expected), `expected zip at ${expected} (dirname(dir)-relative)`);
    assert.ok(!existsSync(join(process.cwd(), relZip)), 'must not have landed relative to process cwd instead');
    const listing = execFileSync('unzip', ['-l', expected], { encoding: 'utf8' });
    assert.match(listing, /demo_data_sfra_J\/f\.xml/);
  } finally {
    process.chdir(originalCwd);
  }
  rmSync(work, { recursive: true });
});

test('zipDir re-run at the same zipPath does not retain a since-deleted source file (no stale merge)', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-stale-'));
  const tree = join(work, 'demo_data_sfra_J');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'stale-file.xml'), '<stale/>');
  writeFileSync(join(tree, 'keep-file.xml'), '<keep>old</keep>');
  const zip = join(work, 'demo_data_sfra_J.zip');
  zipDir(tree, zip, 'demo_data_sfra_J');

  unlinkSync(join(tree, 'stale-file.xml'));
  writeFileSync(join(tree, 'keep-file.xml'), '<keep>new</keep>');
  writeFileSync(join(tree, 'new-file.xml'), '<added/>');
  zipDir(tree, zip, 'demo_data_sfra_J');

  const listing = execFileSync('unzip', ['-l', zip], { encoding: 'utf8' });
  assert.doesNotMatch(listing, /stale-file\.xml/, 'deleted source file must not survive a re-zip to the same path');
  assert.match(listing, /keep-file\.xml/);
  assert.match(listing, /new-file\.xml/);

  rmSync(work, { recursive: true });
});

test('zipDir handles a dash-leading innerName', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-dash-'));
  const tree = join(work, '-x');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'f.xml'), '<f/>');
  const zip = join(work, 'dash-inner.zip');
  zipDir(tree, zip, '-x');
  const listing = execFileSync('unzip', ['-l', zip], { encoding: 'utf8' });
  assert.match(listing, /-x\/f\.xml/);
  rmSync(work, { recursive: true });
});

test('zipDir handles a dash-leading relative zipPath', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-dashzip-'));
  const tree = join(work, 'demo_data_sfra_J');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'f.xml'), '<f/>');
  const relDashZip = '-dash-out.zip';
  zipDir(tree, relDashZip, 'demo_data_sfra_J');
  const expectedZip = join(work, relDashZip);
  assert.ok(existsSync(expectedZip), `expected zip at ${expectedZip}`);
  const listing = execFileSync('unzip', ['-l', expectedZip], { encoding: 'utf8' });
  assert.match(listing, /demo_data_sfra_J\/f\.xml/);
  rmSync(work, { recursive: true });
});

test('zipDir does not depend on an executable in PATH', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-path-'));
  const tree = join(work, 'demo_data_sfra_J');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'f.xml'), '<f/>');
  const zip = join(work, 'demo_data_sfra_J.zip');
  const originalPath = process.env.PATH;

  try {
    process.env.PATH = '/path-that-does-not-exist';
    zipDir(tree, zip, 'demo_data_sfra_J');
  } finally {
    if (originalPath === undefined) delete process.env.PATH;
    else process.env.PATH = originalPath;
  }

  const listing = execFileSync('unzip', ['-l', zip], { encoding: 'utf8' });
  assert.match(listing, /demo_data_sfra_J\/f\.xml/);
  rmSync(work, { recursive: true });
});

test('zipDir marks UTF-8 entry names correctly', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-utf8-'));
  const tree = join(work, 'demo_data_sfra_J');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'café.xml'), '<f/>');
  const zip = join(work, 'demo_data_sfra_J.zip');
  zipDir(tree, zip, 'demo_data_sfra_J');

  const listing = execFileSync('unzip', ['-Z1', zip], { encoding: 'utf8' });
  assert.match(listing, /demo_data_sfra_J\/café\.xml/);
  rmSync(work, { recursive: true });
});

test('makeInventoryDoc concatenates multiple inventory-list files into one well-formed document', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-inv-'));
  mkdirSync(join(work, 'inventory-lists'), { recursive: true });
  writeFileSync(join(work, 'inventory-lists/a.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<inventory xmlns="http://www.demandware.com/xml/impex/inventory/2007-05-31">\n'
    + '<inventory-list><header list-id="aJ"></header></inventory-list>\n</inventory>\n');
  writeFileSync(join(work, 'inventory-lists/b.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<inventory xmlns="http://www.demandware.com/xml/impex/inventory/2007-05-31">\n'
    + '<inventory-list><header list-id="bJ"></header></inventory-list>\n</inventory>\n');

  const doc = makeInventoryDoc(work);

  assert.equal((doc.match(/<\?xml/g) || []).length, 1, 'exactly one xml declaration');
  assert.equal(
    (doc.match(/<inventory xmlns="http:\/\/www\.demandware\.com\/xml\/impex\/inventory\/2007-05-31">/g) || []).length,
    1, 'exactly one namespaced inventory root open tag');
  assert.equal((doc.match(/<\/inventory>/g) || []).length, 1, 'exactly one root close tag');
  assert.match(doc, /<header list-id="aJ">/, 'first list block present');
  assert.match(doc, /<header list-id="bJ">/, 'second list block present');

  rmSync(work, { recursive: true });
});

// Regression: this project is fail-fast everywhere else (see e.g. parseOptions's --out
// validation, or verifyTree gating the whole pipeline before archives are written), but
// makeInventoryDoc previously degraded SILENTLY - an empty inventory-lists dir produced a
// well-formed but EMPTY <inventory> root, and any xml file whose <inventory-list> match failed
// was dropped via filter(Boolean) with no signal at all. Either shape ships an inventory document
// that fails at IMPORT time in Business Manager, the hardest possible place to diagnose it
test('makeInventoryDoc throws when the inventory-lists dir is empty (would otherwise emit zero inventory-list blocks)', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-inv-empty-'));
  mkdirSync(join(work, 'inventory-lists'), { recursive: true });

  assert.throws(() => makeInventoryDoc(work), /inventory-list/i);

  rmSync(work, { recursive: true });
});

test('makeInventoryDoc throws when a candidate .xml file yields no <inventory-list> match', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-inv-nomatch-'));
  mkdirSync(join(work, 'inventory-lists'), { recursive: true });
  // well-formed xml, but missing the <inventory-list>...</inventory-list> shape entirely
  writeFileSync(join(work, 'inventory-lists/malformed.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<inventory xmlns="http://www.demandware.com/xml/impex/inventory/2007-05-31">\n'
    + '</inventory>\n');

  assert.throws(() => makeInventoryDoc(work), /malformed\.xml/);

  rmSync(work, { recursive: true });
});

test('makeInventoryDoc preserves each inventory-list block byte-identical, irregular indentation and xml entities intact', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-inv-entities-'));
  mkdirSync(join(work, 'inventory-lists'), { recursive: true });
  // deliberately irregular indentation (not the pretty-printed 4/8-space style real files use)
  // plus xml entities, to prove the concatenation is a substring copy, not a reparse/re-serialize
  // that could normalize whitespace or re-encode entities
  const block = '<inventory-list>\n'
    + '      <header list-id="oddJ">\n'
    + '  <description>Terms &amp; Conditions apply: a &lt; b &gt; c</description>\n'
    + '      </header>\n'
    + '</inventory-list>';
  writeFileSync(join(work, 'inventory-lists/odd.xml'),
    '<?xml version="1.0" encoding="UTF-8"?>\n'
    + '<inventory xmlns="http://www.demandware.com/xml/impex/inventory/2007-05-31">\n'
    + `${block}\n</inventory>\n`);

  const doc = makeInventoryDoc(work);

  assert.ok(doc.includes(block), 'inventory-list block must appear byte-identical: indentation and entities unchanged');

  rmSync(work, { recursive: true });
});
