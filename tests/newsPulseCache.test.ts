import test from 'node:test';
import assert from 'node:assert/strict';
import { pulseSelectionKey, usablePulseSnapshot } from '../src/server/newsPulseCache.js';
import { portfolioNewsScope } from '../src/utils/newsCache.js';
import { REAL_GROUNDED_NEWS } from '../src/data/groundedRealNews.js';

const now = Date.now();
function snapshot() {
  const news = structuredClone(REAL_GROUNDED_NEWS[0]);
  news.sources = news.sources.map(source => ({ ...source, publishedTimestamp: now - 60000, publishedDateIso: new Date(now - 60000).toISOString() }));
  return { timestamp: now - 1000, hourKey: '2026-11-06_12', news: [news] };
}

test('la clave compartida incluye activos, perfil, posiciones y metadatos, sin depender de una cuenta o ID de cartera', () => {
  const key = (ids: string[], profile = 'moderado', positions = {}, custom: unknown[] = []) => pulseSelectionKey(portfolioNewsScope(ids, profile, positions, custom));
  assert.equal(key(['AL30', 'YPFD']), key(['YPFD', 'AL30']));
  assert.equal(key(['AL30']), key(['AL30'], 'moderado', { AL30: 'long' }));
  assert.notEqual(key(['AL30']), key(['AL30'], 'dinamico'));
  assert.notEqual(key(['AL30']), key(['AL30'], 'moderado', { AL30: 'short' }));
  assert.notEqual(key(['AL30']), key(['YPFD']));
  assert.notEqual(key(['OWN'], 'moderado', {}, [{ name: 'Private issuer A' }]), key(['OWN'], 'moderado', {}, [{ name: 'Private issuer B' }]));
  assert.match(key(['AL30']), /^[a-f0-9]{64}$/);
});

test('un caché compartido respeta vigencia y fecha real, conserva comparación y rechaza fuentes inválidas', () => {
  const original = snapshot();
  const cached = usablePulseSnapshot(original, now)!;
  assert.equal(cached.timestamp, original.timestamp);
  assert.deepEqual(cached.news[0].sources, original.news[0].sources);
  assert.equal(cached.news[0].coverageCount, original.news[0].sources.length);
  assert.equal(usablePulseSnapshot({ ...original, timestamp: now - 2 * 3600000 - 1 }, now), null);
  assert.equal(usablePulseSnapshot({ ...original, timestamp: now + 1 }, now), null);
  const stale = snapshot();
  stale.news[0].sources = stale.news[0].sources.map(source => ({ ...source, publishedTimestamp: now - 49 * 3600000 }));
  assert.equal(usablePulseSnapshot(stale, now), null, 'No convertir publicaciones vencidas en un vacío exitoso');
  const undated = snapshot();
  undated.news[0].sources = undated.news[0].sources.map(source => ({ ...source, publishedTimestamp: undefined, publishedDateIso: undefined }));
  assert.equal(usablePulseSnapshot(undated, now), null);
  assert.equal(usablePulseSnapshot({ ...original, news: [{ ...original.news[0], headline: '' }] }, now), null);
  assert.deepEqual(usablePulseSnapshot({ ...original, news: [] }, now)?.news, []);
});
