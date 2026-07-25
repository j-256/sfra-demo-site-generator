// test/rebrand.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rebrandProse } from '../lib/rebrand.mjs';

const names = ['RefArchGlobal', 'RefArch']; // longest-first

test('rebrands prose to primary name', () => {
  assert.equal(rebrandProse('RefArch Online Store', names, 'RefArchJ', 'J'), 'RefArchJ Online Store');
  assert.equal(rebrandProse('RefArch is offering Free 2 Day Shipping', names, 'RefArchJ', 'J'),
    'RefArchJ is offering Free 2 Day Shipping');
});

test('longest-match-first: RefArchGlobal not left with a dangling "Global"', () => {
  assert.equal(rebrandProse('Welcome to RefArchGlobal', names, 'RefArchJ', 'J'), 'Welcome to RefArchJ');
});

test('idempotent: already-rebranded text is unchanged (no RefArchJJ)', () => {
  // primaryName "RefArchJ" contains the substring "RefArch"; the token lookahead prevents re-match.
  assert.equal(rebrandProse('RefArchJ Online Store', names, 'RefArchJ', 'J'), 'RefArchJ Online Store');
});

test('no site name present -> unchanged', () => {
  assert.equal(rebrandProse('Free shipping on all orders', names, 'RefArchJ', 'J'), 'Free shipping on all orders');
});
