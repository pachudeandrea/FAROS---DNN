import test from 'node:test';
import assert from 'node:assert/strict';
import { pulseSelectionKey, usablePulseSnapshot } from '../src/server/newsPulseCache.js';
import { portfolioNewsScope } from '../src/utils/newsCache.js';
import { REAL_GROUNDED_NEWS } from '../src/data/groundedRealNews.js';
import { argentinaNewsHour } from '../src/utils/dailyNews.js';

const now = Date.parse('2026-11-06T18:00:00Z');
function snapshot() {
  const news = structuredClone(REAL_GROUNDED_NEWS[0]);
  news.sources = news.sources.map(source => ({ ...source, publishedTimestamp: now - 60000, publishedDateIso: new Date(now - 60000).toISOString() }));
  return { timestamp: now - 1000, hourKey: argentinaNewsHour(now), news: [news] };
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

test('el caché dura toda la jornada argentina y se descarta a medianoche, sin ventana móvil de 24/48h', () => {
  const original = snapshot();
  const cached = usablePulseSnapshot(original, now)!;
  assert.equal(cached.timestamp, original.timestamp); assert.deepEqual(cached.news[0].sources, original.news[0].sources);
  assert.equal(cached.news[0].coverageCount, original.news[0].sources.length);
  const morning = { ...original, timestamp: Date.parse('2026-11-06T03:01:00Z'), hourKey: '2026-11-06_00' };
  assert.ok(usablePulseSnapshot(morning, now), 'Una noticia matinal se conserva más de dos horas');
  assert.ok(usablePulseSnapshot(original, Date.parse('2026-11-07T02:59:59.999Z')));
  assert.equal(usablePulseSnapshot(original, Date.parse('2026-11-07T03:00:00Z')), null);
  assert.equal(usablePulseSnapshot({ ...original, timestamp: now + 1 }, now), null);
  assert.equal(usablePulseSnapshot({ ...original, hourKey: '2026-11-05_23' }, now), null);
  const yesterday = snapshot();
  yesterday.news[0].sources = yesterday.news[0].sources.map(source => ({ ...source, publishedTimestamp: Date.parse('2026-11-06T02:59:59Z') }));
  assert.equal(usablePulseSnapshot(yesterday, now), null);
  const undated = snapshot();
  undated.news[0].sources = undated.news[0].sources.map(source => ({ ...source, publishedTimestamp: undefined, publishedDateIso: undefined }));
  assert.equal(usablePulseSnapshot(undated, now), null);
  assert.equal(usablePulseSnapshot({ ...original, news: [{ ...original.news[0], headline: '' }] }, now), null);
  assert.deepEqual(usablePulseSnapshot({ ...original, news: [] }, now)?.news, []);
});
