import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyContent } from '../scripts/verify-content.mjs';

test('內容契約：87 章節／3643 段落，繁體正文與脂批完整、零缺漏', () => {
  const r = verifyContent();
  assert.equal(r.chapters, 87);
  assert.equal(r.segments, 3643);
});
