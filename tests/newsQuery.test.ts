import test from 'node:test';
import assert from 'node:assert/strict';
import { readNewsSnapshot, describeNewsQuery, findRecentNewsSnapshot, pruneNewsSnapshotCache } from '../src/utils/newsQuery.ts';

test('una consulta vacía confirmada se conserva sin inventar hora ni ausencia de riesgos', () => {
  const snapshot = readNewsSnapshot(JSON.stringify({ news: [], checkedAt: '2026-11-01T14:23:00.000Z' }));
  assert.deepEqual(snapshot, { news: [], checkedAt: '2026-11-01T14:23:00.000Z' });
  const text = describeNewsQuery({ status: 'success', checkedAt: snapshot!.checkedAt }, 0);
  assert.match(text, /Sin novedades verificadas/); assert.match(text, /11:23/);
  assert.doesNotMatch(text, /sin riesgos|11:45/i);
  const legacy = readNewsSnapshot('[]');
  assert.equal(legacy!.checkedAt, null);
  assert.match(describeNewsQuery({ status: 'cached', checkedAt: null }, 0), /Horario de consulta no disponible/);
});
test('errores y búsquedas distinguen información anterior de una consulta completada', () => {
  assert.match(describeNewsQuery({ status: 'error', checkedAt: '2026-11-01T14:23:00Z' }, 4), /Error al actualizar.*consulta anterior.*11:23/);
  assert.match(describeNewsQuery({ status: 'loading', checkedAt: null }, 4), /Buscando noticias.*consulta anterior/);
  assert.doesNotMatch(describeNewsQuery({ status: 'error', checkedAt: null }, 0), /Sin novedades verificadas/);
  assert.equal(readNewsSnapshot('{bad'), null);
  assert.equal(readNewsSnapshot('{"news":{}}'), null);
  assert.equal(readNewsSnapshot('{"news":[],"checkedAt":"inventada"}')!.checkedAt, null);
});


test('la limpieza conserva el respaldo reciente al cruzar medianoche sin conservar versiones incompatibles', () => {
  const now = Date.parse('2026-11-07T03:05:00Z'); // 00:05 in Buenos Aires.
  const prefix = 'faros_news_v13_news_tracking_coverage_';
  const snapshot = (checkedAt: string) => JSON.stringify({ news: [{ id: 'verified', sources: [{ publishedDateIso: '2026-11-07T02:00:00Z' }] }], checkedAt });
  const recentKey = `${prefix}same_2026-11-06_23`;
  const values = new Map([
    [recentKey, snapshot('2026-11-07T02:55:00Z')],
    [`${prefix}same_2026-11-06_21`, snapshot('2026-11-07T00:00:00Z')],
    ['faros_news_v4_coverage_same_2026-11-06_23', snapshot('2026-11-07T02:55:00Z')],
    ['faros_session_token', 'preserve-session']
  ]);
  const storage = { get length() { return values.size; }, key: (index: number) => [...values.keys()][index], getItem: (key: string) => values.get(key) || null, removeItem: (key: string) => { values.delete(key); } };
  pruneNewsSnapshotCache(storage, prefix, '2026-11-07', now);
  assert.deepEqual([...values.keys()], [recentKey, 'faros_session_token']);
  assert.equal(findRecentNewsSnapshot(storage, `${prefix}same_`, now)?.checkedAt, '2026-11-07T02:55:00Z');
  assert.equal(findRecentNewsSnapshot(storage, `${prefix}different_`, now), null);
});
