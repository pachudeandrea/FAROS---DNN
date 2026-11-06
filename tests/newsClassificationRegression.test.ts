import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { analyzeNewsRelevance } from '../src/utils/newsRelevance.js';
import { getPortfolioNewsImpact } from '../src/utils/portfolioNews.js';

const publications = JSON.parse(readFileSync(new URL('./fixtures/classification-production-2026-11-06.json', import.meta.url), 'utf8'));

test('los tres titulares de producción no pierden el rebote y la variación del riesgo soberano en neutral', () => {
  const expected = ['favorable', 'alerta', 'favorable'];
  for (const [index, publication] of publications.entries()) {
    const result = analyzeNewsRelevance(publication.headline);
    assert.equal(result.impact, expected[index], publication.headline);
    assert.equal(result.relevanceType, 'valoracion_mercado', 'Se distingue la señal del conjunto de una cotización individual');
    assert.equal(result.assetImpacts.AL30, expected[index]); assert.equal(result.assetImpacts.GD30, expected[index]);
    assert.equal(result.assetImpacts.BOPREAL, undefined);
    assert.match(result.relationships.AL30, /no .*cotizaci[oó]n|no .*precio/);
    const news = { ...result, portfolioImpactAnalysis: { directExplanation: result.explanation, affectedHoldings: Object.entries(result.assetImpacts).map(([symbol, impactDirection]) => ({ symbol, impactDirection, relationshipDetail: result.relationships[symbol] })) } };
    assert.equal(getPortfolioNewsImpact(news, { assetIds: ['AL30'] }), expected[index]);
    assert.equal(getPortfolioNewsImpact(news, { assetIds: ['AL30'], assetPositions: { AL30: 'short' } }), expected[index] === 'alerta' ? 'favorable' : 'alerta');
    assert.equal(getPortfolioNewsImpact(news, { assetIds: ['AAPL'] }), 'neutral');
  }
});

test('reconoce rebotes, alias del emisor y verbos de mercado sin convertir costos, rumores o negaciones en precios', () => {
  const cases = [
    ['AL30 rebota en la Bolsa', 'AL30', 'favorable'],
    ['AL30 vuelve a subir en la Bolsa', 'AL30', 'favorable'],
    ['Los bonos soberanos borran subas iniciales y el riesgo país vuelve a saltar por encima de los 900 puntos', 'AL30', 'alerta'],
    ['El riesgo país volvió a bajar', 'AL30', 'favorable'],
    ['No vuelve a subir el riesgo país', 'AL30', 'neutral'],
    ['El riesgo país podría volver a saltar', 'AL30', 'neutral'],
    ['AL30 se hundió en la Bolsa', 'AL30', 'alerta'],
    ['Nvidia salta 5% en Wall Street', 'NVDA', 'favorable'],
    ['Banco Galicia cae en Wall Street', 'GGAL', 'alerta'],
    ['Los bonos soberanos argentinos se desplomaron', 'AL30', 'alerta'],
    ['Los bonos en dólares de Brasil rebotan', 'AL30', undefined],
    ['El riesgo país de Brasil salta 10%', 'AL30', undefined],
    ['No bajó el riesgo país argentino', 'AL30', 'neutral'],
    ['El riesgo país no subió y se mantiene en 900 puntos', 'AL30', 'neutral'],
    ['Analistas esperan que baje el riesgo país', 'AL30', 'neutral'],
    ['Los bonos en dólares podrían rebotar', 'AL30', 'neutral'],
    ['Los bonos en dólares no rebotaron', 'AL30', 'neutral'],
    ['No rebotaron las acciones de Microsoft', 'MSFT', 'neutral'],
    ['AL30 rebota su TIR', 'AL30', 'neutral'],
    ['Apple aumentó el precio del iPhone', 'AAPL', 'neutral'],
    ['El riesgo país se sostiene por debajo de los 900 puntos', 'AL30', 'neutral'],
    ['El BCRA compró dólares y sumó reservas', 'AL30', 'neutral'],
    ['AL30 cae mientras los bonos en dólares rebotan', 'AL30', 'alerta'],
    ['AL30 sube mientras aumenta el riesgo país', 'AL30', 'favorable'],
  ] as const;
  for (const [headline, id, expected] of cases) assert.equal(analyzeNewsRelevance(headline).assetImpacts[id], expected, headline);
});
