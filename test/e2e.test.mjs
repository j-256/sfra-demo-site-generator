// test/e2e.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { run } from '../generate.mjs';
import { execFileSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Artifacts here are large (~200MB unzipped tree + ~81MB zip per run), so OUT lives under the OS
// temp dir rather than the repo. Each test creates its own mkdtemp parent and rmSync's it in a
// finally, so a failing assertion still cleans up instead of leaking a run into /tmp permanently

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
  // path="large/PG.8211X3997.JJ001XX.PZ.jpg"). Those are legitimately untouched passthrough.
  // The real failure mode is double-TOKENIZATION: an ID we rename getting the token twice.
  // Assert against the ID-bearing positions only.
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
