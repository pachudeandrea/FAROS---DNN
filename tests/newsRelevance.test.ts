import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNewsRelevance } from '../src/utils/newsRelevance';

test('reservas y tasas son contexto, no movimientos observados de todos los bonos', () => {
  for (const headline of ['El BCRA compró dólares y aumentó sus reservas', 'El BCRA no compró dólares y sus reservas bajaron', 'El BCRA subió las tasas de interés', 'Baja el riesgo país de los bonos soberanos']) {
    const result = analyzeNewsRelevance(headline);
    assert.equal(result.relevanceType, 'contexto_macro', headline);
    assert.equal(result.impact, 'neutral', headline);
    assert.ok(Object.values(result.assetImpacts).every(impact => impact === 'neutral'));
    assert.match(result.explanation, /contextual|macroeconómica/);
  }
});

test('movimientos atribuidos al instrumento, sin mezclar monedas ni verbos macro', () => {
  const result = analyzeNewsRelevance('AL30 sube en la Bolsa');
  assert.equal(result.relevanceType, 'impacto_precio'); assert.equal(result.assetImpacts.AL30, 'favorable');
  assert.equal(result.assetImpacts.AL30D, 'neutral', 'La variación de la especie ARS no prueba el precio de la especie USD');
  assert.equal(analyzeNewsRelevance('AL30 cae en la Bolsa').assetImpacts.AL30, 'alerta');
  assert.equal(analyzeNewsRelevance('MSFT +5% en la Bolsa').assetImpacts.MSFT, 'favorable');
  assert.equal(analyzeNewsRelevance('AL30: baja el riesgo país').assetImpacts.AL30, 'neutral');
});

test('titulares de dos emisores atribuyen direcciones locales y conservan resultado global neutral', () => {
  const result = analyzeNewsRelevance('MSFT cae mientras las acciones de Apple suben');
  assert.equal(result.assetImpacts.MSFT, 'alerta'); assert.equal(result.assetImpacts.AAPL, 'favorable');
  assert.equal(result.impact, 'neutral'); assert.equal(result.relevanceType, 'impacto_precio');
  const mixed = analyzeNewsRelevance('Dólar MEP sube tras el balance de Microsoft');
  assert.equal(mixed.assetImpacts.MEP, 'favorable'); assert.equal(mixed.assetImpacts.MSFT, 'neutral');
  assert.equal(analyzeNewsRelevance('Caen las acciones de Microsoft').assetImpacts.MSFT, 'alerta');
});

test('ganancias, costos e inversiones no se convierten automáticamente en subas del precio', () => {
  for (const headline of ['Microsoft presentó ganancias récord en su balance', 'Microsoft aumenta sus costos y reduce sus márgenes', 'Google anunció una inversión millonaria', 'Apple sube los precios del iPhone', 'Apple subió un 5% el precio del iPhone', 'YPF bajó 9% su producción', 'AL30 sube su TIR', 'Microsoft incumplió una regulación de privacidad']) {
    const result = analyzeNewsRelevance(headline);
    assert.notEqual(result.relevanceType, 'impacto_precio', headline); assert.equal(result.impact, 'neutral', headline);
  }
  assert.equal(analyzeNewsRelevance('Microsoft presentó ganancias récord en su balance').relevanceType, 'valoracion_mercado');
  assert.equal(analyzeNewsRelevance('Las acciones de Microsoft suben tras su balance').assetImpacts.MSFT, 'favorable');
});

test('default explícito, pago esperado y calificación se distinguen sin inventar rendimientos', () => {
  const failure = analyzeNewsRelevance('CO29 incumplió el pago del cupón de su deuda');
  assert.equal(failure.relevanceType, 'impacto_precio'); assert.equal(failure.assetImpacts.CO29, 'alerta');
  const payment = analyzeNewsRelevance('YPF confirma el pago del cupón de sus obligaciones negociables');
  assert.equal(payment.relevanceType, 'valoracion_mercado'); assert.equal(payment.impact, 'neutral');
  assert.equal(analyzeNewsRelevance('Bonos de la Provincia de Córdoba: mejora su calificación crediticia').assetImpacts.CO29, 'favorable');
});

test('rumores y opiniones tienen dirección neutral y no se presentan como hechos confirmados', () => {
  for (const headline of ['Rumores sobre una fusión de YPF', 'Analistas creen que MSFT podría subir', 'YPF podría incumplir el pago de su deuda']) {
    const result = analyzeNewsRelevance(headline);
    assert.equal(result.relevanceType, 'ruido'); assert.equal(result.impact, 'neutral');
    assert.ok(Object.values(result.assetImpacts).every(impact => impact === 'neutral'));
  }
});

test('negaciones no inventan caídas o incumplimientos y no compró no es compra', () => {
  for (const headline of ['AL30 no cayó en la Bolsa', 'MSFT no subió en la Bolsa', 'CO29 no incumplió el pago de su deuda', 'YPF evitó el default de su deuda', 'CO29 no mejoró su calificación crediticia', 'CO29 no redujo su calificación crediticia']) {
    const result = analyzeNewsRelevance(headline);
    assert.equal(result.impact, 'neutral', headline);
  }
  assert.equal(analyzeNewsRelevance('CO29 no pagó el cupón').assetImpacts.CO29, 'alerta');
});

test('gestor de ETF, ticker parcial y lenguaje común no atribuyen instrumentos sin evidencia', () => {
  assert.deepEqual(analyzeNewsRelevance('BlackRock presenta un nuevo ETF').affectedAssetIds, []);
  assert.deepEqual(analyzeNewsRelevance('MSFTX presenta un producto').affectedAssetIds, []);
  assert.deepEqual(analyzeNewsRelevance('La gente come cada día y vale la pena').affectedAssetIds, []);
});


test('un índice relacionado no se describe como el emisor ni como precio local probado del CEDEAR', () => {
  const result = analyzeNewsRelevance('El Nasdaq 100 sube en Wall Street');
  assert.ok(result.affectedAssetIds.includes('QQQ'));
  assert.equal(result.assetImpacts.QQQ, 'neutral');
  assert.match(result.relationships.QQQ, /índice o referencia/);
  assert.doesNotMatch(result.relationships.QQQ, /menciona al emisor/);
});


test('los riesgos evitados o negados no son alertas y el crédito de otro emisor no contamina al activo', () => {
  for (const headline of ['YPF no suspende el pago del cupón de sus obligaciones negociables', 'CO29 no dejó de pagar el cupón de su deuda', 'YPF evita una rebaja de su calificación crediticia']) assert.equal(analyzeNewsRelevance(headline).impact, 'neutral', headline);
  for (const headline of ['Microsoft presenta resultados tras la rebaja de la calificación crediticia de YPF', 'Microsoft presenta resultados durante la rebaja de la calificación crediticia de YPF']) {
    const result = analyzeNewsRelevance(headline);
    assert.equal(result.assetImpacts.MSFT, 'neutral', headline);
    assert.equal(result.assetImpacts.YPFD, 'alerta', headline);
  }
  assert.deepEqual(analyzeNewsRelevance('La deuda soberana de Brasil cae mientras Argentina mejora su producción').affectedAssetIds, []);
});
