// lib/archive.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, existsSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

// zip the innerName folder (must be a child of dir's parent) so the archive's top entry is innerName/
export function zipDir(dir, zipPath, innerName) {
  const parent = dirname(dir);
  // `zip -r` UPDATES an existing archive rather than replacing it: entries whose source file was
  // since deleted are silently KEPT. Unlink any pre-existing zipPath first so every call produces
  // a fresh archive matching the CURRENT source tree, rather than relying on every caller to
  // remember to remove a stale target first (the OOTB storefrontdata zipData script does this via
  // its own `rm` before zipping - this makes zipDir self-contained instead)
  //
  // CONTRACT: zipPath is resolved relative to dirname(dir) (i.e. relative to `parent`), matching
  // the `cwd: parent` handed to the zip child process below - so pass a bare filename, or a path
  // already relative to that parent. This mirrors what the zip subprocess would have done on its
  // own even without this resolve() call (a relative arg is interpreted against the process's own
  // cwd, which is `parent`); resolving it explicitly here just makes the value available for the
  // pre-existence check on the line below and for the dash-leading-path guard further down. Passing
  // something already prefixed with the caller's own outRoot (e.g. join(outRoot, 'x.zip') when dir
  // is join(outRoot, 'tree')) DOUBLES that segment - pass innerName-style bare names instead, the
  // same way every real call site in this project does
  const absZipPath = resolve(parent, zipPath);
  if (existsSync(absZipPath)) unlinkSync(absZipPath);
  // zip's OWN argv parser (no shell involved - execFileSync passes an argv array directly) reads
  // a leading "-" as an option introducer. "--" tells zip every arg after it is positional, which
  // protects innerName from being misread as a flag (e.g. a folder literally named "-x"). zip
  // rejects "--" immediately before the archive-name position ("can't use -- before archive
  // name"), so zipPath is protected differently: resolved to an absolute path via `resolve()`
  // above, which can never start with "-"
  execFileSync('zip', ['-r', '-q', absZipPath, '--', innerName], { cwd: parent });
}

// Concatenate transformed per-list inventory files into a single <inventory> doc
// Fail-fast, matching the rest of this project (e.g. parseOptions, verifyTree gating the whole
// pipeline): a candidate .xml file that does not contain an <inventory-list> block, or zero
// inventory-list blocks overall, throws immediately rather than silently shipping a degraded or
// empty <inventory> document that would only fail later, at IMPORT time in Business Manager -
// the hardest place to diagnose it
export function makeInventoryDoc(outDir) {
  const invDir = join(outDir, 'inventory-lists');
  const lists = readdirSync(invDir).filter((f) => f.endsWith('.xml'));
  const bodies = lists.map((f) => {
    const xml = readFileSync(join(invDir, f), 'utf8');
    const m = xml.match(/<inventory-list>[\s\S]*<\/inventory-list>/);
    if (!m) throw new Error(`makeInventoryDoc: ${f} has no <inventory-list> block`);
    return m[0];
  });
  if (bodies.length === 0) throw new Error(`makeInventoryDoc: no inventory-list blocks found under ${invDir}`);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<inventory xmlns="http://www.demandware.com/xml/impex/inventory/2007-05-31">\n${bodies.join('\n')}\n</inventory>\n`;
}
