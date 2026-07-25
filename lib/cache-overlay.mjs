// lib/cache-overlay.mjs
// Non-greedy 'g' so a document with more than one <settings>...</settings> yields every
// non-overlapping match, letting findExactlyOneSettingsBlock reject ambiguity by count. A
// literal nested <settings> (an open tag strictly inside the matched span, past position 0)
// still collapses to a single non-overlapping match, so count alone cannot detect it - the
// nested-tag check inside findExactlyOneSettingsBlock below covers that case separately
const SETTINGS_RE = /<settings>[\s\S]*?<\/settings>/g;

function findExactlyOneSettingsBlock(xml, label) {
  const matches = [...xml.matchAll(SETTINGS_RE)];
  if (matches.length === 0) throw new Error(`${label} has no <settings> block`);
  if (matches.length > 1) throw new Error(`${label} has ${matches.length} <settings> blocks, expected exactly 1`);
  const [match] = matches;
  // A non-greedy match stops at the FIRST </settings>, so a genuinely nested <settings> (an
  // open tag anywhere in the span other than position 0) means the match silently truncated at
  // the inner close tag rather than the outer one. Surface that instead of returning
  // truncated content
  if (match[0].indexOf('<settings>', 1) !== -1) {
    throw new Error(`${label} has a nested <settings> block, expected exactly 1`);
  }
  return match[0];
}

export function overlayCacheSettings(siteCacheXml, correctedSettingsXml) {
  const correctedBlock = findExactlyOneSettingsBlock(correctedSettingsXml, 'corrected cache-settings.xml');
  findExactlyOneSettingsBlock(siteCacheXml, 'site cache-settings.xml');
  // Replacer FUNCTION, not a replacement string - String.prototype.replace treats "$&", "$1",
  // "$'" and the backtick-prefixed form as substitution patterns ONLY when the replacement
  // argument is a string. The corrected block is real vendored XML content we do not control, so
  // a literal "$" sequence in it must be inserted verbatim rather than interpreted
  return siteCacheXml.replace(SETTINGS_RE, () => correctedBlock);
}
