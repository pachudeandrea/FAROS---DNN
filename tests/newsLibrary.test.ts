import test from 'node:test';
import assert from 'node:assert/strict';
import { isActiveSaved, SAVED_NEWS_TTL_MS } from '../src/utils/newsLibrary.js';

test('guardadas vence exactamente 24 horas después de guardarse, sin depender de la fecha de publicación', () => {
  const at = '2026-11-06T16:00:00.000Z'; const start = Date.parse(at);
  assert.equal(isActiveSaved(at, start), true);
  assert.equal(isActiveSaved(at, start + SAVED_NEWS_TTL_MS - 1), true);
  assert.equal(isActiveSaved(at, start + SAVED_NEWS_TTL_MS), false);
  assert.equal(isActiveSaved(at, start - 1), false);
  assert.equal(isActiveSaved(null, start), false);
  assert.equal(isActiveSaved('invalid', start), false);
});
