import test from 'node:test';
import assert from 'node:assert/strict';
import { getPortfolioAffectedAssetIds, getPortfolioNewsImpact } from '../src/utils/portfolioNews';

const news = { impact: 'favorable' as const, affectedAssetIds: ['AL29', 'AL30', 'AL30', 'GD30D', 'CCL'] };

test('solo muestra activos afectados seleccionados, sin duplicados ni confundir especies', () => {
  const original = structuredClone(news);
  assert.deepEqual(getPortfolioAffectedAssetIds(news, ['AL30', 'GD30', 'CCL', 'MSFT']), ['AL30', 'CCL']);
  assert.deepEqual(news, original, 'La noticia original se conserva para otras carteras, fuentes y caché');
});

test('cartera vacía y cambios de selección no recuperan activos desde posiciones antiguas', () => {
  assert.deepEqual(getPortfolioAffectedAssetIds(news, []), []);
  assert.deepEqual(getPortfolioAffectedAssetIds(news, ['AL30', 'CCL']), ['AL30', 'CCL']);
  assert.deepEqual(getPortfolioAffectedAssetIds(news, ['CCL']), ['CCL']);
  assert.deepEqual(getPortfolioAffectedAssetIds(news, ['MSFT']), []);
  assert.equal(getPortfolioNewsImpact(news, { assetIds: [], assetPositions: { CCL: 'short' } }), 'neutral');
});

test('el impacto usa únicamente posiciones seleccionadas y respeta LONG heredado implícito', () => {
  assert.equal(getPortfolioNewsImpact(news, { assetIds: ['CCL'], assetPositions: { CCL: 'short', AL30: 'long' } }), 'alerta');
  assert.equal(getPortfolioNewsImpact(news, { assetIds: ['AL30', 'CCL'], assetPositions: { CCL: 'short' } }), 'neutral');
  assert.equal(getPortfolioNewsImpact(news, { assetIds: ['AL30'] }), 'favorable');
  assert.equal(getPortfolioNewsImpact({ ...news, impact: 'alerta' }, { assetIds: ['CCL'], assetPositions: { CCL: 'short' } }), 'favorable');
});

test('direcciones diferentes se atribuyen a cada activo antes de aplicar LONG/SHORT', () => {
  const mixed = { impact: 'neutral' as const, affectedAssetIds: ['AAPL', 'MSFT'], portfolioImpactAnalysis: {
    directExplanation: 'Hechos de prueba', affectedHoldings: [
      { symbol: 'AAPL', impactDirection: 'favorable' as const, relationshipDetail: 'Hecho de prueba A' },
      { symbol: 'MSFT', impactDirection: 'alerta' as const, relationshipDetail: 'Hecho de prueba B' }
    ]
  } };
  assert.equal(getPortfolioNewsImpact(mixed, { assetIds: ['AAPL'] }), 'favorable');
  assert.equal(getPortfolioNewsImpact(mixed, { assetIds: ['MSFT'] }), 'alerta');
  assert.equal(getPortfolioNewsImpact(mixed, { assetIds: ['AAPL', 'MSFT'] }), 'neutral');
  assert.equal(getPortfolioNewsImpact(mixed, { assetIds: ['AAPL', 'MSFT'], assetPositions: { MSFT: 'short' } }), 'favorable');
  assert.equal(getPortfolioNewsImpact({ ...mixed, relevanceType: 'ruido' }, { assetIds: ['AAPL'] }), 'neutral');
  assert.equal(getPortfolioNewsImpact({ ...mixed, relevanceType: 'contexto_macro' }, { assetIds: ['AAPL'] }), 'neutral');
});
