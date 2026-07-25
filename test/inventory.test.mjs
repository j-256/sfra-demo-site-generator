// test/inventory.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cleanInventoryXml } from '../lib/inventory.mjs';

const map = new Map([['inventory_m', 'inventory_mJ'], ['008884303989M', '008884303989MJ']]);
const record = `<inventory><inventory-list><header list-id="inventory_m"></header><records>
<record product-id="008884303989M">
<allocation>100</allocation>
<allocation-timestamp>2023-11-09T23:03:21.000Z</allocation-timestamp>
<perpetual>false</perpetual>
<ats>100</ats>
<on-order>0</on-order>
<turnover>0</turnover>
</record></records></inventory-list></inventory>`;

test('always strips read-only fields ats/on-order/turnover', () => {
  const out = cleanInventoryXml(record, map, { keepAllocationTimestamps: true });
  assert.doesNotMatch(out, /<ats>/);
  assert.doesNotMatch(out, /<on-order>/);
  assert.doesNotMatch(out, /<turnover>/);
});

test('strips allocation-timestamp by default, keeps allocation', () => {
  const out = cleanInventoryXml(record, map, { keepAllocationTimestamps: false });
  assert.doesNotMatch(out, /<allocation-timestamp>/);
  assert.match(out, /<allocation>100<\/allocation>/);
});

test('keeps allocation-timestamp when flagged', () => {
  const out = cleanInventoryXml(record, map, { keepAllocationTimestamps: true });
  assert.match(out, /<allocation-timestamp>/);
});

test('remaps list-id and record product-id', () => {
  const out = cleanInventoryXml(record, map, { keepAllocationTimestamps: false });
  assert.match(out, /list-id="inventory_mJ"/);
  assert.match(out, /product-id="008884303989MJ"/);
});

test('PRESERVES the header-level <on-order> config flag (importable boolean, not the read-only record field)', () => {
  const withHeaderFlag = `<inventory><inventory-list><header list-id="inventory_m">
<default-instock>false</default-instock>
<use-bundle-inventory-only>false</use-bundle-inventory-only>
<on-order>false</on-order>
</header><records>
<record product-id="008884303989M">
<allocation>100</allocation>
<on-order>0</on-order>
<turnover>0</turnover>
</record></records></inventory-list></inventory>`;
  const out = cleanInventoryXml(withHeaderFlag, map, { keepAllocationTimestamps: false });
  assert.match(out, /<on-order>false<\/on-order>/, 'header config flag must survive');
  assert.doesNotMatch(out, /<on-order>0<\/on-order>/, 'read-only record field must be stripped');
  assert.doesNotMatch(out, /<turnover>/, 'read-only record field must be stripped');
  assert.match(out, /<allocation>100<\/allocation>/, 'importable record field must survive');
});
