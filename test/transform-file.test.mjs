// test/transform-file.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformFileContent } from '../lib/transform.mjs';

const rename = {
  map: new Map([['RefArch', 'RefArchJ'], ['RefArchGlobal', 'RefArchGlobalJ'], ['RefArchSharedLibrary', 'RefArchSharedLibraryJ']]),
  primaryName: 'RefArchJ',
};

test('site.xml name follows resolved site id', () => {
  const xml = '<site site-id="RefArch"><name>RefArch</name></site>';
  const out = transformFileContent(xml, rename, { isSiteXml: true, siteName: 'RefArchJ', rebrand: false });
  assert.match(out, /<name>RefArchJ<\/name>/);
  assert.match(out, /site-id="RefArchJ"/);
});

test('library: online-flag site-id suffixed, page-title prose rebranded, library-id suffixed', () => {
  const xml = '<library library-id="RefArchSharedLibrary">'
    + '<online-flag site-id="RefArch">true</online-flag>'
    + '<page-title>RefArch Online Store</page-title></library>';
  const out = transformFileContent(xml, rename, { isSiteXml: false, rebrand: true });
  assert.match(out, /library-id="RefArchSharedLibraryJ"/, 'library id suffixed');
  assert.match(out, /<online-flag site-id="RefArchJ">/, 'online-flag site-id suffixed');
  assert.match(out, /<page-title>RefArchJ Online Store<\/page-title>/, 'prose rebranded to primary');
});

test('rebrand does not suffix an already-suffixed page-title twice', () => {
  const xml = '<page-title>RefArchJ Online Store</page-title>';
  const out = transformFileContent(xml, rename, { rebrand: true });
  assert.equal(out, '<page-title>RefArchJ Online Store</page-title>');
});

test('regression: isSiteXml + rebrand together must not corrupt a compound <name>', () => {
  // the <name> substitution writes the compound "RefArchGlobalJ" as element TEXT BEFORE the
  // rebrand pass runs. A short "RefArch" rule that is not aware of word boundaries can then
  // match the "RefArch" prefix of that already-suffixed compound and rewrite it again
  const xml = '<site site-id="RefArchGlobal"><name>RefArchGlobal</name></site>';
  const out = transformFileContent(xml, rename, { isSiteXml: true, siteName: 'RefArchGlobalJ', rebrand: true });
  assert.match(out, /<name>RefArchGlobalJ<\/name>/);
  assert.doesNotMatch(out, /RefArchJGlobalJ/);
});

test('regression: SiteLibrary preference text is not suffixed twice under rebrand', () => {
  // same shape as the <name> regression above but via a preference element: transformXml already
  // end-appends the suffix to the whole value ("RefArchSharedLibrary" -> "RefArchSharedLibraryJ")
  // before the rebrand pass runs, so rebrand must not then match the "RefArch" prefix of that
  // already-suffixed compound value
  const xml = '<preference preference-id="SiteLibrary">RefArchSharedLibrary</preference>';
  const out = transformFileContent(xml, rename, { rebrand: true });
  assert.match(out, /<preference preference-id="SiteLibrary">RefArchSharedLibraryJ<\/preference>/);
  assert.doesNotMatch(out, /RefArchJSharedLibraryJ/);
});
