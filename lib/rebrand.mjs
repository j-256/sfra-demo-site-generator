// lib/rebrand.mjs
// Replace literal source site-name occurrences in prose with primaryName
// Sort longest-first so "RefArchGlobal" is consumed before the "RefArch" rule can match its prefix
// The (?!token) lookahead skips occurrences already followed by the token (i.e. already rebranded),
// so the pass is idempotent even though primaryName = "RefArch"+token contains "RefArch"
export function rebrandProse(text, siteNames, primaryName, token) {
  const ordered = [...siteNames].sort((a, b) => b.length - a.length);
  const escToken = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let out = text;
  for (const name of ordered) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${esc}(?!${escToken})`, 'g');
    out = out.replace(re, primaryName);
  }
  return out;
}
