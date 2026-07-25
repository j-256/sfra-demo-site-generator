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

test('cacheEnvs defaults to production only', () => {
  assert.deepEqual(parseOptions(['--token', 'x']).cacheEnvs, ['production']);
});

test('--cache adds an environment, repeatable', () => {
  assert.deepEqual(parseOptions(['--token', 'x', '--cache', 'staging']).cacheEnvs.sort(),
    ['production', 'staging']);
  assert.deepEqual(parseOptions(['--token', 'x', '--cache', 'staging', '--cache', 'development']).cacheEnvs.sort(),
    ['development', 'production', 'staging']);
});

test('--cache accepts stg and dev aliases', () => {
  assert.deepEqual(parseOptions(['--token', 'x', '--cache', 'stg']).cacheEnvs.sort(),
    ['production', 'staging']);
  assert.deepEqual(parseOptions(['--token', 'x', '--cache', 'dev']).cacheEnvs.sort(),
    ['development', 'production']);
  assert.deepEqual(parseOptions(['--token', 'x', '--cache', 'prd']).cacheEnvs, ['production']);
});

test('--cache is idempotent (no duplicate envs)', () => {
  assert.deepEqual(parseOptions(['--token', 'x', '--cache', 'dev', '--cache', 'development']).cacheEnvs.sort(),
    ['development', 'production']);
});

test('--cache rejects an unknown environment and a swallowed flag', () => {
  assert.throws(() => parseOptions(['--token', 'x', '--cache', 'sandbox']), /--cache/);
  assert.throws(() => parseOptions(['--token', 'x', '--cache', '--force']), /--cache/);
  assert.throws(() => parseOptions(['--token', 'x', '--cache']), /--cache/);
});

test('short options are accepted for every long option', () => {
  const long = parseOptions(['--token', 'x', '--only', 'primary', '--out', 'dist',
    '--cache', 'stg', '--keep-allocation-timestamps', '--force']);
  const short = parseOptions(['-t', 'x', '-O', 'primary', '-o', 'dist', '-c', 'stg', '-k', '-f']);
  assert.deepEqual(short, long);
});

test('short options bundle, and a value-taking short can be glued', () => {
  // -kf == -k -f
  const bundled = parseOptions(['-t', 'x', '-kf']);
  assert.equal(bundled.keepAllocationTimestamps, true);
  assert.equal(bundled.force, true);
  // -tx == -t x
  assert.equal(parseOptions(['-tx']).token, 'X');
  // -c takes a value when glued
  assert.deepEqual(parseOptions(['-t', 'x', '-cstg']).cacheEnvs.sort(), ['production', 'staging']);
});

test('long options accept an = joined value', () => {
  assert.equal(parseOptions(['--token=alice']).token, 'Alice');
  assert.equal(parseOptions(['--token', 'x', '--out=dist']).out, 'dist');
  assert.deepEqual(parseOptions(['--token', 'x', '--cache=dev']).cacheEnvs.sort(),
    ['development', 'production']);
  assert.equal(parseOptions(['--token', 'x', '--only=global']).only, 'global');
});

test('an = joined long option with an empty value is a usage error', () => {
  assert.throws(() => parseOptions(['--token=']), /--token requires/);
  assert.throws(() => parseOptions(['--token', 'x', '--out=']), /--out requires/);
});

test('usage errors carry exit code 2, runtime errors do not', () => {
  const usage = [[], ['--token', 'a b'], ['--token', 'x', '--cache', 'nope'], ['--bogus']];
  for (const argv of usage) {
    try {
      parseOptions(argv);
      assert.fail(`expected ${JSON.stringify(argv)} to throw`);
    } catch (e) {
      assert.equal(e.exitCode, 2, `${JSON.stringify(argv)} should be a usage error`);
    }
  }
});

test('help request is reported rather than thrown', () => {
  assert.equal(parseOptions(['--help']).help, true);
  assert.equal(parseOptions(['-h']).help, true);
  // help wins over a missing required token, so -h always works
  assert.equal(parseOptions(['-h']).token, null);
});
