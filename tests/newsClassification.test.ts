import test from 'node:test';
import assert from 'node:assert/strict';
import { REAL_GROUNDED_NEWS } from '../src/data/groundedRealNews.js';
import { reclassifyCachedNews } from '../src/utils/newsClassification.js';
import { usablePulseSnapshot } from '../src/server/newsPulseCache.js';
import { getPortfolioNewsImpact } from '../src/utils/portfolioNews.js';
import type { NewsItem } from '../src/types/index.js';

function cachedItem(headline: string, articleSummary?: string): NewsItem {
  const item = structuredClone(REAL_GROUNDED_NEWS[0]);
  return {
    ...item, id: 'live-news-cached-judicial', headline, affectedAssetIds: ['YPFD'], impact: 'neutral', relevanceType: 'ruido',
    sources: [{ mediaName: 'El Cronista', originalHeadline: headline, articleSummary, sourceUrl: 'https://www.cronista.com/finanzas-mercados/ypf-judicial-fixture/', publishedDateIso: '2030-06-15T14:00:00Z' }],
    coverageCount: 1,
    portfolioImpactAnalysis: { directExplanation: 'Análisis anterior sin señal.', affectedHoldings: [{ symbol: 'YPFD', impactDirection: 'neutral', relationshipDetail: 'Anterior' }] },
    fullSynthesis: ['Síntesis conservada.', 'Análisis anterior sin señal.']
  };
}

test('la colección diaria en caché adopta la señal judicial sin perder noticias ni renovar su horario', () => {
  const item = cachedItem('La Justicia ordenó a YPF pagar una indemnización millonaria');
  const other = { ...cachedItem('YPF presenta un informe sobre su actividad'), id: 'live-news-cached-second' };
  const timestamp = Date.parse('2030-06-15T15:00:00Z');
  const snapshot = usablePulseSnapshot({ news: [item, other], timestamp, hourKey: '2030-06-15_12' }, Date.parse('2030-06-15T16:00:00Z'))!;
  assert.equal(snapshot.timestamp, timestamp);
  assert.equal(snapshot.hourKey, '2030-06-15_12');
  assert.deepEqual(snapshot.news.map(news => news.id), [item.id, other.id]);
  const revised = snapshot.news[0];
  assert.equal(revised.relevanceType, 'valoracion_mercado');
  assert.equal(revised.impact, 'alerta');
  assert.deepEqual(revised.sources, item.sources);
  assert.equal(item.impact, 'neutral', 'No muta el dato almacenado');
  assert.ok(revised.fullSynthesis.includes('Síntesis conservada.'));
  assert.ok(!revised.fullSynthesis.includes('Análisis anterior sin señal.'));
  assert.match(revised.audioScript, /judicial|indemnización|valoración/i);
  assert.equal(getPortfolioNewsImpact(revised, { assetIds: ['YPFD'], assetPositions: { YPFD: 'long' } }), 'alerta');
  assert.equal(getPortfolioNewsImpact(revised, { assetIds: ['YPFD'], assetPositions: { YPFD: 'short' } }), 'favorable');
});

test('usa la evidencia del medio y nunca una síntesis generada como prueba de un fallo', () => {
  const item = cachedItem('Juicio YPF: mucho ruido y una premisa equivocada');
  item.briefSummary = 'La Justicia condenó a YPF a pagar una indemnización millonaria.';
  const neutral = reclassifyCachedNews([item])[0];
  assert.equal(neutral.impact, 'neutral');
  assert.equal(neutral.relevanceType, 'valoracion_mercado');
  assert.match(neutral.portfolioImpactAnalysis.directExplanation, /judicial/i);
  const evidenced = reclassifyCachedNews([{ ...item, sources: [{ ...item.sources[0], articleSummary: 'La Justicia ordenó a YPF pagar una indemnización millonaria.' }] }])[0];
  assert.equal(evidenced.impact, 'alerta');
  assert.equal(evidenced.id, item.id);
});
