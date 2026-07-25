// test/harvest.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { harvestIds } from '../lib/harvest.mjs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const fixtures = join(here, 'fixtures');

test('harvest collects site, catalog, product, store, pricebook, inventory, library, customer-list ids', () => {
  const ids = harvestIds(join(fixtures, 'harvest-tree'));
  assert.ok(ids.has('RefArch'), 'site id');
  assert.ok(ids.has('apparel-m-catalog'), 'catalog id');
  assert.ok(ids.has('008884303989M'), 'product id');
  assert.ok(ids.has('11736753M'), 'recommendation source id');
  assert.ok(ids.has('usd-m-list-prices'), 'pricebook id');
  assert.ok(ids.has('inventory_m_store_store1'), 'inventory list id');
  assert.ok(ids.has('RefArchSharedLibrary'), 'library id');
  assert.ok(ids.has('store1'), 'store id');
});

test('harvest collects ids from single-quoted XML attributes', () => {
  const ids = harvestIds(join(fixtures, 'harvest-tree'));
  assert.ok(ids.has('SINGLEQUOTEDM'), 'single-quoted product id');
});

test('harvest collects a pricebook parent id from inside its header block', () => {
  const ids = harvestIds(join(fixtures, 'harvest-tree'));
  assert.ok(ids.has('usd-m-base-prices'), 'pricebook parent id nested in <header pricebook-id=...>');
});

test('harvest EXCLUDES category ids', () => {
  const ids = harvestIds(join(fixtures, 'harvest-tree'));
  assert.ok(!ids.has('womens'), 'category id must not be harvested');
  assert.ok(!ids.has('root'), 'root category id must not be harvested');
  assert.ok(!ids.has('mens'), 'category parent id (bare <parent> inside a <category>) must not be harvested');
});

test('harvest collects job-id (org-scoped job objects must be tokenized too)', () => {
  const ids = harvestIds(join(fixtures, 'harvest-tree'));
  assert.ok(ids.has('RebuildURLs'), 'job-id must be harvested so jobs.xml job objects are isolated per token');
});

test('harvest EXCLUDES template-id and step-id (job-internal, never referenced outside their own job)', () => {
  const ids = harvestIds(join(fixtures, 'harvest-tree'));
  assert.ok(!ids.has('template_40'), 'template-id must not be harvested');
  assert.ok(!ids.has('RebuildURLsStep'), 'step-id must not be harvested');
});
