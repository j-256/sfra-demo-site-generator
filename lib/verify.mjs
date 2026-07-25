// lib/verify.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function allXml(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const p = join(dir, n);
    const st = statSync(p);
    if (st.isDirectory()) allXml(p, out);
    else if (n.endsWith('.xml')) out.push(p);
  }
  return out;
}

function collectAll(re, xml, idx, into) {
  let m; while ((m = re.exec(xml))) into.add(m[idx].trim());
}

// Referential-integrity checker over a GENERATED output tree. Collects every DEFINED id and
// every REFERENCED id across all XML, then reports references that point at nothing. This is
// the guard that makes the original bug this project was built to fix - a hand-built dataset
// with 11 silently broken store->inventory references - impossible to ship unnoticed
export function verifyTree(dir) {
  const defined = new Set();
  const referenced = new Set();
  for (const f of allXml(dir)) {
    const xml = readFileSync(f, 'utf8');
    // DEFINED
    collectAll(/\bsite-id="([^"]+)"/g, xml, 1, defined); // site definitions (also refs; ok, superset)
    collectAll(/\bcatalog-id="([^"]+)"/g, xml, 1, defined);
    collectAll(/<product product-id="([^"]+)"/g, xml, 1, defined);
    collectAll(/<header pricebook-id="([^"]+)"/g, xml, 1, defined);
    collectAll(/<header list-id="([^"]+)"/g, xml, 1, defined);
    collectAll(/\blibrary-id="([^"]+)"/g, xml, 1, defined);
    collectAll(/<customer-list list-id="([^"]+)"/g, xml, 1, defined);
    // REFERENCED
    collectAll(/<preference preference-id="Site(?:Catalog|CustomerList|Library|InventoryList)">([^<]+)</g, xml, 1, referenced);
    collectAll(/<custom-attribute attribute-id="inventoryListId">([^<]+)</g, xml, 1, referenced);
    // Pricebook parent links ONLY, scoped to the pricebook header block - the same guard used in
    // harvest.mjs and transform.mjs. Catalog <category> and library <folder> elements reuse the
    // bare <parent> tag for their own hierarchy: in the real data 174 of 179 <parent> elements
    // are hierarchy, not pricebook refs, so an unscoped collect invents 22 phantom dangling ids
    // (womens, root, mens-clothing, ...) and reports ok:false on referentially-valid output
    const pbHeaderRe = /<header\s+pricebook-id=(?:"[^"]+"|'[^']+')[^>]*>([\s\S]*?)<\/header>/g;
    let phm;
    while ((phm = pbHeaderRe.exec(xml))) {
      collectAll(/<parent>([^<]+)<\/parent>/g, phm[1], 1, referenced);
    }
    let pm; const pb = /<preference preference-id="SitePriceBooks">([^<]+)</g;
    while ((pm = pb.exec(xml))) pm[1].split(':').forEach((v) => referenced.add(v.trim()));
  }
  const dangling = [...referenced].filter((id) => id && !defined.has(id));
  return { ok: dangling.length === 0, dangling };
}
