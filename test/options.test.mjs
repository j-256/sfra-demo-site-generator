// test/options.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions } from '../lib/options.mjs';

test('preserves suffix value and case exactly', () => {
  assert.equal(parseOptions(['--suffix', 'alice']).suffix, 'alice');
  assert.equal(parseOptions(['--suffix', 'aLiCe']).suffix, 'aLiCe');
  assert.equal(parseOptions(['--suffix', 'J']).suffix, 'J');
  assert.equal(parseOptions(['--suffix=_alice']).suffix, '_alice');
  assert.equal(parseOptions(['--suffix=-alice']).suffix, '-alice');
});

test('rejects missing suffix', () => {
  assert.throws(() => parseOptions([]), /suffix is required/);
});

test('rejects removed token option spellings', () => {
  assert.throws(() => parseOptions(['--token', 'x']), /unknown argument: --token/);
  assert.throws(() => parseOptions(['-t', 'x']), /unknown argument: -t/);
});

test('rejects invalid charset', () => {
  assert.throws(() => parseOptions(['--suffix', 'a:b']), /invalid suffix/i);
  assert.throws(() => parseOptions(['--suffix', 'a b']), /invalid suffix/i);
});

test('rejects suffix longer than 19 chars', () => {
  assert.throws(() => parseOptions(['--suffix', 'a'.repeat(20)]), /19/);
});

test('defaults: only=null, keep=false, out=out, force=false', () => {
  const o = parseOptions(['--suffix', 'x']);
  assert.equal(o.only, null);
  assert.equal(o.keepAllocationTimestamps, false);
  assert.equal(o.out, 'out');
  assert.equal(o.force, false);
});

test('parses only/keep/out/force', () => {
  const o = parseOptions(['--suffix', 'x', '--only', 'primary', '--keep-allocation-timestamps', '--out', 'dist', '--force']);
  assert.equal(o.only, 'primary');
  assert.equal(o.keepAllocationTimestamps, true);
  assert.equal(o.out, 'dist');
  assert.equal(o.force, true);
});

test('rejects invalid --only value', () => {
  assert.throws(() => parseOptions(['--suffix', 'x', '--only', 'both']), /only/);
});

// Regression: --out took ZERO validation (`o.out = argv[++i]`), so a missing value silently
// swallowed the NEXT flag as the path instead. `--out --force` set out="--force" and left
// force=false - no throw, no warning, just a wrong parse the user would not notice until the
// generated files landed somewhere unexpected. A leading "-" on the value is the tell: it is
// (almost) never a real intended directory name, and is exactly what happens when the value is
// missing and argv parsing slides one flag over
test('rejects --out value that looks like a swallowed flag (missing value case)', () => {
  assert.throws(() => parseOptions(['--suffix', 'x', '--out', '--force']), /--out/);
  // the swallowed --force must not silently take effect either
  assert.throws(() => parseOptions(['--suffix', 'x', '--out', '--only']), /--out/);
});

test('rejects empty --out value', () => {
  assert.throws(() => parseOptions(['--suffix', 'x', '--out', '']), /--out/);
});

test('rejects --out given with no following value at all (end of argv)', () => {
  assert.throws(() => parseOptions(['--suffix', 'x', '--out']), /--out/);
});

test('cacheEnvs defaults to production only', () => {
  assert.deepEqual(parseOptions(['--suffix', 'x']).cacheEnvs, ['production']);
});

test('--cache adds an environment, repeatable', () => {
  assert.deepEqual(parseOptions(['--suffix', 'x', '--cache', 'staging']).cacheEnvs.sort(),
    ['production', 'staging']);
  assert.deepEqual(parseOptions(['--suffix', 'x', '--cache', 'staging', '--cache', 'development']).cacheEnvs.sort(),
    ['development', 'production', 'staging']);
});

test('--cache accepts stg and dev aliases', () => {
  assert.deepEqual(parseOptions(['--suffix', 'x', '--cache', 'stg']).cacheEnvs.sort(),
    ['production', 'staging']);
  assert.deepEqual(parseOptions(['--suffix', 'x', '--cache', 'dev']).cacheEnvs.sort(),
    ['development', 'production']);
  assert.deepEqual(parseOptions(['--suffix', 'x', '--cache', 'prd']).cacheEnvs, ['production']);
});

test('--cache is idempotent (no duplicate envs)', () => {
  assert.deepEqual(parseOptions(['--suffix', 'x', '--cache', 'dev', '--cache', 'development']).cacheEnvs.sort(),
    ['development', 'production']);
});

test('--cache rejects an unknown environment and a swallowed flag', () => {
  assert.throws(() => parseOptions(['--suffix', 'x', '--cache', 'sandbox']), /--cache/);
  assert.throws(() => parseOptions(['--suffix', 'x', '--cache', '--force']), /--cache/);
  assert.throws(() => parseOptions(['--suffix', 'x', '--cache']), /--cache/);
});

test('short options are accepted for every long option', () => {
  const long = parseOptions(['--suffix', 'x', '--only', 'primary', '--out', 'dist',
    '--cache', 'stg', '--keep-allocation-timestamps', '--force']);
  const short = parseOptions(['-s', 'x', '-O', 'primary', '-o', 'dist', '-c', 'stg', '-k', '-f']);
  assert.deepEqual(short, long);
});

test('short options bundle, and a value-taking short can be glued', () => {
  // -kf == -k -f
  const bundled = parseOptions(['-s', 'x', '-kf']);
  assert.equal(bundled.keepAllocationTimestamps, true);
  assert.equal(bundled.force, true);
  // -sx == -s x
  assert.equal(parseOptions(['-sx']).suffix, 'x');
  // -c takes a value when glued
  assert.deepEqual(parseOptions(['-s', 'x', '-cstg']).cacheEnvs.sort(), ['production', 'staging']);
});

test('long options accept an = joined value', () => {
  assert.equal(parseOptions(['--suffix=alice']).suffix, 'alice');
  assert.equal(parseOptions(['--suffix', 'x', '--out=dist']).out, 'dist');
  assert.deepEqual(parseOptions(['--suffix', 'x', '--cache=dev']).cacheEnvs.sort(),
    ['development', 'production']);
  assert.equal(parseOptions(['--suffix', 'x', '--only=global']).only, 'global');
});

test('an = joined long option with an empty value is a usage error', () => {
  assert.throws(() => parseOptions(['--suffix=']), /--suffix requires/);
  assert.throws(() => parseOptions(['--suffix', 'x', '--out=']), /--out requires/);
});

test('usage errors carry exit code 2, runtime errors do not', () => {
  const usage = [[], ['--suffix', 'a b'], ['--suffix', 'x', '--cache', 'nope'], ['--bogus']];
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
  // help wins over a missing required suffix, so -h always works
  assert.equal(parseOptions(['-h']).suffix, null);
});
