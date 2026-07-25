// lib/archive.mjs
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

// zip the innerName folder (must be a child of dir's parent) so the archive's top entry is innerName/
export function zipDir(dir, zipPath, innerName) {
  const parent = dirname(dir);
  execFileSync('zip', ['-r', '-q', zipPath, innerName], { cwd: parent });
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
