import type { MediaCoverage, NewsItem } from '../types/index.js';
import { areSourcesReportingSameEvent, cleanHeadlineText, distinctMediaSources, getPublisherKey } from './sourceGrounding.js';

// Compare original, verified headlines, never a model's broad market summary.
// Aliases let outlets describe the same actor in their own words.
function eventText(value: string): string {
  return cleanHeadlineText(value)
    .replace(/banco central(?: de la republica argentina)?|autoridad monetaria/g, 'bcra')
    .replace(/titulos publicos|bonos soberanos|deuda soberana/g, 'bonos en dolares')
    .replace(/indice de precios al consumidor|costo de vida/g, 'inflacion')
    .replace(/adquirio|compro|compras netas|saldo comprador/g, 'compro')
    .replace(/prestamos hipotecarios|creditos para vivienda/g, 'credito hipotecario');
}

const months = /\b(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g;
const currencies = /\b(mep|ccl|blue|oficial)\b/g;
const companies = /\b(ypf|pampa|galicia|bbva|apple|nvidia|mercadolibre|tesla)\b/g;
const eventKinds = [
  /\b(bcra|reservas)\b.*\b(compra|vende|vendio|reservas|mulc)\b/,
  /\b(bcra|fed)\b.*\b(tasa|tasas|encajes|politica monetaria)\b/,
  /\b(oleoducto|gasoducto|transporte de crudo|vaca muerta sur)\b/,
  /\b(nafta|naftas|combustible|combustibles|surtidor)\b/,
  /\b(balance|balances|ebitda|ganancias trimestrales)\b/,
  /\b(credito hipotecario|creditos hipotecarios|creditos uva)\b/,
  /\b(inflacion|ipc|indec)\b/
];
const disjoint = (a: string[], b: string[]) => a.length > 0 && b.length > 0 && !a.some(value => b.includes(value));
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
  // Same sector/ticker is insufficient. Separate different releases, currency
  // markets and corporate actions even when their wording is very similar.
  if (disjoint(a.match(months) || [], b.match(months) || []) || disjoint(a.match(currencies) || [], b.match(currencies) || []) || disjoint(a.match(companies) || [], b.match(companies) || [])) return false;
  const kindsA = kindsFor(a); const kindsB = kindsFor(b);
  if (disjoint(kindsA, kindsB)) return false;
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
    const existing = distinctMediaSources(item.sources || []);
    const primary = existing[0];
    if (!primary) return item;
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
