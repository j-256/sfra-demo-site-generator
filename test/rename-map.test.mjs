// test/rename-map.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRenameMap } from '../lib/rename-map.mjs';

const ids = new Set(['RefArch', 'RefArchGlobal', 'apparel-m-catalog', '008884303989M',
  'inventory_m', 'inventory_m_store_store1', 'usd-m-list-prices', 'RefArchSharedLibrary', 'store1']);

test('appends token to every id (end-append)', () => {
  const { map } = buildRenameMap(ids, 'J', null);
  assert.equal(map.get('RefArch'), 'RefArchJ');
  assert.equal(map.get('RefArchGlobal'), 'RefArchGlobalJ');
  assert.equal(map.get('008884303989M'), '008884303989MJ');
  assert.equal(map.get('inventory_m_store_store1'), 'inventory_m_store_store1J');
  assert.equal(map.get('store1'), 'store1J');
});

test('primaryName is RefArch+token', () => {
  assert.equal(buildRenameMap(ids, 'Alice', null).primaryName, 'RefArchAlice');
});

test('exposes the token used', () => {
  assert.equal(buildRenameMap(ids, 'J', null).token, 'J');
});

test('siteIds reflect --only', () => {
  assert.deepEqual(buildRenameMap(ids, 'J', null).siteIds, { primary: 'RefArchJ', global: 'RefArchGlobalJ' });
  assert.deepEqual(buildRenameMap(ids, 'J', 'primary').siteIds, { primary: 'RefArchJ', global: null });
});
