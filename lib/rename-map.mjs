// lib/rename-map.mjs
export function buildRenameMap(ids, token, only) {
  const map = new Map();
  for (const id of ids) map.set(id, id + token);
  const siteIds = {
    primary: only === 'global' ? null : 'RefArch' + token,
    global: only === 'primary' ? null : 'RefArchGlobal' + token,
  };
  // token is threaded through so the prose rebrand (Task 5) can build its idempotence lookahead
  return { map, primaryName: 'RefArch' + token, siteIds, token };
}
