import test from 'node:test';
import assert from 'node:assert/strict';
import { REAL_GROUNDED_NEWS } from '../src/data/groundedRealNews.js';
import { argentinaNewsDay } from '../src/utils/dailyNews.js';
import { selectTourNews, tourExamplePortfolio } from '../src/utils/tourNews.js';
import { getPortfolioNewsImpact } from '../src/utils/portfolioNews.js';
import type { NewsItem, NewsImpact } from '../src/types/index.js';

const news = (id: string, impact: NewsImpact = 'neutral', published = '2026-11-09T10:00:00-03:00'): NewsItem => {
  const base = structuredClone(REAL_GROUNDED_NEWS[0]);
  return {
    ...base, id, impact, relevanceType: 'impacto_precio', affectedAssetIds: ['YPFD'],
    sources: [{ ...base.sources[0], sourceUrl: `https://www.ambito.com/finanzas/${id}`, publishedTimestamp: Date.parse(published), publishedDateIso: published }],
    portfolioImpactAnalysis: { directExplanation: 'Hecho de ejemplo para la prueba.', affectedHoldings: [{ symbol: 'YPFD', impactDirection: impact, relationshipDetail: 'Efecto respaldado por la publicación.' }] },
  };
};

test('el ejemplo usa la publicación original del día argentino, sin relabelar noticias históricas', () => {
  const current = news('current', 'neutral', '2026-11-10T02:59:00Z');
  const historical = news('historical', 'favorable', '2026-11-09T02:59:00Z');
  const undated = news('undated', 'alerta');
  undated.sources[0].publishedTimestamp = NaN; undated.sources[0].publishedDateIso = '';
  // A generated card date cannot replace an old or unknown publication date.
  historical.timestamp = current.timestamp;
  assert.equal(selectTourNews([historical, undated, current], '2026-11-09')?.id, 'current');
  assert.equal(selectTourNews([historical, undated], '2026-11-09'), undefined);
});

test('prefiere un caso favorable o desfavorable real aunque primero llegue una noticia neutral', () => {
  const neutral = news('neutral');
  for (const impact of ['favorable', 'alerta', 'positivo', 'negativo'] as const) {
    const directional = news(impact, impact);
    assert.equal(selectTourNews([neutral, directional], '2026-11-09')?.id, impact);
  }
  const macro = { ...news('macro', 'favorable'), relevanceType: 'contexto_macro' as const };
  assert.equal(selectTourNews([neutral, macro], '2026-11-09')?.id, 'neutral');
  assert.equal(selectTourNews([neutral], '2026-11-09')?.impact, 'neutral');
});

test('sin fuentes actuales o enlaces de artículos devuelve vacío en lugar de fabricar un ejemplo', () => {
  const home = news('home', 'favorable'); home.sources[0].sourceUrl = 'https://www.ambito.com/';
  assert.equal(selectTourNews([], '2026-11-09'), undefined);
  assert.equal(selectTourNews([home], '2026-11-09'), undefined);
});

test('a las00:00 argentinas descarta el ejemplo anterior y una respuesta tardía de ayer', () => {
  const before = Date.parse('2026-11-10T02:59:59.999Z');
  const previous = news('previous', 'alerta', '2026-11-10T02:59:00Z');
  const next = news('next', 'neutral', '2026-11-10T03:00:01Z');
  assert.equal(selectTourNews([previous], argentinaNewsDay(before))?.id, 'previous');
  assert.equal(selectTourNews([previous], argentinaNewsDay(before + 1)), undefined);
  assert.equal(selectTourNews([previous, next], argentinaNewsDay(before + 1))?.id, 'next');
});

test('la cartera temporal conserva el impacto del activo sin cambiar noticias ni activos reales', () => {
  const item = news('directional', 'alerta');
  const original = structuredClone(item);
  const example = tourExamplePortfolio(item);
  assert.deepEqual(example.assetIds, ['YPFD']);
  assert.deepEqual(example.assetPositions, { YPFD: 'long' });
  assert.equal(getPortfolioNewsImpact(item, example), 'alerta');
  example.assetIds.push('AL30');
  assert.deepEqual(item, original);
});
