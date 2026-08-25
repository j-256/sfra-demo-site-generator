// lib/rename-map.mjs
export function buildRenameMap(ids, suffix) {
  const map = new Map();
  for (const id of ids) map.set(id, id + suffix);
  return { map, primaryName: 'RefArch' + suffix };
}
