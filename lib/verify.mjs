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
    // accepted tradeoff, not an oversight - but it is not as narrow as it once looked: harvest.mjs
    // and transform.mjs substitute every site-id occurrence from the same rename map, so a plain
    // full-tree run cannot create a mismatch. --only IS a pipeline that creates exactly this
    // divergence on purpose, though: it omits one site's directory entirely while jobs.xml (and
    // the shared library, and any other org-scoped file) still references that omitted site's
    // tokenized id. This checker does not attempt to catch that case either - a --only run's
    // jobs.xml can reference a site-id with no <site-id="..."> definition anywhere in the output
    // tree, and verifyTree reports ok:true regardless
    collectAll(/\bsite-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/\bcatalog-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/<product product-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/<header pricebook-id=(["'])([^"']+)\1/g, xml, 2, defined);
    // \s+ (not a literal single space) matches harvest.mjs's own <header ... list-id= scoping
    // regex, so a reformatted header (extra whitespace, a line break before the attribute)
    // cannot make this DEFINED collector miss a real definition and cry wolf with a false
    // dangling report - the failure mode that trains people to ignore this guard
    collectAll(/<header\s+list-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/\blibrary-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/<customer-list list-id=(["'])([^"']+)\1/g, xml, 2, defined);
    // store-id, source-id, target-id: DEFINED for consistency with harvest.mjs/transform.mjs,
    // which already collect/rename all 9 ID_ATTRS. Real vendored data confirms this is safe: a
    // store-id value (e.g. "store1") never collides with any REFERENCED value (inventoryListId
    // values are always "inventory_m_store_store1"-shaped, never the bare store id), and
    // source-id/target-id (<recommendation>) values are themselves product ids already covered
    // by the <product product-id=...> collector above, so this only ever ADDS definitions, never
    // masks a real dangling reference
    collectAll(/\bstore-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/\bsource-id=(["'])([^"']+)\1/g, xml, 2, defined);
    collectAll(/\btarget-id=(["'])([^"']+)\1/g, xml, 2, defined);
    // REFERENCED
    collectAll(/<preference preference-id="Site(?:Catalog|CustomerList|Library|InventoryList)">([^<]+)</g, xml, 1, referenced);
    collectAll(/<custom-attribute attribute-id="inventoryListId">([^<]+)</g, xml, 1, referenced);
    // Element-form product reference: <product-id-condition> wraps a bare <product-id>ID</product-id>,
    // and so does <bonus-products>, found in promotions.xml (67 occurrences across the real
    // RefArch/RefArchGlobal data). Distinct from the ATTRIBUTE form product-id="..." already
    // covered by the DEFINED collector above - this is the bare element form, and it is always a
    // REFERENCE to a product defined elsewhere, never a definition itself. The exact tag match
    // (requires the literal ">" right after "product-id") cannot mismatch the unrelated
    // <product-id-condition> element, which never closes before a ">"
    collectAll(/<product-id>([^<]+)<\/product-id>/g, xml, 1, referenced);
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
