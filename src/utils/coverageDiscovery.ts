import * as cheerio from 'cheerio';
import type { MediaCoverage, NewsItem } from '../types/index.js';
import { cleanHeadlineText, getPublisherKey } from './sourceGrounding.js';
import { enrichNewsCoverage, sourcesCoverSameEvent } from './newsCoverage.js';
import { verifySourceUrl } from './urlResolver.js';

const PUBLISHERS = ['ambito.com', 'cronista.com', 'infobae.com'];
export function createCoverageDiscoveryDiagnostics() {
  return { searches: 0, unavailable: 0, candidates: 0, verified: 0, added: 0 };
}
const belongsTo = (url: string, publisher: string) => {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && (parsed.hostname === publisher || parsed.hostname.endsWith(`.${publisher}`)); }
  catch { return false; }
};

/** Search missing outlets explicitly. Search results are candidates, never evidence. */
export async function discoverMissingCoverage(news: NewsItem[], diagnostics = createCoverageDiscoveryDiagnostics()): Promise<NewsItem[]> {
  const targets = news.filter(item => item.sources.length === 1).slice(0, 4);
  if (!targets.length) return news;
  const queries = targets.flatMap(item => PUBLISHERS.filter(publisher => publisher !== getPublisherKey(item.sources[0]))
    .map(publisher => ({ anchor: item.sources[0], publisher })));
  const candidates: { anchor: MediaCoverage; publisher: string; url: string; title: string }[] = [];
  await Promise.all(queries.map(async ({ anchor, publisher }) => {
    diagnostics.searches++;
    const search = new URL('https://www.bing.com/search');
    // Send only the public headline, never portfolio/account information.
    search.searchParams.set('q', `site:${publisher} ${cleanHeadlineText(anchor.originalHeadline).slice(0, 180)}`);
    search.searchParams.set('format', 'rss');
    search.searchParams.set('setlang', 'es-AR');
    try {
      const response = await fetch(search, { signal: AbortSignal.timeout(3500) });
      if (!response.ok) throw new Error('SEARCH_UNAVAILABLE');
      const $ = cheerio.load(await response.text(), { xmlMode: true });
      if (!$('rss, feed').length) throw new Error('INVALID_SEARCH_FEED');
      let accepted = 0;
      $('item, entry').each((_, node) => {
        const link = $(node).find('link').first();
        const url = link.attr('href') || link.text().trim();
        if (accepted >= 3 || !belongsTo(url, publisher)) return;
        candidates.push({ anchor, publisher, url, title: $(node).find('title').first().text().trim() });
        accepted++;
      });
    } catch { diagnostics.unavailable++; }
  }));
  diagnostics.candidates = candidates.length;
  const verified = new Map<string, MediaCoverage>();
  const signal = AbortSignal.timeout(6000);
  const results = new Map<string, ReturnType<typeof verifySourceUrl>>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
    while (!signal.aborted && next < candidates.length) {
      const candidate = candidates[next++];
      let pending = results.get(candidate.url);
      if (!pending) {
        pending = verifySourceUrl(candidate.url, candidate.title, signal);
        results.set(candidate.url, pending);
      }
      const result = await pending;
      if (!result.verified || !result.source || !belongsTo(result.source.sourceUrl, candidate.publisher)) continue;
      // Compare the publication's own headline and date, not the search snippet.
      if (!sourcesCoverSameEvent(candidate.anchor, result.source)) continue;
      verified.set(result.source.sourceUrl, result.source);
    }
  }));
  diagnostics.verified = verified.size;
  if (!verified.size) return news;
  const enriched = enrichNewsCoverage(news, [...verified.values()]);
  diagnostics.added = enriched.reduce((total, item, index) => total + Math.max(0, item.sources.length - news[index].sources.length), 0);
  return enriched;
}
