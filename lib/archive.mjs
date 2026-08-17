// lib/archive.mjs
import { Buffer } from 'node:buffer';
import { randomBytes } from 'node:crypto';
import {
  closeSync,
  lstatSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { deflateRawSync } from 'node:zlib';

const ZIP_LOCAL_FILE_HEADER = 0x04034b50;
const ZIP_CENTRAL_DIRECTORY_HEADER = 0x02014b50;
const ZIP_END_OF_CENTRAL_DIRECTORY = 0x06054b50;
const ZIP_VERSION = 20;
const ZIP_UNIX_VERSION = 0x0314;
const ZIP_UTF8_FLAG = 0x0800;
const ZIP_STORE_METHOD = 0;
const ZIP_DEFLATE_METHOD = 8;
const ZIP_MAX_UINT16 = 0xffff;
const ZIP_MAX_UINT32 = 0xffffffff;

const CRC_TABLE = Object.freeze(Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
}));

function compareNames(left, right) {
  if (left < right) return -1;
  if (left > right) return 1;
  return 0;
}

function collectEntries(sourcePath, archiveName, entries = []) {
  const stat = lstatSync(sourcePath);
  if (stat.isSymbolicLink()) {
    throw new Error(`zipDir: symbolic links are not supported: ${sourcePath}`);
  }
  if (stat.isDirectory()) {
    const directoryName = archiveName.endsWith('/') ? archiveName : `${archiveName}/`;
    entries.push({ sourcePath, archiveName: directoryName, stat, isDirectory: true });
    for (const child of readdirSync(sourcePath).sort(compareNames)) {
      collectEntries(join(sourcePath, child), `${directoryName}${child}`, entries);
    }
    return entries;
  }
  if (!stat.isFile()) {
    throw new Error(`zipDir: unsupported file type: ${sourcePath}`);
  }
  entries.push({ sourcePath, archiveName, stat, isDirectory: false });
  return entries;
}

function crc32(buffer) {
  let crc = ZIP_MAX_UINT32;
  for (const byte of buffer) {
    crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ ZIP_MAX_UINT32) >>> 0;
}

function dosTimestamp(date) {
  const year = Math.min(2107, Math.max(1980, date.getFullYear()));
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  return { dosDate, dosTime };
}

function assertUInt16(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP_MAX_UINT16) {
    throw new Error(`zipDir: ${label} exceeds the classic ZIP limit`);
  }
}

function assertUInt32(value, label) {
  if (!Number.isSafeInteger(value) || value < 0 || value > ZIP_MAX_UINT32) {
    throw new Error(`zipDir: ${label} exceeds the classic ZIP limit`);
  }
}

function writeBuffer(fd, buffer, state) {
  assertUInt32(state.offset + buffer.length, 'archive size');
  let offset = 0;
  while (offset < buffer.length) {
    const written = writeSync(fd, buffer, offset, buffer.length - offset);
    if (written <= 0) throw new Error('zipDir: failed to write archive data');
    offset += written;
  }
  state.offset += buffer.length;
}

function localHeader(entry) {
  const header = Buffer.alloc(30);
  header.writeUInt32LE(ZIP_LOCAL_FILE_HEADER, 0);
  header.writeUInt16LE(ZIP_VERSION, 4);
  header.writeUInt16LE(ZIP_UTF8_FLAG, 6);
  header.writeUInt16LE(entry.method, 8);
  header.writeUInt16LE(entry.dosTime, 10);
  header.writeUInt16LE(entry.dosDate, 12);
  header.writeUInt32LE(entry.crc, 14);
  header.writeUInt32LE(entry.compressedSize, 18);
  header.writeUInt32LE(entry.uncompressedSize, 22);
  header.writeUInt16LE(entry.name.length, 26);
  header.writeUInt16LE(0, 28);
  return header;
}

function centralDirectoryRecord(entry) {
  const header = Buffer.alloc(46);
  const externalAttributes = (((entry.stat.mode & 0xffff) << 16) | (entry.isDirectory ? 0x10 : 0)) >>> 0;
  header.writeUInt32LE(ZIP_CENTRAL_DIRECTORY_HEADER, 0);
  header.writeUInt16LE(ZIP_UNIX_VERSION, 4);
  header.writeUInt16LE(ZIP_VERSION, 6);
  header.writeUInt16LE(ZIP_UTF8_FLAG, 8);
  header.writeUInt16LE(entry.method, 10);
  header.writeUInt16LE(entry.dosTime, 12);
  header.writeUInt16LE(entry.dosDate, 14);
  header.writeUInt32LE(entry.crc, 16);
  header.writeUInt32LE(entry.compressedSize, 20);
  header.writeUInt32LE(entry.uncompressedSize, 24);
  header.writeUInt16LE(entry.name.length, 28);
  header.writeUInt16LE(0, 30);
  header.writeUInt16LE(0, 32);
  header.writeUInt16LE(0, 34);
  header.writeUInt16LE(0, 36);
  header.writeUInt32LE(externalAttributes, 38);
  header.writeUInt32LE(entry.localOffset, 42);
  return Buffer.concat([header, entry.name]);
}

function endOfCentralDirectory(entryCount, centralSize, centralOffset) {
  const record = Buffer.alloc(22);
  record.writeUInt32LE(ZIP_END_OF_CENTRAL_DIRECTORY, 0);
  record.writeUInt16LE(0, 4);
  record.writeUInt16LE(0, 6);
  record.writeUInt16LE(entryCount, 8);
  record.writeUInt16LE(entryCount, 10);
  record.writeUInt32LE(centralSize, 12);
  record.writeUInt32LE(centralOffset, 16);
  record.writeUInt16LE(0, 20);
  return record;
}

// Write a fresh classic ZIP with innerName as its top-level entry
export function zipDir(dir, zipPath, innerName) {
  const parent = dirname(dir);
  if (!innerName || basename(innerName) !== innerName) {
    throw new Error('zipDir: innerName must name a direct child of dirname(dir)');
  }

  const sourcePath = join(parent, innerName);
  const entries = collectEntries(sourcePath, innerName);
  assertUInt16(entries.length, 'entry count');
  for (const entry of entries) {
    entry.name = Buffer.from(entry.archiveName, 'utf8');
    assertUInt16(entry.name.length, `entry name length for ${entry.archiveName}`);
  }

  const absZipPath = resolve(parent, zipPath);
  const tempPath = join(dirname(absZipPath), `.${basename(absZipPath)}.${process.pid}.${randomBytes(8).toString('hex')}.tmp`);
  let fd;
  try {
    fd = openSync(tempPath, 'wx');
    const state = { offset: 0 };
    const centralRecords = [];

    for (const entry of entries) {
      const raw = entry.isDirectory ? Buffer.alloc(0) : readFileSync(entry.sourcePath);
      const compressed = entry.isDirectory ? raw : deflateRawSync(raw);
      const useDeflate = compressed.length < raw.length;
      const payload = useDeflate ? compressed : raw;
      const timestamp = dosTimestamp(entry.stat.mtime);
      assertUInt32(raw.length, `uncompressed size for ${entry.archiveName}`);
      assertUInt32(payload.length, `compressed size for ${entry.archiveName}`);
      assertUInt32(state.offset, `local header offset for ${entry.archiveName}`);

      entry.crc = crc32(raw);
      entry.method = useDeflate ? ZIP_DEFLATE_METHOD : ZIP_STORE_METHOD;
      entry.dosTime = timestamp.dosTime;
      entry.dosDate = timestamp.dosDate;
      entry.compressedSize = payload.length;
      entry.uncompressedSize = raw.length;
      entry.localOffset = state.offset;

      writeBuffer(fd, localHeader(entry), state);
      writeBuffer(fd, entry.name, state);
      writeBuffer(fd, payload, state);
      centralRecords.push(centralDirectoryRecord(entry));
    }

    const centralOffset = state.offset;
    for (const record of centralRecords) writeBuffer(fd, record, state);
    const centralSize = state.offset - centralOffset;
    assertUInt32(centralOffset, 'central directory offset');
    assertUInt32(centralSize, 'central directory size');
    writeBuffer(fd, endOfCentralDirectory(entries.length, centralSize, centralOffset), state);
    closeSync(fd);
    fd = undefined;
    renameSync(tempPath, absZipPath);
  } catch (error) {
    if (fd !== undefined) {
      try {
        closeSync(fd);
      } catch {
        // Preserve the original failure
      }
    }
    try {
      unlinkSync(tempPath);
    } catch {
      // The temporary archive may not have been created
    }
    throw error;
  }
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
