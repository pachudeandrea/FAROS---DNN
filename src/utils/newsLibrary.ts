import type { NewsItem } from '../types/index.js';
export interface LibraryEntry { id: string; news: NewsItem; urls: string[]; day: string; savedAt: string | null; seenAt: string }
export interface SavedReference { id: string; day: string; urls: string[]; savedAt: string }
export interface LibraryPage { items: LibraryEntry[]; saved: SavedReference[]; days: string[]; next: number | null }
export const libraryStorageKey = (userId: string) => `faros_library_v1:${userId}`;
export function publicationUrls(news: NewsItem): string[] {
  return [...new Set((news.sources || []).flatMap(source => {
    try {
      const url = new URL(source.sourceUrl);
      if (url.href.length > 2000 || url.protocol !== 'https:' || url.username || url.password) return [];
      url.hash = '';
      for (const key of [...url.searchParams.keys()]) if (/^utm_|^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
      url.searchParams.sort();
      return [url.href];
    } catch { return []; }
  }))];
}
export function samePublication(a: NewsItem, b: NewsItem): boolean {
  const urls = publicationUrls(a); return publicationUrls(b).some(url => urls.includes(url));
}
export function publicationDay(news: NewsItem, fallback = new Date().toISOString()): string {
  const source = news.sources?.[0];
  const at = source?.publishedTimestamp ?? Date.parse(source?.publishedDateIso || '');
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(Number.isFinite(at) ? new Date(at) : new Date(fallback));
}
export function validLibraryNews(value: unknown): value is NewsItem {
  if (!value || typeof value !== 'object') return false;
  const item = value as NewsItem;
  return typeof item.id === 'string' && item.id.length <= 300 && typeof item.headline === 'string' && item.headline.length > 0 && item.headline.length <= 1000
    && typeof item.briefSummary === 'string' && Array.isArray(item.fullSynthesis) && item.fullSynthesis.every(line => typeof line === 'string')
    && Array.isArray(item.sources) && item.sources.length > 0 && item.sources.length <= 5 && publicationUrls(item).length === item.sources.length
    && item.sources.every(source => typeof source.mediaName === 'string' && typeof source.originalHeadline === 'string')
    && Array.isArray(item.affectedAssetIds) && item.affectedAssetIds.every(id => typeof id === 'string')
    && typeof item.audioScript === 'string' && typeof item.audioDuration === 'string'
    && typeof item.timestamp === 'string' && typeof item.publishedAgo === 'string' && item.coverageCount === item.sources.length
    && !!item.factCheck && ['confirmado', 'en_analisis', 'rumor_descartado'].includes(item.factCheck.status) && typeof item.factCheck.detail === 'string' && typeof item.factCheck.officialSource === 'string'
    && !!item.portfolioImpactAnalysis && typeof item.portfolioImpactAnalysis.directExplanation === 'string' && Array.isArray(item.portfolioImpactAnalysis.affectedHoldings)
    && ['favorable', 'alerta', 'neutral', 'positivo', 'negativo', 'neutro'].includes(item.impact)
    && ['impacto_precio', 'valoracion_mercado', 'ruido', 'contexto_macro'].includes(item.relevanceType)
    && JSON.stringify(item).length <= 100000;
}
export function mergeLibrary(entries: LibraryEntry[], incoming: LibraryEntry[]): LibraryEntry[] {
  const merged = [...entries];
  for (const entry of incoming) {
    const index = merged.findIndex(previous => previous.id === entry.id || previous.day === entry.day && (previous.urls || publicationUrls(previous.news)).some(url => (entry.urls || publicationUrls(entry.news)).includes(url)));
    if (index < 0) merged.push(entry); else merged[index] = entry;
  }
  return merged;
}

export const SAVED_NEWS_TTL_MS = 24 * 60 * 60 * 1000;
export function isActiveSaved(savedAt: string | null, now = Date.now()): boolean {
  const timestamp = Date.parse(savedAt || "");
  return Number.isFinite(timestamp) && timestamp <= now && now - timestamp < SAVED_NEWS_TTL_MS;
}
