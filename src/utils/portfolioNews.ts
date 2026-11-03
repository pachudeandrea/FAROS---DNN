import { getEffectiveImpactForPortfolio, type NewsImpact, type NewsItem, type Portfolio } from '../types/index.js';

/** Portfolio membership is defined by assetIds, even when legacy positions are missing. */
export function getPortfolioAffectedAssetIds(news: Pick<NewsItem, 'affectedAssetIds'>, assetIds: string[]): string[] {
  const selected = new Set(assetIds);
  return [...new Set(news.affectedAssetIds)].filter(id => selected.has(id));
}

export function getPortfolioNewsImpact(
  news: Pick<NewsItem, 'impact' | 'affectedAssetIds'> & Partial<Pick<NewsItem, 'portfolioImpactAnalysis' | 'relevanceType'>>,
  portfolio: Pick<Portfolio, 'assetIds' | 'assetPositions'>
): NewsImpact {
  const affected = getPortfolioAffectedAssetIds(news, portfolio.assetIds);
  if (!affected.length || news.relevanceType === 'contexto_macro' || news.relevanceType === 'ruido') return 'neutral';
  const holdings = news.portfolioImpactAnalysis?.affectedHoldings;
  const directions = affected.map(id => {
    const holding = holdings?.find(item => item.symbol === id);
    // Existing news without per-asset analysis retains its original direction.
    // Once an analysis exists, an omitted instrument has no proven direction.
    const base = holding?.impactDirection || (holdings?.length ? 'neutral' : news.impact);
    return getEffectiveImpactForPortfolio(base, [id], { [id]: portfolio.assetPositions?.[id] || 'long' });
  });
  const positive = directions.some(impact => impact === 'favorable' || impact === 'positivo');
  const negative = directions.some(impact => impact === 'alerta' || impact === 'negativo');
  // Amounts and weights are unknown; opposing effects cannot establish a net benefit.
  return positive && !negative ? 'favorable' : negative && !positive ? 'alerta' : 'neutral';
}
