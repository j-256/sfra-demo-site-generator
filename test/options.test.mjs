// test/options.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions } from '../lib/options.mjs';

test('capitalizes first char of token', () => {
  assert.equal(parseOptions(['--token', 'alice']).token, 'Alice');
  assert.equal(parseOptions(['--token', 'J']).token, 'J');
});

test('rejects missing token', () => {
  assert.throws(() => parseOptions([]), /token is required/);
});

test('rejects invalid charset', () => {
  assert.throws(() => parseOptions(['--token', 'a:b']), /invalid token/i);
  assert.throws(() => parseOptions(['--token', 'a b']), /invalid token/i);
});

test('rejects token longer than 19 chars', () => {
  assert.throws(() => parseOptions(['--token', 'a'.repeat(20)]), /19/);
});

test('defaults: only=null, keep=false, out=out, force=false', () => {
  const o = parseOptions(['--token', 'x']);
  assert.equal(o.only, null);
  assert.equal(o.keepAllocationTimestamps, false);
  assert.equal(o.out, 'out');
  assert.equal(o.force, false);
});

test('parses only/keep/out/force', () => {
  const o = parseOptions(['--token', 'x', '--only', 'primary', '--keep-allocation-timestamps', '--out', 'dist', '--force']);
  assert.equal(o.only, 'primary');
  assert.equal(o.keepAllocationTimestamps, true);
  assert.equal(o.out, 'dist');
  assert.equal(o.force, true);
});

test('rejects invalid --only value', () => {
  assert.throws(() => parseOptions(['--token', 'x', '--only', 'both']), /only/);
});

// Regression: --out took ZERO validation (`o.out = argv[++i]`), so a missing value silently
// swallowed the NEXT flag as the path instead. `--out --force` set out="--force" and left
// force=false - no throw, no warning, just a wrong parse the user would not notice until the
// generated files landed somewhere unexpected. A leading "-" on the value is the tell: it is
// (almost) never a real intended directory name, and is exactly what happens when the value is
// missing and argv parsing slides one flag over
test('rejects --out value that looks like a swallowed flag (missing value case)', () => {
  assert.throws(() => parseOptions(['--token', 'x', '--out', '--force']), /--out/);
  // the swallowed --force must not silently take effect either
  assert.throws(() => parseOptions(['--token', 'x', '--out', '--only']), /--out/);
});

test('rejects empty --out value', () => {
  assert.throws(() => parseOptions(['--token', 'x', '--out', '']), /--out/);
});

test('rejects --out given with no following value at all (end of argv)', () => {
  assert.throws(() => parseOptions(['--token', 'x', '--out']), /--out/);
});
