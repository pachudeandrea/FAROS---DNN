import * as cheerio from 'cheerio';
import type { MediaCoverage, NewsItem } from '../types/index.js';
import { cleanHeadlineText, getPublisherKey } from './sourceGrounding.js';
import { enrichNewsCoverage, sourcesCoverSameEvent } from './newsCoverage.js';
import { verifySourceUrl } from './urlResolver.js';

import { COVERAGE_PUBLISHERS, collectPublisherSections, type SectionReport, type PublicationCandidate } from './publisherSections.js';
const PUBLISHERS = COVERAGE_PUBLISHERS.map(publisher => publisher.domain);
interface EventReport { searchesPlanned: number; searchesCompleted: number; searchIncomplete: boolean; id: string; headline: string; unresolvedPublishers: string[]; checkedPublishers: string[]; candidateCount: number; attempted: number; matched: number; differentEvent: number; failed: number; skipped: number; sourcesBefore: number; sourcesAfter: number; status: string };
export function createCoverageDiscoveryDiagnostics() {
  return { summary: { total: 0, multiMedia: 0, singleSource: 0, enriched: 0, incompleteSearches: 0 }, events: [] as EventReport[], sections: [] as SectionReport[], verification: { budgetExhausted: false, skipped: 0 }, searchBudgetExhausted: false, searches: 0, unavailable: 0, candidates: 0, verified: 0, added: 0, queries: [] as { publisher: string; query: string; raw: number; rejected: number; accepted: number; status: string; route: string; rejectionReasons: Record<string, number>; rejectedExamples: { host: string; path: string; reason: string }[] }[] };
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
    for (let depth = 0; ['www.bing.com', 'bing.com'].includes(url.hostname); depth++) {
      if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password || url.port) return reject('unsafe_url');
      if (depth >= 3) return reject('tracker_limit');
      // Decode locally: HTTP tracking wrappers are never visited.

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

/** Date hints improve discovery of older events without changing verified dates. */
export function coverageDatedQueries(anchor: MediaCoverage, now = new Date()): string[] {
  const queries = coverageEventQueries(anchor.originalHeadline);
  const at = typeof anchor.publishedTimestamp === 'number' && Number.isFinite(anchor.publishedTimestamp) ? anchor.publishedTimestamp : Date.parse(anchor.publishedDateIso || '');
  const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' });
  if (queries.length && Number.isFinite(at) && at < now.getTime() && day.format(at) !== day.format(now)) {
    const date = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long', year: 'numeric' }).format(at);
    queries[0] = `${queries[0]} ${date}`;
  }
  return queries;
}

/** Broad retrieval: candidates may be approximate; final event matching is strict. */
export function coverageCandidateScore(anchor: string, candidate: string): number {
  const terms = (value: string) => new Set(cleanHeadlineText(value)
    .replace(/banco central|autoridad monetaria/g, 'bcra').replace(/adquirio|compras|compro/g, 'compra')
    .split(' ').filter(word => word.length >= 3 && !/^(los|las|del|una|por|para|con|sus|tras|que|pero|mas|ano|argentina|argentino|argentinos|puntos)$/.test(word)));
  const a = terms(anchor); const b = terms(candidate);
  const overlap = [...a].filter(word => b.has(word));
  return overlap.length >= 2 ? overlap.length / Math.max(1, a.size) : 0;
}

interface DiscoveryOptions { prefetchedSections?: Promise<PublicationCandidate[]>; publishers?: string[]; sections?: boolean; searchPaths?: string[]; searchBudgetMs?: number; verificationBudgetMs?: number }
/** Every event is checked against shared publisher indexes, plus bounded searches. */
export async function discoverMissingCoverage(news: NewsItem[], diagnostics = createCoverageDiscoveryDiagnostics(), options: DiscoveryOptions = {}): Promise<NewsItem[]> {
  diagnostics.summary.total = news.length;
  diagnostics.summary.multiMedia = news.filter(item => item.sources.length > 1).length;
  diagnostics.summary.singleSource = news.filter(item => item.sources.length === 1).length;
  const publishers = options.publishers || PUBLISHERS;
  const targets = news.filter(item => item.sources.length && item.sources.length < 5 && publishers.some(publisher => !item.sources.some(source => getPublisherKey(source) === publisher)));
  const reports = new Map<NewsItem, EventReport>();
  for (const item of news) {
    const report: EventReport = { searchesPlanned: 0, searchesCompleted: 0, searchIncomplete: false, id: item.id, headline: item.sources[0]?.originalHeadline || item.headline, unresolvedPublishers: [], checkedPublishers: [], candidateCount: 0, attempted: 0, matched: 0, differentEvent: 0, failed: 0, skipped: 0, sourcesBefore: item.sources.length, sourcesAfter: item.sources.length, status: item.sources.length >= 5 ? 'coverage_limit' : item.sources.length ? 'pending' : 'missing_anchor' };
    diagnostics.events.push(report); reports.set(item, report);
  }
  if (!targets.length) return news;
  type Candidate = PublicationCandidate & { item: NewsItem; anchor: MediaCoverage; score: number };
  const candidates: Candidate[] = [];
  const searchSignal = AbortSignal.timeout(Math.max(1, options.searchBudgetMs ?? 5000));
  const sectionsTask = options.prefetchedSections || (options.sections === false ? Promise.resolve([] as PublicationCandidate[]) : collectPublisherSections(COVERAGE_PUBLISHERS.filter(publisher => publishers.includes(publisher.domain)), diagnostics.sections, searchSignal));
  // Round-robin across events first, instead of exhausting the first four cards.
  const queues = targets.map(item => publishers.filter(publisher => !item.sources.some(source => getPublisherKey(source) === publisher)).map(publisher => ({ item, anchor: item.sources[0], publisher })));
  queues.forEach((queue, index) => { reports.get(targets[index])!.searchesPlanned = queue.length; });
  const queries = Array.from({ length: publishers.length }, (_, turn) => queues.flatMap(queue => queue[turn] ? [queue[turn]] : [])).flat();
  let nextQuery = 0;
  await Promise.all(Array.from({ length: Math.min(4, queries.length) }, async () => {
    while (!searchSignal.aborted && nextQuery < queries.length && diagnostics.searches < 48) {
      const { item, anchor, publisher } = queries[nextQuery++];
      const seen = new Set<string>();
      let accepted = false; let interrupted = false; let queryFailed = false;
      for (const terms of coverageDatedQueries(anchor)) {
        for (const route of options.searchPaths || ['/news/search', '/search']) {
          if (accepted) break;
          if (searchSignal.aborted || diagnostics.searches >= 48) { interrupted = true; break; }
          diagnostics.searches++;
          const query = `site:${publisher} ${terms}`;
          const report = { publisher, query, route, raw: 0, rejected: 0, accepted: 0, status: 'pending', rejectionReasons: {} as Record<string, number>, rejectedExamples: [] as { host: string; path: string; reason: string }[] };
          diagnostics.queries.push(report);
          const search = new URL(route, 'https://www.bing.com');
          search.searchParams.set('q', query); search.searchParams.set('format', 'rss'); search.searchParams.set('setlang', 'es-AR');
          try {
            const response = await fetch(search, { signal: searchSignal, redirect: 'error' });
            if (!response.ok) throw new Error('SEARCH_UNAVAILABLE');
            const $ = cheerio.load(await response.text(), { xmlMode: true });
            if (!$('rss, feed').length) throw new Error('INVALID_SEARCH_FEED');
            report.status = 'ok';
            $('item, entry').each((_, node) => {
              report.raw++;
              const link = $(node).find('link').first();
              const inspected = inspectCoverageCandidate(link.attr('href') || link.text().trim(), publisher);
              const url = inspected.url;
              if (report.accepted >= 3 || !url || seen.has(url)) {
                report.rejected++;
                const reason = url ? seen.has(url) ? 'duplicate' : 'limit' : inspected.reason;
                report.rejectionReasons[reason] = (report.rejectionReasons[reason] || 0) + 1;
                const example = { host: inspected.host, path: inspected.path, reason };
                if (report.rejectedExamples.length < 3 && !report.rejectedExamples.some(entry => entry.host === example.host && entry.path === example.path && entry.reason === reason)) report.rejectedExamples.push(example);
                return;
              }
              seen.add(url);
              const title = $(node).find('title').first().text().trim();
              candidates.push({ item, anchor, publisher, url, title, score: coverageCandidateScore(anchor.originalHeadline, title) });
              report.accepted++;
            });
            if (report.raw && !report.accepted) report.status = 'irrelevant_results';
          } catch { diagnostics.unavailable++; report.status = 'unavailable'; queryFailed = true; accepted = true; break; }
          if (report.accepted) { if (!reports.get(item)!.checkedPublishers.includes(publisher)) reports.get(item)!.checkedPublishers.push(publisher); accepted = true; break; }
        }
        if (accepted) break;
      }
      if (!interrupted && !queryFailed) reports.get(item)!.searchesCompleted++;
    }
  }));
  diagnostics.searchBudgetExhausted = diagnostics.events.some(event => event.searchesCompleted < event.searchesPlanned) && (searchSignal.aborted || diagnostics.searches >= 48);
  const sectionCandidates = await sectionsTask;
  for (const item of targets) {
    const report = reports.get(item)!;
    const missing = publishers.filter(publisher => !item.sources.some(source => getPublisherKey(source) === publisher));
    for (const publisher of missing) {
      if (diagnostics.sections.some(section => section.publisher === publisher && section.status === 'ok') && !report.checkedPublishers.includes(publisher)) report.checkedPublishers.push(publisher);
      const ranked = sectionCandidates.filter(candidate => candidate.publisher === publisher).map(candidate => ({ ...candidate, item, anchor: item.sources[0], score: coverageCandidateScore(item.sources[0].originalHeadline, candidate.title) }))
        .filter(candidate => candidate.score > 0).sort((a, b) => b.score - a.score).slice(0, 3);
      candidates.push(...ranked);
    }
  }
  // Deduplicate event/URL and give every event its best candidate before seconds.
  const byEvent = targets.map(item => [...new Map(candidates.filter(candidate => candidate.item === item).sort((a, b) => b.score - a.score).map(candidate => [candidate.url, candidate])).values()]);
  const ordered: Candidate[] = [];
  for (let turn = 0; byEvent.some(queue => queue[turn]); turn++) for (const queue of byEvent) if (queue[turn]) ordered.push(queue[turn]);
  for (const candidate of ordered) reports.get(candidate.item)!.candidateCount++;
  diagnostics.candidates = ordered.length;
  const verified = new Map<string, MediaCoverage>();
  const signal = AbortSignal.timeout(Math.max(1, options.verificationBudgetMs ?? 10000));
  const pending = new Map<string, ReturnType<typeof verifySourceUrl>>(news.flatMap(item => item.sources).map(source => [source.sourceUrl, Promise.resolve({ verified: true, source: { ...source, canonicalUrl: source.canonicalUrl || source.sourceUrl } })]));
  // An explicit race enforces the budget even if a transport ignores AbortSignal.
  const cancelled = new Promise<undefined>(resolve => signal.addEventListener('abort', () => resolve(undefined), { once: true }));
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(4, ordered.length) }, async () => {
    while (!signal.aborted && next < ordered.length) {
      const candidate = ordered[next++]; const report = reports.get(candidate.item)!;
      report.attempted++;
      let work = pending.get(candidate.url);
      if (!work) { work = verifySourceUrl(candidate.url, candidate.title, signal, candidate.publisher).catch(() => ({ verified: false })); pending.set(candidate.url, work); }
      const result = await Promise.race([work, cancelled]);
      if (!result) { report.skipped++; continue; }
      if (!result.verified || !result.source || !belongsTo(result.source.sourceUrl, candidate.publisher)) { report.failed++; continue; }
      if (!sourcesCoverSameEvent(candidate.anchor, result.source)) { report.differentEvent++; continue; }
      report.matched++; verified.set(result.source.sourceUrl, result.source);
    }
  }));
  for (const candidate of ordered.slice(next)) reports.get(candidate.item)!.skipped++;
  diagnostics.verification.skipped = diagnostics.events.reduce((total, event) => total + event.skipped, 0);
  diagnostics.verification.budgetExhausted = diagnostics.verification.skipped > 0;
  diagnostics.verified = verified.size;
  const enriched = verified.size ? enrichNewsCoverage(news, [...verified.values()]) : news;
  diagnostics.added = enriched.reduce((total, item, index) => total + Math.max(0, item.sources.length - news[index].sources.length), 0);
  for (const item of targets) {
    const report = reports.get(item)!;
    report.sourcesAfter = enriched[news.indexOf(item)].sources.length;
    report.searchIncomplete = report.searchesCompleted < report.searchesPlanned;
    report.unresolvedPublishers = queues[targets.indexOf(item)].map(query => query.publisher).filter(publisher => !report.checkedPublishers.includes(publisher));
    report.status = report.sourcesAfter > report.sourcesBefore ? 'enriched' : report.skipped || report.searchIncomplete || report.checkedPublishers.length < queues[targets.indexOf(item)].length ? 'incomplete'
      : report.failed ? 'verification_failed' : report.differentEvent ? 'different_event' : 'no_verified_match';
  }
  diagnostics.summary.multiMedia = enriched.filter(item => item.sources.length > 1).length;
  diagnostics.summary.singleSource = enriched.filter(item => item.sources.length === 1).length;
  diagnostics.summary.enriched = diagnostics.events.filter(event => event.status === 'enriched').length;
  diagnostics.summary.incompleteSearches = diagnostics.events.filter(event => event.searchIncomplete || event.unresolvedPublishers.length || event.skipped || event.failed).length;
  return enriched;
}
