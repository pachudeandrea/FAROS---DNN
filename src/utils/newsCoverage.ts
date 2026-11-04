import { recognizeAssetIds } from './assetNews.js';
import type { MediaCoverage, NewsItem } from '../types/index.js';
import { areSourcesReportingSameEvent, cleanHeadlineText, distinctMediaSources, getPublisherKey } from './sourceGrounding.js';

// Compare original, verified headlines, never a model's broad market summary.
// Aliases let outlets describe the same actor in their own words.
const bankActors: [string, RegExp][] = [
  ['bcra', /\b(bcra|banco central (?:argentino|de argentina|de la republica argentina))\b/],
  ['fed', /\b(fed|reserva federal)\b/],
  ['bce', /\b(bce|banco central europeo)\b/],
  ['rba', /\b(australia|australiano|rba)\b/],
  ['bcb', /\b(brasil|brasileno|bcb)\b/],
  ['boe', /\b(inglaterra|reino unido|britanico|boe)\b/],
  ['banxico', /\b(mexico|mexicano|banxico)\b/],
  ['bcch', /\b(chile|chileno|bcch)\b/],
  ['boj', /\b(japon|japones|boj)\b/],
  ['pboc', /\b(china|chino|pboc)\b/]
];
function centralBankActors(value: string): string[] {
  const text = cleanHeadlineText(value);
  if (!/\b(bcra|fed|bce|rba|bcb|boe|banxico|bcch|boj|pboc|banco central|reserva federal|banco de reserva|autoridad monetaria|tasas?)\b/.test(text)) return [];
  const explicit = bankActors.flatMap(([actor, pattern]) => pattern.test(text) ? [actor] : []);
  // A foreign central bank must never become the Argentine BCRA through an alias.
  return explicit.length ? explicit : /\b(banco central|autoridad monetaria)\b/.test(text) ? ['bcra'] : [];
}
function eventText(value: string): string {
  const actors = centralBankActors(value);
  return cleanHeadlineText(value)
    .replace(/\b(?:banco central(?: de la republica argentina)?|autoridad monetaria)\b/g, actors.length === 1 ? actors[0] : 'banco central')
    .replace(/\breserva federal\b/g, 'fed')
    .replace(/titulos publicos|bonos soberanos|deuda soberana/g, 'bonos en dolares')
    .replace(/indice de precios al consumidor|costo de vida/g, 'inflacion')
    .replace(/adquirio|compro|compras netas|saldo comprador/g, 'compro')
    .replace(/prestamos hipotecarios|creditos para vivienda/g, 'credito hipotecario')
    .replace(/\b(dejo sin cambios|deja sin cambios|mantuvo|mantener|conservo)\b/g, 'mantiene')
    .replace(/\b(recorto|recorta|recorte|redujo|reduce|reduccion|bajo)\b/g, 'baja')
    .replace(/\b(subio|elevo|aumento|incremento|eleva|aumenta|incrementa|suba)\b/g, 'sube')
    .replace(/\btasas\b/g, 'tasa')
    .replace(/\bpuntos basicos\b/g, 'pb');
}

const months = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g;
const currencies = /\b(mep|ccl|blue|oficial)\b/g;
const companies = /\b(ypf|pampa|galicia|bbva|apple|nvidia|mercadolibre|tesla)\b/g;
const eventKinds = [
  /\b(bcra|reservas)\b.*\b(compra|compro|vende|vendio|reservas|mulc)\b/,
  /\b(bcra|fed|bce|rba|bcb|boe|banxico|bcch|boj|pboc)\b.*\b(tasa|tasas|encajes|politica monetaria)\b/,
  /\b(oleoducto|gasoducto|transporte de crudo|vaca muerta sur)\b/,
  /\b(nafta|naftas|combustible|combustibles|surtidor)\b/,
  /\b(balance|balances|ebitda|ganancias trimestrales)\b/,
  /\b(credito hipotecario|creditos hipotecarios|creditos uva)\b/,
  /\b(inflacion|ipc|indec)\b/
];
const disjoint = (a: string[], b: string[]) => a.length > 0 && b.length > 0 && !a.some(value => b.includes(value));
const policyInstruments = (text: string) => (text.match(/\b(tasas?|encajes)\b/g) || []).map(value => value === 'tasa' ? 'tasas' : value);
function policyActions(text: string): string[] {
  if (!policyInstruments(text).length) return [];
  const actions: [string, string][] = [
    ['mantiene', 'mantiene|mantuvo|mantendra|mantener|dejo sin cambios|deja sin cambios|sin cambios|no modifico|no modifica|conservo'],
    ['sube', 'subio|sube|subira|elevo|eleva|aumento|aumenta|incremento|incrementa|suba'],
    ['baja', 'bajo|baja|bajara|recorto|recorta|redujo|reduce|recorte|reduccion']
  ];
  return actions.flatMap(([action, synonyms]) => {
    // Restrict the verb to its nearby policy object: rising inflation is not a rate hike.
    const before = new RegExp(`\\b(?:${synonyms})\\b(?:\\s+\\w+){0,5}\\s+(?:tasas?|encajes)\\b`);
    const after = new RegExp(`\\b(?:tasas?|encajes)\\b(?:\\s+\\w+){0,4}\\s+(?:${synonyms})\\b`);
    const negated = new RegExp(`\\b(?:no|nego|descarto)\\s+(?:\\w+\\s+){0,2}(?:${synonyms})\\b`);
    return before.test(text) || after.test(text) ? [negated.test(text) ? `no_${action}` : action] : [];
  });
}
function reserveActions(text: string): string[] {
  if (!/\b(bcra|reservas|mulc)\b/.test(text)) return [];
  if (/\b(no|sin|dejo de)\b(?:\s+\w+){0,2}\s+(compro|compra|compras|comprar|adquirio)\b/.test(text)) return ['sin_compras'];
  return [
    /\b(compro|compra|compras|adquirio|saldo comprador)\b/.test(text) ? 'compra' : '',
    /\b(vendio|vende|ventas|saldo vendedor)\b/.test(text) ? 'venta' : ''
  ].filter(Boolean);
}
function numericFacts(value: string, unit: RegExp): string[] {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  return [...text.matchAll(unit)].map(match => {
    const number = match[1].replace(/\.(?=\d{3}(?:[.,]|$))/g, '').replace(',', '.');
    return String(Number(number));
  });
}
const kindsFor = (text: string) => {
  const matches = eventKinds.flatMap((rule, index) => rule.test(text) ? [String(index)] : []);
  // Inflation can be context for a rate decision or a company report. In that
  // case it is not itself evidence of the same statistical release.
  const inflation = String(eventKinds.length - 1);
  return matches.length > 1 ? matches.filter(kind => kind !== inflation) : matches;
};
const publishedAt = (source: MediaCoverage) => typeof source.publishedTimestamp === 'number' && Number.isFinite(source.publishedTimestamp)
  ? source.publishedTimestamp : Date.parse(source.publishedDateIso || '');
const argentinaDay = (at: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(at);

export function sourcesCoverSameEvent(primary: MediaCoverage, candidate: MediaCoverage): boolean {
  const a = eventText(primary.originalHeadline); const b = eventText(candidate.originalHeadline);
  if (!a || !b) return false;
  if (disjoint(centralBankActors(primary.originalHeadline), centralBankActors(candidate.originalHeadline))) return false;
  // Same sector/ticker is insufficient. Separate different releases, currency
  // markets and corporate actions even when their wording is very similar.
  if (disjoint(a.match(months) || [], b.match(months) || []) || disjoint(a.match(currencies) || [], b.match(currencies) || []) || disjoint(a.match(companies) || [], b.match(companies) || [])) return false;
  if (disjoint(recognizeAssetIds(primary.originalHeadline), recognizeAssetIds(candidate.originalHeadline))) return false;
  const kindsA = kindsFor(a); const kindsB = kindsFor(b);
  if (disjoint(kindsA, kindsB)) return false;
  if (disjoint(policyInstruments(a), policyInstruments(b)) || disjoint(policyActions(a), policyActions(b)) || disjoint(reserveActions(a), reserveActions(b))) return false;
  // The generic lexical matcher also accepts shared actor + topic. Conflicting
  // concrete figures or release dates disqualify that otherwise broad match.
  for (const unit of [/(\d+(?:[.,]\d+)?)\s*(?:%|por ciento)/g, /(\d+(?:[.,]\d+)?)\s*(?:puntos basicos|pb)\b/g, /(\d+(?:[.,]\d+)?)\s*(?:millones|millon)\b/g]) {
    if (disjoint(numericFacts(primary.originalHeadline, unit), numericFacts(candidate.originalHeadline, unit))) return false;
  }
  const calendarDate = /\b\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g;
  if (disjoint(a.match(calendarDate) || [], b.match(calendarDate) || [])) return false;
  const timeA = publishedAt(primary); const timeB = publishedAt(candidate);
  if (Number.isFinite(timeA) && Number.isFinite(timeB)) {
    if (Math.abs(timeA - timeB) > 36 * 3600000) return false;
    // Repeated daily quotes and reserve purchases are different daily events.
    const recurring = /\b(dolar|mep|ccl|blue|riesgo pais|wall street|bonos en dolares|reservas)\b/;
    if (recurring.test(a) && recurring.test(b) && argentinaDay(timeA) !== argentinaDay(timeB)) return false;
  }
  return areSourcesReportingSameEvent(a, b);
}

/** Add only verified publications about the primary event. All personalized
 * analysis, order, IDs, audio, tickers and refresh behavior remain untouched. */
export function enrichNewsCoverage(news: NewsItem[], verifiedPool: MediaCoverage[], now = new Date()): NewsItem[] {
  return news.map(item => {
    const distinct = distinctMediaSources(item.sources || []);
    const primary = distinct[0];
    if (!primary) return item;
    const existing = distinct.filter((source, index) => index === 0 || sourcesCoverSameEvent(primary, source)).slice(0, 5);
    const publishers = new Set(existing.map(getPublisherKey));
    const sources = [...existing];
    for (const candidate of verifiedPool) {
      if (sources.length >= 5) break;
      const at = publishedAt(candidate);
      if (!Number.isFinite(at) || at < now.getTime() - 48 * 3600000 || at > now.getTime() + 5 * 60000) continue;
      const publisher = getPublisherKey(candidate);
      if (publishers.has(publisher) || !sourcesCoverSameEvent(primary, candidate)) continue;
      if (!distinctMediaSources([candidate]).length) continue;
      sources.push(candidate); publishers.add(publisher);
    }
    return { ...item, sources, coverageCount: sources.length };
  });
}

/** Combine independently collected, verified pipelines. The first item's
 * personalized analysis and ordering win; only its factual coverage expands. */
export function mergeVerifiedNews(primary: NewsItem[], secondary: NewsItem[], now = new Date()): NewsItem[] {
  const all = [...primary, ...secondary];
  const pool = all.flatMap(item => item.sources || []);
  const enriched = enrichNewsCoverage(all, pool, now);
  const merged: NewsItem[] = [];
  const seenUrls = new Set<string>();
  for (const item of enriched) {
    const sources = item.sources || [];
    const anchor = sources[0];
    const duplicateUrl = sources.some(source => seenUrls.has(source.sourceUrl));
    const duplicateEvent = anchor && merged.some(existing => existing.sources?.[0] && sourcesCoverSameEvent(existing.sources[0], anchor));
    if (duplicateUrl || duplicateEvent) continue;
    merged.push(item);
    for (const source of sources) seenUrls.add(source.sourceUrl);
  }
  return merged;
}
