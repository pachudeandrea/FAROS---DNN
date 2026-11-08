import { ASSET_CATALOG } from '../data/assetCatalog.js';
import type { Asset, NewsItem } from '../types/index.js';
import { analyzeNewsRelevance } from './newsRelevance.js';

/** Re-evaluate our generated snapshots without discarding today's collection.
 * Only publisher evidence is used; an old generated synthesis is never evidence.
 * Curated/legacy items keep their original editorial analysis. */
export function reclassifyCachedNews(items: NewsItem[], assets: Asset[] = ASSET_CATALOG): NewsItem[] {
  return items.map(item => {
    if (typeof item?.id !== 'string' || !/^(live-news-|gemini_)/.test(item.id)) return item;
    if (item.affectedAssetIds?.some(id => !assets.some(asset => asset.id === id))) return item;
    const source = item.sources?.[0];
    if (!source?.originalHeadline) return item;
    const analysis = analyzeNewsRelevance(source.originalHeadline, assets, source.articleSummary);
    const oldExplanation = item.portfolioImpactAnalysis?.directExplanation;
    const holdings = item.affectedAssetIds.map(symbol => ({
      symbol, impactDirection: analysis.assetImpacts[symbol] || 'neutral', relationshipDetail: analysis.relationships[symbol]
    }));
    if (item.impact === analysis.impact && item.relevanceType === analysis.relevanceType && oldExplanation === analysis.explanation
      && holdings.every(holding => item.portfolioImpactAnalysis.affectedHoldings.some(old => old.symbol === holding.symbol && old.impactDirection === holding.impactDirection && old.relationshipDetail === holding.relationshipDetail))) return item;
    const synthesis = (item.fullSynthesis || []).map(line => line === oldExplanation ? analysis.explanation : line);
    if (!synthesis.includes(analysis.explanation)) synthesis.push(analysis.explanation);
    return {
      ...item,
      impact: analysis.impact,
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
