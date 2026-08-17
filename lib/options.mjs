// lib/options.mjs
const TOKEN_RE = /^[A-Za-z0-9_-]+$/;
const MAX_TOKEN = 19; // RefArchGlobal(13) + token <= 32 site-id cap

// A cache-settings file carries all three environment blocks and every instance imports and
// STORES all three - what differs is which one the instance OBEYS. The other two are inert but
// still present and editable. So enabling caching is per-environment, not a profile choice:
// there is no way to ship only the block that matters for one instance type.
// Production is always on; staging and development are opt-in via --cache.
// Aliases exist because these are hand-typed and the platform's own naming is inconsistent
const CACHE_ENVS = Object.freeze({
  production: 'production',
  prd: 'production',
  prod: 'production',
  staging: 'staging',
  stg: 'staging',
  development: 'development',
  dev: 'development',
});
const ALWAYS_CACHED = 'production';
const CACHE_CHOICES = [...new Set(Object.values(CACHE_ENVS))].join(', ');

// Short letters that TAKE A VALUE, so -cstg expands to -c stg rather than -c -s -t -g.
// -O is uppercase because -o is already --out
const VALUE_SHORTS = 'tOoc';

// Usage errors get exit code 2 so a caller can tell "you invoked me wrong" from "something broke
// while running" (which stays 1). Anything parseOptions rejects is by definition the former
function usageError(message) {
  const e = new Error(message);
  e.exitCode = 2;
  return e;
}

// Expand bundled and glued short options so the parse loop only ever sees one flag per token:
// -kf becomes -k -f, and -tx becomes -t x when t takes a value. A token that is exactly "-" or
// starts with "--" passes through, as does anything after a bare "--"
function expandShortOpts(argv) {
  const out = [];
  let passthru = false;
  for (const arg of argv) {
    if (passthru) { out.push(arg); continue; }
    if (arg === '--') { passthru = true; out.push(arg); continue; }
    if (arg === '-' || arg.startsWith('--') || !arg.startsWith('-')) { out.push(arg); continue; }
    let rest = arg.slice(1);
    while (rest.length > 0) {
      const c = rest[0];
      rest = rest.slice(1);
      out.push(`-${c}`);
      if (VALUE_SHORTS.includes(c) && rest.length > 0) {
        out.push(rest);
        rest = '';
      }
    }
  }
  return out;
}

// Read the value for an option, accepting both "--flag value" and "--flag=value". Returns the
// value and how many argv slots it consumed
function optionValue(argv, i, flagName) {
  const arg = argv[i];
  const eq = arg.indexOf('=');
  if (arg.startsWith('--') && eq !== -1) {
    const value = arg.slice(eq + 1);
    if (!value) throw usageError(`${flagName} requires a value. Run \`./generate --help\` for usage`);
    return { value, consumed: 1 };
    }
  const value = argv[i + 1];
  if (value === undefined || value.startsWith('-')) {
    throw usageError(`${flagName} requires a value. Run \`./generate --help\` for usage`);
  }
  return { value, consumed: 2 };
}

export function parseOptions(rawArgv) {
  const argv = expandShortOpts(rawArgv);
  const o = {
    help: false, token: null, only: null, keepAllocationTimestamps: false, out: 'out',
    force: false, cacheEnvs: [ALWAYS_CACHED],
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const flag = a.startsWith('--') && a.includes('=') ? a.slice(0, a.indexOf('=')) : a;
    if (flag === '-h' || flag === '--help') { o.help = true; return o; }
    else if (flag === '-t' || flag === '--token') {
      const { value, consumed } = optionValue(argv, i, '--token');
      o.token = value; i += consumed - 1;
    } else if (flag === '-O' || flag === '--only') {
      const { value, consumed } = optionValue(argv, i, '--only');
      o.only = value; i += consumed - 1;
    } else if (flag === '-o' || flag === '--out') {
      const { value, consumed } = optionValue(argv, i, '--out');
      o.out = value; i += consumed - 1;
    } else if (flag === '-c' || flag === '--cache') {
      const { value, consumed } = optionValue(argv, i, '--cache');
      const env = CACHE_ENVS[value];
      if (!env) {
        throw usageError(
          `--cache requires one of ${CACHE_CHOICES} (aliases prd/stg/dev); got ${JSON.stringify(value)}`);
      }
      if (!o.cacheEnvs.includes(env)) o.cacheEnvs.push(env);
      i += consumed - 1;
    } else if (flag === '-k' || flag === '--keep-allocation-timestamps') o.keepAllocationTimestamps = true;
    else if (flag === '-f' || flag === '--force') o.force = true;
    else throw usageError(`unknown argument: ${a}`);
  }
  if (!o.token) throw usageError('token is required (use --token <t>)');
  if (!TOKEN_RE.test(o.token)) throw usageError(`invalid token "${o.token}": use only [A-Za-z0-9_-]`);
  if (o.token.length > MAX_TOKEN) throw usageError(`token too long: max ${MAX_TOKEN} chars`);
  if (o.only !== null && o.only !== 'primary' && o.only !== 'global') {
    throw usageError('--only must be "primary" or "global"');
  }
  if (!o.out) throw usageError('--out requires a directory path');
  return o;
}
