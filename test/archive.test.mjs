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

// Pins the CONTRACT documented on zipDir: a relative zipPath (the natural case - every real call
// site in this project passes a bare filename, e.g. `${innerName}.zip`) resolves against
// dirname(dir), not against the process cwd. This is the scenario an earlier fix-round drive-by
// almost broke: swapping to a single-argument resolve(zipPath) would have resolved bare filenames
// against process.cwd() instead, silently landing the archive somewhere other than next to the
// source tree. process.chdir is used here (restored in finally) so a bare relative zipPath has a
// process cwd that is DIFFERENT from dirname(dir) - if resolution ever drifted to process.cwd(),
// this test would look for the zip in the wrong place and fail loudly rather than passing by
// coincidence
test('zipDir resolves a relative zipPath against dirname(dir), not the process cwd', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-relzip-'));
  const tree = join(work, 'demo_data_sfra_J');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'f.xml'), '<f/>');
  const originalCwd = process.cwd();
  try {
    process.chdir(tmpdir()); // deliberately NOT dirname(tree), so a wrong resolution is detectable
    const relZip = 'demo_data_sfra_J.zip'; // bare filename, exactly how every real call site builds it
    zipDir(tree, relZip, 'demo_data_sfra_J');
    const expected = join(dirname(tree), relZip); // dirname(dir) === work
    assert.ok(existsSync(expected), `expected zip at ${expected} (dirname(dir)-relative)`);
    assert.ok(!existsSync(join(process.cwd(), relZip)), 'must not have landed relative to process cwd instead');
    const listing = execFileSync('unzip', ['-l', expected], { encoding: 'utf8' });
    assert.match(listing, /demo_data_sfra_J\/f\.xml/);
  } finally {
    process.chdir(originalCwd);
  }
  rmSync(work, { recursive: true });
});

// Regression: `zip -r` MERGES into a pre-existing archive at the same path - it updates entries
// that still exist in the source and, critically, KEEPS entries whose source file was since
// DELETED. Re-running zipDir at the same zipPath after the source tree changed must produce a
// FRESH archive (stale entries gone), not an accumulating one. Reproduces the exact shape found
// in review: zip once with stale-file.xml + keep-file.xml, then delete stale-file.xml, modify
// keep-file.xml, add new-file.xml, and re-zip to the SAME zipPath
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

// Regression: zip's OWN argv parser (not a shell - execFileSync never invokes one) treats a
// leading "-" as an option introducer for positional args. A directory literally named "-x" is
// misread as the "-x" (exclude) flag and errors "requires a value" unless a "--" separator
// precedes it. Call sites always build innerName as a fixed literal prefix
// (demo_data_sfra_<token> / inventory_<token>.xml) so this is defense in depth, not a reachable
// bug today - but the fix is cheap and protects the module boundary regardless of caller care
test('zipDir handles a dash-leading innerName via the -- separator (zip argv parsing, not shell injection)', () => {
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

// Regression: zip's argv parser ALSO misreads a dash-leading ARCHIVE path (zipPath) as an
// option - e.g. "-foo.zip" errors "short option ... not supported" / "invalid date entered for
// -t option". Unlike innerName, this one IS reachable in practice: lib/options.mjs's --out is
// unvalidated, and --out is one segment of how zipPath gets built downstream. zip refuses "--"
// immediately before the archive-name position ("can't use -- before archive name"), so the fix
// has to be normalization, not a "--" separator. The zipPath passed here is a BARE relative
// string starting with "-" (not pre-joined with the absolute work dir, which would cancel the
// leading dash and defeat the repro) - zip resolves it relative to zipDir's execFileSync `cwd`
// (dir's parent), so the resulting file is expected at join(parent, relDashZip)
test('zipDir handles a dash-leading relative zipPath without misparsing it as a zip option', () => {
  const work = mkdtempSync(join(tmpdir(), 'arc-dashzip-'));
  const tree = join(work, 'demo_data_sfra_J');
  mkdirSync(tree, { recursive: true });
  writeFileSync(join(tree, 'f.xml'), '<f/>');
  const relDashZip = '-dash-out.zip';
  zipDir(tree, relDashZip, 'demo_data_sfra_J');
  const expectedZip = join(work, relDashZip); // parent (dirname(tree)) === work
  assert.ok(existsSync(expectedZip), `expected zip at ${expectedZip}`);
  const listing = execFileSync('unzip', ['-l', expectedZip], { encoding: 'utf8' });
  assert.match(listing, /demo_data_sfra_J\/f\.xml/);
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
