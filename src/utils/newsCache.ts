// Change this namespace when the news format or coverage pipeline changes.
// Only news caches are invalidated; sessions and personal calendars are kept.
export const NEWS_CACHE_VERSION = 'v4_coverage';
export const NEWS_CLIENT_CACHE_PREFIX = `faros_news_${NEWS_CACHE_VERSION}_`;

export function newsCacheKey(portfolioId: string, hourKey: string): string {
  return `${NEWS_CACHE_VERSION}_${portfolioId || 'default'}_${hourKey}`;
}

export function newsClientCacheKey(portfolioId: string, hourKey: string): string {
  return `faros_news_${newsCacheKey(portfolioId, hourKey)}`;
}
