#!/usr/bin/env node
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const ALLOWED_EXT = new Set(['.json', '.js', '.html', '.css', '.webp', '.gif', '.jpeg', '.jpg']);

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (fs.lstatSync(full).isSymbolicLink()) throw new Error(`public/ 禁止符號連結: ${path.relative(PUB, full)}`);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.isFile()) out.push(full);
  }
  return out.sort();
}

export function verifyPublicationBoundary() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.json'), 'utf8'));
  const pb = manifest.publicationBoundary ?? {};
  if (pb.sourceDocumentsPublished !== false) throw new Error('manifest 必須宣告 sourceDocumentsPublished=false');
  if (pb.fullPageRendersPublished !== false) throw new Error('manifest 必須宣告 fullPageRendersPublished=false');

  const files = walk(PUB);
  let bytes = 0;
  const isBinaryExt = (ext) => ext === '.webp' || ext === '.gif' || ext === '.jpeg' || ext === '.jpg';

  for (const file of files) {
    const rel = path.relative(PUB, file);
    const ext = path.extname(file).toLowerCase();
    if (!ALLOWED_EXT.has(ext)) throw new Error(`非白名單格式: ${rel}`);
    const buf = fs.readFileSync(file);
    bytes += buf.length;
    const head = buf.subarray(0, 5).toString('ascii');
    if (head === '%PDF-') throw new Error(`PDF 位元洩漏: ${rel}`);
    if (buf.length >= 4 && buf[0] === 0x50 && buf[1] === 0x4b && buf[2] === 0x03 && buf[3] === 0x04) {
      throw new Error(`ZIP/EPUB 容器洩漏: ${rel}`);
    }
    if (buf.includes(0x00) && !isBinaryExt(ext)) throw new Error(`文字資產含 NUL 位元組: ${rel}`);
  }

  const cover = fs.readFileSync(path.join(PUB, manifest.coverAsset.publicFile));
  const isWebp = cover.subarray(0, 4).toString('ascii') === 'RIFF' && cover.subarray(8, 12).toString('ascii') === 'WEBP';
  if (!isWebp) throw new Error('封面不是有效的 WebP');

  return { files: files.length, bytes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = verifyPublicationBoundary();
    console.log(`publication boundary OK — ${r.files} files, ${(r.bytes / 1048576).toFixed(1)} MiB, no source leakage`);
  } catch (err) {
    console.error('publication boundary failed:', err.message);
    process.exit(1);
  }
}
