// test/transform-xml.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { transformXml } from '../lib/transform.mjs';

const map = new Map([
  ['RefArch', 'RefArchJ'],
  ['RefArchGlobal', 'RefArchGlobalJ'],
  ['apparel-m-catalog', 'apparel-m-catalogJ'],
  ['008884303989M', '008884303989MJ'],
  ['inventory_m', 'inventory_mJ'],
  ['inventory_m_store_store1', 'inventory_m_store_store1J'],
  ['usd-m-list-prices', 'usd-m-list-pricesJ'],
  ['usd-m-sale-prices', 'usd-m-sale-pricesJ'],
  ['RefArchSharedLibrary', 'RefArchSharedLibraryJ'],
]);

test('replaces id-bearing attribute values', () => {
  assert.equal(transformXml('<site site-id="RefArch">', map), '<site site-id="RefArchJ">');
  assert.equal(transformXml('<catalog catalog-id="apparel-m-catalog">', map), '<catalog catalog-id="apparel-m-catalogJ">');
  assert.equal(transformXml('<product product-id="008884303989M">', map), '<product product-id="008884303989MJ">');
});

test('does NOT touch category-id (not in map)', () => {
  assert.equal(transformXml('<category category-id="womens"/>', map), '<category category-id="womens"/>');
  assert.equal(transformXml('<category-assignment category-id="womens" product-id="008884303989M"/>', map),
    '<category-assignment category-id="womens" product-id="008884303989MJ"/>');
});

test('end-appends without clobbering: inventory prefix boundary', () => {
  // inventory_m is a prefix of inventory_m_store_store1; whole-value match must pick the exact key
  assert.equal(transformXml('<header list-id="inventory_m_store_store1">', map), '<header list-id="inventory_m_store_store1J">');
  assert.equal(transformXml('<header list-id="inventory_m">', map), '<header list-id="inventory_mJ">');
});

test('does NOT corrupt RefArchGlobal via RefArch', () => {
  assert.equal(transformXml('<context site-id="RefArchGlobal"/>', map), '<context site-id="RefArchGlobalJ"/>');
});

test('handles single-quoted attributes (real electronics catalog uses them)', () => {
  // electronics-m-catalog/catalog.xml: <catalog catalog-id='electronics-m-catalog' ...>
  const m2 = new Map([['electronics-m-catalog', 'electronics-m-catalogJ']]);
  assert.equal(transformXml("<catalog catalog-id='electronics-m-catalog'>", m2),
    "<catalog catalog-id='electronics-m-catalogJ'>");
  // quote style is preserved (single stays single)
  assert.equal(transformXml("<product product-id='008884303989M'/>", map),
    "<product product-id='008884303989MJ'/>");
});

test('renames store-id attribute values', () => {
  const m3 = new Map([['store1', 'store1J'], ['german_store', 'german_storeJ']]);
  assert.equal(transformXml('<store store-id="store1">', m3), '<store store-id="store1J">');
});

test('renames job-id attribute values but leaves template-id and step-id alone (job-internal, org-scoped job needs isolation, its internals do not)', () => {
  const m4 = new Map([['RebuildURLs', 'RebuildURLsJ']]);
  assert.equal(transformXml('<job job-id="RebuildURLs" priority="0">', m4), '<job job-id="RebuildURLsJ" priority="0">');
  assert.equal(
    transformXml('<template-ref template-id="template_40"/><step step-id="RebuildURLs" type="UpdateStorefrontURLs">', m4),
    '<template-ref template-id="template_40"/><step step-id="RebuildURLs" type="UpdateStorefrontURLs">');
});

test('remaps single-valued preference element text', () => {
  assert.equal(
    transformXml('<preference preference-id="SiteCatalog">apparel-m-catalog</preference>', map),
    '<preference preference-id="SiteCatalog">apparel-m-catalogJ</preference>');
});

test('remaps colon-delimited SitePriceBooks list', () => {
  const input = '<preference preference-id="SitePriceBooks">usd-m-list-prices:usd-m-sale-prices</preference>';
  const out = '<preference preference-id="SitePriceBooks">usd-m-list-pricesJ:usd-m-sale-pricesJ</preference>';
  assert.equal(transformXml(input, map), out);
});

test('remaps <parent> pricebook link (scoped to a pricebook header block) and inventoryListId', () => {
  // pricebook-id itself ('usd-m-base-prices') is deliberately NOT a key in map, so this test
  // isolates the <parent> element remap from the (separately-tested) pricebook-id attribute remap
  const input = '<header pricebook-id="usd-m-base-prices"><parent>usd-m-list-prices</parent></header>';
  const out = '<header pricebook-id="usd-m-base-prices"><parent>usd-m-list-pricesJ</parent></header>';
  assert.equal(transformXml(input, map), out);
  assert.equal(
    transformXml('<custom-attribute attribute-id="inventoryListId">inventory_m_store_store1</custom-attribute>', map),
    '<custom-attribute attribute-id="inventoryListId">inventory_m_store_store1J</custom-attribute>');
});

test('remaps element-form <product-id> (promotions.xml shape: condition + bonus-products)', () => {
  // <product-id-condition> wraps one-or-more bare <product-id>ID</product-id> elements, and
  // <bonus-products> wraps its own bare <product-id>ID</product-id> - both distinct from the
  // ATTRIBUTE form product-id="..." already covered above. The exact "<product-id>" open-tag
  // match must not also fire on the unrelated <product-id-condition> element
  const input = '<product-id-condition operator="is equal"><product-id>008884303989M</product-id></product-id-condition>'
    + '<bonus-products><product-id>008884303989M</product-id></bonus-products>';
  const out = '<product-id-condition operator="is equal"><product-id>008884303989MJ</product-id></product-id-condition>'
    + '<bonus-products><product-id>008884303989MJ</product-id></bonus-products>';
  assert.equal(transformXml(input, map), out);
});

test('does NOT corrupt a category or folder <parent> even when its id collides with a mapped id', () => {
  // 'electronics' is a real category id in electronics-m-catalog today; nothing structurally
  // stops a renamed resource id from colliding with a category or library-folder id, so this
  // guards against the collision rather than relying on it never happening
  const collidingMap = new Map([['electronics', 'electronicsJ']]);
  assert.equal(
    transformXml('<category category-id="electronics-accessories"><parent>electronics</parent></category>', collidingMap),
    '<category category-id="electronics-accessories"><parent>electronics</parent></category>');
  assert.equal(
    transformXml('<folder folder-id="some-folder"><parent>electronics</parent></folder>', collidingMap),
    '<folder folder-id="some-folder"><parent>electronics</parent></folder>');
});

test('leaves unmapped attribute values alone', () => {
  assert.equal(transformXml('<foo product-id="NOT_IN_MAP"/>', map), '<foo product-id="NOT_IN_MAP"/>');
});
