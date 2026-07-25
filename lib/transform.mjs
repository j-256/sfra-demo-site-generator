// lib/transform.mjs
import { readdirSync, statSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join, sep } from 'node:path';
import { ID_ATTRS, ID_PREF_SINGLE, PREF_PRICEBOOKS } from './locations.mjs';
import { rebrandProse } from './rebrand.mjs';
import { cleanInventoryXml } from './inventory.mjs';

const SOURCE_SITE_NAMES = ['RefArchGlobal', 'RefArch'];

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
  // element-form product reference: <product-id-condition> wraps a bare <product-id>ID</product-id>,
  // and so does <bonus-products> (promotions.xml). The exact "<product-id>" open-tag match (no
  // attributes) never matches the unrelated <product-id-condition> element, whose tag name
  // continues past "product-id"
  out = replaceElement(out, 'product-id', map);
  return out;
}

export function transformFileContent(xml, rename, { isSiteXml = false, siteName = null, rebrand = false } = {}) {
  let out = transformXml(xml, rename.map);
  if (isSiteXml && siteName) {
    out = out.replace(/(<name>)([^<]*)(<\/name>)/, `$1${siteName}$3`);
  }
  if (rebrand) {
    // Rebrand ONLY inside content-asset text nodes (between > and <). Runs AFTER transformXml,
    // so site-id="RefArch" attributes and element/preference text such as the site name or
    // library-id are already tokenized and never seen as prose here; attribute values are never
    // touched because the regex matches only text between tags. rebrandProse only matches a
    // source name as a standalone word (not immediately followed by another identifier char), so
    // it is idempotent AND leaves already-tokenized compound text (e.g. "RefArchGlobalJ",
    // "RefArchSharedLibraryJ") alone even though it starts with a source name
    out = out.replace(/>([^<]*)</g, (full, text) => {
      if (SOURCE_SITE_NAMES.some((n) => text.includes(n))) {
        return '>' + rebrandProse(text, SOURCE_SITE_NAMES, rename.primaryName) + '<';
      }
      return full;
    });
  }
  return out;
}

// A path segment (a single directory or file name, never a full path) is renamed when it EQUALS
// a mapped id, or it STARTS WITH a mapped id immediately followed by ".". The dot boundary is
// what lets a pricebook or inventory FILENAME rename while keeping its extension attached
// ("usd-m-list-prices.xml" matches the key "usd-m-list-prices" and becomes
// "usd-m-list-pricesJ.xml"); a bare directory name such as "RefArchGlobal" matches only via
// whole equality. When more than one key qualifies, the LONGEST key wins, so
// "inventory_m_store_store1.xml" resolves against the full "inventory_m_store_store1" key rather
// than stopping at the shorter "inventory_m" prefix
function renamePathSegment(name, map) {
  let bestKey = null;
  for (const key of map.keys()) {
    const isWholeMatch = name === key || name.startsWith(key + '.');
    if (isWholeMatch && (!bestKey || key.length > bestKey.length)) bestKey = key;
  }
  return bestKey ? map.get(bestKey) + name.slice(bestKey.length) : name;
}

// Rename EVERY segment of a relative path independently, then rejoin with the platform
// separator. A single pass over all segments is enough to compute the correct output path for
// both a directory entry (its own name is the last segment) and a file nested under a renamed
// ancestor (e.g. "sites/RefArch/site.xml" needs its "RefArch" segment renamed on the way to
// building the containing directory, in addition to any rename of the file's own basename)
function renameRelPath(relPath, map) {
  return relPath.split(sep).map((segment) => renamePathSegment(segment, map)).join(sep);
}

function toPosixPath(relPath) {
  return relPath.split(sep).join('/');
}

// Everything here is copied byte-for-byte, never transformed, even when its content happens to
// contain a substring that also appears as a mapped id. Matches the "Untouched files" list in
// the project's global constraints. The caller (writeTransformedFile) already copies verbatim
// anything that is not a ".xml" file at all - via its own separate `!srcAbs.endsWith('.xml')`
// check, which is what actually protects the CSVs, .sample files, urls/* content, and every
// non-XML asset - so by the time this function runs, relPosix always ends in ".xml". This
// function therefore only needs to name the XML that must STILL be copied verbatim rather than
// transformed: meta/*.xml, geolocations/*.xml, and anything under a real active-data directory.
// The active-data check tests EVERY path segment uniformly (not just directory segments - the
// final segment, i.e. the filename itself, is checked the same way), matching a segment that
// either equals "active-data" or starts with "active-data-". There are two such directories in
// the vendored data - "active-data" and "active-data-lite" - so the match is bounded to those
// exact forms (not a bare substring match, to avoid over-matching an unrelated directory that
// merely starts with the same letters)
function isUntouchedPath(relPosix) {
  const segments = relPosix.split('/');
  if (segments.some((s) => s === 'active-data' || s.startsWith('active-data-'))) return true;
  if (segments[0] === 'meta') return true;
  if (segments.includes('urls')) return true;
  if (segments[0] === 'geolocations') return true;
  return false;
}

function isInventoryPath(relPosix) {
  return relPosix.split('/')[0] === 'inventory-lists';
}

function shouldSkipSite(relPosix, only) {
  if (!only) return false;
  const segments = relPosix.split('/');
  if (segments[0] !== 'sites') return false;
  const site = segments[1];
  if (only === 'primary' && site === 'RefArchGlobal') return true;
  if (only === 'global' && site === 'RefArch') return true;
  return false;
}

// site.xml's <name> follows the RENAMED id of the site it belongs to (not necessarily the
// primary name: RefArchGlobal/site.xml must read "RefArchGlobalJ", not "RefArchJ"). A private,
// site-scoped library (sites/<site>/library/library.xml) and the shared library
// (libraries/RefArchSharedLibrary/library.xml) both carry rebrandable prose, so either shape
// routes rebrand:true - the private one simply has no library-id/site-id text to act on today
function resolveContentOptions(relPosix, map) {
  const segments = relPosix.split('/');
  const basename = segments[segments.length - 1];
  const isSiteXml = basename === 'site.xml';
  const siteName = isSiteXml ? (map.get(segments[1]) ?? segments[1]) : null;
  const rebrand = segments.includes('libraries') || basename === 'library.xml';
  return { isSiteXml, siteName, rebrand };
}

function writeTransformedFile(relPosix, srcAbs, outAbs, rename, opts) {
  if (!srcAbs.endsWith('.xml') || isUntouchedPath(relPosix)) {
    copyFileSync(srcAbs, outAbs);
    return;
  }
  const xml = readFileSync(srcAbs, 'utf8');
  const out = isInventoryPath(relPosix)
    ? cleanInventoryXml(xml, rename.map, opts)
    : transformFileContent(xml, rename, resolveContentOptions(relPosix, rename.map));
  writeFileSync(outAbs, out);
}

// Walk srcDir, renaming every ID-bearing path segment, transforming XML content by file type,
// and copying everything else verbatim. Directories are created top-down before their children
// are visited, so by the time any file is written its output parent directory already exists
export function transformTree(srcDir, outDir, rename, opts) {
  mkdirSync(outDir, { recursive: true });

  const walk = (relPath) => {
    const srcParentAbs = relPath ? join(srcDir, relPath) : srcDir;
    for (const name of readdirSync(srcParentAbs)) {
      if (name === '.DS_Store') continue;
      const childRel = relPath ? join(relPath, name) : name;
      const childRelPosix = toPosixPath(childRel);
      if (shouldSkipSite(childRelPosix, opts.only)) continue;

      const childSrcAbs = join(srcParentAbs, name);
      const childOutAbs = join(outDir, renameRelPath(childRel, rename.map));

      if (statSync(childSrcAbs).isDirectory()) {
        mkdirSync(childOutAbs, { recursive: true });
        walk(childRel);
      } else {
        writeTransformedFile(childRelPosix, childSrcAbs, childOutAbs, rename, opts);
      }
    }
  };

  walk('');
}
