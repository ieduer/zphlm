#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const TOML = fs.readFileSync(path.join(ROOT, 'wrangler.toml'), 'utf8');
const BASELINE_COMPAT = '2026-08-08';
const problems = [];

const need = (re, label) => { if (!re.test(TOML)) problems.push(`wrangler.toml 缺少 ${label}`); };

need(/^name\s*=\s*"zphlm-reader"/m, 'name = "zphlm-reader"');
need(/^main\s*=\s*"src\/release-entry\.js"/m, 'main = src/release-entry.js');
need(/^workers_dev\s*=\s*false/m, 'workers_dev = false');
need(/^preview_urls\s*=\s*false/m, 'preview_urls = false');
need(/binding\s*=\s*"ASSETS"/, 'ASSETS binding');
need(/binding\s*=\s*"DB"/, 'D1 binding DB');
need(/database_name\s*=\s*"zphlm-reactions"/, 'D1 database_name');
need(/binding\s*=\s*"CF_VERSION_METADATA"/, 'CF_VERSION_METADATA');
need(/BOOK_ID\s*=\s*"zphlm"/, 'BOOK_ID var');
need(/pattern\s*=\s*"zphlm\.bdfz\.net(?:\/\*)?"/, 'route pattern');

const compat = TOML.match(/^compatibility_date\s*=\s*"([\d-]+)"/m)?.[1];
if (!compat) problems.push('wrangler.toml 缺少 compatibility_date');
else if (compat < BASELINE_COMPAT) problems.push(`compatibility_date ${compat} 低於基線 ${BASELINE_COMPAT}`);

for (const rel of ['src/index.js', 'src/release-entry.js', 'src/tombstone.js', 'public/app.js', 'public/read-storage.js']) {
  const buf = fs.readFileSync(path.join(ROOT, rel));
  if (buf.includes(0x00)) problems.push(`${rel} 含 NUL 位元組（請用 \\x00 跳脫，勿寫入裸位元組）`);
  try {
    execFileSync(process.execPath, ['--check', path.join(ROOT, rel)], { stdio: 'pipe' });
  } catch (err) {
    problems.push(`${rel} 語法檢查失敗: ${String(err.stderr || err).split('\n').find((l) => l.includes('Error')) ?? ''}`);
  }
}

const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
for (const s of ['verify', 'check:config', 'check:content', 'check:publication'])
  if (!pkg.scripts?.[s]) problems.push(`package.json 缺少 scripts.${s}`);

if (problems.length) {
  console.error('config verification failed:');
  for (const p of problems) console.error('  - ' + p);
  process.exit(1);
}
console.log(`config OK — compatibility_date ${compat}, bindings/exposure/syntax contracts satisfied`);
