import test from 'node:test';
import assert from 'node:assert/strict';
import { readNewsSnapshot, describeNewsQuery } from '../src/utils/newsQuery.ts';

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
