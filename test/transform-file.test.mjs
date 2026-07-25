// test/transform-file.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformFileContent } from '../lib/transform.mjs';

const rename = {
  map: new Map([['RefArch', 'RefArchJ'], ['RefArchGlobal', 'RefArchGlobalJ'], ['RefArchSharedLibrary', 'RefArchSharedLibraryJ']]),
  primaryName: 'RefArchJ',
  token: 'J',
};

test('site.xml name follows resolved site id', () => {
  const xml = '<site site-id="RefArch"><name>RefArch</name></site>';
  const out = transformFileContent(xml, rename, { isSiteXml: true, siteName: 'RefArchJ', rebrand: false });
  assert.match(out, /<name>RefArchJ<\/name>/);
  assert.match(out, /site-id="RefArchJ"/);
});

test('library: online-flag site-id tokenized, page-title prose rebranded, library-id tokenized', () => {
  const xml = '<library library-id="RefArchSharedLibrary">'
    + '<online-flag site-id="RefArch">true</online-flag>'
    + '<page-title>RefArch Online Store</page-title></library>';
  const out = transformFileContent(xml, rename, { isSiteXml: false, rebrand: true });
  assert.match(out, /library-id="RefArchSharedLibraryJ"/, 'library id tokenized');
  assert.match(out, /<online-flag site-id="RefArchJ">/, 'online-flag site-id tokenized');
  assert.match(out, /<page-title>RefArchJ Online Store<\/page-title>/, 'prose rebranded to primary');
});

test('rebrand does not double-token an already-tokenized page-title', () => {
  const xml = '<page-title>RefArchJ Online Store</page-title>';
  const out = transformFileContent(xml, rename, { rebrand: true });
  assert.equal(out, '<page-title>RefArchJ Online Store</page-title>');
});
