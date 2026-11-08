import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeNewsRelevance } from '../src/utils/newsRelevance';

test('reservas y tasas son contexto, no movimientos observados de todos los bonos', () => {
  for (const headline of ['El BCRA compró dólares y aumentó sus reservas', 'El BCRA no compró dólares y sus reservas bajaron', 'El BCRA subió las tasas de interés']) {
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
  const spread = analyzeNewsRelevance('AL30: baja el riesgo país');
  assert.equal(spread.assetImpacts.AL30, 'favorable');
  assert.equal(spread.relevanceType, 'valoracion_mercado', 'La señal de riesgo no se presenta como una cotización');
  assert.match(spread.relationships.AL30, /no demuestra la cotización/);
});

test('titulares de dos emisores atribuyen direcciones locales y conservan resultado global neutral', () => {
  const result = analyzeNewsRelevance('MSFT cae mientras las acciones de Apple suben');
  assert.equal(result.assetImpacts.MSFT, 'alerta'); assert.equal(result.assetImpacts.AAPL, 'favorable');
  assert.equal(result.impact, 'neutral'); assert.equal(result.relevanceType, 'impacto_precio');
  const mixed = analyzeNewsRelevance('Dólar MEP sube tras el balance de Microsoft');
  assert.equal(mixed.assetImpacts.MEP, 'favorable'); assert.equal(mixed.assetImpacts.MSFT, 'neutral');
  assert.equal(analyzeNewsRelevance('Caen las acciones de Microsoft').assetImpacts.MSFT, 'alerta');
});

test('inversiones y precios comerciales no se convierten automáticamente en subas de cotización', () => {
  for (const headline of ['Google anunció una inversión millonaria', 'Apple sube los precios del iPhone', 'Apple subió un 5% el precio del iPhone', 'AL30 sube su TIR', 'Microsoft incumplió una regulación de privacidad']) {
    const result = analyzeNewsRelevance(headline);
    assert.notEqual(result.relevanceType, 'impacto_precio', headline); assert.equal(result.impact, 'neutral', headline);
  }
  assert.equal(analyzeNewsRelevance('Las acciones de Microsoft suben tras su balance').assetImpacts.MSFT, 'favorable');
});

test('cambios concretos de resultados, márgenes y producción son señales de valoración, sin inventar cotizaciones', () => {
  const cases = [
    ['Microsoft presentó ganancias récord en su balance', 'MSFT', 'favorable'],
    ['Microsoft aumenta sus costos y reduce sus márgenes', 'MSFT', 'alerta'],
    ['Microsoft redujo sus costos', 'MSFT', 'favorable'],
    ['Microsoft reportó una caída de sus ganancias', 'MSFT', 'alerta'],
    ['YPF aumentó su producción', 'YPFD', 'favorable'],
    ['YPF bajó 9% su producción', 'YPFD', 'alerta'],
    ['YPF duplicó sus ganancias', 'YPFD', 'favorable'],
    ['YPF aumentó su producción y redujo sus ganancias', 'YPFD', 'neutral']
  ];
  for (const [headline, id, direction] of cases) {
    const result = analyzeNewsRelevance(headline);
    assert.equal(result.relevanceType, 'valoracion_mercado', headline);
    assert.equal(result.assetImpacts[id], direction, headline);
    assert.match(result.explanation, /señal de valoración/);
    assert.match(result.explanation, /sin afirmar que el precio/);
  }
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

test('resoluciones judiciales adversas y favorables cambian la valoración del emisor identificado', () => {
  const cases = [
    ['La Justicia ordenó a YPF pagar una indemnización millonaria', 'alerta'],
    ['El tribunal dictó un fallo contra YPF', 'alerta'],
    ['YPF perdió el juicio', 'alerta'],
    ['La Justicia rechazó la demanda contra YPF', 'favorable'],
    ['La Justicia revocó el fallo contra YPF', 'favorable'],
    ['La Justicia anuló la multa a YPF', 'favorable'],
    ['YPF ganó el juicio', 'favorable'],
    ['La Justicia levantó el embargo sobre los activos de YPF', 'favorable']
  ];
  for (const [headline, direction] of cases) {
    const result = analyzeNewsRelevance(headline);
    assert.equal(result.relevanceType, 'valoracion_mercado', headline);
    assert.equal(result.assetImpacts.YPFD, direction, headline);
    assert.match(result.explanation, /decisión judicial/);
    assert.match(result.explanation, /no afirma una variación observada/);
  }
  const mixed = analyzeNewsRelevance('La Justicia rechazó la demanda contra YPF, pero YPF perdió una apelación');
  assert.equal(mixed.assetImpacts.YPFD, 'neutral', 'Dos hechos judiciales contrapuestos no prueban un efecto neto');
});

test('el artículo real de opinión judicial requiere seguimiento, sin inventar una condena de YPF', () => {
  const headline = 'Juicio YPF: mucho ruido y una premisa equivocada';
  const summary = 'El amicus de los 15 Estados confunde jurisdicción con derecho aplicable: el Segundo Circuito sí juzgó a la Argentina, pero aplicó ley argentina.';
  for (const evidence of ['', summary]) {
    const result = analyzeNewsRelevance(headline, undefined, evidence);
    assert.equal(result.relevanceType, 'valoracion_mercado');
    assert.equal(result.assetImpacts.YPFD, 'neutral');
    assert.match(result.explanation, /judicial relevante para el seguimiento/);
    assert.match(result.explanation, /dirección queda por confirmar/);
    assert.match(result.relationships.YPFD, /responsabilidad del Estado/);
  }
  const decided = analyzeNewsRelevance(headline, undefined, 'La Justicia ordenó a YPF pagar una indemnización millonaria.');
  assert.equal(decided.assetImpacts.YPFD, 'alerta', 'La evidencia editorial verificada puede aclarar un titular ambiguo');
});

test('un litigio del Estado no se convierte automáticamente en deuda de YPF; un pedido real sobre su control sí es un riesgo', () => {
  for (const headline of [
    'Juicio YPF: la Justicia ordenó a la Argentina pagar una indemnización',
    'Juicio YPF: el tribunal rechazó la demanda contra la Argentina',
    'YPF no fue condenada por la Justicia',
    'El tribunal no ordenó a YPF pagar una indemnización',
    'Analistas creen que en el juicio podrían embargar acciones de YPF'
  ]) assert.equal(analyzeNewsRelevance(headline).assetImpacts.YPFD, 'neutral', headline);
  const pending = analyzeNewsRelevance('Juicio YPF: los demandantes solicitan la transferencia de las acciones de YPF');
  assert.equal(pending.assetImpacts.YPFD, 'alerta');
  assert.equal(pending.relevanceType, 'valoracion_mercado');
  assert.match(pending.explanation, /resultado pendiente/);
  assert.match(pending.relationships.YPFD, /no atribuye una obligación de pago/);
});

test('atribución y negaciones son locales; otras frases o emisores no contaminan hechos confirmados', () => {
  const factual = analyzeNewsRelevance('Microsoft aumentó sus ganancias mientras analistas creen que YPF podría subir');
  assert.equal(factual.assetImpacts.MSFT, 'favorable');
  assert.equal(factual.assetImpacts.YPFD, 'neutral');
  const court = analyzeNewsRelevance('Microsoft presentó resultados durante el fallo contra YPF');
  assert.equal(court.assetImpacts.MSFT, 'neutral');
  assert.equal(court.assetImpacts.YPFD, 'alerta');
  const production = analyzeNewsRelevance('Microsoft presentó resultados durante la caída de producción de YPF');
  assert.equal(production.assetImpacts.MSFT, 'neutral');
  assert.equal(production.assetImpacts.YPFD, 'alerta');
  const independent = analyzeNewsRelevance('YPF presentó resultados. Aumentaron los costos del sector');
  assert.equal(independent.assetImpacts.YPFD, 'neutral', 'Una nueva oración sin sujeto identificado no hereda YPF');
  for (const headline of ['YPF no aumentó sus ganancias', 'YPF no redujo su producción', 'YPF podría duplicar sus ganancias']) assert.equal(analyzeNewsRelevance(headline).assetImpacts.YPFD, 'neutral', headline);
});
