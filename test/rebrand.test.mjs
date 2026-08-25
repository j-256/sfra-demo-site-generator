// test/rebrand.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { rebrandProse } from '../lib/rebrand.mjs';

const names = ['RefArchGlobal', 'RefArch']; // longest-first

test('rebrands prose to primary name', () => {
  assert.equal(rebrandProse('RefArch Online Store', names, 'RefArchJ'), 'RefArchJ Online Store');
  assert.equal(rebrandProse('RefArch is offering Free 2 Day Shipping', names, 'RefArchJ'),
    'RefArchJ is offering Free 2 Day Shipping');
});

test('longest-match-first: RefArchGlobal not left with a dangling "Global"', () => {
  assert.equal(rebrandProse('Welcome to RefArchGlobal', names, 'RefArchJ'), 'Welcome to RefArchJ');
});

test('idempotent: already-rebranded text is unchanged (no RefArchJJ)', () => {
  // primaryName "RefArchJ" contains the substring "RefArch"; the word-boundary lookahead prevents
  // re-match because the char right after "RefArch" here is "J", which continues the identifier
  assert.equal(rebrandProse('RefArchJ Online Store', names, 'RefArchJ'), 'RefArchJ Online Store');
});

test('idempotent: compound already-suffixed name is unchanged (no RefArchJGlobalJ)', () => {
  // regression: the short "RefArch" rule must not match the prefix of a compound name that is
  // ALREADY fully suffixed, such as the site name "RefArchGlobalJ" written as element text, or
  // the library id "RefArchSharedLibraryJ" written as preference text. A suffix-specific
  // lookahead skips only when the very next char is the suffix itself ("J"), so it missed these
  // cases because the char right after "RefArch" is "G" or "S". The word-boundary lookahead
  // skips any identifier char, so it catches both
  assert.equal(rebrandProse('RefArchGlobalJ', names, 'RefArchJ'), 'RefArchGlobalJ');
  assert.equal(rebrandProse('RefArchSharedLibraryJ', names, 'RefArchJ'), 'RefArchSharedLibraryJ');
});

test('does not match a different word that merely shares the same prefix', () => {
  // "RefArchJoinery" is a different word, not an already-rebranded "RefArch". The word-boundary
  // rule treats this as one continuous word and skips it as DEFINED behavior, rather than as an
  // accident of the current suffix happening to equal the next character
  assert.equal(rebrandProse('Welcome to RefArchJoinery today', names, 'RefArchJ'),
    'Welcome to RefArchJoinery today');
});

test('regression: a name followed by a letter that is NOT the suffix still rebrands correctly', () => {
  // "RefArchive" is a different word, but its next char after "RefArch" ("i") does not equal the
  // suffix. A suffix-specific lookahead has no opinion about "i" so it matched and mangled this
  // into "RefArchJive" (the "RefArch" prefix got rebranded mid-word). The word-boundary rule
  // correctly leaves the whole word alone because "i" continues the identifier either way
  assert.equal(rebrandProse('Ask about RefArchive services', names, 'RefArchJ'),
    'Ask about RefArchive services');
});

test('no site name present -> unchanged', () => {
  assert.equal(rebrandProse('Free shipping on all orders', names, 'RefArchJ'), 'Free shipping on all orders');
});
