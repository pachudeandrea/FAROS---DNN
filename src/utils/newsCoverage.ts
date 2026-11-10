import { recognizeAssetIds } from './assetNews.js';
import { ASSET_CATALOG } from '../data/assetCatalog.js';
import type { MediaCoverage, NewsItem } from '../types/index.js';
import { areSourcesReportingSameEvent, cleanHeadlineText, distinctMediaSources, getPublisherKey } from './sourceGrounding.js';
import { reclassifyCachedNews } from './newsClassification.js';
import { publicationUrls } from './newsLibrary.js';

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
const argentinaDayFormatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
const argentinaDay = (at: number) => argentinaDayFormatter.format(at);

// A narrow equivalence for daily Argentine sovereign spread quotations.
// Require the movement next to this metric, never borrow it from bonds/stocks.
function sovereignSpread(value: string) {
  const text = value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const metric = /\b(?:riesgo pais|prima de riesgo argentina)\b/;
  if (!metric.test(text)) return null;
  // Keep the risk quotation through its percentage/threshold, stopping before
  // another market metric. A decimal comma is not a clause boundary.
  const clause = text.slice(text.search(metric)).split(/;|,(?!\d)|\b(?:mientras|pero)\b|\by\s+(?:(?:el|la|los|las)\s+)?(?:dolar|acciones|bonos|merval|reservas)\b/)[0];
  const levels = [...clause.matchAll(/\b(\d{1,3}(?:\.\d{3})*|\d+)\s*puntos\b/g)];
  const level = levels[0];
  const movement = clause.match(/^(?:riesgo pais|prima de riesgo argentina)\s+(?:(?:de la argentina|argentino|argentina|se)\s+)?(?:siguio\s+)?(baja|bajo|bajando|cae|cayo|cayendo|retrocede|retrocedio|sube|subio|subiendo|aumenta|aumento|salta|salto|trepa|trepo)\b/);
  if (!level || new Set(levels.map(item => item[1].replaceAll('.', ''))).size !== 1 || !movement || /\b(no|sin|brasil|brasileno|chile|chileno|mexico|mexicano|colombia|colombiano|peru|peruano|ecuador|ecuatoriano)\b/.test(clause)
    || /\b(brasil|brasileno|chile|chileno|mexico|mexicano|colombia|colombiano|peru|peruano|ecuador|ecuatoriano)\b/.test(text)) return { valid: false, level: '', direction: '', kind: '' };
  const beforeLevel = clause.slice(0, level.index);
  const kind = /(?:encima de|supero|rompio (?:la )?barrera de)\s+(?:los\s+)?$/.test(beforeLevel) ? 'above'
    : /(?:debajo de|perforo|rompio (?:el )?piso de)\s+(?:los\s+)?$/.test(beforeLevel) ? 'below' : 'level';
  const direction = /^(baja|bajo|bajando|cae|cayo|cayendo|retrocede|retrocedio)$/.test(movement[1]) ? 'down' : 'up';
  if ((kind === 'above' && direction !== 'up') || (kind === 'below' && direction !== 'down')) return { valid: false, level: '', direction: '', kind: '' };
  return { valid: true, level: level[1].replaceAll('.', ''), direction, kind };
}

const unaccentedText = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const normalizedText = (value: string) => unaccentedText(value).toLowerCase();
const marketUp = 'sube|suben|subio|subieron|trepa|trepan|trepo|treparon|avanza|avanzan|avanzo|avanzaron|rebota|rebotan|reboto|rebotaron|salta|saltan|salto|saltaron|escala|escalan|escalo|escalaron|repuntan|repunto';
const marketDown = 'baja|bajan|bajo|bajaron|cae|caen|cayo|cayeron|retrocede|retroceden|retrocedio|retrocedieron|pierde|pierden|perdio|perdieron|desploma|desploman|desplomo|desplomaron|hunde|hunden|hundio|hundieron|derrumba|derrumban|derrumbo|derrumbaron|cede|ceden|cedio|cedieron';
const marketUpWord = new RegExp(`^(?:${marketUp})$`);
const marketDownWord = new RegExp(`^(?:${marketDown})$`);
const marketMovement = new RegExp(`\\b(${marketUp}|${marketDown})\\b`, 'g');
const marketPercentage = new RegExp(`\\b(?:${marketUp}|${marketDown})\\b(?:\\s+(?:hasta|casi|mas|menos|cerca|alrededor|aproximadamente|de|del|un|una|el|los)){0,5}\\s+\\d+(?:[.,]\\d+)?\\s*(?:%|por ciento)`, 'g');
const marketClauses = (text: string) => text.split(/;|,(?!\d)|\b(?:mientras|pero|y)\b/i);
const nonPriceMetric = /\b(riesgo pais|prima de riesgo|tasas?|encajes|reservas|inflacion|ganancias|utilidades|ebitda|dividendos|produccion|ventas|ingresos|beneficios|costos|margenes)\b/;

/** Attribute a movement to its grammatical market subject. A ticker mentioned
 * after "pese a"/"tras" is context, not the instrument whose price moved. */
function marketObservation(value: string): { keys: string[]; direction: string } | null {
  const caseText = unaccentedText(value);
  const clause = caseText.toLowerCase();
  const movements = [...clause.matchAll(marketMovement)];
  if (!movements.length) return null;
  const up = movements.some(match => marketUpWord.test(match[1]));
  const down = movements.some(match => marketDownWord.test(match[1]));
  if (up === down) return null;
  const first = movements[0];
  const before = clause.slice(0, first.index);
  if (nonPriceMetric.test(before) || /\b(no|sin)\b/.test(before)) return null;
  const after = clause.slice(first.index! + first[0].length).split(/\b(?:tras|por|ante|pese|despues|debido|a raiz|a causa)\b/)[0];
  const subject = `${before} ${after}`;
  const caseSubject = `${caseText.slice(0, first.index)} ${caseText.slice(first.index! + first[0].length).split(/\b(?:tras|por|ante|pese|despues|debido|a raiz|a causa)\b/i)[0]}`;
  const hasPriceLanguage = /\b(acciones|adrs?|bonos|dolar|cotiza\w*|cotizacion|merval|wall street|bolsa|bolsas|bursatil|papeles|titulos)\b/.test(subject);
  const hasQuotedMovement = new RegExp(marketPercentage.source).test(clause);
  if (!hasPriceLanguage && !hasQuotedMovement) return null;
  const keys = [...recognizeAssetIds(caseSubject), ...[...subject.matchAll(/\bdolar (mep|ccl|blue|oficial)\b/g)].map(match => `dolar_${match[1]}`)];
  if (/\bmerval\b/.test(subject)) keys.push('merval');
  if (!keys.length && /\b(petroleo|brent|wti)\b/.test(subject)) keys.push('petroleo');
  if (!keys.length && /\b(wall street|bolsas|indices bursatiles)\b/.test(subject)) keys.push('mercado_general');
  return keys.length ? { keys: [...new Set(keys)], direction: up ? 'up' : 'down' } : null;
}

/** Price directions belong to their own clause and asset, never a neighboring metric. */
function marketDirections(headline: string): Map<string, string> {
  const movements = new Map<string, string>();
  for (const clause of marketClauses(headline)) {
    const observation = marketObservation(clause);
    for (const key of observation?.keys || []) movements.set(key, observation!.direction);
  }
  return movements;
}

const catalystRules: [string, RegExp][] = [
  ['investigacion', /\b(investigacion|investiga|investigan|investigaria|investigado|pesquisa|indagacion|indaga|escandalo|espionaje|espia)\b/],
  ['resultados', /\b(balance|balances|resultados|ganancias|utilidades|ebitda|beneficios|ingresos trimestrales)\b/],
  ['produccion', /\b(produccion|produjo|produjeron|extraccion|despachos|entregas)\b/],
  ['dividendos', /\b(dividendo|dividendos|distribucion de utilidades)\b/],
  ['capital', /\b(ampliacion de capital|emision de acciones|recompra de acciones|split|desdoblamiento)\b/],
  ['adquisicion', /\b(adquisicion|fusion|fusiones|compra de la empresa|compra de empresa|compra de otra empresa)\b/],
  ['litigio', /\b(juicio|litigio|sentencia|fallo|embargo|apelacion|demanda judicial|tribunal|multa|sancion)\b/],
  ['perspectivas', /\b(guidance|proyecciones|pronostico|previsiones|perspectivas de ventas)\b/]
];
const investigationTypes: [string, RegExp][] = [
  ['espionaje', /\b(espionaje|espia|inteligencia extranjera)\b/],
  ['competencia', /\b(antimonopolio|antitrust|monopolio|competencia desleal)\b/],
  ['fraude', /\b(fraude|estafa)\b/],
  ['corrupcion', /\b(corrupcion|soborno|sobornos)\b/],
  ['seguridad', /\b(conduccion autonoma|autopilot|autonomo|autonoma|seguridad de sus|accidentes)\b/],
  ['privacidad', /\b(privacidad|datos personales)\b/]
];
const caseGenericWords = new Set(('investigacion investiga investigan investigaria investigado pesquisa indagacion indaga escandalo autoridades autoridad regulatoria regulatorio regulador reguladores federal acusaciones irregularidades proceso procesos avanza avance avanzar consejo administracion junta directiva director ejecutivo gerente empresa compania fabricante companias corporacion acciones accion papeles titulos cotizacion precio precios mercado mercados bursatil bolsa bolsas wall street casi hasta cerca ciento mediodia primeros negocios despues mientras sobre ante mediante durante porque tambien fueron tras entre desde hacia supuesto supuesta presunto presunta relacion relacionado relacionada involucra involucro juicio litigio demanda judicial tribunal fallo sentencia multa sancion suyos suyas estas estos este esta otros otras').split(' '));
const assetCatalogById = new Map(ASSET_CATALOG.map(asset => [asset.id, asset]));
function specificCaseDetails(text: string, assets: string[]): string[] {
  const actorWords = new Set(assets.flatMap(id => {
    const asset = assetCatalogById.get(id);
    return [id, asset?.issuer || '', asset?.name || '', ...(asset?.aliases || [])].flatMap(value => normalizedText(value).match(/[a-z]+/g) || []);
  }));
  return [...new Set((normalizedText(text).match(/[a-z]{4,}/g) || []).filter(word => !caseGenericWords.has(word)
    && !actorWords.has(word) && !marketUpWord.test(word) && !marketDownWord.test(word)))];
}
function eventCatalysts(source: MediaCoverage, assets: string[]) {
  const headline = normalizedText(source.originalHeadline);
  const summary = normalizedText(source.articleSummary || '');
  const kindsForText = (text: string) => catalystRules.flatMap(([kind, pattern]) => pattern.test(text) ? [kind] : []);
  const explicit = kindsForText(headline);
  const reported = kindsForText(summary);
  // Only the publisher's verified extract may clarify an otherwise terse
  // headline. An extract spanning several different topics is not an identity.
  const kinds = explicit.length ? explicit : reported.length === 1 ? reported : [];
  const detail = kinds.includes('investigacion') ? `${headline} ${summary}` : headline;
  const investigation = investigationTypes.flatMap(([kind, pattern]) => pattern.test(detail) ? [kind] : []);
  const caseText = [headline, ...summary.split(/[.!?]\s+/).filter(part => /\b(investig\w*|pesquisa|indag\w*|escandalo|espionaje|espia|juicio|litigio|demanda judicial|tribunal|multa|sancion)\b/.test(part)).slice(0, 2)].join(' ');
  const details = kinds.some(kind => kind === 'investigacion' || kind === 'litigio') ? specificCaseDetails(caseText, assets) : [];
  return { kinds, investigation, details };
}

/** A generic label such as "investigation" cannot identify the case. Unknown
 * types still match through substantive publisher details, rather than through
 * a closed list of scandals or a ticker-specific exception. */
function sameConcreteCase(a: ReturnType<typeof eventCatalysts>, b: ReturnType<typeof eventCatalysts>): boolean {
  if (a.investigation.length || b.investigation.length) return a.investigation.some(type => b.investigation.includes(type));
  return a.details.filter(word => b.details.includes(word)).length >= 2;
}
const sharedCaseKind = (a: ReturnType<typeof eventCatalysts>, b: ReturnType<typeof eventCatalysts>) =>
  a.kinds.some(kind => (kind === 'investigacion' || kind === 'litigio') && b.kinds.includes(kind));

/** Evolving intraday price quotes describe the same episode only with a shared
 * instrument, direction and substantive cause. This is independent of ticker. */
function sameMarketEpisode(primary: MediaCoverage, candidate: MediaCoverage, a: Map<string, string>, b: Map<string, string>, causesA: ReturnType<typeof eventCatalysts>, causesB: ReturnType<typeof eventCatalysts>): boolean {
  const timeA = publishedAt(primary); const timeB = publishedAt(candidate);
  if (!Number.isFinite(timeA) || !Number.isFinite(timeB) || argentinaDay(timeA) !== argentinaDay(timeB) || Math.abs(timeA - timeB) > 12 * 3600000) return false;
  if (!causesA.kinds.some(kind => causesB.kinds.includes(kind)) || disjoint(causesA.investigation, causesB.investigation)) return false;
  if (sharedCaseKind(causesA, causesB) && !sameConcreteCase(causesA, causesB)) return false;
  return [...a].some(([asset, direction]) => b.get(asset) === direction);
}

function withoutQuotedPricePercentages(headline: string): string {
  return marketClauses(headline).map(clause => marketObservation(clause)
    ? normalizedText(clause).replace(marketPercentage, 'cotiza') : clause).join(';');
}

function reportingQuarters(headline: string): string[] {
  const text = normalizedText(headline);
  const explicit = [...text.matchAll(/\bq([1-4])\b/g)].map(match => match[1]);
  const ordinal = ['primer', 'segundo', 'tercer', 'cuarto'];
  return [...new Set([...explicit, ...ordinal.flatMap((word, index) => new RegExp(`\\b${word}(?:o)? trimestre\\b`).test(text) ? [String(index + 1)] : [])])];
}

// Coverage/snapshots copy source objects repeatedly. Cache by original publisher
// text, with a fixed bound, so matching a collection does not reparse every pair.
const EVENT_FACTS_CACHE_LIMIT = 256;
const eventFactsCache = new Map<string, {
  headline: string; summary?: string; assets: string[]; directions: Map<string, string>;
  causes: ReturnType<typeof eventCatalysts>; nonPriceFigures: string; quarters: string[]; relativeDays: string[];
}>();
function eventFacts(source: MediaCoverage) {
  const key = `${source.originalHeadline}\u0000${source.articleSummary || ''}`;
  const previous = eventFactsCache.get(key);
  if (previous) { eventFactsCache.delete(key); eventFactsCache.set(key, previous); return previous; }
  const assets = recognizeAssetIds(source.originalHeadline);
  const result = {
    headline: source.originalHeadline, summary: source.articleSummary,
    assets, directions: marketDirections(source.originalHeadline),
    causes: eventCatalysts(source, assets), nonPriceFigures: withoutQuotedPricePercentages(source.originalHeadline),
    quarters: reportingQuarters(source.originalHeadline), relativeDays: normalizedText(source.originalHeadline).match(/\b(hoy|ayer)\b/g) || []
  };
  eventFactsCache.set(key, result);
  if (eventFactsCache.size > EVENT_FACTS_CACHE_LIMIT) eventFactsCache.delete(eventFactsCache.keys().next().value!);
  return result;
}

export function sourcesCoverSameEvent(primary: MediaCoverage, candidate: MediaCoverage): boolean {
  const a = eventText(primary.originalHeadline); const b = eventText(candidate.originalHeadline);
  if (!a || !b) return false;
  const factsA = eventFacts(primary); const factsB = eventFacts(candidate);
  const directionsA = factsA.directions; const directionsB = factsB.directions;
  if ([...directionsA].some(([asset, direction]) => directionsB.has(asset) && directionsB.get(asset) !== direction)) return false;
  if (disjoint([...directionsA.keys()], [...directionsB.keys()])) return false;
  if (disjoint(factsA.quarters, factsB.quarters)) return false;
  if (directionsA.size && directionsB.size && disjoint(factsA.relativeDays, factsB.relativeDays)) return false;
  const causesA = factsA.causes; const causesB = factsB.causes;
  if (disjoint(causesA.kinds, causesB.kinds) || disjoint(causesA.investigation, causesB.investigation)) return false;
  if (sharedCaseKind(causesA, causesB) && causesA.details.length && causesB.details.length && !sameConcreteCase(causesA, causesB)) return false;
  const marketEpisode = sameMarketEpisode(primary, candidate, directionsA, directionsB, causesA, causesB);
  if (disjoint(centralBankActors(primary.originalHeadline), centralBankActors(candidate.originalHeadline))) return false;
  // Same sector/ticker is insufficient. Separate different releases, currency
  // markets and corporate actions even when their wording is very similar.
  if (disjoint(a.match(months) || [], b.match(months) || []) || disjoint(a.match(currencies) || [], b.match(currencies) || []) || disjoint(a.match(companies) || [], b.match(companies) || [])) return false;
  if (disjoint(factsA.assets, factsB.assets)) return false;
  const kindsA = kindsFor(a); const kindsB = kindsFor(b);
  if (disjoint(kindsA, kindsB)) return false;
  if (disjoint(policyInstruments(a), policyInstruments(b)) || disjoint(policyActions(a), policyActions(b)) || disjoint(reserveActions(a), reserveActions(b))) return false;
  // The generic lexical matcher also accepts shared actor + topic. Conflicting
  // concrete figures or release dates disqualify that otherwise broad match.
  const percentage = /(\d+(?:[.,]\d+)?)\s*(?:%|por ciento)/g;
  const figureA = marketEpisode ? factsA.nonPriceFigures : primary.originalHeadline;
  const figureB = marketEpisode ? factsB.nonPriceFigures : candidate.originalHeadline;
  if (disjoint(numericFacts(figureA, percentage), numericFacts(figureB, percentage))) return false;
  for (const unit of [/(\d+(?:[.,]\d+)?)\s*(?:puntos basicos|pb)\b/g, /(\d+(?:[.,]\d+)?)\s*(?:millones|millon)\b/g]) {
    if (disjoint(numericFacts(primary.originalHeadline, unit), numericFacts(candidate.originalHeadline, unit))) return false;
  }
  const calendarDate = /\b\d{1,2} de (?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g;
  if (disjoint(a.match(calendarDate) || [], b.match(calendarDate) || [])) return false;
  const timeA = publishedAt(primary); const timeB = publishedAt(candidate);
  if (Number.isFinite(timeA) && Number.isFinite(timeB)) {
    if (Math.abs(timeA - timeB) > 36 * 3600000) return false;
    if (directionsA.size && directionsB.size && argentinaDay(timeA) !== argentinaDay(timeB)) return false;
    // Repeated daily quotes and reserve purchases are different daily events.
    const recurring = /\b(dolar|mep|ccl|blue|riesgo pais|wall street|bonos en dolares|reservas)\b/;
    if (recurring.test(a) && recurring.test(b) && argentinaDay(timeA) !== argentinaDay(timeB)) return false;
  }
  const spreadA = sovereignSpread(primary.originalHeadline); const spreadB = sovereignSpread(candidate.originalHeadline);
  if (spreadA && spreadB) {
    return spreadA.valid && spreadB.valid && spreadA.level === spreadB.level && spreadA.direction === spreadB.direction && spreadA.kind === spreadB.kind
      && Number.isFinite(timeA) && Number.isFinite(timeB) && argentinaDay(timeA) === argentinaDay(timeB);
  }
  return marketEpisode || areSourcesReportingSameEvent(a, b);
}

/** Add only verified publications about the primary event. All personalized
 * analysis, order, IDs, audio, tickers and refresh behavior remain untouched. */
export function enrichNewsCoverage(news: NewsItem[], verifiedPool: MediaCoverage[], now = new Date()): NewsItem[] {
  return news.map(item => {
    const distinct = distinctMediaSources(item.sources || []);
    const primary = distinct[0];
    if (!primary) return item;
    const existing: MediaCoverage[] = [];
    for (const source of distinct) {
      if (existing.length >= 5) break;
      if (!existing.length || existing.every(previous => sourcesCoverSameEvent(previous, source))) existing.push(source);
    }
    const publishers = new Set(existing.map(getPublisherKey));
    const sources = [...existing];
    for (const candidate of verifiedPool) {
      if (sources.length >= 5) break;
      const at = publishedAt(candidate);
      if (!Number.isFinite(at) || at < now.getTime() - 48 * 3600000 || at > now.getTime() + 5 * 60000) continue;
      const publisher = getPublisherKey(candidate);
      if (publishers.has(publisher) || !sources.every(source => sourcesCoverSameEvent(source, candidate))) continue;
      if (!distinctMediaSources([candidate]).length) continue;
      sources.push(candidate); publishers.add(publisher);
    }
    return { ...item, sources, coverageCount: sources.length };
  });
}

const primaryUrl = (source: MediaCoverage | undefined) => source && publicationUrls({ sources: [source] } as NewsItem)[0];
const samePrimaryPublication = (a: MediaCoverage | undefined, b: MediaCoverage | undefined) => !!primaryUrl(a) && primaryUrl(a) === primaryUrl(b);

function combineEventItems(previous: NewsItem, incoming: NewsItem, preferIncoming: boolean): NewsItem {
  const preferred = preferIncoming ? incoming : previous;
  const other = preferIncoming ? previous : incoming;
  const anchor = preferred.sources?.[0];
  if (!anchor) return preferred;
  const replacingPublication = preferIncoming && samePrimaryPublication(previous.sources?.[0], incoming.sources?.[0]);
  // The incoming item's verified/curated comparison is authoritative. Validate
  // additional old sources, rather than stripping that comparison on a second
  // cache read just because two original quotes have different wording.
  const sources = distinctMediaSources([...preferred.sources, ...other.sources.filter(source =>
    preferred.sources.every(current => sourcesCoverSameEvent(current, source)))]).slice(0, 5);
  const affectedAssetIds = replacingPublication ? preferred.affectedAssetIds
    : [...new Set([...(preferred.affectedAssetIds || []), ...(other.affectedAssetIds || [])])];
  const baseHoldings = preferred.portfolioImpactAnalysis?.affectedHoldings || [];
  const holdings = [...baseHoldings];
  if (!replacingPublication) for (const holding of other.portfolioImpactAnalysis?.affectedHoldings || []) {
    const index = holdings.findIndex(value => value.symbol === holding.symbol);
    if (index < 0) holdings.push(holding);
    // A source without a direction must not erase a verified directional reading.
    else if (holdings[index].impactDirection === 'neutral' && holding.impactDirection !== 'neutral') holdings[index] = holding;
  }
  const analysisChanged = holdings.length !== baseHoldings.length || holdings.some((holding, index) => holding !== baseHoldings[index]);
  const merged = {
    ...preferred, sources, coverageCount: sources.length, affectedAssetIds,
    ...(analysisChanged ? { portfolioImpactAnalysis: { ...preferred.portfolioImpactAnalysis, affectedHoldings: holdings } } : {}),
  };
  return merged;
}

/** Reconcile every stored/incoming card, rather than only the first matching row.
 * Each member's primary event must agree: a broad secondary article cannot bridge
 * two different stories, and sharing a secondary URL alone never deletes a card. */
export function coalesceNewsEvents(items: NewsItem[], preferIncoming = false): NewsItem[] {
  const groups: { item: NewsItem; anchors: MediaCoverage[] }[] = [];
  for (const item of items) {
    const anchor = item.sources?.[0];
    if (!anchor) { groups.push({ item, anchors: [] }); continue; }
    if (preferIncoming) for (const group of groups) {
      if (samePrimaryPublication(group.item.sources?.[0], anchor)) continue;
      // A publisher can revise an article already used as secondary coverage.
      // Remove that old version before matching its updated event, even if the
      // update now belongs to a different story or reverses the price movement.
      const sources = group.item.sources.filter(source => !samePrimaryPublication(source, anchor));
      if (sources.length !== group.item.sources.length) {
        group.item = { ...group.item, sources, coverageCount: sources.length };
        group.anchors = group.anchors.filter(source => !samePrimaryPublication(source, anchor));
      }
    }
    const incomingAnchors = item.sources;
    const matches = groups.flatMap((group, index) => samePrimaryPublication(group.item.sources?.[0], anchor)
      || group.anchors.length > 0 && group.anchors.every(source => incomingAnchors.every(candidate => sourcesCoverSameEvent(source, candidate))) ? [index] : []);
    // An ambiguous overview covering otherwise incompatible stories stands alone.
    const compatible = matches.every((index, position) => matches.slice(position + 1).every(other =>
      groups[index].anchors.every(a => groups[other].anchors.every(b => sourcesCoverSameEvent(a, b)))));
    if (!matches.length || !compatible) { groups.push({ item, anchors: [...incomingAnchors] }); continue; }
    const first = matches[0];
    let combined = groups[first].item;
    let anchors = [...groups[first].anchors];
    for (const index of matches.slice(1)) {
      combined = combineEventItems(combined, groups[index].item, preferIncoming);
      anchors.push(...groups[index].anchors);
    }
    const replacingPublication = preferIncoming && samePrimaryPublication(combined.sources?.[0], anchor);
    combined = combineEventItems(combined, item, preferIncoming);
    anchors = [...anchors.filter(source => !incomingAnchors.some(candidate => samePrimaryPublication(source, candidate))
      && (!replacingPublication || incomingAnchors.every(candidate => sourcesCoverSameEvent(source, candidate)))), ...incomingAnchors];
    groups[first] = { item: combined, anchors };
    for (const index of matches.slice(1).reverse()) groups.splice(index, 1);
  }
  const normalized = groups.map(({ item }) => {
    const boilerplate = ['Información publicada en ', 'Acontecimiento con cobertura periodística coincidente en ', 'Cobertura de este acontecimiento en ']
      .some(prefix => item.briefSummary?.startsWith(`${item.headline}. ${prefix}`));
    if (!boilerplate || !item.sources.length) return item;
    const names = item.sources.map(source => source.mediaName).join(', ');
    const briefSummary = item.sources.length > 1 ? `${item.headline}. Cobertura de este acontecimiento en ${names}.`
      : `${item.headline}. Información publicada en ${names}.`;
    return briefSummary === item.briefSummary ? item : { ...item, briefSummary };
  });
  // Inputs may be restricted to a requested portfolio. Merge their actual
  // related instruments, rather than expanding a scoped API result to every
  // sovereign bond or share of the issuer in the complete catalog.
  return reclassifyCachedNews(normalized, undefined, { preserveRelatedAssetScope: true });
}

/** Combine verified pipelines without discarding secondary instruments or stories. */
export function mergeVerifiedNews(primary: NewsItem[], secondary: NewsItem[], now = new Date()): NewsItem[] {
  const all = [...primary, ...secondary];
  const pool = all.flatMap(item => item.sources || []);
  return coalesceNewsEvents(enrichNewsCoverage(all, pool, now));
}
