import { Portfolio, NewsItem, CalendarEvent } from '../types/index';
import { NowAR, getNowAR } from './dateAR';
import { calculateEstimatedDuration } from './audioController';
import { getPortfolioAffectedAssetIds, getPortfolioNewsImpact } from './portfolioNews';
import { distinctMediaSources } from './sourceGrounding';

export interface DailySummaryResult {
  script: string;
  wordCount: number;
  durationText: string;
  durationSeconds: number;
  timeSlot: 'manana' | 'mediodia' | 'cierre';
  generatedAtIso: string;
  disclaimerNotice?: string;
}

/**
 * Counts words accurately in Spanish text.
 */
export function countWords(text: string): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

/**
 * Determines the market day slot in Argentina timezone.
 * Mañana: < 12:00
 * Mediodía: 12:00 - 16:00
 * Cierre: >= 16:00
 */
export function getTimeSlot(hour: number): 'manana' | 'mediodia' | 'cierre' {
  if (hour < 12) return 'manana';
  if (hour < 16) return 'mediodia';
  return 'cierre';
}

/**
 * Naturalizes text for natural Argentine Rioplatense neural speech synthesis.
 * - Short conversational sentences with voseo
 * - Replaces symbols (%, $, &, /) with natural spoken words ("por ciento", "dólares", "pesos", "y")
 * - Spells out tickers and acronyms ("AL treinta", "GD treinta", "dólar MEP", "S y P quinientos")
 * - Removes abbreviations that TTS can mispronounce
 */
export function naturalizeScriptForSpeech(raw: string): string {
  if (!raw) return '';

  let text = raw;

  // Clean markdown or html tags
  text = text.replace(/<[^>]*>/g, ' ');
  text = text.replace(/[*#_~`]/g, '');

  // 1. Specific index and ticker replacements before generic & or / replacements
  text = text.replace(/\bS\s*&\s*P\s*500\b/gi, 'S y P quinientos');
  text = text.replace(/\bS\s*&\s*P\b/gi, 'S y P');
  text = text.replace(/\bSPY\b/g, 'S y P quinientos');
  text = text.replace(/\bAL30\b/g, 'A L treinta');
  text = text.replace(/\bGD30\b/g, 'G D treinta');
  text = text.replace(/\bAL29\b/g, 'A L veintinueve');
  text = text.replace(/\bGD35\b/g, 'G D treinta y cinco');
  text = text.replace(/\bGD38\b/g, 'G D treinta y ocho');
  text = text.replace(/\bGD46\b/g, 'G D cuarenta y seis');
  text = text.replace(/\bYPFD\b/g, 'YPF');
  text = text.replace(/\bGGAL\b/g, 'Galicia');
  text = text.replace(/\bPAMP\b/g, 'Pampa Energía');
  text = text.replace(/\bBOPREAL\b/g, 'Bopreal');
  text = text.replace(/\bMELI\b/g, 'MercadoLibre');
  text = text.replace(/\bAAPL\b/g, 'Apple');
  text = text.replace(/\bNVDA\b/g, 'Nvidia');
  text = text.replace(/\bBBAR\b/g, 'Banco Francés');
  text = text.replace(/\bBMA\b/g, 'Banco Macro');
  text = text.replace(/\bTXAR\b/g, 'Ternium');
  text = text.replace(/\bEDN\b/g, 'Edenor');
  text = text.replace(/\bCRES\b/g, 'Cresud');
  text = text.replace(/\bCEPU\b/g, 'Central Puerto');
  text = text.replace(/\bTGSU2\b/g, 'Transportadora de Gas del Sur');
  text = text.replace(/\bLECAPS?\b/gi, 'Lecaps');
  text = text.replace(/\bBONCER\b/gi, 'Boncer');

  // Currency & MEP: avoid "dólar dólar MEP"
  text = text.replace(/\bd[oó]lar\s+MEP\b/gi, 'dólar MEP');
  text = text.replace(/\b(?<!d[oó]lar\s)MEP\b/gi, 'dólar MEP');
  text = text.replace(/\bd[oó]lar\s+CCL\b/gi, 'dólar Contado con Liquidación');
  text = text.replace(/\b(?<!d[oó]lar\s)CCL\b/gi, 'Contado con Liquidación');

  // Abbreviations to spoken words
  text = text.replace(/\bvs\.?\s*/gi, 'frente a ');
  text = text.replace(/\bej\.?\s*/gi, 'por ejemplo ');
  text = text.replace(/\betc\.?\s*/gi, 'entre otras variables ');
  text = text.replace(/\baprox\.?\s*/gi, 'aproximadamente ');
  text = text.replace(/\bpb\b/gi, 'puntos básicos');
  text = text.replace(/\bbps\b/gi, 'puntos básicos');
  text = text.replace(/\bTIR\b/g, 'tasa interna de retorno');
  text = text.replace(/\bBYMA\b/g, 'Bolsas y Mercados Argentinos');
  text = text.replace(/\bMAE\b/g, 'Mercado Abierto Electrónico');
  text = text.replace(/\bCNV\b/g, 'Comisión Nacional de Valores');
  text = text.replace(/\bBCRA\b/g, 'Banco Central');
  text = text.replace(/\bMULC\b/g, 'mercado libre de cambios');
  text = text.replace(/\bADR\b/g, 'A D R');

  // Numbers & Symbols to words
  text = text.replace(/(\d+)[.,](\d+)\s*%/g, '$1 coma $2 por ciento');
  text = text.replace(/(\d+)\s*%/g, '$1 por ciento');
  text = text.replace(/%/g, ' por ciento');
  text = text.replace(/u\$s\s*(\d+)/gi, '$1 dólares');
  text = text.replace(/usd\s*(\d+)/gi, '$1 dólares');
  text = text.replace(/\$\s*(\d+)/g, '$1 pesos');
  text = text.replace(/\$/g, 'pesos');
  text = text.replace(/\s*&\s*/g, ' y ');
  text = text.replace(/(\w+)\/(\w+)/g, '$1 o $2');

  // Remove parenthesis, brackets and strange quotes
  text = text.replace(/[()[\]{}"«»]/g, ' ');

  // Standardize spaces and punctuation
  text = text.replace(/\s+/g, ' ');
  text = text.replace(/\s+([.,;:])/g, '$1');
  text = text.trim();

  return text;
}

/** Generates an informative audio summary from the supplied portfolio, publications and calendar. */
export function generateDailySummaryScript(
  portfolio: Portfolio,
  newsList: NewsItem[],
  calendarEvents: CalendarEvent[],
  customNowAR?: NowAR
): DailySummaryResult {
  const nowAR = customNowAR || getNowAR();
  const timeSlot = getTimeSlot(nowAR.hour);
  const userTickers = new Set(portfolio.assetIds);
  const sections = [
    `Resumen FAROS del ${nowAR.formattedSpanish} para tu cartera ${portfolio.name || 'Cartera Principal'}.`,
  ];
  if (!userTickers.size) sections.push('Tu cartera no tiene activos seleccionados.');

  const relevantNews = [...new Map(newsList.map(item => [item.id, item])).values()]
    .filter(item => getPortfolioAffectedAssetIds(item, portfolio.assetIds).length > 0
      && (item.factCheck.status === 'confirmado' || item.factCheck.status === 'en_analisis'))
    .map(item => ({ item, sources: distinctMediaSources(item.sources).filter(source => source.originalHeadline?.trim()) }))
    .filter(({ item, sources }) => item.headline.trim() && sources.length > 0);

  const relevanceLabels: Record<NewsItem['relevanceType'], string> = {
    impacto_precio: 'hecho material o variación de cotización reportados; la categoría por sí sola no prueba que el precio haya cambiado',
    valoracion_mercado: 'información para la valoración, sin reacción de cotización demostrada',
    contexto_macro: 'contexto macroeconómico, sin efecto de precio específico demostrado',
    ruido: 'ruido, sin efecto financiero específico suficientemente acreditado',
  };
  if (!relevantNews.length) {
    sections.push('No hay noticias verificadas para tus activos en esta consulta. Esto no demuestra ausencia de riesgos.');
  } else {
    sections.push(`Este resumen incluye ${Math.min(relevantNews.length, 6)} de las ${relevantNews.length} publicaciones relevantes con fuente disponibles en esta consulta.`);
    for (const { item, sources } of relevantNews.slice(0, 6)) {
      const selected = getPortfolioAffectedAssetIds(item, portfolio.assetIds);
      const positions = selected.map(id => `${id}, posición ${portfolio.assetPositions?.[id] === 'short' ? 'SHORT' : 'LONG'}`).join('; ');
      const verification = item.factCheck.status === 'confirmado'
        ? 'Estado de verificación registrado: confirmado.'
        : 'La verificación del hecho sigue en análisis; no se presenta como confirmado.';
      sections.push(`Para ${positions}. Según ${sources.map(source => source.mediaName).join(' y ')}, el titular publicado es: ${item.headline}. ${verification} Clasificación: ${relevanceLabels[item.relevanceType]}.`);
      const effect = getPortfolioNewsImpact(item, portfolio);
      if (effect === 'favorable' || effect === 'positivo') {
        sections.push('La lectura para tus posiciones es condicionalmente favorable, si el efecto identificado se traslada al valor de los instrumentos. No anticipa una cotización.');
      } else if (effect === 'alerta' || effect === 'negativo') {
        sections.push('La lectura para tus posiciones es condicionalmente desfavorable, si el efecto identificado se traslada al valor de los instrumentos. No anticipa una cotización.');
      } else {
        sections.push('No se establece una dirección neta favorable o desfavorable para tus posiciones.');
      }
    }
  }

  const upcomingEvents = [...new Map(calendarEvents.map(event => [event.id, event])).values()]
    .filter(event => event.date >= nowAR.isoDate && (event.assetSymbol
      ? userTickers.has(event.assetSymbol)
      : event.isMacro || event.category === 'macro_bcra' || event.category === 'elecciones_politica'))
    .sort((a, b) => a.date.localeCompare(b.date) || (a.time || '').localeCompare(b.time || ''));
  if (upcomingEvents.length) {
    sections.push('Próximos registros recibidos del calendario:');
    for (const event of upcomingEvents.slice(0, 3)) {
      const status = event.isCustom ? 'recordatorio personal, sin validación como evento oficial'
        : event.status === 'estimada' ? 'fecha estimada'
          : event.status === 'confirmada' ? 'figura como confirmado en el calendario recibido'
            : event.status === 'realizado' ? 'registrado como realizado'
              : 'sin estado de confirmación informado';
      const asset = event.assetSymbol ? `, para ${event.assetSymbol}` : ', de alcance general';
      const time = event.time?.trim() ? `, a las ${event.time}` : ', sin horario informado';
      sections.push(`${event.title}${asset}, el ${event.date}${time}: ${status}.`);
    }
  } else {
    sections.push('No se recibieron registros de calendario para hoy o fechas posteriores aplicables a tu cartera. Esto no confirma que no existan otros eventos o vencimientos.');
  }
  sections.push('Este resumen es informativo y no contiene recomendaciones de compra o venta.');

  const script = naturalizeScriptForSpeech(sections.join(' '));
  const durationEst = calculateEstimatedDuration(script, 1.0);
  return {
    script,
    wordCount: countWords(script),
    durationText: `${durationEst.formatted} min`,
    durationSeconds: durationEst.seconds,
    timeSlot,
    generatedAtIso: new Date().toISOString(),
  };
}
