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

test('remaps <parent> pricebook link and inventoryListId', () => {
  assert.equal(transformXml('<parent>usd-m-list-prices</parent>', map), '<parent>usd-m-list-pricesJ</parent>');
  assert.equal(
    transformXml('<custom-attribute attribute-id="inventoryListId">inventory_m_store_store1</custom-attribute>', map),
    '<custom-attribute attribute-id="inventoryListId">inventory_m_store_store1J</custom-attribute>');
});

test('leaves unmapped attribute values alone', () => {
  assert.equal(transformXml('<foo product-id="NOT_IN_MAP"/>', map), '<foo product-id="NOT_IN_MAP"/>');
});
