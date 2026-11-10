import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import type { MediaCoverage, NewsItem } from '../src/types/index.js';
import { coalesceNewsEvents, enrichNewsCoverage, mergeVerifiedNews, sourcesCoverSameEvent } from '../src/utils/newsCoverage.js';
import { mergeDailyNews } from '../src/utils/dailyNews.js';
import { getPortfolioNewsImpact } from '../src/utils/portfolioNews.js';
import { REAL_GROUNDED_NEWS } from '../src/data/groundedRealNews.js';

// Original public publications captured on 9/11, including each outlet's figures,
// timestamps, article extract and URL. Never redate these as live articles.
const publications: NewsItem[] = JSON.parse(readFileSync(new URL('./fixtures/nvidia-coverage-production-2026-11-09.json', import.meta.url), 'utf8'));
const stockEvent = publications.filter(item => !/^El petróleo/.test(item.headline));
const permutations = <T,>(values: T[]): T[][] => values.length ? values.flatMap((value, index) => permutations(values.filter((_, other) => other !== index)).map(rest => [value, ...rest])) : [[]];

test('los tres medios reales forman un solo acontecimiento cualquiera sea el orden, sin cambiar cifras ni enlaces', () => {
  const before = structuredClone(stockEvent);
  for (const ordered of permutations(stockEvent)) {
    const merged = mergeVerifiedNews(ordered, [], new Date('2026-11-09T20:00:00Z'));
    assert.equal(merged.length, 1);
    assert.equal(merged[0].coverageCount, 3);
    assert.deepEqual(merged[0].sources.map(source => source.originalHeadline).sort(), stockEvent.map(item => item.sources[0].originalHeadline).sort());
    assert.deepEqual(merged[0].sources.map(source => source.sourceUrl).sort(), stockEvent.map(item => item.sources[0].sourceUrl).sort());
    assert.ok(merged[0].affectedAssetIds.includes('NVDA'));
    assert.ok(merged[0].affectedAssetIds.includes('SPY'), 'Conserva el contexto secundario verificado');
    assert.equal(getPortfolioNewsImpact(merged[0], { assetIds: ['NVDA'], assetPositions: { NVDA: 'long' } }), 'alerta');
    assert.equal(getPortfolioNewsImpact(merged[0], { assetIds: ['NVDA'], assetPositions: { NVDA: 'short' } }), 'favorable');
    assert.equal(getPortfolioNewsImpact(merged[0], { assetIds: ['SPY'], assetPositions: { SPY: 'long' } }), 'neutral');
  }
  assert.deepEqual(stockEvent, before);
});

test('reagrupa duplicados ya almacenados y conserva el otro hecho sobre petróleo, fecha y acumulado diario', () => {
  const before = structuredClone(publications);
  const restored = mergeDailyNews(publications, [], '2026-11-09');
  assert.equal(restored.length, 2);
  assert.ok(restored.some(item => /^El petróleo/.test(item.headline) && item.coverageCount === 1));
  assert.ok(restored.some(item => item.coverageCount === 3));
  const refreshed = mergeDailyNews(restored, publications, '2026-11-09');
  assert.equal(refreshed.length, 2);
  assert.equal(refreshed.find(item => item.coverageCount === 3)?.sources.length, 3);
  assert.deepEqual(mergeDailyNews(refreshed, [], '2026-11-09'), refreshed);
  assert.deepEqual(mergeDailyNews(refreshed, publications, '2026-11-10'), []);
  assert.deepEqual(publications, before);
});

const at = '2030-06-15T15:00:00Z';
const source = (headline: string, publisher: string, slug: string): MediaCoverage => ({
  originalHeadline: headline, mediaName: publisher, sourceUrl: `https://www.${publisher}/economia/${slug}`,
  publishedDateIso: at, publishedTimestamp: Date.parse(at),
});
const card = (id: string, sources: MediaCoverage[]): NewsItem => ({
  ...stockEvent[0], id, headline: sources[0].originalHeadline, sources, coverageCount: sources.length,
  affectedAssetIds: ['AL30'], portfolioImpactAnalysis: { directExplanation: 'Fixture de integración', affectedHoldings: [] },
});

test('una fuente secundaria compartida no elimina dos hechos distintos ni sirve de puente para unirlos', () => {
  const a = source('El BCRA compró USD 125 millones y sumó reservas', 'ambito.com', 'reserve');
  const b = source('El BCRA subió la tasa de interés al 40%', 'cronista.com', 'rates');
  const shared = source('El BCRA compró USD 125 millones y sumó reservas; el BCRA subió la tasa de interés al 40%', 'infobae.com', 'overview');
  // Both facts are explicitly present in the overview; the two facts still differ.
  assert.equal(sourcesCoverSameEvent(a, b), false);
  assert.equal(sourcesCoverSameEvent(a, shared), true);
  assert.equal(sourcesCoverSameEvent(b, shared), true);
  const merged = mergeVerifiedNews([card('reserves', [a, shared])], [card('rates', [b, shared])], new Date(at));
  assert.deepEqual(merged.map(item => item.id), ['reserves', 'rates']);
  assert.ok(merged.every(item => item.sources.some(source => source.sourceUrl === shared.sourceUrl)));
  assert.equal(coalesceNewsEvents([card('reserves', [a]), card('rates', [b]), card('overview', [shared])]).length, 3);
  const overview = enrichNewsCoverage([card('overview', [shared])], [a, b], new Date(at))[0];
  assert.equal(overview.coverageCount, 2, 'El enriquecimiento tampoco usa la portada amplia para juntar los dos hechos');
  const other = overview.sources.some(source => source.sourceUrl === a.sourceUrl) ? b : a;
  for (const ordered of [[overview, card('other', [other])], [card('other', [other]), overview]]) {
    assert.equal(coalesceNewsEvents(ordered).length, 2, 'Las fuentes de un grupo completo deben ser compatibles, también en orden inverso');
  }
});

test('una revisión de una URL secundaria retira su versión anterior sin borrar el otro medio ni duplicar el artículo', () => {
  const a = source('AL30 sube 3% en la Bolsa', 'ambito.com', 'changing-quote');
  const b = source('AL30 sube 3% en la Bolsa', 'cronista.com', 'other-quote');
  const old = mergeDailyNews([], [card('a', [a]), card('b', [b])], '2030-06-15');
  assert.equal(old.length, 1);
  assert.equal(old[0].sources[0].sourceUrl, b.sourceUrl);
  const updated = { ...a, originalHeadline: 'AL30 cae 5% en la Bolsa' };
  const refreshed = mergeDailyNews(old, [card('a', [updated])], '2030-06-15');
  assert.equal(refreshed.length, 2, 'La otra publicación conserva su hecho original');
  const versions = refreshed.flatMap(item => item.sources).filter(source => source.sourceUrl === a.sourceUrl);
  assert.equal(versions.length, 1);
  assert.equal(versions[0].originalHeadline, updated.originalHeadline);
  assert.ok(refreshed.some(item => item.sources.some(source => source.sourceUrl === b.sourceUrl)));
  assert.deepEqual(mergeDailyNews(refreshed, [], '2030-06-15'), refreshed);
});

test('releer una comparación curada conserva las fuentes entrantes y sus cifras originales', () => {
  const curated = structuredClone(REAL_GROUNDED_NEWS[0]);
  for (const source of curated.sources) {
    source.publishedDateIso = at;
    source.publishedTimestamp = Date.parse(at);
  }
  const first = mergeDailyNews([], [curated], '2030-06-15');
  const second = mergeDailyNews(first, [curated], '2030-06-15');
  assert.deepEqual(JSON.parse(JSON.stringify(second)), JSON.parse(JSON.stringify(first)));
  assert.equal(second[0].coverageCount, curated.sources.length);
  assert.deepEqual(second[0].sources.map(source => source.originalHeadline), curated.sources.map(source => source.originalHeadline));
});
