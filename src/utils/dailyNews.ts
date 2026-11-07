import type { MediaCoverage, NewsItem } from '../types/index.js';
import { sourcesCoverSameEvent } from './newsCoverage.js';
import { getPublisherKey } from './sourceGrounding.js';
import { publicationUrls } from './newsLibrary.js';

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23'
});
function clockParts(now: number | Date) {
  const parts = formatter.formatToParts(now);
  const part = (name: string) => parts.find(value => value.type === name)!.value;
  return { day: `${part('year')}-${part('month')}-${part('day')}`, hour: part('hour') };
}
export const argentinaNewsDay = (now: number | Date = Date.now()): string => clockParts(now).day;
export const argentinaNewsHour = (now: number | Date = Date.now()): string => { const parts = clockParts(now); return `${parts.day}_${parts.hour}`; };
/** Buenos Aires uses UTC-3; calendar-hour boundaries have the same UTC minutes. */
export function nextNewsHourDelay(now: number | Date = Date.now()): number {
  const date = new Date(now);
  return 3600000 - (date.getUTCMinutes() * 60000 + date.getUTCSeconds() * 1000 + date.getUTCMilliseconds());
}
const sourceAt = (source: MediaCoverage | undefined) => Number.isFinite(source?.publishedTimestamp) ? source!.publishedTimestamp! : Date.parse(source?.publishedDateIso || '');
const belongsToDay = (source: MediaCoverage | undefined, day: string) => {
  const at = sourceAt(source);
  return Number.isFinite(at) && argentinaNewsDay(at) === day;
};

/** A card's anchor defines its publication day. Never relabel yesterday's
 * headline/audio as today's just because it has a later secondary source. */
export function dailyNewsItems(news: NewsItem[], day = argentinaNewsDay()): NewsItem[] {
  return news.flatMap(item => {
    if (!Array.isArray(item?.sources) || !belongsToDay(item.sources[0], day)) return [];
    const sources = item.sources.filter(source => belongsToDay(source, day));
    return [{ ...item, sources, coverageCount: sources.length }];
  });
}
function sameItem(a: NewsItem, b: NewsItem): boolean {
  const urls = publicationUrls(a);
  return publicationUrls(b).some(url => urls.includes(url)) || sourcesCoverSameEvent(a.sources[0], b.sources[0]);
}
/** Keep the day's verified news; refresh repeated articles rather than making
 * another card, and combine only publications about the same concrete event. */
export function mergeDailyNews(previous: NewsItem[], incoming: NewsItem[], day = argentinaNewsDay()): NewsItem[] {
  const merged = dailyNewsItems(previous, day);
  for (const item of dailyNewsItems(incoming, day)) {
    const index = merged.findIndex(old => sameItem(old, item));
    if (index < 0) { merged.push(item); continue; }
    const old = merged[index];
    const anchor = item.sources[0];
    const publishers = new Set<string>();
    const sources: MediaCoverage[] = [];
    for (const source of [...item.sources, ...old.sources]) {
      const publisher = getPublisherKey(source);
      if (publishers.has(publisher) || sources.length >= 5 || !item.sources.includes(source) && !sourcesCoverSameEvent(anchor, source)) continue;
      publishers.add(publisher); sources.push(source);
    }
    merged[index] = { ...item, sources, coverageCount: sources.length };
  }
  return merged;
}
