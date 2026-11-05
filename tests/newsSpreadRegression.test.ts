import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MediaCoverage, NewsItem } from '../src/types/index.js';
import { sourcesCoverSameEvent, mergeVerifiedNews } from '../src/utils/newsCoverage.js';
import { coverageEventQueries } from '../src/utils/coverageDiscovery.js';

// Public article metadata returned by production, supplied by the user.
// This regression reproduces matching, not a new live publication check.
const sources: MediaCoverage[] = JSON.parse(readFileSync(new URL('./fixtures/verified-risk-2026-11-05.json', import.meta.url), 'utf8'));

test('producción: reúne el cruce de 900 puntos de la misma jornada en Ámbito e Infobae', () => {
  for (const a of sources.slice(1)) for (const b of sources.slice(1)) assert.equal(sourcesCoverSameEvent(a, b), true, `${a.originalHeadline} / ${b.originalHeadline}`);
  const items = sources.map((source, index) => ({ id: `public-${index}`, headline: source.originalHeadline, sources: [source], affectedAssetIds: ['AL30', 'GD30'], briefSummary: `Análisis ${index}`, portfolioImpactAnalysis: { directExplanation: `Análisis ${index}`, affectedHoldings: [] } } as unknown as NewsItem));
  const result = mergeVerifiedNews(items, [], new Date('2026-11-06T00:00:00Z'));
  assert.equal(result.length, 2, 'Reservas/FMI permanece como hecho independiente');
  const risk = result.find(item => item.id === 'public-1')!;
  assert.equal(risk.coverageCount, 2);
  assert.deepEqual(risk.sources.map(source => source.sourceUrl), [sources[1].sourceUrl, sources[2].sourceUrl]);
  assert.deepEqual(risk.portfolioImpactAnalysis, items[1].portfolioImpactAnalysis);
  assert.deepEqual(risk.affectedAssetIds, ['AL30', 'GD30']);
});

test('el cruce de un umbral no equivale a cotizar exactamente allí ni a otra cifra, país o jornada', () => {
  const a = sources[1];
  for (const title of [
    'El riesgo país trepó por encima de los 950 puntos',
    'El riesgo país bajó por debajo de los 900 puntos',
    'El riesgo país subió a 900 puntos',
    'El riesgo país trepó de 900 puntos a 950 puntos',
    'El riesgo país de Brasil trepó por encima de los 900 puntos',
    'Las acciones suben y el riesgo país en 900 puntos',
    'El riesgo país no trepó por encima de los 900 puntos',
    'El riesgo país cayó mientras las acciones superaron los 900 puntos'
  ]) assert.equal(sourcesCoverSameEvent(a, { ...sources[2], originalHeadline: title }), false, title);
  assert.equal(sourcesCoverSameEvent(a, { ...sources[2], publishedTimestamp: a.publishedTimestamp! - 86400000 }), false);
  assert.equal(sourcesCoverSameEvent(a, { ...sources[2], publishedTimestamp: undefined, publishedDateIso: undefined }), false);
});

test('las consultas reales conservan la cifra del hecho y evitan fragmentos de moneda o porcentajes', () => {
  for (const source of sources.slice(1)) assert.deepEqual(coverageEventQueries(source.originalHeadline), ['riesgo pais Argentina 900 puntos', 'riesgo pais Argentina 900']);
  const queries = coverageEventQueries(sources[0].originalHeadline);
  assert.ok(queries.some(query => query.includes('16000')));
  assert.ok(queries.every(query => !/\bu s16\b|\bmas u$/.test(query)));
  assert.ok(coverageEventQueries('La inflación de octubre llegó al 3,5% según el INDEC').every(query => query.includes('3.5')));
});
