import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

test('設定契約：綁定、相容性基線、外露開關、原始碼無 NUL', () => {
  const out = execFileSync(process.execPath, [path.join(ROOT, 'scripts/verify-config.mjs')], { encoding: 'utf8' });
  assert.match(out, /config OK/);
});
