import test from 'node:test';
import assert from 'node:assert/strict';
import type { CalendarEvent, NewsItem, Portfolio } from '../src/types/index';
import { calculateEstimatedDuration } from '../src/utils/audioController';
import { getNowAR } from '../src/utils/dateAR';
import { countWords, generateDailySummaryScript, generatePortfolioNewsScript, getTimeSlot, naturalizeScriptForSpeech } from '../src/utils/dailySummaryGenerator';

const now = getNowAR(new Date('2026-11-03T20:30:00Z'));
const portfolio: Portfolio = {
  id: 'portfolio-test', name: 'Cartera de prueba', description: '', profile: 'moderado',
  assetIds: ['MSFT'], assetPositions: { MSFT: 'long' },
};
const news: NewsItem = {
  id: 'news-test', headline: 'MSFT sube en la Bolsa: titular de prueba',
  briefSummary: 'Una síntesis no se necesita para completar artificialmente el audio.',
  fullSynthesis: [], publishedAgo: '', timestamp: now.date.toISOString(), coverageCount: 1,
  sources: [{ mediaName: 'Reuters', originalHeadline: 'MSFT sube en la Bolsa: titular de prueba', sourceUrl: 'https://www.reuters.com/markets/test-fixture-msft/' }],
  affectedAssetIds: ['MSFT'], impact: 'favorable', relevanceType: 'impacto_precio',
  portfolioImpactAnalysis: { directExplanation: 'Fixture', affectedHoldings: [
    { symbol: 'MSFT', impactDirection: 'favorable', relationshipDetail: 'Movimiento informado en el titular de prueba.' },
  ] },
  audioDuration: '', audioScript: '', topicCategory: 'cedears_tech',
  factCheck: { status: 'confirmado', officialSource: 'Reuters', detail: 'Fixture para prueba unitaria.' },
};
const event: CalendarEvent = {
  id: 'event-test', date: now.isoDate, time: '', title: 'Pago de prueba', assetSymbol: 'MSFT',
  category: 'pago_cupon', description: '', source: 'Fixture', impactLevel: 'bajo', status: 'estimada',
};

test('cartera vacía no recupera tickers desde posiciones antiguas ni fabrica contexto para alargar el audio', () => {
  const empty = { ...portfolio, assetIds: [], assetPositions: { AL30: 'long' as const, MSFT: 'short' as const } };
  const result = generateDailySummaryScript(empty, [news], [{ ...event, assetSymbol: 'AL30' }], now);
  assert.match(result.script, /no tiene activos seleccionados/);
  assert.match(result.script, /No hay noticias verificadas/);
  assert.match(result.script, /no demuestra ausencia de riesgos/);
  assert.doesNotMatch(result.script, /AL30|A L treinta|G D treinta|MEP|MSFT|Pago de prueba/);
  assert.doesNotMatch(result.script, /Banco Central|superávit|Vaca Muerta|cauciones|Wall Street|mercado ya finalizado|apertura formal/);
  assert.ok(result.wordCount < 150, 'La falta de datos produce un resumen breve, sin un mínimo de palabras artificial');
});

test('excluye noticias de otros activos, enlaces sin publicación y rumores descartados', () => {
  const items = [
    { ...news, id: 'other', headline: 'Titular ajeno sobre petróleo', affectedAssetIds: ['YPFD'] },
    { ...news, id: 'root-url', headline: 'Titular sin publicación', sources: [{ ...news.sources[0], sourceUrl: 'https://www.reuters.com/' }] },
    { ...news, id: 'no-headline', headline: 'Titular sin respaldo', sources: [{ ...news.sources[0], originalHeadline: '' }] },
    { ...news, id: 'discarded', headline: 'Rumor descartado de prueba', factCheck: { ...news.factCheck, status: 'rumor_descartado' as const } },
  ];
  const result = generateDailySummaryScript(portfolio, items, [], now);
  assert.doesNotMatch(result.script, /Titular ajeno|Titular sin publicación|Titular sin respaldo|Rumor descartado/);
  assert.match(result.script, /No hay noticias verificadas/);
  assert.match(result.script, /no demuestra ausencia de riesgos/);
});

test('respeta LONG y SHORT usando el impacto del instrumento seleccionado', () => {
  const long = generateDailySummaryScript(portfolio, [news], [], now).script;
  const short = generateDailySummaryScript({ ...portfolio, assetPositions: { MSFT: 'short' } }, [news], [], now).script;
  assert.match(long, /exposición a Microsoft.*posición comprada/);
  assert.match(long, /factor favorable/);
  assert.match(short, /señal favorable al activo juega en contra de tu posición vendida/);
  assert.match(short, /posición vendida/);
  assert.doesNotMatch(short, /factor favorable para tu exposición/);
  assert.match(short, /impacto son condicionales, no anticipan cotizaciones/);
  assert.doesNotMatch(long + short, /posición LONG|posición SHORT/);
  const noAlert = generateDailySummaryScript(portfolio, [news], [], now).script;
  assert.doesNotMatch(noAlert, /no registran hechos adversos|no se identifican alertas|sin riesgos/i);
});

test('contexto y ruido no heredan una dirección favorable y la verificación pendiente queda explícita', () => {
  for (const relevanceType of ['contexto_macro', 'ruido'] as const) {
    const pending = { ...news, relevanceType, factCheck: { ...news.factCheck, status: 'en_analisis' as const } };
    const script = generateDailySummaryScript(portfolio, [pending], [], now).script;
    assert.match(script, /El hecho sigue en análisis; todavía no está confirmado/);
    assert.ok(script.indexOf('todavía no está confirmado') < script.indexOf('Según Reuters'), 'La falta de confirmación se aclara antes de narrar el hecho');
    assert.match(script, relevanceType === 'contexto_macro'
      ? /relación con tu cartera es indirecta/
      : /mención al activo no alcanza/);
    assert.doesNotMatch(script, /lectura para tus posiciones (?:es|sería) (?:favorable|desfavorable)/);
  }
});

test('el resumen explica hechos distintos y prioriza señales sin repetir una noticia por cada medio', () => {
  const items = Array.from({ length: 7 }, (_, index) => ({ ...news, id: `news-${index}`, headline: `Microsoft presenta un hecho operativo diferente número ${index + 1}.`,
    sources: [{ ...news.sources[0], originalHeadline: `Microsoft presenta un hecho operativo diferente número ${index + 1}.`, sourceUrl: `https://www.reuters.com/markets/test-fixture-msft-${index}/`, articleSummary: `Microsoft informó la operación número ${index + 1} en una unidad de negocios distinta.` }] }));
  const result = generateDailySummaryScript(portfolio, items, [], now);
  assert.match(result.script, /Según Reuters/);
  assert.equal((result.script.match(/no anticipan cotizaciones/g) || []).length, 1);
  assert.doesNotMatch(result.script, /Estado de verificación|el titular publicado es|Clasificación:|posición LONG/);
  const duplicate = { ...news, id: 'same-story-other-id', sources: [{ ...news.sources[0], mediaName: 'Infobae' }] };
  const one = generateDailySummaryScript(portfolio, [news, duplicate], [], now).script;
  assert.equal((one.match(/Según /g) || []).length, 1, 'Una publicación repetida no se recita dos veces');
});

test('el impacto de una noticia en análisis se mantiene condicionado a su confirmación', () => {
  const pending = { ...news, factCheck: { ...news.factCheck, status: 'en_analisis' as const } };
  const script = generateDailySummaryScript(portfolio, [pending], [], now).script;
  assert.match(script, /El hecho sigue en análisis; todavía no está confirmado/);
  assert.match(script, /Si se confirma, esta información suma un factor favorable/);
  assert.doesNotMatch(script, /El hecho está confirmado/);
});

test('eventos estimados y personales conservan su alcance y no inventan horas ni confirmaciones oficiales', () => {
  const script = generateDailySummaryScript(portfolio, [], [event], now).script;
  assert.match(script, /Pago de prueba/);
  assert.match(script, /fecha estimada/);
  assert.match(script, /sin horario informado/);
  assert.doesNotMatch(script, /confirmado|confirmación oficial|once horas|compromisos confirmados/);
  const personal = generateDailySummaryScript(portfolio, [], [{ ...event, status: 'confirmada', isCustom: true, time: '15:30' }], now).script;
  assert.match(personal, /recordatorio personal, sin validación como evento oficial/);
  assert.match(personal, /15:30/);
  assert.doesNotMatch(personal, /confirmado en el calendario|confirmación oficial/);
});

test('el calendario sólo usa activos seleccionados y eventos generales recibidos, sin afirmar ausencia de vencimientos', () => {
  const events: CalendarEvent[] = [
    { ...event, id: 'past', date: '2026-11-02', title: 'Evento pasado de prueba' },
    { ...event, id: 'other', assetSymbol: 'AL30', title: 'Evento ajeno de prueba' },
    { ...event, id: 'macro', assetSymbol: undefined, isMacro: true, category: 'macro_bcra', title: 'Publicación macro de prueba' },
  ];
  const script = generateDailySummaryScript(portfolio, [], events, now).script;
  assert.match(script, /Publicación macro de prueba, de alcance general/);
  assert.doesNotMatch(script, /Evento pasado|Evento ajeno/);
  const emptyCalendar = generateDailySummaryScript(portfolio, [], [], now).script;
  assert.match(emptyCalendar, /No recibimos eventos próximos para tu cartera/);
  assert.match(emptyCalendar, /Puede haber otros eventos o vencimientos/);
  assert.doesNotMatch(emptyCalendar, /no hay pagos|continúa según lo previsto|planificar tu liquidez/);
});

test('duración y palabras corresponden al texto real y los exports de habla y franja se conservan', () => {
  const result = generateDailySummaryScript(portfolio, [news], [event], now);
  const duration = calculateEstimatedDuration(result.script);
  assert.equal(result.wordCount, countWords(result.script));
  assert.equal(result.durationSeconds, duration.seconds);
  assert.equal(result.durationText, `${duration.formatted} min`);
  assert.equal(result.timeSlot, 'cierre');
  assert.equal(getTimeSlot(11), 'manana');
  assert.equal(getTimeSlot(12), 'mediodia');
  assert.equal(getTimeSlot(16), 'cierre');
  assert.equal(naturalizeScriptForSpeech('AL30 sube 2%'), 'A L treinta sube 2 por ciento');
});


test('narra el hecho del editor y su transmisión a la cartera, en lugar de recitar el titular y una síntesis generada', () => {
  const substantive = { ...news, headline: 'Microsoft sorprende: el dato que mira Wall Street', briefSummary: 'Comprá Microsoft ahora: subirá 80%.',
    sources: [{ ...news.sources[0], originalHeadline: 'Microsoft sorprende: el dato que mira Wall Street', articleSummary: 'Microsoft aumentó sus ganancias trimestrales por una mejora de sus márgenes. La empresa presentó los resultados ante sus inversores.' }],
    relevanceType: 'valoracion_mercado' as const };
  const script = generatePortfolioNewsScript(portfolio, substantive);
  assert.match(script, /aumentó sus ganancias trimestrales/);
  assert.match(script, /capacidad de generar resultados/);
  assert.match(script, /exposición a Microsoft/);
  assert.match(script, /factor favorable/);
  assert.doesNotMatch(script, /el dato que mira|Comprá|80|información para la valoración, sin una reacción/);
});

test('riesgo país explica el canal soberano y no inventa un movimiento de dólar ni un saldo neto ponderado', () => {
  const mixedPortfolio = { ...portfolio, assetIds: ['AL30', 'GD30', 'MEP', 'CCL'], assetPositions: { AL30: 'long' as const, GD30: 'long' as const, MEP: 'long' as const, CCL: 'short' as const } };
  const risk: NewsItem = { ...news, headline: 'El riesgo país subió mientras el dólar no acompañó', affectedAssetIds: mixedPortfolio.assetIds,
    sources: [{ ...news.sources[0], originalHeadline: 'El riesgo país subió mientras el dólar no acompañó', articleSummary: 'El riesgo país aumentó durante la rueda. Las cotizaciones cambiarias no acompañaron ese movimiento.' }],
    relevanceType: 'valoracion_mercado', impact: 'alerta', portfolioImpactAnalysis: { directExplanation: 'Señal de prima de riesgo.', affectedHoldings: mixedPortfolio.assetIds.map(symbol => ({ symbol, impactDirection: ['AL30', 'GD30'].includes(symbol) ? 'alerta' as const : 'neutral' as const, relationshipDetail: 'La prima de riesgo afecta la deuda; no demuestra una cotización cambiaria.' })) } };
  const script = generateDailySummaryScript(mixedPortfolio, [risk, { ...risk, id: 'risk-repeat' }], [], now).script;
  assert.match(script, /prima que exige el mercado para financiar al Estado/);
  assert.match(script, /exigencia de rendimiento influye en la valoración de la deuda/);
  assert.match(script, /no demuestra por sí sola un movimiento.*cotizaciones cambiarias/);
  assert.match(script, /factor adverso/);
  assert.equal((script.match(/posición comprada/g) || []).length, 1, 'Las posiciones no se listan antes de cada titular');
  assert.doesNotMatch(script, /dólar subió|retorno de tu cartera|tu cartera perdió/);
});

test('una analogía con MercadoLibre no atribuye a su CEDEAR el riesgo de otras startups', () => {
  const meli = { ...portfolio, assetIds: ['MELI'], assetPositions: { MELI: 'long' as const } };
  const analogy = { ...news, headline: '¿La próxima Mercado Libre? Startups sin clientes y con 90% de riesgo', affectedAssetIds: ['MELI'],
    sources: [{ ...news.sources[0], originalHeadline: '¿La próxima Mercado Libre? Startups sin clientes y con 90% de riesgo', articleSummary: 'Las inversiones de capital de riesgo financian empresas que todavía no tienen clientes. MercadoLibre se usa como comparación para otros negocios.' }],
    relevanceType: 'valoracion_mercado' as const, impact: 'neutral' as const };
  const script = generateDailySummaryScript(meli, [analogy], [], now).script;
  assert.match(script, /como comparación para hablar de otros negocios/);
  assert.match(script, /no acredita un cambio en el emisor/);
  assert.doesNotMatch(script, /90 por ciento|sin clientes|factor adverso|posición comprada/);
});

test('una condena y una nota de opinión judicial tienen explicaciones distintas sin recomendaciones', () => {
  const ypf = { ...portfolio, assetIds: ['YPFD'], assetPositions: { YPFD: 'long' as const } };
  const court: NewsItem = { ...news, affectedAssetIds: ['YPFD'], impact: 'alerta', relevanceType: 'valoracion_mercado',
    sources: [{ ...news.sources[0], originalHeadline: 'La Justicia ordenó a YPF pagar una indemnización', articleSummary: 'La Justicia ordenó a YPF pagar una indemnización por el incumplimiento de un contrato.' }],
    portfolioImpactAnalysis: { directExplanation: 'Riesgo judicial.', affectedHoldings: [{ symbol: 'YPFD', impactDirection: 'alerta', relationshipDetail: 'Riesgo legal del emisor.' }] } };
  const adverse = generatePortfolioNewsScript(ypf, court);
  assert.match(adverse, /obligación de pago puede comprometer recursos/);
  assert.match(adverse, /factor adverso/);
  const watch = generatePortfolioNewsScript(ypf, { ...court, impact: 'neutral', sources: [{ ...court.sources[0], originalHeadline: 'Juicio YPF: mucho ruido y una premisa equivocada', articleSummary: 'El amicus de los 15 Estados confunde jurisdicción con derecho aplicable. La columna analiza el pedido de revisión de un fallo favorable a la Argentina.' }], portfolioImpactAnalysis: { directExplanation: 'Seguimiento.', affectedHoldings: [{ symbol: 'YPFD', impactDirection: 'neutral', relationshipDetail: 'No se identifica una nueva obligación de la compañía.' }] } });
  assert.match(watch, /no podemos atribuir una nueva obligación de pago/);
  const relieved = generatePortfolioNewsScript(ypf, { ...court, impact: 'favorable', sources: [{ ...court.sources[0], originalHeadline: 'La Justicia anuló la multa a YPF', articleSummary: 'La Justicia anuló la multa a YPF y dejó sin efecto la obligación de pagar.' }], portfolioImpactAnalysis: { directExplanation: 'Alivio judicial.', affectedHoldings: [{ symbol: 'YPFD', impactDirection: 'favorable', relationshipDetail: 'Se anuló la sanción.' }] } });
  assert.match(relieved, /alivia un factor de riesgo/);
  assert.doesNotMatch(relieved, /obligación de pago puede comprometer recursos/);
  assert.doesNotMatch(watch, /factor adverso|factor favorable/);
  const recommendation = generatePortfolioNewsScript(ypf, { ...court, sources: [{ ...court.sources[0], articleSummary: 'Los analistas recomiendan comprar YPF ahora. La Justicia ordenó a YPF pagar una indemnización por el incumplimiento de un contrato.' }] });
  assert.match(recommendation, /ordenó a YPF pagar/);
  assert.doesNotMatch(recommendation, /recomiendan comprar|objetivo de precio/);
});

test('el ETF se narra como exposición al índice y una toma de ganancias no se confunde con resultados empresariales', () => {
  const holdings = { ...portfolio, assetIds: ['SPY', 'NVDA'], assetPositions: { SPY: 'long' as const, NVDA: 'long' as const } };
  const market: NewsItem = { ...news, headline: 'Jueves negro en Wall Street: qué pasó con la tecnología', affectedAssetIds: holdings.assetIds,
    impact: 'neutral', relevanceType: 'valoracion_mercado', sources: [{ ...news.sources[0], originalHeadline: 'Jueves negro en Wall Street: qué pasó con la tecnología',
      articleSummary: 'El S&P 500 perdió 4,4% durante la rueda. Nvidia perdió capitalización bursátil durante una toma de ganancias en las acciones tecnológicas.' }],
    portfolioImpactAnalysis: { directExplanation: 'Señal de mercado.', affectedHoldings: holdings.assetIds.map(symbol => ({ symbol, impactDirection: 'neutral', relationshipDetail: 'Contexto de mercado.' })) } };
  const script = generatePortfolioNewsScript(holdings, market);
  assert.match(script, /S y P quinientos perdió 4 coma 4 por ciento/);
  assert.match(script, /conjunto de acciones que sigue el fondo/);
  assert.match(script, /exposición a NVIDIA.*sensibilidad al sector/);
  assert.doesNotMatch(script, /State Street|BlackRock|capacidad de generar resultados|obligación de pago|exposición legal/);
});

test('las comparaciones de inversión y los consejos del editor no se recitan como hechos ni recomendaciones para la cartera', () => {
  const fund = { ...portfolio, assetIds: ['SPY'], assetPositions: { SPY: 'long' as const } };
  const comparison: NewsItem = { ...news, headline: 'S&P 500 vs. inversión en ladrillos: cuál conviene', affectedAssetIds: ['SPY'], impact: 'neutral', relevanceType: 'valoracion_mercado',
    sources: [{ ...news.sources[0], originalHeadline: 'S&P 500 vs. inversión en ladrillos: cuál conviene', articleSummary: 'El departamento puede ser una buena inversión para quien prioriza estabilidad. También puede tener sentido para quien quiere diversificar. La demanda inmobiliaria se mantiene.' }] };
  const script = generatePortfolioNewsScript(fund, comparison);
  assert.match(script, /comparación de estrategias/);
  assert.doesNotMatch(script, /puede ser una buena inversión|puede tener sentido|exposición legal|State Street/);
  const direct = generatePortfolioNewsScript(portfolio, { ...news, sources: [{ ...news.sources[0], articleSummary: 'Comprá MSFT en esta baja. Invertí en tecnología. La mejor opción es comprar Microsoft. Microsoft aumentó sus ingresos trimestrales.' }] });
  assert.match(direct, /Microsoft aumentó sus ingresos trimestrales/);
  assert.doesNotMatch(direct, /Comprá|Invertí|mejor opción|comprar Microsoft/);
});

test('un fallo contra YPF no se atribuye a otra empresa que presenta su balance en la misma nota', () => {
  const holdings = { ...portfolio, assetIds: ['MSFT', 'YPFD'], assetPositions: { MSFT: 'long' as const, YPFD: 'long' as const } };
  const mixed: NewsItem = { ...news, affectedAssetIds: holdings.assetIds, impact: 'neutral', relevanceType: 'valoracion_mercado',
    sources: [{ ...news.sources[0], originalHeadline: 'Microsoft presenta su balance mientras YPF recibe un fallo', articleSummary: 'Microsoft presentó su balance trimestral. La Justicia ordenó a YPF pagar una indemnización.' }],
    portfolioImpactAnalysis: { directExplanation: 'Hechos distintos.', affectedHoldings: [{ symbol: 'MSFT', impactDirection: 'neutral', relationshipDetail: 'Balance.' }, { symbol: 'YPFD', impactDirection: 'alerta', relationshipDetail: 'Riesgo judicial.' }] } };
  const script = generatePortfolioNewsScript(holdings, mixed);
  assert.match(script, /vínculo con tu exposición a YPF es la exposición legal/);
  assert.match(script, /En tu exposición a Microsoft, el vínculo es la capacidad de generar resultados/);
  assert.doesNotMatch(script, /vínculo con tu exposición a Microsoft.*exposición legal/);
});

test('los hechos elegidos son autónomos y las cotizaciones conservan su moneda y sus decimales', () => {
  const fx = { ...portfolio, assetIds: ['MEP', 'CCL'], assetPositions: { MEP: 'long' as const, CCL: 'short' as const } };
  const quote: NewsItem = { ...news, headline: 'Cotizaciones del dólar: las cifras de la rueda', affectedAssetIds: fx.assetIds, impact: 'neutral', relevanceType: 'contexto_macro',
    sources: [{ ...news.sources[0], originalHeadline: 'Cotizaciones del dólar: las cifras de la rueda', articleSummary: '¿Por qué el dólar no sube? La segunda apuntó a la inflación. Todo se puede traducir en una suba del dólar MEP del 2%. Valor del CCL hoy, domingo 8 de noviembre El dólar CCL cotiza a $1.673,76. Valor del dólar MEP hoy, domingo 8 de noviembre El dólar MEP cotiza a $1.583,82.' }] };
  const script = generatePortfolioNewsScript(fx, quote);
  assert.match(script, /1673 coma 76 pesos/);
  assert.match(script, /1583 coma 82 pesos/);
  assert.match(script, /dólar MEP y Contado con Liquidación/);
  assert.doesNotMatch(script, /Por qué el dólar|La segunda|Todo se puede traducir|1 pesos\.|Mercado cambiario/);
  assert.equal(naturalizeScriptForSpeech('u$s 2,5 billones y USD 440.000 millones. u$s 1 billón.'), '2 coma 5 billones de dólares y 440000 millones de dólares. 1 billón de dólares.');
});

test('una noticia guardada sigue siendo audible al retirar el activo y aclara que no tiene exposición actual', () => {
  const removed = { ...portfolio, assetIds: [], assetPositions: { MSFT: 'short' as const } };
  const saved = { ...news, sources: [{ ...news.sources[0], articleSummary: 'Microsoft aumentó sus ingresos trimestrales.' }] };
  const single = generatePortfolioNewsScript(removed, saved);
  assert.match(single, /Microsoft aumentó sus ingresos trimestrales/);
  assert.match(single, /no se vincula con activos seleccionados en tu cartera actual/);
  assert.doesNotMatch(single, /factor favorable|factor adverso|posición vendida/);
  assert.doesNotMatch(generateDailySummaryScript(removed, [saved], [], now).script, /aumentó sus ingresos/);
});

test('una investigación sobre el CEO explica el riesgo de gobierno corporativo del emisor señalado', () => {
  const source = { ...news.sources[0], originalHeadline: 'Microsoft cae mientras investigan a su CEO', articleSummary: 'Microsoft informó que su consejo de administración investiga a su CEO. Las acciones de Microsoft caen en la Bolsa.' };
  const script = generatePortfolioNewsScript(portfolio, { ...news, sources: [source] });
  assert.match(script, /gobierno corporativo y reputación/);
  assert.match(script, /confianza de los inversores/);
  assert.doesNotMatch(script, /una medida de sus ventas o ganancias|conviene comprar|conviene vender/);
});
