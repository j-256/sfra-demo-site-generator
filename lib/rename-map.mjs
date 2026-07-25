// lib/rename-map.mjs
export function buildRenameMap(ids, token) {
  const map = new Map();
  for (const id of ids) map.set(id, id + token);
  return { map, primaryName: 'RefArch' + token };
}
