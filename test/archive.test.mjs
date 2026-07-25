// test/archive.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { zipDir } from '../lib/archive.mjs';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

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
