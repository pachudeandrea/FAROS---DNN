import test from 'node:test';
import assert from 'node:assert/strict';
import type { CalendarEvent, NewsItem, Portfolio } from '../src/types/index';
import { calculateEstimatedDuration } from '../src/utils/audioController';
import { getNowAR } from '../src/utils/dateAR';
import { countWords, generateDailySummaryScript, getTimeSlot, naturalizeScriptForSpeech } from '../src/utils/dailySummaryGenerator';

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
  assert.match(long, /MSFT, posición comprada/);
  assert.match(long, /lectura para tus posiciones es favorable/);
  assert.match(short, /MSFT, posición vendida/);
  assert.match(short, /lectura para tus posiciones es desfavorable/);
  assert.doesNotMatch(short, /lectura para tus posiciones es favorable/);
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
    assert.ok(script.indexOf('todavía no está confirmado') < script.indexOf(news.headline), 'La falta de confirmación se aclara antes de leer el titular');
    assert.match(script, relevanceType === 'contexto_macro'
      ? /contexto macroeconómico, sin un efecto de precio demostrado/
      : /No hay un efecto financiero suficientemente respaldado/);
    assert.doesNotMatch(script, /lectura para tus posiciones (?:es|sería) (?:favorable|desfavorable)/);
  }
});

test('el guion confirmado lee fuente y titular sin recitar etiquetas ni repetir advertencias por noticia', () => {
  const items = Array.from({ length: 7 }, (_, index) => ({ ...news, id: `news-${index}`, headline: `Titular de prueba ${index + 1}.` }));
  const result = generateDailySummaryScript(portfolio, items, [], now);
  assert.match(result.script, /Repasamos 6 de las 7 noticias/);
  assert.match(result.script, /Reuters: Titular de prueba 1\./);
  assert.doesNotMatch(result.script, /Titular de prueba 7|Estado de verificación|el titular publicado es|Clasificación:|posición LONG/);
  assert.equal((result.script.match(/no anticipan cotizaciones/g) || []).length, 1);
  assert.ok(result.wordCount < 300, 'Seis titulares no requieren un bloque de advertencias por noticia');
});

test('el impacto de una noticia en análisis se mantiene condicionado a su confirmación', () => {
  const pending = { ...news, factCheck: { ...news.factCheck, status: 'en_analisis' as const } };
  const script = generateDailySummaryScript(portfolio, [pending], [], now).script;
  assert.match(script, /El hecho sigue en análisis; todavía no está confirmado/);
  assert.match(script, /Si se confirma, la lectura para tus posiciones sería favorable/);
  assert.doesNotMatch(script, /lectura para tus posiciones es favorable/);
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
