// lib/inventory.mjs
import { transformXml } from './transform.mjs';

const READONLY = ['ats', 'on-order', 'turnover'];

function stripElement(xml, tag) {
  // remove a whole <tag>...</tag> plus its trailing newline/indent
  const re = new RegExp(`[ \\t]*<${tag}>[^<]*</${tag}>\\r?\\n?`, 'g');
  return xml.replace(re, '');
}

// CRITICAL: strip read-only fields ONLY inside <record> blocks. <on-order> is TWO different
// fields that share a tag name: the record-level one is xsd:decimal and read-only, but the
// HEADER-level one is an xsd:boolean "On Order Inventory" config flag that IS importable and
// must be preserved. Every <on-order> in the real vendored data is in fact the header flag,
// so an unscoped strip silently deletes valid configuration from every inventory list
function stripReadOnlyFromRecords(xml) {
  return xml.replace(/<record\b[^>]*>[\s\S]*?<\/record>/g, (block) => {
    let out = block;
    for (const tag of READONLY) out = stripElement(out, tag);
    return out;
  });
}

export function cleanInventoryXml(xml, map, { keepAllocationTimestamps }) {
  let out = transformXml(xml, map);
  out = stripReadOnlyFromRecords(out);
  // allocation-timestamp only ever occurs inside <record> blocks, so a document-wide strip is safe
  if (!keepAllocationTimestamps) out = stripElement(out, 'allocation-timestamp');
  return out;
}
