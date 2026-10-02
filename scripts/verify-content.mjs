#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUB = path.join(ROOT, 'public');
const EXPECT = { chapters: 87, segments: 3643 };

export function verifyContent() {
  const manifest = JSON.parse(fs.readFileSync(path.join(PUB, 'manifest.json'), 'utf8'));
  assert.equal(manifest.key, 'zphlm', 'manifest.key');
  assert.equal(manifest.counts.chapters, EXPECT.chapters, 'manifest.counts.chapters');
  assert.equal(manifest.counts.segments, EXPECT.segments, 'manifest.counts.segments');

  const contentJs = fs.readFileSync(path.join(PUB, 'content.js'), 'utf8');
  assert.ok(contentJs.startsWith('window.BOOK = '), 'content.js must start with window.BOOK =');
  const book = JSON.parse(contentJs.slice(contentJs.indexOf('{')).replace(/;\s*$/, ''));
  assert.equal(book.chapters.length, EXPECT.chapters, 'content.js chapters');

  const files = fs.readdirSync(path.join(PUB, 'chapters')).filter((f) => f.endsWith('.json')).sort();
  assert.equal(files.length, EXPECT.chapters, 'chapters/*.json count');

  let totalSegments = 0;
  for (const file of files) {
    const segs = JSON.parse(fs.readFileSync(path.join(PUB, 'chapters', file), 'utf8'));
    assert.ok(Array.isArray(segs), `${file} must be an array`);
    for (const seg of segs) {
      totalSegments += 1;
      assert.ok(seg.zh, `seg ${seg.id} missing zh`);
    }
  }
  assert.equal(totalSegments, EXPECT.segments, 'total segments match expected');

  return { chapters: files.length, segments: totalSegments };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const r = verifyContent();
    console.log(`content OK — ${r.chapters} chapters, ${r.segments} segments verified with 100% full content`);
  } catch (err) {
    console.error('content verification failed:', err.message);
    process.exit(1);
  }
}
