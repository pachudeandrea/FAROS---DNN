import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { REAL_GROUNDED_NEWS } from '../src/data/groundedRealNews.js';
import { ASSET_CATALOG } from '../src/data/assetCatalog.js';
import { analyzeVerifiedCoverage, reclassifyCachedNews } from '../src/utils/newsClassification.js';
import { usablePulseSnapshot } from '../src/server/newsPulseCache.js';
import { getPortfolioNewsImpact } from '../src/utils/portfolioNews.js';
import type { MediaCoverage, NewsItem } from '../src/types/index.js';

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

const source = (headline: string, articleSummary?: string): MediaCoverage => ({
  mediaName: 'Ámbito', originalHeadline: headline, articleSummary,
  sourceUrl: 'https://www.ambito.com/finanzas/cobertura-classification-fixture',
});

test('la cobertura real conserva NVDA y el contexto de SPY aportado por otro medio, sin copiarle la caída', () => {
  const publications = JSON.parse(readFileSync(new URL('./fixtures/nvidia-coverage-production-2026-11-09.json', import.meta.url), 'utf8')) as NewsItem[];
  const reports = publications.filter(item => !/^El petróleo/.test(item.headline));
  const sources = reports.flatMap(item => item.sources);
  const originals = structuredClone(sources);
  const analysis = analyzeVerifiedCoverage(sources);
  assert.deepEqual([...analysis.affectedAssetIds].sort(), ['NVDA', 'SPY']);
  assert.equal(analysis.assetImpacts.NVDA, 'alerta');
  assert.equal(analysis.assetImpacts.SPY, 'neutral', 'La suba genérica de las bolsas no demuestra la cotización de SPY');
  assert.equal(analysis.relevanceType, 'impacto_precio');
  assert.deepEqual(sources, originals);

  const merged = { ...reports[0], affectedAssetIds: ['NVDA'], sources };
  const revised = reclassifyCachedNews([merged])[0];
  assert.deepEqual([...revised.affectedAssetIds].sort(), ['NVDA', 'SPY']);
  assert.equal(revised.portfolioImpactAnalysis.affectedHoldings.find(holding => holding.symbol === 'NVDA')?.impactDirection, 'alerta');
  assert.equal(revised.portfolioImpactAnalysis.affectedHoldings.find(holding => holding.symbol === 'SPY')?.impactDirection, 'neutral');
  assert.equal(getPortfolioNewsImpact(revised, { assetIds: ['NVDA'], assetPositions: { NVDA: 'long' } }), 'alerta');
  assert.equal(getPortfolioNewsImpact(revised, { assetIds: ['NVDA'], assetPositions: { NVDA: 'short' } }), 'favorable');
  assert.equal(getPortfolioNewsImpact(revised, { assetIds: ['SPY'], assetPositions: { SPY: 'long' } }), 'neutral');
  assert.equal(reclassifyCachedNews([revised])[0], revised, 'Una cobertura ya actualizada conserva su identidad');
});

test('combina evidencia por instrumento y no atribuye al ETF el movimiento adverso de la compañía', () => {
  const analysis = analyzeVerifiedCoverage([
    source('Las acciones de Tesla caen 5% mientras avanza la investigación de su CEO'),
    source('Tesla cae 8% por la investigación de su CEO, pero el ETF SPY sube 2%'),
  ]);
  assert.equal(analysis.assetImpacts.TSLA, 'alerta');
  assert.equal(analysis.assetImpacts.SPY, 'favorable');
  assert.equal(analysis.impact, 'neutral', 'Direcciones opuestas de distintos activos no establecen un efecto neto');
});

test('una fuente sin señal no borra una señal explícita y las señales contradictorias quedan identificadas', () => {
  const fact = source('Las acciones de Tesla caen 5% por una investigación');
  const mention = source('Tesla presenta su agenda institucional');
  assert.equal(analyzeVerifiedCoverage([mention, fact]).assetImpacts.TSLA, 'alerta');
  assert.equal(analyzeVerifiedCoverage([fact, mention]).assetImpacts.TSLA, 'alerta');
  const conflicting = analyzeVerifiedCoverage([fact, source('Las acciones de Tesla suben 3% por una investigación')]);
  assert.equal(conflicting.assetImpacts.TSLA, 'neutral');
  assert.match(conflicting.relationships.TSLA, /señales favorables y adversas/);
});

test('el contexto macro de una fuente conserva su límite aunque otra fuente pruebe un movimiento distinto', () => {
  const analysis = analyzeVerifiedCoverage([
    source('La inflación y las tasas son contexto para AL30'),
    source('Las acciones de Tesla caen 5% por una investigación'),
  ]);
  assert.equal(analysis.assetImpacts.AL30, 'neutral');
  assert.equal(analysis.assetImpacts.TSLA, 'alerta');
});

test('conserva el análisis desconocido de un instrumento personalizado y no modifica noticias curadas', () => {
  const item = cachedItem('La Justicia ordenó a YPF pagar una indemnización millonaria');
  const customHolding = { symbol: 'CUSTOM_TEST', impactDirection: 'neutral' as const, relationshipDetail: 'Ficha manual conservada.' };
  item.affectedAssetIds.push('CUSTOM_TEST');
  item.portfolioImpactAnalysis.affectedHoldings.push(customHolding);
  const revised = reclassifyCachedNews([item])[0];
  assert.ok(revised.affectedAssetIds.includes('CUSTOM_TEST'));
  assert.deepEqual(revised.portfolioImpactAnalysis.affectedHoldings.find(holding => holding.symbol === 'CUSTOM_TEST'), customHolding);
  assert.equal(revised.portfolioImpactAnalysis.affectedHoldings.find(holding => holding.symbol === 'YPFD')?.impactDirection, 'alerta');
  const curated = { ...item, id: 'curated-example' };
  assert.equal(reclassifyCachedNews([curated])[0], curated);
});

test('releer una publicación actualizada usa su nuevo extracto y titular, sin una clasificación anterior', () => {
  const publication = source('Tesla presenta su informe operativo', 'Las acciones de Tesla caen 5%.');
  assert.equal(analyzeVerifiedCoverage([publication]).assetImpacts.TSLA, 'alerta');
  publication.articleSummary = 'Las acciones de Tesla suben 3%.';
  assert.equal(analyzeVerifiedCoverage([publication]).assetImpacts.TSLA, 'favorable');
  publication.originalHeadline = 'Las acciones de Apple caen 6%';
  const updated = analyzeVerifiedCoverage([publication]);
  assert.equal(updated.assetImpacts.AAPL, 'alerta');
  assert.equal(updated.assetImpacts.TSLA, 'favorable');
});

test('editar los alias de la ficha manual actualiza la relación aun conservando los mismos objetos', () => {
  const asset = { ...structuredClone(ASSET_CATALOG.find(asset => asset.id === 'AAPL')!),
    id: 'CUSTOM_CACHE', symbol: 'CCACHE', name: 'Emisor Uno', issuer: 'Emisor Uno', aliases: ['Empresa Alias'], manual: true };
  const assets = [asset];
  const publication = source('Las acciones de Empresa Alias caen 5%');
  assert.equal(analyzeVerifiedCoverage([publication], assets).assetImpacts.CUSTOM_CACHE, 'alerta');
  asset.aliases[0] = 'Otra Empresa';
  assert.deepEqual(analyzeVerifiedCoverage([publication], assets).affectedAssetIds, []);
  asset.aliases[0] = 'Empresa Alias';
  assert.equal(analyzeVerifiedCoverage([publication], assets).assetImpacts.CUSTOM_CACHE, 'alerta');
});

test('modificar un análisis devuelto no altera consultas posteriores de la misma publicación', () => {
  const publication = source('Las acciones de Tesla caen 5% por una investigación');
  const original = analyzeVerifiedCoverage([publication]);
  const expected = structuredClone(original);
  original.affectedAssetIds.push('NO_ES_UN_ACTIVO');
  original.assetImpacts.TSLA = 'favorable';
  original.relationships.TSLA = 'Texto ajeno a las fuentes.';
  assert.deepEqual(analyzeVerifiedCoverage([publication]), expected);
});
