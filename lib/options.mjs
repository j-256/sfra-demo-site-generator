// lib/options.mjs
const TOKEN_RE = /^[A-Za-z0-9_-]+$/;
const MAX_TOKEN = 19; // RefArchGlobal(13) + token <= 32 site-id cap

export function parseOptions(argv) {
  const o = { token: null, only: null, keepAllocationTimestamps: false, out: 'out', force: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--token') o.token = argv[++i];
    else if (a === '--only') o.only = argv[++i];
    else if (a === '--keep-allocation-timestamps') o.keepAllocationTimestamps = true;
    else if (a === '--out') o.out = argv[++i];
    else if (a === '--force') o.force = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  if (!o.token) throw new Error('token is required (use --token <t>)');
  if (!TOKEN_RE.test(o.token)) throw new Error(`invalid token "${o.token}": use only [A-Za-z0-9_-]`);
  if (o.token.length > MAX_TOKEN) throw new Error(`token too long: max ${MAX_TOKEN} chars`);
  if (o.only !== null && o.only !== 'primary' && o.only !== 'global') {
    throw new Error('--only must be "primary" or "global"');
  }
  // a missing value means argv[++i] read past the end (undefined) or swallowed the NEXT flag
  // (e.g. "--out --force" sets out="--force" and silently leaves force=false). A leading "-" is
  // the tell for the swallowed-flag case: it is never a real intended directory name
  if (!o.out || o.out.startsWith('-')) {
    throw new Error(`--out requires a directory path (got ${JSON.stringify(o.out)}); check for a missing value`);
  }
  o.token = o.token[0].toUpperCase() + o.token.slice(1);
  return o;
}
