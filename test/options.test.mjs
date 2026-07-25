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
