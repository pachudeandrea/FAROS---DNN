import * as cheerio from 'cheerio';
import type { MediaCoverage, NewsItem } from '../types/index.js';
import { getPublisherKey } from './sourceGrounding.js';
import { enrichNewsCoverage, sourcesCoverSameEvent } from './newsCoverage.js';
import { verifySourceUrl } from './urlResolver.js';

const PUBLISHERS = ['ambito.com', 'cronista.com', 'infobae.com'];
export function createCoverageDiscoveryDiagnostics() {
  return { searches: 0, unavailable: 0, candidates: 0, verified: 0, added: 0, queries: [] as { publisher: string; query: string; raw: number; rejected: number; accepted: number; status: string; rejectionReasons: Record<string, number>; rejectedExamples: { host: string; path: string; reason: string }[] }[] };
}
const belongsTo = (url: string, publisher: string, candidate = false) => {
  try { const parsed = new URL(url); return (parsed.protocol === 'https:' || candidate && parsed.protocol === 'http:') && !parsed.username && !parsed.password && !parsed.port && (parsed.hostname === publisher || parsed.hostname.endsWith(`.${publisher}`)); }
  catch { return false; }
};

/** Inspect public result destinations without following search-engine links. */
function inspectCoverageCandidate(raw: string, publisher: string) {
  let url: URL | undefined;
  const reject = (reason: string) => ({ url: null as string | null, reason, host: url?.hostname || '', path: (url?.pathname || '').slice(0, 180) });
  try {
    url = new URL(raw, 'https://www.bing.com');
    if (url.protocol === 'https:' && ['www.bing.com', 'bing.com'].includes(url.hostname)) {
      if (url.pathname === '/ck/a') {
        const value = url.searchParams.get('u') || '';
        if (!/^a1[A-Za-z0-9_-]+$/.test(value)) return reject('malformed_tracker');
        url = new URL(Buffer.from(value.slice(2), 'base64url').toString('utf8'));
      } else if (url.pathname === '/news/apiclick.aspx') {
        url = new URL(url.searchParams.get('url') || '');
      } else return reject('unsupported_tracker');
    }
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return reject('unsafe_url');
    if (!belongsTo(url.href, publisher, true)) return reject('outside_publisher');
    url.hash = '';
    return { url: url.href as string | null, reason: '', host: url.hostname, path: url.pathname.slice(0, 180) };
  } catch { return reject('invalid_url'); }
}

/** Decode only known Bing tracking formats, then validate the destination. */
export function coverageCandidateUrl(raw: string, publisher: string): string | null {
  return inspectCoverageCandidate(raw, publisher).url;
}

export function coverageEventQueries(headline: string): string[] {
  const normalized = headline.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/u\s*\$s?\s*|us\$/g, ' dolares ')
    .replace(/(\d)\.(?=\d{3}(?:\D|$))/g, '$1').replace(/(\d),(?=\d)/g, '$1.');
  const tokens = normalized.match(/[a-z0-9]+(?:\.\d+)?/g) || [];
  const text = tokens.join(' ');
  const words = tokens.filter(word => !/^(el|la|los|las|un|una|de|del|en|a|al|y|por|para|con|sus|su|tras|se|que)$/.test(word));
  // Keep public event terms and figures; avoid searching the whole editorial headline.
  const risk = text.match(/(?:riesgo pais|prima de riesgo argentina).*?\b(\d+) puntos/);
  if (risk) return [`riesgo pais Argentina ${risk[1]} puntos`, `riesgo pais Argentina ${risk[1]}`];
  const event = words.slice(0, 9).join(' ');
  const alternative = words.filter(word => !/^(ya|mas|dolares|ano)$/.test(word)).slice(0, 6).join(' ');
  return [...new Set([event, alternative])].filter(Boolean);
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
      const report = { publisher, query, raw: 0, rejected: 0, accepted: 0, status: 'pending', rejectionReasons: {} as Record<string, number>, rejectedExamples: [] as { host: string; path: string; reason: string }[] };
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
          const raw = link.attr('href') || link.text().trim();
          const inspected = inspectCoverageCandidate(raw, publisher);
          const url = inspected.url;
          if (report.accepted >= 3 || !url || seen.has(url)) {
            report.rejected++;
            const reason = url ? seen.has(url) ? 'duplicate' : 'limit' : inspected.reason;
            report.rejectionReasons[reason] = (report.rejectionReasons[reason] || 0) + 1;
            const example = { host: inspected.host, path: inspected.path, reason };
            if (report.rejectedExamples.length < 3 && !report.rejectedExamples.some(item => item.host === example.host && item.path === example.path && item.reason === reason)) report.rejectedExamples.push(example);
            return;
          }
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
