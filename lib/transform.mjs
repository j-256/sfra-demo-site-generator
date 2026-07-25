// lib/transform.mjs
import { ID_ATTRS, ID_PREF_SINGLE, PREF_PRICEBOOKS } from './locations.mjs';

// Replace a whole attribute value iff it is a key in map. Whole-value match by construction
// (regex captures the full quoted value), so prefixes never clobber longer ids
// Handles BOTH double- and single-quoted attributes: real OOTB data mixes them
// (electronics-m-catalog/catalog.xml uses single quotes: catalog-id='...'). Confirmed in Task 2
function replaceAttrs(xml, map) {
  for (const attr of ID_ATTRS) {
    const re = new RegExp(`(\\b${attr}=)(["'])([^"']+)(\\2)`, 'g');
    xml = xml.replace(re, (full, pre, q, val, post) => (map.has(val) ? pre + q + map.get(val) + post : full));
  }
  return xml;
}

function replaceSinglePrefs(xml, map) {
  for (const name of ID_PREF_SINGLE) {
    const re = new RegExp(`(<preference preference-id="${name}">)([^<]+)(</preference>)`, 'g');
    xml = xml.replace(re, (full, pre, val, post) => {
      const t = val.trim();
      return map.has(t) ? pre + map.get(t) + post : full;
    });
  }
  return xml;
}

function replacePriceBooks(xml, map) {
  const re = new RegExp(`(<preference preference-id="${PREF_PRICEBOOKS}">)([^<]+)(</preference>)`, 'g');
  return xml.replace(re, (full, pre, val, post) => {
    const remapped = val.split(':').map((v) => (map.has(v.trim()) ? map.get(v.trim()) : v)).join(':');
    return pre + remapped + post;
  });
}

function replaceElement(xml, tag, map, attrMatch = '') {
  const open = attrMatch ? `<${tag} ${attrMatch}>` : `<${tag}>`;
  const re = new RegExp(`(${open.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})([^<]+)(</${tag}>)`, 'g');
  return xml.replace(re, (full, pre, val, post) => {
    const t = val.trim();
    return map.has(t) ? pre + map.get(t) + post : full;
  });
}

// Pricebook parent links live ONLY inside a <header pricebook-id="..."> block. Catalog
// <category> elements and library <folder> elements use the SAME bare <parent> tag for their
// own hierarchy, so an unscoped replace would corrupt a category/folder parent link the moment
// a category or folder id collides with a renamed resource id. Nothing structurally prevents
// such a collision (it just does not occur in the currently vendored data), so scope the
// replacement to the pricebook header block - mirroring the same guard harvest.mjs uses
function replacePricebookParent(xml, map) {
  const headerRe = /<header\s+pricebook-id=(?:"[^"]+"|'[^']+')[^>]*>[\s\S]*?<\/header>/g;
  return xml.replace(headerRe, (block) => replaceElement(block, 'parent', map));
}

export function transformXml(xml, map) {
  let out = xml;
  out = replaceAttrs(out, map);
  out = replaceSinglePrefs(out, map);
  out = replacePriceBooks(out, map);
  out = replacePricebookParent(out, map); // scoped: pricebook parent link only
  out = replaceElement(out, 'custom-attribute', map, 'attribute-id="inventoryListId"');
  return out;
}
