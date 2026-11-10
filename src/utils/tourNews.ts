import type { NewsItem, Portfolio } from '../types/index.js';
import { argentinaNewsDay, dailyNewsItems } from './dailyNews.js';
import { getPortfolioNewsImpact } from './portfolioNews.js';
import { isValidArticleUrl } from './sourceGrounding.js';

/** The guide uses the publication's actual date, never a generated card date. */
export function selectTourNews(news: NewsItem[], day = argentinaNewsDay()): NewsItem | undefined {
  const today = dailyNewsItems(news, day).filter(item => isValidArticleUrl(item.sources[0]?.sourceUrl));
  return today.find(item => {
    const impact = getPortfolioNewsImpact(item, { assetIds: item.affectedAssetIds });
    return impact === 'favorable' || impact === 'alerta';
  }) || today.find(item => item.affectedAssetIds.length > 0) || today[0];
}

/** Display context only. This portfolio is never saved or added to an account. */
export function tourExamplePortfolio(news: NewsItem): Portfolio {
  const assetIds = [...new Set(news.affectedAssetIds)];
  return {
    id: 'tour-example',
    name: 'Cartera de ejemplo de la guía',
    description: 'Ejemplo informativo con los activos mencionados en esta noticia.',
    profile: 'moderado',
    assetIds,
    assetPositions: Object.fromEntries(assetIds.map(id => [id, 'long' as const])),
  };
}
