// lib/rebrand.mjs
// Replace literal source site-name occurrences in prose with primaryName
// Sort longest-first so "RefArchGlobal" is consumed before the "RefArch" rule can match its prefix
// A name is rebranded only when it appears as a standalone word: the (?![A-Za-z0-9_-]) lookahead
// requires that the character right after the name NOT continue an identifier. This is what makes
// the pass idempotent - "RefArchJ" (already rebranded) has "J" right after "RefArch", so it is
// skipped - and it also skips compound already-tokenized text such as "RefArchGlobalJ" or
// "RefArchSharedLibraryJ" (there the next char is "G" or "S", a case a token-only lookahead
// missed), and unrelated words that merely share the same prefix, such as "RefArchJoinery"
export function rebrandProse(text, siteNames, primaryName) {
  const ordered = [...siteNames].sort((a, b) => b.length - a.length);
  let out = text;
  for (const name of ordered) {
    const esc = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const re = new RegExp(`${esc}(?![A-Za-z0-9_-])`, 'g');
    out = out.replace(re, primaryName);
  }
  return out;
}
