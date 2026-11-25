import { ASSET_CATALOG } from '../data/assetCatalog.js';
import type { Asset, MediaCoverage, NewsImpact, NewsItem, RelevanceType } from '../types/index.js';
type PortfolioHolding = NewsItem['portfolioImpactAnalysis']['affectedHoldings'][number];
import { analyzeNewsRelevance, type NewsRelevanceAnalysis } from './newsRelevance.js';
import { exposureLinksFrom, type ExposureLink } from '../data/assetExposure.js';
import { normalizeAssetText } from '../data/assetCatalog.js';

const UP = '(?:sube|suben|subio|subieron|trepa|trepan|trepo|treparon|avanza|avanzan|avanzo|avanzaron|gana|ganan|gano|ganaron|repunta|repuntan|repunto|rebota|rebotan|reboto|cierra en alza|cierran en alza|opera en alza|operan en alza|en verde)';
const DOWN = '(?:cae|caen|cayo|cayeron|baja|bajan|bajo|bajaron|retrocede|retroceden|retrocedio|pierde|pierden|perdio|perdieron|se hunde|se hunden|se desploma|se desploman|cierra en baja|cierran en baja|opera en baja|operan en baja|en rojo)';
const US_MARKET = '(?:wall street|bolsas? (?:de nueva york|estadounidenses?|norteamericanas?)|las bolsas|los mercados|s&p(?: 500)?|nasdaq|dow jones|indices? (?:de wall street|estadounidenses?))';
const INDEX_TARGETS: Record<string, string> = { SPY: '(?:s&p(?: 500)?)', QQQ: '(?:nasdaq)', DIA: '(?:dow jones|dow)' };

/** The index must be the grammatical subject ("Wall Street cae", "cae el
 * S&P 500"), never a location ("las acciones de X caen en Wall Street"). */
function indexIsSubject(clause: string, subject: string, verb: string): boolean {
  const after = new RegExp(`(?:^|[^\\p{L}\\p{N}&])(?:el |la |los |las )?${subject}(?=$|[^\\p{L}\\p{N}&])(?:\\s+(?:hoy|ya|tambien|nuevamente|500|100|se))*[\\s,:]+${verb}\\b`, 'u');
  const before = new RegExp(`\\b${verb}\\s+(?:el |la |los |las )${subject}(?=$|[^\\p{L}\\p{N}&])`, 'u');
  return after.test(clause) || before.test(clause);
}

/** A movement of the index itself reported in the same publication prevails
 * over the contribution inferred from one constituent. */
function reportedIndexDirection(text: string, target: string): 'favorable' | 'alerta' | 'mixed' | null {
  const subject = INDEX_TARGETS[target] ? `(?:${INDEX_TARGETS[target]}|${US_MARKET})` : null;
  if (!subject) return null;
  const clauses = text.split(/[;!?]+|\.\s+|\s+(?:mientras(?: que)?|pero|aunque|en tanto)\s+/);
  const found = new Set<'favorable' | 'alerta'>();
  for (const clause of clauses) {
    if (indexIsSubject(clause, subject, UP)) found.add('favorable');
    if (indexIsSubject(clause, subject, DOWN)) found.add('alerta');
  }
  return found.size > 1 ? 'mixed' : found.size ? [...found][0] : null;
}
// The publication itself describes the peers: their reaction is not inferred.
const peersDescribed = /\b(?:competidor\w*|rivales|pares del sector|resto del sector)\b/;

const relevancePriority: Record<RelevanceType, number> = {
  impacto_precio: 3, valoracion_mercado: 2, contexto_macro: 1, ruido: 0,
};
const directional = (impact: NewsImpact | undefined): 'favorable' | 'alerta' | null =>
  impact === 'favorable' || impact === 'positivo' ? 'favorable'
    : impact === 'alerta' || impact === 'negativo' ? 'alerta' : null;
function combinedImpact(impacts: NewsImpact[]): NewsImpact {
  const directions = new Set(impacts.map(directional).filter(Boolean));
  return directions.size === 1 ? [...directions][0]! : 'neutral';
}

const MAX_CACHED_CATALOGS = 3;
const MAX_CACHED_SOURCES = 128;
const sourceAnalyses = new Map<string, Map<string, NewsRelevanceAnalysis>>();
function analysisCache(assets: Asset[]): Map<string, NewsRelevanceAnalysis> | undefined {
  // Catalog contents matter: custom assets/aliases can change while retaining
  // the same array or object identity. Keep only three recent catalogs.
  const key = JSON.stringify(assets);
  if (key.length > 250_000) return;
  let cache = sourceAnalyses.get(key);
  if (cache) sourceAnalyses.delete(key);
  else cache = new Map();
  sourceAnalyses.set(key, cache);
  if (sourceAnalyses.size > MAX_CACHED_CATALOGS) sourceAnalyses.delete(sourceAnalyses.keys().next().value!);
  return cache;
}
function analyzeSource(source: MediaCoverage, assets: Asset[], cache: Map<string, NewsRelevanceAnalysis> | undefined): NewsRelevanceAnalysis {
  // Match the analyzer's evidence boundary, not URL/date or an old generated
  // summary. Unusually large inputs are analyzed without retaining a cache key.
  const summary = source.articleSummary?.slice(0, 6000) || '';
  const key = JSON.stringify([source.originalHeadline, summary]);
  const previous = cache?.get(key);
  if (previous) {
    cache!.delete(key); cache!.set(key, previous);
    return previous;
  }
  const analysis = analyzeNewsRelevance(source.originalHeadline, assets, summary);
  if (cache && key.length <= 16_000) {
    cache.set(key, analysis);
    if (cache.size > MAX_CACHED_SOURCES) cache.delete(cache.keys().next().value!);
  }
  return analysis;
}

/** The sources have already been verified and matched to one concrete event.
 * Analyze each publication independently: a sentence about one instrument must
 * never borrow the movement reported for another source's instrument. */
export function analyzeVerifiedCoverage(sources: MediaCoverage[], assets: Asset[] = ASSET_CATALOG): NewsRelevanceAnalysis {
  const cache = analysisCache(assets);
  const analyses = sources.filter(source => source.originalHeadline?.trim())
    .map(source => analyzeSource(source, assets, cache));
  if (!analyses.length) return analyzeNewsRelevance('', assets);
  const strongest = analyses.reduce((best, analysis) => relevancePriority[analysis.relevanceType] > relevancePriority[best.relevanceType] ? analysis : best);
  const affectedAssetIds = [...new Set(analyses.flatMap(analysis => analysis.affectedAssetIds))];
  const assetImpacts: Record<string, NewsImpact> = {};
  const relationships: Record<string, string> = {};
  for (const symbol of affectedAssetIds) {
    const related = analyses.filter(analysis => analysis.affectedAssetIds.includes(symbol));
    const explicit = related.filter(analysis => directional(analysis.assetImpacts[symbol]));
    assetImpacts[symbol] = combinedImpact(explicit.map(analysis => analysis.assetImpacts[symbol]));
    const evidence = (explicit.length ? explicit : related).reduce((best, analysis) =>
      relevancePriority[analysis.relevanceType] > relevancePriority[best.relevanceType] ? analysis : best);
    relationships[symbol] = new Set(explicit.map(analysis => directional(analysis.assetImpacts[symbol]))).size > 1
      ? `Las publicaciones verificadas describen señales favorables y adversas para ${symbol}. Se conservan los hechos de cada fuente; no se establece un efecto direccional neto ni una evolución futura.`
      : evidence.relationships[symbol];
  }
  return applyExposureSpillover({
    // Fresh arrays/maps keep the private cached source analyses isolated from
    // callers that edit a returned aggregate or a temporary example portfolio.
    ...strongest, affectedAssetIds, assetImpacts, relationships,
    impact: combinedImpact(Object.values(assetImpacts)),
  }, assets, sources.map(source => `${source.originalHeadline || ''}. ${source.articleSummary?.slice(0, 6000) || ''}`).join(' \n '));
}

const signalWord = (direction: 'favorable' | 'alerta') => direction === 'favorable' ? 'favorable' : 'adversa';
const joinIds = (ids: string[]) => ids.length < 2 ? ids.join('') : `${ids.slice(0, -1).join(', ')} y ${ids.at(-1)}`;

/** Extend a verified analysis from the instruments named in the publication to
 * the instruments that hold or depend on them (indices/ETF, supply chain,
 * sovereign exposure of banks, sector contagion on observed price moves).
 * Direct evidence about an instrument always prevails over an indirect signal. */
const INDEX_OWN_NAMES: Record<string, string> = { SPY: '(?:s&p(?: 500)?|wall street)', QQQ: '(?:nasdaq(?: 100)?)', DIA: '(?:dow jones)' };
const INDEX_LABELS: Record<string, string> = { SPY: 'el S&P 500 / Wall Street', QQQ: 'el Nasdaq', DIA: 'el Dow Jones' };
const speculative = /\b(?:podria\w*|podra|se espera|esperan|expectativ\w*|pronostic\w*|analistas|rumor\w*|si\s)\b/;

/** A reported move of the reference index (S&P 500, Nasdaq, Dow Jones) is the
 * signal an index ETF follows. It is assigned to the ETF (without claiming its
 * local CEDEAR quote) and then drags the index constituents. */
function withReportedIndexMoves(analysis: NewsRelevanceAnalysis, assets: Asset[], text: string): NewsRelevanceAnalysis {
  const known = new Set(assets.map(asset => asset.id));
  let result = analysis;
  for (const [id, name] of Object.entries(INDEX_OWN_NAMES)) {
    if (!known.has(id) || directional(result.assetImpacts[id])) continue;
    const found = new Set<'favorable' | 'alerta'>();
    for (const clause of text.split(/[;!?]+|\.\s+|\s+(?:mientras(?: que)?|pero|aunque|en tanto|y)\s+/)) {
      if (speculative.test(clause)) continue;
      if (indexIsSubject(clause, name, UP)) found.add('favorable');
      if (indexIsSubject(clause, name, DOWN)) found.add('alerta');
    }
    if (found.size !== 1) continue;
    const direction = [...found][0];
    const upgraded = result.relevanceType === 'ruido' || result.relevanceType === 'contexto_macro';
    result = {
      ...result,
      relevanceType: upgraded ? 'impacto_precio' : result.relevanceType,
      explanation: upgraded ? 'La publicación informa una variación de cotización de instrumentos identificados. Esa observación no establece su evolución futura.' : result.explanation,
      affectedAssetIds: result.affectedAssetIds.includes(id) ? result.affectedAssetIds : [...result.affectedAssetIds, id],
      assetImpacts: { ...result.assetImpacts, [id]: direction },
      relationships: { ...result.relationships, [id]: `La publicación informa ${direction === 'favorable' ? 'una suba' : 'una baja'} de ${INDEX_LABELS[id]}, el índice que replica ${id}. Es la señal de su referencia; no mide la cotización local del CEDEAR ni anticipa su evolución.` },
    };
  }
  if (result === analysis) return analysis;
  return { ...result, impact: combinedImpact(Object.values(result.assetImpacts)) };
}

export function applyExposureSpillover(input: NewsRelevanceAnalysis, assets: Asset[] = ASSET_CATALOG, evidence = ''): NewsRelevanceAnalysis {
  const text = normalizeAssetText(evidence);
  const analysis = withReportedIndexMoves(input, assets, text);
  // Macro context and noise carry no direction to transmit.
  if (analysis.relevanceType === 'contexto_macro' || analysis.relevanceType === 'ruido') return analysis;
  const known = new Set(assets.map(asset => asset.id));
  const direct = new Set(analysis.affectedAssetIds);
  const priceEvent = analysis.relevanceType === 'impacto_precio';
  const peersInText = peersDescribed.test(text);
  const reached = new Map<string, { links: ExposureLink[]; directions: Set<'favorable' | 'alerta'>; drivers: Map<string, 'favorable' | 'alerta' | null> }>();
  for (const driver of analysis.affectedAssetIds) {
    const direction = directional(analysis.assetImpacts[driver]);
    for (const link of exposureLinksFrom(driver)) {
      if (!known.has(link.target) || link.target === driver) continue;
      if (direct.has(link.target) && directional(analysis.assetImpacts[link.target])) continue;
      // Peers only inherit an observed market movement; chains and balance-sheet
      // exposure need a direction; an index reports its largest constituents.
      if (link.kind === 'sector' && (!priceEvent || !direction || peersInText)) continue;
      if ((link.kind === 'cadena' || link.kind === 'riesgo') && !direction) continue;
      if (link.kind === 'indice' && !direction && link.weight !== 'alta') continue;
      const entry = reached.get(link.target) || { links: [] as ExposureLink[], directions: new Set<'favorable' | 'alerta'>(), drivers: new Map<string, 'favorable' | 'alerta' | null>() };
      entry.links.push(link);
      entry.drivers.set(driver, direction);
      if (direction) entry.directions.add(direction);
      reached.set(link.target, entry);
    }
  }
  if (!reached.size) return analysis;
  const affectedAssetIds = [...analysis.affectedAssetIds];
  const assetImpacts = { ...analysis.assetImpacts };
  const relationships = { ...analysis.relationships };
  const exposures: NonNullable<NewsRelevanceAnalysis['exposures']> = { ...(analysis.exposures || {}) };
  for (const [target, entry] of reached) {
    const drivers = [...entry.drivers.keys()];
    // A driver directly mentioned in several clauses adds only one link detail.
    const details = [...new Set(entry.links.map(link => link.detail))].slice(0, 3);
    const kinds = new Set(entry.links.map(link => link.kind));
    const kind = kinds.has('indice') ? 'indice' : kinds.has('cadena') ? 'cadena' : kinds.has('riesgo') ? 'riesgo' : 'sector';
    const label = kind === 'sector' ? 'Arrastre sectorial' : 'Impacto indirecto';
    let reading: string;
    const indexMove = kind === 'indice' ? reportedIndexDirection(text, target) : null;
    if (entry.directions.size > 1) {
      reading = `Las señales de ${joinIds(drivers)} se contraponen; no se establece un efecto neto para ${target}.`;
    } else if (entry.directions.size === 1 && indexMove && indexMove !== [...entry.directions][0]) {
      const direction = [...entry.directions][0];
      reading = `La publicación informa una señal ${signalWord(direction)} para ${joinIds(drivers.filter(driver => entry.drivers.get(driver)))}, pero también que el mercado de referencia de ${target} se movió en otro sentido en la jornada. El aporte de ${joinIds(drivers)} pesa sobre el índice, sin establecer un efecto neto para ${target}.`;
      entry.directions.clear();
    } else if (entry.directions.size === 1) {
      const direction = [...entry.directions][0];
      const signaled = drivers.filter(driver => entry.drivers.get(driver));
      reading = kind === 'sector'
        ? `La publicación informa un movimiento ${direction === 'favorable' ? 'al alza' : 'a la baja'} de ${joinIds(signaled)}; para ${target} es una señal de contagio sectorial, no una variación observada de su cotización.`
        : `La publicación informa una señal ${signalWord(direction)} para ${joinIds(signaled)}; por esa exposición, ${target} recibe la misma señal aunque la nota no mida una variación propia de ${target}.`;
    } else {
      reading = `La publicación no establece una dirección para ${joinIds(drivers)}; se informa por su peso en ${target}, sin trasladar una señal.`;
    }
    const impact: NewsImpact = entry.directions.size === 1 ? [...entry.directions][0] : 'neutral';
    const detailText = `${label}: ${details.join('; ')}. ${reading}`;
    if (direct.has(target)) {
      // Named without its own direction: keep the direct link and add the channel.
      relationships[target] = `${relationships[target] || ''} ${detailText}`.trim();
    } else {
      affectedAssetIds.push(target);
      relationships[target] = detailText;
    }
    assetImpacts[target] = impact;
    exposures[target] = { via: drivers, kind };
  }
  return { ...analysis, affectedAssetIds, assetImpacts, relationships, exposures, impact: combinedImpact(Object.values(assetImpacts)) };
}

/** Per-holding rows shared by every pipeline (RSS, Gemini and cached news). */
export function holdingsFor(ids: string[], analysis: NewsRelevanceAnalysis): PortfolioHolding[] {
  return ids.map(symbol => {
    const exposure = analysis.exposures?.[symbol];
    const directMention = exposure && analysis.relationships[symbol] && !/^(Impacto indirecto|Arrastre sectorial):/.test(analysis.relationships[symbol]);
    return {
      symbol,
      impactDirection: analysis.assetImpacts[symbol] || 'neutral',
      relationshipDetail: analysis.relationships[symbol],
      ...(exposure ? { exposure: directMention ? 'directa' as const : 'indirecta' as const, via: exposure.via, exposureKind: exposure.kind } : {})
    };
  });
}

/** The item explanation names the wider set of affected holdings, limited to
 * the instruments related to the requested portfolio. */
export function explanationWithExposure(analysis: NewsRelevanceAnalysis, ids: string[]): string {
  const indirect = ids.filter(id => analysis.exposures?.[id] && /^(Impacto indirecto|Arrastre sectorial):/.test(analysis.relationships[id] || ''));
  if (!indirect.length) return analysis.explanation;
  const drivers = [...new Set(indirect.flatMap(id => analysis.exposures![id].via))];
  return `${analysis.explanation} El hecho sobre ${joinIds(drivers)} alcanza también a ${joinIds(indirect)} por su exposición indirecta (índices que lo contienen, cadena de valor, sector o tenencia de deuda).`;
}

/** Re-evaluate our generated snapshots without discarding today's collection.
 * Only publisher evidence is used; an old generated synthesis is never evidence.
 * Curated/legacy items keep their original editorial analysis. */
export function reclassifyCachedNews(items: NewsItem[], assets: Asset[] = ASSET_CATALOG, options: { preserveRelatedAssetScope?: boolean } = {}): NewsItem[] {
  return items.map(item => {
    if (typeof item?.id !== 'string' || !/^(live-news-|gemini_)/.test(item.id)) return item;
    const source = item.sources?.[0];
    if (!source?.originalHeadline) return item;
    const analysis = analyzeVerifiedCoverage(item.sources, assets);
    const knownAssets = new Set(assets.map(asset => asset.id));
    const unknownAssets = item.affectedAssetIds.filter(id => !knownAssets.has(id));
    // Without the custom asset's catalog definition, keep its existing analysis.
    if (unknownAssets.length && !analysis.affectedAssetIds.length) return item;
    const related = options.preserveRelatedAssetScope
      ? analysis.affectedAssetIds.filter(id => item.affectedAssetIds.includes(id)) : analysis.affectedAssetIds;
    const affectedAssetIds = [...new Set([...related, ...unknownAssets])];
    const oldExplanation = item.portfolioImpactAnalysis?.directExplanation;
    const previousHoldings = item.portfolioImpactAnalysis?.affectedHoldings || [];
    const computed = holdingsFor(affectedAssetIds.filter(symbol => knownAssets.has(symbol)), analysis);
    const holdings = affectedAssetIds.map(symbol => !knownAssets.has(symbol)
      ? previousHoldings.find(holding => holding.symbol === symbol) || { symbol, impactDirection: 'neutral' as const, relationshipDetail: 'La información disponible no permite establecer un efecto direccional para este instrumento.' }
      : computed.find(holding => holding.symbol === symbol)!);
    const explanation = explanationWithExposure(analysis, affectedAssetIds);
    const impact = combinedImpact(holdings.map(holding => holding.impactDirection));
    if (item.impact === impact && item.relevanceType === analysis.relevanceType && oldExplanation === explanation
      && affectedAssetIds.length === item.affectedAssetIds.length && holdings.length === previousHoldings.length
      && holdings.every(holding => previousHoldings.some(old => old.symbol === holding.symbol && old.impactDirection === holding.impactDirection && old.relationshipDetail === holding.relationshipDetail && old.exposure === holding.exposure))) return item;
    const synthesis = (item.fullSynthesis || []).map(line => line === oldExplanation ? explanation : line);
    if (!synthesis.includes(explanation)) synthesis.push(explanation);
    return {
      ...item,
      affectedAssetIds,
      impact,
      relevanceType: analysis.relevanceType,
      topicCategory: analysis.topicCategory,
      fullSynthesis: synthesis,
      portfolioImpactAnalysis: {
        directExplanation: explanation,
        affectedHoldings: holdings
      },
      audioScript: `Resumen FAROS. ${source.originalHeadline}. ${explanation} Publicado en ${source.mediaName}.`
    };
  });
}
