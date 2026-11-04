import * as cheerio from 'cheerio';
import { recognizeAssetIds } from './assetNews.js';
import { analyzeNewsRelevance } from './newsRelevance.js';
import { ASSET_CATALOG } from '../data/assetCatalog.js';
import type { Asset } from '../types/index.js';
import { NewsItem, MediaCoverage } from '../types/index.js';
import { verifySourceUrl, filterByFreshness, getArgentinaDateInfo, DISALLOWED_PATH_PATTERNS } from './urlResolver.js';
import { getPublisherKey } from './sourceGrounding.js';
import { sourcesCoverSameEvent } from './newsCoverage.js';

export interface RawFeedItem {
  title: string;
  link: string;
  pubDate?: string;
  sourceFeed: string;
}

const RSS_FEEDS = [
  { name: 'Ámbito Finanzas', url: 'https://www.ambito.com/rss/finanzas.xml' },
  { name: 'Ámbito Economía', url: 'https://www.ambito.com/rss/economia.xml' },
  { name: 'El Cronista', url: 'https://www.cronista.com/files/rss/news.xml' },
  { name: 'Infobae', url: 'https://www.infobae.com/arc/outboundfeeds/rss/?outputType=xml' }
];

const FEED_TIMEOUT_MS = 5000;
// RSS and source verification together use at most about 23 seconds. Leave
// time for the personalized synthesis in the 60-second serverless request.
const VERIFICATION_BUDGET_MS = 18000;
const VERIFICATION_CONCURRENCY = 4;

function publisherFor(candidate: RawFeedItem): string {
  return getPublisherKey({ sourceUrl: candidate.link, mediaName: candidate.sourceFeed } as MediaCoverage);
}

/** Remove only transport/tracking differences, retaining article identifiers. */
function candidateUrlKey(rawUrl: string): string | null {
  try {
    const url = new URL(rawUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^utm_/i.test(key) || /^(fbclid|gclid)$/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    return url.href;
  } catch { return null; }
}

/** Each publisher gets a turn; two Ámbito feeds still count as one publisher. */
function fairCandidateOrder(candidates: RawFeedItem[], userTickers: string[], assets: Asset[]): RawFeedItem[] {
  const byPublisher = new Map<string, RawFeedItem[]>();
  const selected = new Set(userTickers);
  const priorities = new Map<RawFeedItem, number>();
  for (const candidate of candidates) {
    const publisher = publisherFor(candidate);
    const queue = byPublisher.get(publisher) || [];
    queue.push(candidate);
    byPublisher.set(publisher, queue);
    priorities.set(candidate, selected.size > 0
      && analyzeNewsRelevance(candidate.title, assets).affectedAssetIds.some(id => selected.has(id)) ? 1 : 0);
  }
  // Prioritize relevant headlines inside every publisher's queue without
  // excluding other publishers or dropping general financial coverage.
  for (const queue of byPublisher.values()) {
    queue.sort((a, b) => priorities.get(b)! - priorities.get(a)!);
  }
  const ordered: RawFeedItem[] = [];
  for (let turn = 0; ordered.length < candidates.length; turn++) {
    for (const queue of byPublisher.values()) {
      if (queue[turn]) ordered.push(queue[turn]);
    }
  }
  return ordered;
}

// Keywords to ensure articles are genuine financial/macro/corporate Argentine news
const FINANCIAL_KEYWORDS = [
  'dólar', 'dolar', 'mep', 'ccl', 'blue', 'brecha', 'cambiaria', 'cambiario', 'divisa', 'divisas',
  'bono', 'bonos', 'deuda', 'riesgo país', 'riesgo pais', 'al30', 'gd30', 'bopreal',
  'ypf', 'vaca muerta', 'petróleo', 'petroleo', 'crudo', 'gas natural', 'gasoducto', 'gnc', 'pampa', 'energía', 'energia',
  'banco', 'bancos', 'galicia', 'ggal', 'tasa', 'tasas', 'bcra', 'reservas', 'inflación', 'inflacion',
  'byma', 'merval', 'cedear', 'cedears', 'wall street', 'adr', 'adrs', 'superávit', 'superavit', 'déficit', 'deficit',
  'comercial', 'exportaciones', 'exportación', 'exportacion', 'cnv', 'lecap', 'lecaps', 'boncap', 'fmi'
];

const NON_FINANCIAL_REJECT_REGEX = /(^|[^\p{L}\p{N}])(botargas?|carrera de|maratón|maraton|desfile|recital|concierto|farándula|farandula|espectáculos?|espectaculos?|fútbol|futbol|partido de|champions league|copa libertadores|asesinato|homicidio|femicidio|detenido por|accidente vial|choque fatal|clima para hoy|pronóstico del tiempo|horóscopo|horoscopo|signos del zodíaco)([^\\p{L}\\p{N}]|$)/iu;

export function isFinancialCandidate(title: string, link: string, assets: Asset[] = ASSET_CATALOG): boolean {
  if (!title || !link) return false;
  const lowerLink = link.toLowerCase();

  // 1. Never accept foreign news or non-financial sections
  if (DISALLOWED_PATH_PATTERNS.some(p => lowerLink.includes(p))) {
    return false;
  }

  // 2. Infobae must be strictly in /economia/
  if (lowerLink.includes('infobae.com') && !lowerLink.includes('/economia/')) {
    return false;
  }

  // 3. Reject known non-financial themes in headline
  if (NON_FINANCIAL_REJECT_REGEX.test(title)) {
    return false;
  }

  if (recognizeAssetIds(title, assets).length) return true;

  // 4. Must match at least one genuine financial keyword with word-boundaries
  const lowerTitle = title.toLowerCase();
  for (const kw of FINANCIAL_KEYWORDS) {
    const reg = new RegExp(`(^|[^\\p{L}\\p{N}])${kw}([^\\p{L}\\p{N}]|$)`, 'iu');
    if (reg.test(lowerTitle) || reg.test(lowerLink)) {
      return true;
    }
  }

  return false;
}

/**
 * Fetches real candidate articles directly from Argentine financial RSS feeds.
 */
async function fetchRssCandidates(maxPerFeed = 100, diagnostics = createCollectionDiagnostics(), assets: Asset[] = ASSET_CATALOG): Promise<RawFeedItem[]> {
  // Push diagnostics before launching requests to keep their order stable even
  // if a slow or unavailable feed finishes last.
  const feedResults = RSS_FEEDS.map(feed => ({ name: feed.name, status: 'unavailable', found: 0, accepted: 0 }));
  diagnostics.feeds.push(...feedResults);
  const batches = await Promise.all(RSS_FEEDS.map(async (feed, index) => {
    const result = feedResults[index];
    const candidates: RawFeedItem[] = [];
    try {
      const res = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(FEED_TIMEOUT_MS)
      });
      if (!res.ok) { result.status = 'http_error'; return candidates; }

      const xml = await res.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      if (!$('rss, feed').length) { result.status = 'invalid_feed'; return candidates; }
      result.status = 'ok';
      let count = 0;
      $('item, entry').each((_, el) => {
        if (count >= maxPerFeed) return false;
        result.found++;
        const title = $(el).find('title').first().text().trim();
        const linkElement = $(el).find('link[rel="alternate"], link:not([rel])').first();
        const link = linkElement.attr('href')?.trim() || linkElement.text().trim() || $(el).find('guid').first().text().trim();
        const pubDate = $(el).find('pubDate, published, updated').first().text().trim();

        if (title && link && link.startsWith('http')) {
          if (isFinancialCandidate(title, link, assets)) {
            candidates.push({
              title,
              link,
              pubDate,
              sourceFeed: feed.name
            });
            count++;
            result.accepted++;
          } else diagnostics.discarded.notFinancial++;
        } else diagnostics.discarded.invalidFeedItem++;
      });
    } catch (error) {
      result.status = error instanceof Error && /timeout|abort/i.test(error.name) ? 'timeout' : 'connection_error';
    }
    return candidates;
  }));

  const candidates = batches.flat();
  diagnostics.candidates = candidates.length;
  if (!diagnostics.feeds.some(feed => feed.status === 'ok')) {
    console.info('[NEWS COLLECTION]', JSON.stringify(diagnostics));
    throw new Error('NEWS_SOURCES_UNAVAILABLE');
  }
  return candidates;
}

interface EventCluster {
  id: string;
  headline: string;
  category: NewsItem['topicCategory'];
  tickers: string[];
  impact: NewsItem['impact'];
  sources: MediaCoverage[];
}

/**
 * Analyzes an individual article's headline to extract:
 * 1. Financial category
 * 2. Specific affected tickers
 * 3. Market impact direction (alerta, favorable, neutral)
 *
 * NOTE: Category is used solely for metadata and filtering, NEVER to force-group unrelated events!
 */
export function analyzeArticleContext(headline: string, assets: Asset[] = ASSET_CATALOG): {
  category: NewsItem['topicCategory'];
  tickers: string[];
  impact: NewsItem['impact'];
} {
  const analysis = analyzeNewsRelevance(headline, assets);
  return { category: analysis.topicCategory, tickers: analysis.affectedAssetIds, impact: analysis.impact };
}

/**
 * Builds real, live, grounded financial news for today directly from verified Argentine media articles.
 * Enforces STRICT EVENT COHERENCE:
 * Two articles can ONLY be grouped if they report on the EXACT SAME CONCRETE EVENT.
 * If articles report on different events, they remain separate news items with their own authentic source.
 */
export function createCollectionDiagnostics() {
  return { feeds: [] as { name: string; status: string; found: number; accepted: number }[], candidates: 0, uniqueCandidates: 0, verified: 0,
    sources: [] as { name: string; candidates: number; attempted: number; verified: number; failed: number; timedOut: number }[],
    verification: { concurrencyLimit: VERIFICATION_CONCURRENCY, peakConcurrency: 0, budgetExhausted: false, skipped: 0 },
    discarded: { notFinancial: 0, invalidFeedItem: 0, connection: 0, missingMetadata: 0, invalidArticle: 0, duplicate: 0, stale: 0 }, news: 0, multiMedia: 0 };
}
type VerificationResult = Awaited<ReturnType<typeof verifySourceUrl>>;
type VerifiedSource = NonNullable<VerificationResult['source']>;

/** Bounded, fair verification; injectable transport/budget also permits offline checks. */
export async function verifyNewsCandidates(
  candidates: RawFeedItem[],
  userTickers: string[],
  diagnostics = createCollectionDiagnostics(),
  assets: Asset[] = ASSET_CATALOG,
  options: { verify?: typeof verifySourceUrl; budgetMs?: number; concurrency?: number } = {}
): Promise<VerifiedSource[]> {
  const unique: RawFeedItem[] = [];
  const seenUrls = new Set<string>();
  for (const c of candidates) {
    const url = candidateUrlKey(c.link);
    if (!url) { diagnostics.discarded.invalidFeedItem++; continue; }
    if (seenUrls.has(url)) { diagnostics.discarded.duplicate++; continue; }
    seenUrls.add(url);
    unique.push({ ...c, link: url });
  }
  diagnostics.uniqueCandidates = unique.length;
  const ordered = fairCandidateOrder(unique, userTickers, assets);
  const sourceDiagnostics = new Map<string, typeof diagnostics.sources[number]>();
  for (const c of ordered) {
    const publisher = publisherFor(c);
    const item = sourceDiagnostics.get(publisher) || { name: publisher, candidates: 0, attempted: 0, verified: 0, failed: 0, timedOut: 0 };
    item.candidates++;
    sourceDiagnostics.set(publisher, item);
  }
  diagnostics.sources.push(...sourceDiagnostics.values());
  if (!ordered.length) return [];

  const verify = options.verify || verifySourceUrl;
  const concurrency = Math.max(1, Math.min(VERIFICATION_CONCURRENCY, options.concurrency || VERIFICATION_CONCURRENCY));
  diagnostics.verification.concurrencyLimit = concurrency;
  const budgetMs = Math.max(0, options.budgetMs ?? VERIFICATION_BUDGET_MS);
  const deadline = Date.now() + budgetMs;
  const timedOut = Symbol('verification-deadline');
  let deadlineTimer: ReturnType<typeof setTimeout>;
  const deadlineResult = new Promise<typeof timedOut>(resolve => {
    deadlineTimer = setTimeout(() => resolve(timedOut), budgetMs);
  });
  const results: (VerifiedSource | undefined)[] = new Array(ordered.length);
  let next = 0;
  let active = 0;
  const worker = async () => {
    while (next < ordered.length && Date.now() < deadline && !diagnostics.verification.budgetExhausted) {
      const index = next++;
      const candidate = ordered[index];
      const publisher = sourceDiagnostics.get(publisherFor(candidate))!;
      publisher.attempted++;
      active++;
      diagnostics.verification.peakConcurrency = Math.max(diagnostics.verification.peakConcurrency, active);
      // Every underlying URL request already has its own five-second timeout.
      // Stop waiting at the collection deadline and launch no further requests.
      const result = await Promise.race([
        Promise.resolve().then(() => verify(candidate.link, candidate.title)).catch((): VerificationResult => ({ verified: false, discardReason: 'Fallo de conexión' })),
        deadlineResult
      ]);
      active--;
      if (result === timedOut) {
        diagnostics.verification.budgetExhausted = true;
        diagnostics.discarded.connection++;
        publisher.failed++;
        publisher.timedOut++;
      } else if (result.verified && result.source) {
        results[index] = result.source;
        publisher.verified++;
      } else {
        publisher.failed++;
        const reason = result.discardReason || '';
        if (/conexión|timeout|HTTP status (?:401|403|408|429|5\d\d)/i.test(reason)) diagnostics.discarded.connection++;
        else if (/extraer|titular|fecha/i.test(reason)) diagnostics.discarded.missingMetadata++;
        else diagnostics.discarded.invalidArticle++;
      }
    }
    if (next < ordered.length && Date.now() >= deadline) diagnostics.verification.budgetExhausted = true;
  };
  try {
    await Promise.all(Array.from({ length: Math.min(concurrency, ordered.length) }, worker));
  } finally {
    clearTimeout(deadlineTimer!);
  }
  diagnostics.verification.skipped = ordered.length - next;
  const verifiedSources: VerifiedSource[] = [];
  const seenCanonical = new Set<string>();
  for (const result of results) {
    if (!result) continue;
    const canon = candidateUrlKey(result.canonicalUrl || result.sourceUrl) || result.sourceUrl;
    if (seenCanonical.has(canon)) { diagnostics.discarded.duplicate++; continue; }
    seenCanonical.add(canon);
    verifiedSources.push(result);
  }
  return verifiedSources;
}

export async function getLiveVerifiedArgentineNews(userTickers: string[] = [], diagnostics = createCollectionDiagnostics(), assets: Asset[] = ASSET_CATALOG): Promise<NewsItem[]> {
  const candidates = await fetchRssCandidates(100, diagnostics, assets);
  const argInfo = getArgentinaDateInfo();
  const verifiedSources = await verifyNewsCandidates(candidates, userTickers, diagnostics, assets);

  console.log(`[LIVE VERIFIER] Total successfully verified authentic sources: ${verifiedSources.length}`);

  diagnostics.verified = verifiedSources.length;
  if (verifiedSources.length === 0) {
    console.info('[NEWS COLLECTION]', JSON.stringify(diagnostics));
    if (diagnostics.uniqueCandidates && diagnostics.discarded.connection + diagnostics.verification.skipped === diagnostics.uniqueCandidates) throw new Error('NEWS_SOURCES_UNAVAILABLE');
    return [];
  }

  // Group sources strictly by CONCRETE EVENT MATCH (Never by general category!)
  const clusters: EventCluster[] = [];

  for (const src of verifiedSources) {
    // Only group with an existing cluster if the two articles speak of the EXACT SAME EVENT
    const matchedCluster = clusters.find(cl => sourcesCoverSameEvent(cl.sources[0], src));

    if (matchedCluster) {
      // Deduplicate within cluster by media name or URL
      const hasMedia = matchedCluster.sources.some(s => getPublisherKey(s) === getPublisherKey(src) || s.sourceUrl === src.sourceUrl);
      if (!hasMedia && matchedCluster.sources.length < 5) {
        matchedCluster.sources.push(src);

      }
    } else {
      // Independent concrete event!
      const ctx = analyzeArticleContext(src.originalHeadline, assets);
      clusters.push({
        id: `live-event-${Date.now()}-${clusters.length}`,
        headline: src.originalHeadline, // The authentic, real headline of the event
        category: ctx.category,
        tickers: ctx.tickers,
        impact: ctx.impact,
        sources: [src]
      });
    }
  }

  // Convert clusters to NewsItems
  const newsItems: NewsItem[] = [];
  let itemCounter = 1;

  clusters.sort((a, b) => Number(b.tickers.some(id => userTickers.includes(id))) - Number(a.tickers.some(id => userTickers.includes(id))));
  for (const cluster of clusters) {
    // Check ticker intersection if user provided tickers
    const matchesUserTickers = userTickers.length === 0 || cluster.tickers.some(t => userTickers.includes(t));
    if (!matchesUserTickers) continue;

    const analysis = analyzeNewsRelevance(cluster.headline, assets);
    const primarySource = cluster.sources[0];
    const mediaNames = cluster.sources.map(s => s.mediaName).join(' y ');
    const displayTimestamp = primarySource.publishedTime || argInfo.formattedSpanish;

    const briefSummary = cluster.sources.length === 1
      ? `${cluster.headline}. Información publicada en ${primarySource.mediaName}.`
      : `${cluster.headline}. Acontecimiento con cobertura periodística coincidente en ${mediaNames}.`;

    newsItems.push({
      id: `live-news-${itemCounter++}`,
      headline: cluster.headline,
      briefSummary,
      fullSynthesis: [
        `Hecho concreto informado en ${mediaNames} (${displayTimestamp}).`,
        analysis.explanation,
        `Información respaldada directamente por las publicaciones originales de los medios consultados.`
      ],
      publishedAgo: primarySource.publishedTime || 'Reciente',
      timestamp: displayTimestamp,
      coverageCount: cluster.sources.length,
      sources: cluster.sources.map(s => ({
        mediaName: s.mediaName,
        originalHeadline: s.originalHeadline,
        sourceUrl: s.sourceUrl, // Real verified canonical URL
        publishedTime: s.publishedTime,
        publishedDateIso: s.publishedDateIso,
        publishedTimestamp: s.publishedTimestamp,
        domain: s.domain
      })),
      affectedAssetIds: cluster.tickers,
      impact: cluster.impact,
      relevanceType: analysis.relevanceType,
      portfolioImpactAnalysis: {
        directExplanation: analysis.explanation,
        affectedHoldings: cluster.tickers.map(sym => ({
          symbol: sym,
          impactDirection: analysis.assetImpacts[sym] || 'neutral',
          relationshipDetail: analysis.relationships[sym]
        }))
      },
      audioDuration: '1:00 min',
      audioScript: `Resumen FAROS. ${cluster.headline}. ${analysis.explanation} Publicado en ${mediaNames}.`,
      factCheck: {
        status: analysis.relevanceType === 'ruido' ? 'en_analisis' : 'confirmado',
        officialSource: mediaNames,
        detail: analysis.relevanceType === 'ruido' ? `Publicación verificada en ${mediaNames}; su contenido no se trata como un hecho financiero confirmado.` : `Reportado en publicaciones periodísticas con fecha ${displayTimestamp}.`
      },
      topicCategory: cluster.category
    });
  }

  // Apply freshness filter (primary window: today; expansion window: 48h; discard notes with 0 sources)
  const freshNews = filterByFreshness(newsItems);
  diagnostics.discarded.stale = newsItems.length - freshNews.length;
  diagnostics.news = freshNews.length;
  diagnostics.multiMedia = freshNews.filter(item => new Set(item.sources.map(getPublisherKey)).size > 1).length;
  console.info('[NEWS COLLECTION]', JSON.stringify(diagnostics));
  return freshNews;
}
