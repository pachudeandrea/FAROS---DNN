import { ASSET_CATALOG } from '../data/assetCatalog.js';
import type { Asset, MediaCoverage, NewsImpact, NewsItem, RelevanceType } from '../types/index.js';
import { analyzeNewsRelevance, type NewsRelevanceAnalysis } from './newsRelevance.js';

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
  return {
    // Fresh arrays/maps keep the private cached source analyses isolated from
    // callers that edit a returned aggregate or a temporary example portfolio.
    ...strongest, affectedAssetIds, assetImpacts, relationships,
    impact: combinedImpact(Object.values(assetImpacts)),
  };
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
    const holdings = affectedAssetIds.map(symbol => !knownAssets.has(symbol)
      ? previousHoldings.find(holding => holding.symbol === symbol) || { symbol, impactDirection: 'neutral' as const, relationshipDetail: 'La información disponible no permite establecer un efecto direccional para este instrumento.' }
      : { symbol, impactDirection: analysis.assetImpacts[symbol] || 'neutral', relationshipDetail: analysis.relationships[symbol] });
    const impact = combinedImpact(holdings.map(holding => holding.impactDirection));
    if (item.impact === impact && item.relevanceType === analysis.relevanceType && oldExplanation === analysis.explanation
      && affectedAssetIds.length === item.affectedAssetIds.length && holdings.length === previousHoldings.length
      && holdings.every(holding => previousHoldings.some(old => old.symbol === holding.symbol && old.impactDirection === holding.impactDirection && old.relationshipDetail === holding.relationshipDetail))) return item;
    const synthesis = (item.fullSynthesis || []).map(line => line === oldExplanation ? analysis.explanation : line);
    if (!synthesis.includes(analysis.explanation)) synthesis.push(analysis.explanation);
    return {
      ...item,
      affectedAssetIds,
      impact,
      relevanceType: analysis.relevanceType,
      topicCategory: analysis.topicCategory,
      fullSynthesis: synthesis,
      portfolioImpactAnalysis: {
        directExplanation: analysis.explanation,
        affectedHoldings: holdings
      },
      audioScript: `Resumen FAROS. ${source.originalHeadline}. ${analysis.explanation} Publicado en ${source.mediaName}.`
    };
  });
}
