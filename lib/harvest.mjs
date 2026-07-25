// lib/harvest.mjs
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { ID_ATTRS, ID_PREF_SINGLE, PREF_PRICEBOOKS } from './locations.mjs';

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (name.endsWith('.xml')) out.push(p);
  }
  return out;
}

export function harvestIds(srcDir) {
  const ids = new Set();
  for (const file of walk(srcDir)) {
    const xml = readFileSync(file, 'utf8');
    for (const attr of ID_ATTRS) {
      // XML attribute values may be double- or single-quoted
      const re = new RegExp(`\\b${attr}=(?:"([^"]+)"|'([^']+)')`, 'g');
      let m;
      while ((m = re.exec(xml))) ids.add(m[1] ?? m[2]);
    }
    // preference values live in <preference preference-id="NAME">VALUE</preference>
    const prefRe = new RegExp(`<preference preference-id="(${ID_PREF_SINGLE.join('|')})">([^<]+)</preference>`, 'g');
    let pm;
    while ((pm = prefRe.exec(xml))) ids.add(pm[2].trim());
    // SitePriceBooks is a colon-delimited list
    const pbRe = new RegExp(`<preference preference-id="${PREF_PRICEBOOKS}">([^<]+)</preference>`, 'g');
    let pbm;
    while ((pbm = pbRe.exec(xml))) pbm[1].split(':').forEach((v) => ids.add(v.trim()));
    // pricebook parent id: <parent>ID</parent> nested inside <header pricebook-id="...">...</header>
    // Scoped to the header block because catalog <category> elements also use a bare <parent>
    // for their parent CATEGORY id, which must stay excluded
    const pbHeaderRe = /<header\s+pricebook-id=(?:"[^"]+"|'[^']+')[^>]*>([\s\S]*?)<\/header>/g;
    let phm;
    while ((phm = pbHeaderRe.exec(xml))) {
      const parentRe = /<parent>([^<]+)<\/parent>/g;
      let prm;
      while ((prm = parentRe.exec(phm[1]))) ids.add(prm[1].trim());
    }
    const invRe = /<custom-attribute attribute-id="inventoryListId">([^<]+)<\/custom-attribute>/g;
    let im;
    while ((im = invRe.exec(xml))) ids.add(im[1].trim());
  }
  ids.delete('');
  return ids;
}
