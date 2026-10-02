import test from 'node:test';
import assert from 'node:assert/strict';
import { verifyPublicationBoundary } from '../scripts/verify-publication-boundary.mjs';

test('發布邊界：public/ 無來源 EPUB 位元、無非白名單格式、無 NUL', () => {
  const r = verifyPublicationBoundary();
  assert.ok(r.files >= 80);
  assert.ok(r.bytes > 0);
});
