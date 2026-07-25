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
    // DEFINED. Every attribute-based collector accepts EITHER quote style via a backreference
    // (["'])...\1, matching the dual-quote handling already established in harvest.mjs and
    // transform.mjs. Real vendored data mixes styles: electronics-m-catalog/catalog.xml uses
    // catalog-id='...' and product product-id='...' with single quotes, so a double-quote-only
    // collector would miss those definitions and report referentially-valid data as dangling
    //
    // site-id is added to DEFINED only - it is never added to REFERENCED, so a site-id reference
    // (e.g. jobs.xml <context site-id="..."/>) gets NO dangling check at all. That gap is an
    // accepted tradeoff, not an oversight: this tool's own pipeline cannot create such a
    // divergence, since harvest.mjs/transform.mjs substitute every site-id occurrence from the
    // same rename map, so a mismatch could only come from a pre-existing typo already present in
    // the vendored source, which this checker does not attempt to catch
    collectAll(/\bsite-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/\bcatalog-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/<product product-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/<header pricebook-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/<header list-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/\blibrary-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/<customer-list list-id=(["'])([^"']+)\1/g, xml, 2, defined);
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
