import * as cheerio from 'cheerio';
import { recognizeAssetIds, isMacroAssetContext } from './assetNews.js';
import { ASSET_CATALOG } from '../data/assetCatalog.js';
import type { Asset } from '../types/index.js';
import { NewsItem, MediaCoverage } from '../types/index.js';
import { verifySourceUrl, filterByFreshness, getArgentinaDateInfo, DISALLOWED_PATH_PATTERNS } from './urlResolver.js';
import { getPublisherKey } from './sourceGrounding.js';
import { sourcesCoverSameEvent } from './newsCoverage.js';

interface RawFeedItem {
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
async function fetchRssCandidates(maxPerFeed = 15, diagnostics = createCollectionDiagnostics(), assets: Asset[] = ASSET_CATALOG): Promise<RawFeedItem[]> {
  const candidates: RawFeedItem[] = [];

  for (const feed of RSS_FEEDS) {
    const result = { name: feed.name, status: 'unavailable', found: 0 };
    diagnostics.feeds.push(result);
    try {
      const res = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) { result.status = 'http_error'; continue; }

      const xml = await res.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      if (!$('rss, feed').length) { result.status = 'invalid_feed'; continue; }
      result.status = 'ok';
      let count = 0;
      $('item').each((_, el) => {
        if (count >= maxPerFeed) return false;
        result.found++;
        const title = $(el).find('title').first().text().trim();
        const link = $(el).find('link').first().text().trim() || $(el).find('guid').first().text().trim();
        const pubDate = $(el).find('pubDate').first().text().trim();

        if (title && link && link.startsWith('http')) {
          if (isFinancialCandidate(title, link, assets)) {
            candidates.push({
              title,
              link,
              pubDate,
              sourceFeed: feed.name
            });
            count++;
          } else diagnostics.discarded.notFinancial++;
        } else diagnostics.discarded.invalidFeedItem++;
      });
    } catch {
      // Continue with other feeds if one times out
    }
  }

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
  category: 'deuda_soberana' | 'balances' | 'regulaciones_bcra' | 'macro_tasas' | 'energia';
  tickers: string[];
  impact: 'favorable' | 'alerta' | 'neutral';
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
  category: 'deuda_soberana' | 'balances' | 'regulaciones_bcra' | 'macro_tasas' | 'energia';
  tickers: string[];
  impact: 'favorable' | 'alerta' | 'neutral';
} {
  const lower = headline.toLowerCase();

  // Impact determination based on concrete market facts in headline
  const isAdverse = /ca[eé]|baja|retroced|derrumbe|presi[oó]n|inflaci[oó]n|sube el riesgo|tensi[oó]n|mora|freno|dudas|d[eé]ficit|ca[ií]da/i.test(lower);
  const isFavorable = /sube|trepa|compras netas|compr[oó]|super[aá]vit|r[eé]cord|ganancia|baja el riesgo|comprime|inversi[oó]n|acuerdo|duplica|ampl[ií]a|lanzan|mejoran/i.test(lower);
  const impact = isAdverse ? 'alerta' : isFavorable ? 'favorable' : 'neutral';

  const tickers = recognizeAssetIds(headline, assets);
  const affected = assets.filter(asset => tickers.includes(asset.id));
  const category = affected.some(a => ['bonos', 'provinciales', 'corporativos', 'tesoro'].includes(a.category)) ? 'deuda_soberana'
    : affected.some(a => a.category === 'divisas') ? 'regulaciones_bcra'
    : /ypf|petroleo|energía|energia|crudo/i.test(lower) ? 'energia'
    : affected.length ? 'balances' : 'macro_tasas';
  return { category, tickers, impact };
}

/**
 * Builds real, live, grounded financial news for today directly from verified Argentine media articles.
 * Enforces STRICT EVENT COHERENCE:
 * Two articles can ONLY be grouped if they report on the EXACT SAME CONCRETE EVENT.
 * If articles report on different events, they remain separate news items with their own authentic source.
 */
export function createCollectionDiagnostics() {
  return { feeds: [] as { name: string; status: string; found: number }[], candidates: 0, verified: 0,
    discarded: { notFinancial: 0, invalidFeedItem: 0, connection: 0, missingMetadata: 0, invalidArticle: 0, duplicate: 0, stale: 0 }, news: 0, multiMedia: 0 };
}
export async function getLiveVerifiedArgentineNews(userTickers: string[] = [], diagnostics = createCollectionDiagnostics(), assets: Asset[] = ASSET_CATALOG): Promise<NewsItem[]> {
  const candidates = await fetchRssCandidates(15, diagnostics, assets);
  const argInfo = getArgentinaDateInfo();

  console.log(`[LIVE VERIFIER] ${candidates.length} filtered financial RSS articles found. Validating URLs and extracting metadata...`);

  // Verify each URL via the complete resolution and validation pipeline
  const verifiedSources: (MediaCoverage & { canonicalUrl: string; publishedDateIso?: string; publishedTimestamp?: number })[] = [];
  const seenCanonical = new Set<string>();

  for (const c of candidates) {
    const vResult = await verifySourceUrl(c.link, c.title);
    if (vResult.verified && vResult.source) {
      const canon = vResult.source.canonicalUrl || vResult.source.sourceUrl;
      if (!seenCanonical.has(canon)) {
        seenCanonical.add(canon);
        verifiedSources.push(vResult.source);
      } else diagnostics.discarded.duplicate++;
    } else {
      const reason = vResult.discardReason || '';
      if (/conexión|timeout/i.test(reason)) diagnostics.discarded.connection++;
      else if (/extraer|titular|fecha/i.test(reason)) diagnostics.discarded.missingMetadata++;
      else diagnostics.discarded.invalidArticle++;
    }
  }

  console.log(`[LIVE VERIFIER] Total successfully verified authentic sources: ${verifiedSources.length}`);

  diagnostics.verified = verifiedSources.length;
  if (verifiedSources.length === 0) {
    console.info('[NEWS COLLECTION]', JSON.stringify(diagnostics));
    if (candidates.length && diagnostics.discarded.connection === candidates.length) throw new Error('NEWS_SOURCES_UNAVAILABLE');
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
    if (!matchesUserTickers && newsItems.length >= 8) {
      continue;
    }

    const primarySource = cluster.sources[0];
    const mediaNames = cluster.sources.map(s => s.mediaName).join(' y ');
    const displayTimestamp = primarySource.publishedTime || argInfo.formattedSpanish;

    const briefSummary = cluster.sources.length === 1
      ? `${cluster.headline}. Información reportada y confirmada en ${primarySource.mediaName}.`
      : `${cluster.headline}. Acontecimiento con cobertura periodística coincidente en ${mediaNames}.`;

    newsItems.push({
      id: `live-news-${itemCounter++}`,
      headline: cluster.headline,
      briefSummary,
      fullSynthesis: [
        `Hecho concreto informado en ${mediaNames} (${displayTimestamp}).`,
        `Instrumentos relacionados por identificación o emisor: ${cluster.tickers.join(', ') || 'contexto general'}.`,
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
      relevanceType: isMacroAssetContext(cluster.headline) ? 'contexto_macro' : 'impacto_precio',
      portfolioImpactAnalysis: {
        directExplanation: `Hecho respaldado por ${mediaNames} con incidencia sobre las cotizaciones y el flujo de fondos de tus tenencias.`,
        affectedHoldings: cluster.tickers.map(sym => ({
          symbol: sym,
          impactDirection: cluster.impact,
          relationshipDetail: 'Transmisión vía cotización en plaza local y variables del activo.'
        })),
        horizon: 'Corto plazo (24-72h)'
      },
      audioDuration: '1:00 min',
      audioScript: `Resumen FAROS. ${cluster.headline}. Información confirmada en ${mediaNames} para tus activos ${cluster.tickers.join(' y ')}.`,
      factCheck: {
        status: 'confirmado',
        officialSource: mediaNames,
        detail: `Reportado en publicaciones periodísticas con fecha ${displayTimestamp}.`
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
