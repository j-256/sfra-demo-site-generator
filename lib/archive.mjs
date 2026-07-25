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
export function makeInventoryDoc(outDir) {
  const invDir = join(outDir, 'inventory-lists');
  const lists = readdirSync(invDir).filter((f) => f.endsWith('.xml'));
  const bodies = lists.map((f) => {
    const xml = readFileSync(join(invDir, f), 'utf8');
    const m = xml.match(/<inventory-list>[\s\S]*<\/inventory-list>/);
    return m ? m[0] : '';
  }).filter(Boolean);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<inventory xmlns="http://www.demandware.com/xml/impex/inventory/2007-05-31">\n${bodies.join('\n')}\n</inventory>\n`;
}
