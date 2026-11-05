import * as cheerio from 'cheerio';
import type { MediaCoverage, NewsItem } from '../types/index.js';
import { cleanHeadlineText, getPublisherKey } from './sourceGrounding.js';
import { enrichNewsCoverage, sourcesCoverSameEvent } from './newsCoverage.js';
import { verifySourceUrl } from './urlResolver.js';

const PUBLISHERS = ['ambito.com', 'cronista.com', 'infobae.com'];
export function createCoverageDiscoveryDiagnostics() {
  return { searches: 0, unavailable: 0, candidates: 0, verified: 0, added: 0, queries: [] as { publisher: string; query: string; raw: number; rejected: number; accepted: number; status: string }[] };
}
const belongsTo = (url: string, publisher: string, candidate = false) => {
  try { const parsed = new URL(url); return (parsed.protocol === 'https:' || candidate && parsed.protocol === 'http:') && !parsed.username && !parsed.password && !parsed.port && (parsed.hostname === publisher || parsed.hostname.endsWith(`.${publisher}`)); }
  catch { return false; }
};

/** Decode only known Bing tracking formats, then validate the destination. */
export function coverageCandidateUrl(raw: string, publisher: string): string | null {
  try {
    let url = new URL(raw, 'https://www.bing.com');
    if (url.protocol === 'https:' && ['www.bing.com', 'bing.com'].includes(url.hostname)) {
      if (url.pathname === '/ck/a') {
        const value = url.searchParams.get('u') || '';
        if (!/^a1[A-Za-z0-9_-]+$/.test(value)) return null;
        url = new URL(Buffer.from(value.slice(2), 'base64url').toString('utf8'));
      } else if (url.pathname === '/news/apiclick.aspx') {
        url = new URL(url.searchParams.get('url') || '');
      } else return null;
    }
    if (!belongsTo(url.href, publisher, true)) return null;
    url.hash = '';
    return url.href;
  } catch { return null; }
}

export function coverageEventQueries(headline: string): string[] {
  const text = cleanHeadlineText(headline);
  const words = text.split(/\s+/).filter(word => !/^(el|la|los|las|un|una|de|del|en|a|al|y|por|para|con|sus|su|tras|se|que)$/.test(word));
  // Keep public event terms and figures; avoid searching the whole editorial headline.
  const event = words.slice(0, 9).join(' ');
  return [...new Set([event, words.slice(0, 5).join(' ')])].filter(Boolean);
}

/** Search missing outlets explicitly. Search results are candidates, never evidence. */
export async function discoverMissingCoverage(news: NewsItem[], diagnostics = createCoverageDiscoveryDiagnostics()): Promise<NewsItem[]> {
  const targets = news.filter(item => item.sources.length && PUBLISHERS.some(publisher => !item.sources.some(source => getPublisherKey(source) === publisher))).slice(0, 4);
  if (!targets.length) return news;
  const queries = targets.flatMap(item => PUBLISHERS.filter(publisher => !item.sources.some(source => getPublisherKey(source) === publisher))
    .map(publisher => ({ anchor: item.sources[0], publisher })));
  const candidates: { anchor: MediaCoverage; publisher: string; url: string; title: string }[] = [];
  await Promise.all(queries.map(async ({ anchor, publisher }) => {
    const signal = AbortSignal.timeout(3500);
    const seen = new Set<string>();
    for (const terms of coverageEventQueries(anchor.originalHeadline)) {
      if (signal.aborted) break;
      diagnostics.searches++;
      const query = `site:${publisher} ${terms}`;
      const report = { publisher, query, raw: 0, rejected: 0, accepted: 0, status: 'pending' };
      diagnostics.queries.push(report);
      const search = new URL('https://www.bing.com/search');
      search.searchParams.set('q', query);
      search.searchParams.set('format', 'rss');
      search.searchParams.set('setlang', 'es-AR');
      try {
        const response = await fetch(search, { signal });
        if (!response.ok) throw new Error('SEARCH_UNAVAILABLE');
        const $ = cheerio.load(await response.text(), { xmlMode: true });
        if (!$('rss, feed').length) throw new Error('INVALID_SEARCH_FEED');
        report.status = 'ok';
        $('item, entry').each((_, node) => {
          report.raw++;
          const link = $(node).find('link').first();
          const url = coverageCandidateUrl(link.attr('href') || link.text().trim(), publisher);
          if (report.accepted >= 3 || !url || seen.has(url)) { report.rejected++; return; }
          seen.add(url);
          candidates.push({ anchor, publisher, url, title: $(node).find('title').first().text().trim() });
          report.accepted++;
        });
      } catch { diagnostics.unavailable++; report.status = 'unavailable'; break; }
      if (report.accepted) break;
    }
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
        pending = verifySourceUrl(candidate.url, candidate.title, signal, candidate.publisher);
        results.set(candidate.url, pending);
      }
      const result = await pending;
      if (!result.verified || !result.source || !belongsTo(result.source.sourceUrl, candidate.publisher)) continue;
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
