// test/e2e.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../generate.mjs';
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdtempSync, mkdirSync, writeFileSync, readdirSync, statSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(here, '..');

// Artifacts here are large (~200MB unzipped tree + ~81MB zip per run), so OUT lives under the OS
// temp dir rather than the repo. Each test creates its own mkdtemp parent and rmSync's it in a
// finally, so a failing assertion still cleans up instead of leaking a run into /tmp permanently

// A handful of tests below need to drive generate.mjs as a real CLI SUBPROCESS rather than call
// run() in-process. Reason: run()'s verify-failure branch sets process.exitCode = 1 and returns
// (it does not throw). Under node:test, a process.exitCode left set inside an otherwise-passing
// test poisons that test FILE's own exit status - confirmed directly: a trivial repro test that
// sets process.exitCode = 1 and then asserts truthily still makes `node --test` exit 1 for the
// whole file. Running generate.mjs as a child process sidesteps this entirely: a child's exit
// status is only ever DATA returned to the parent (spawnSync's .status), never a write to the
// parent's own process.exitCode. This also lets these tests assert on the CLI's real stdout/stderr
// shape, which an in-process call to run() cannot observe at all
//
// generate.mjs resolves its SRC/CORRECTED_CACHE constants from ITS OWN import.meta.url, so a
// fixture cannot symlink to the real generate.mjs/lib - that would resolve straight back through
// the symlink to the real src/demo_data_sfra (confirmed by probing fileURLToPath(import.meta.url)
// through a symlink: it returns the link's REAL target, not the link's own path). Copy instead
function buildFixtureProject({ brokenRef = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'sfra-fixture-'));
  mkdirSync(join(root, 'lib'));
  for (const f of readdirSync(join(REPO_ROOT, 'lib'))) {
    cpSync(join(REPO_ROOT, 'lib', f), join(root, 'lib', f));
  }
  cpSync(join(REPO_ROOT, 'generate.mjs'), join(root, 'generate.mjs'));
  mkdirSync(join(root, 'src'));
  cpSync(join(REPO_ROOT, 'src/cache-settings.xml'), join(root, 'src/cache-settings.xml'));

  const src = join(root, 'src', 'demo_data_sfra');
  mkdirSync(join(src, 'sites/RefArch'), { recursive: true });
  mkdirSync(join(src, 'sites/RefArchGlobal'), { recursive: true });
  mkdirSync(join(src, 'inventory-lists'), { recursive: true });

  writeFileSync(join(src, 'sites/RefArch/site.xml'),
    '<site xmlns="http://www.demandware.com/xml/impex/site/2007-04-30" site-id="RefArch"><name>RefArch</name></site>');
  writeFileSync(join(src, 'sites/RefArchGlobal/site.xml'),
    '<site xmlns="http://www.demandware.com/xml/impex/site/2007-04-30" site-id="RefArchGlobal"><name>RefArchGlobal</name></site>');

  // two org-scoped inventory lists, always defined regardless of brokenRef - these are what the
  // --only tests check survive intact no matter which site is selected
  for (const id of ['inventory_a', 'inventory_b']) {
    writeFileSync(join(src, 'inventory-lists', `${id}.xml`),
      '<inventory xmlns="http://www.demandware.com/xml/impex/inventory/2007-05-31">'
      + `<inventory-list><header list-id="${id}"><default-instock>false</default-instock></header>`
      + '<records/></inventory-list></inventory>');
  }

  // two stores with valid inventory refs, plus - only when brokenRef is set - a THIRD store
  // pointing at a list that is never defined anywhere: the same shape as the real 11-broken-link
  // bug that motivated this whole project (a store's inventoryListId custom-attribute pointing at
  // an inventory list that does not exist)
  let storesXml = '<stores xmlns="http://www.demandware.com/xml/impex/store/2007-04-30">'
    + '<store store-id="store-a"><custom-attributes>'
    + '<custom-attribute attribute-id="inventoryListId">inventory_a</custom-attribute>'
    + '</custom-attributes></store>'
    + '<store store-id="store-b"><custom-attributes>'
    + '<custom-attribute attribute-id="inventoryListId">inventory_b</custom-attribute>'
    + '</custom-attributes></store>';
  if (brokenRef) {
    storesXml += '<store store-id="store-ghost"><custom-attributes>'
      + '<custom-attribute attribute-id="inventoryListId">inventory_ghost</custom-attribute>'
      + '</custom-attributes></store>';
  }
  storesXml += '</stores>';
  writeFileSync(join(src, 'sites/RefArch/stores.xml'), storesXml);

  return root;
}

function anyZipUnder(dir) {
  if (!existsSync(dir)) return false;
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) {
      if (anyZipUnder(p)) return true;
    } else if (name.endsWith('.zip')) {
      return true;
    }
  }
  return false;
}

test('full generate with --token J: valid, isolated, cache-corrected', () => {
  const OUT = mkdtempSync(join(tmpdir(), 'sfra-e2e-'));
  try {
    const r = run(['--token', 'J', '--out', OUT]);
    assert.equal(r.ok, true);
    const tree = join(OUT, 'demo_data_sfra_J');

    // sites renamed
    assert.ok(existsSync(join(tree, 'sites/RefArchJ/site.xml')));
    assert.ok(existsSync(join(tree, 'sites/RefArchGlobalJ/site.xml')));

    // cache corrected: dev enabled, staging disabled in RefArchJ
    const cache = readFileSync(join(tree, 'sites/RefArchJ/cache-settings.xml'), 'utf8');
    const dev = cache.match(/<development>[\s\S]*?<\/development>/)[0];
    const stg = cache.match(/<staging>[\s\S]*?<\/staging>/)[0];
    assert.match(dev, /page-cache-enabled>true/);
    assert.match(stg, /page-cache-enabled>false/);

    // partitions preserved
    assert.match(cache, /page-cache-partition/);

    // customer-list tokenized to RefArchJ (same string as site, but here it's the list id)
    const cl = readFileSync(join(tree, 'customer-lists.xml'), 'utf8');
    assert.match(cl, /list-id="RefArchJ"/);

    // active-data CSV NOT tokenized (byte-preserved product ids)
    const csv = readFileSync(join(tree, 'sites/RefArchJ/active-data/product-Sites-RefArch.csv'), 'utf8');
    assert.match(csv, /\b8884304016M\b/); // original id present, not 8884304016MJ
    assert.doesNotMatch(csv, /MJ\b/);

    // library prose rebranded, online-flag site-id tokenized
    const lib = readFileSync(join(tree, 'libraries/RefArchSharedLibraryJ/library.xml'), 'utf8');
    assert.match(lib, /RefArchJ Online Store/);
    assert.match(lib, /<online-flag site-id="RefArchJ">/);

    // zips exist
    assert.ok(existsSync(join(OUT, 'demo_data_sfra_J.zip')));
    assert.ok(existsSync(join(OUT, 'inventory_J.zip')));

    // every generated XML is well-formed
    const files = execFileSync('bash', ['-lc', `find ${tree} -name '*.xml'`], { encoding: 'utf8' }).trim().split('\n');
    for (const f of files) execFileSync('xmllint', ['--noout', f]);
  } finally {
    rmSync(OUT, { recursive: true, force: true });
  }
});

test('idempotence guard: no double-tokenized IDs (no product-id "...JJ", no RefArchJJ)', () => {
  // NOTE: a blind grep for "JJ" is WRONG here - the OOTB catalog data contains manufacturer
  // color codes and image filenames with literal "JJ" (e.g. value="JJ001XX",
  // path="large/PG.8211X3997.JJ001XX.PZ.jpg"). Those are legitimately untouched passthrough
  // The real failure mode is double-TOKENIZATION: an ID we rename getting the token twice
  // Assert against the ID-bearing positions only
  const OUT = mkdtempSync(join(tmpdir(), 'sfra-e2e-'));
  try {
    run(['--token', 'J', '--out', OUT]);
    const tree = join(OUT, 'demo_data_sfra_J');
    // any renamed id ending in the token followed by another token = double-tokenized
    const bad = execFileSync('bash', ['-lc',
      `grep -rhoE '(product-id|catalog-id|site-id|list-id|pricebook-id|library-id|source-id|target-id)="[^"]*JJ"' ${tree} || true`],
      { encoding: 'utf8' }).trim();
    assert.equal(bad, '', `found double-tokenized ids:\n${bad}`);
    // and the site/library ids specifically
    const site = readFileSync(join(tree, 'sites/RefArchJ/site.xml'), 'utf8');
    assert.doesNotMatch(site, /RefArchJJ/);
  } finally {
    rmSync(OUT, { recursive: true, force: true });
  }
});

test('refuses existing out without --force, succeeds with it', () => {
  const OUT = mkdtempSync(join(tmpdir(), 'sfra-e2e-'));
  try {
    run(['--token', 'J', '--out', OUT]);
    assert.throws(() => run(['--token', 'J', '--out', OUT]), /force/);
    assert.equal(run(['--token', 'J', '--out', OUT, '--force']).ok, true);
  } finally {
    rmSync(OUT, { recursive: true, force: true });
  }
});

test('verify-failure path: dangling reference reports the id, exits non-zero, produces zero archives', () => {
  // Uses a small SYNTHETIC src tree (via buildFixtureProject), not the real ~200MB pipeline - the
  // assertion under test (no archives on verification failure) does not need real catalog data,
  // and a full real-tree run would make this test roughly as slow as the other three combined
  // Driven as a SUBPROCESS (see the rationale comment near buildFixtureProject above): run()'s
  // failure branch sets process.exitCode = 1 and returns rather than throwing, and leaving that
  // set inside an in-process test would poison this file's own exit status even though every
  // assertion here passes
  const project = buildFixtureProject({ brokenRef: true });
  try {
    const out = join(project, 'out');
    const r = spawnSync('node', [join(project, 'generate.mjs'), '--token', 'J', '--out', out], { encoding: 'utf8' });

    assert.equal(r.status, 1, `expected exit 1, got ${r.status}; stderr: ${r.stderr}`);
    assert.match(r.stderr, /verification FAILED/);
    assert.match(r.stderr, /dangling reference/);
    // the specific broken id (store-ghost's inventoryListId, tokenized) must be named
    assert.match(r.stderr, /inventory_ghostJ/);
    assert.equal(r.stdout, '', 'no success message on stdout when verification fails');

    assert.equal(anyZipUnder(out), false, 'no .zip file anywhere under out when verification fails');
  } finally {
    rmSync(project, { recursive: true, force: true });
  }
});

test('--only primary / --only global through the real CLI: selected site only, inventory doc keeps all lists', () => {
  for (const only of ['primary', 'global']) {
    const project = buildFixtureProject({ brokenRef: false });
    try {
      const out = join(project, 'out');
      const r = spawnSync('node',
        [join(project, 'generate.mjs'), '--token', 'J', '--out', out, '--only', only],
        { encoding: 'utf8' });
      assert.equal(r.status, 0, `expected exit 0 for --only ${only}; stderr: ${r.stderr}`);

      const tree = join(out, 'demo_data_sfra_J');
      const selectedDir = only === 'primary' ? 'RefArchJ' : 'RefArchGlobalJ';
      const omittedDir = only === 'primary' ? 'RefArchGlobalJ' : 'RefArchJ';
      assert.ok(existsSync(join(tree, 'sites', selectedDir, 'site.xml')), `${selectedDir} must exist`);
      assert.ok(!existsSync(join(tree, 'sites', omittedDir)), `${omittedDir} must NOT exist`);

      // inventory is org-scoped, not site-scoped: both lists survive regardless of --only
      const invDoc = readFileSync(join(out, 'inventory_J.xml'), 'utf8');
      assert.equal((invDoc.match(/<inventory-list>/g) || []).length, 2, `--only ${only} must keep both inventory lists`);
      assert.match(invDoc, /list-id="inventory_aJ"/);
      assert.match(invDoc, /list-id="inventory_bJ"/);
    } finally {
      rmSync(project, { recursive: true, force: true });
    }
  }
});

test('CLI subprocess: missing --token produces a clean one-line message and exit 1', () => {
  const r = spawnSync('node', [join(REPO_ROOT, 'generate.mjs')], { encoding: 'utf8' });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /token is required/);
  assert.doesNotMatch(r.stderr, /at .*\(.*:\d+:\d+\)/, 'stderr must not contain a stack trace frame');
});
