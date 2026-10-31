import * as cheerio from 'cheerio';
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

function isFinancialCandidate(title: string, link: string): boolean {
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
async function fetchRssCandidates(maxPerFeed = 15): Promise<RawFeedItem[]> {
  const candidates: RawFeedItem[] = [];

  for (const feed of RSS_FEEDS) {
    try {
      const res = await fetch(feed.url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
        },
        signal: AbortSignal.timeout(5000)
      });
      if (!res.ok) continue;

      const xml = await res.text();
      const $ = cheerio.load(xml, { xmlMode: true });

      let count = 0;
      $('item').each((_, el) => {
        if (count >= maxPerFeed) return false;
        const title = $(el).find('title').first().text().trim();
        const link = $(el).find('link').first().text().trim() || $(el).find('guid').first().text().trim();
        const pubDate = $(el).find('pubDate').first().text().trim();

        if (title && link && link.startsWith('http')) {
          if (isFinancialCandidate(title, link)) {
            candidates.push({
              title,
              link,
              pubDate,
              sourceFeed: feed.name
            });
            count++;
          }
        }
      });
    } catch {
      // Continue with other feeds if one times out
    }
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
function analyzeArticleContext(headline: string): {
  category: 'deuda_soberana' | 'balances' | 'regulaciones_bcra' | 'macro_tasas' | 'energia';
  tickers: string[];
  impact: 'favorable' | 'alerta' | 'neutral';
} {
  const lower = headline.toLowerCase();

  // Impact determination based on concrete market facts in headline
  const isAdverse = /ca[eé]|baja|retroced|derrumbe|presi[oó]n|inflaci[oó]n|sube el riesgo|tensi[oó]n|mora|freno|dudas|d[eé]ficit|ca[ií]da/i.test(lower);
  const isFavorable = /sube|trepa|compras netas|compr[oó]|super[aá]vit|r[eé]cord|ganancia|baja el riesgo|comprime|inversi[oó]n|acuerdo|duplica|ampl[ií]a|lanzan|mejoran/i.test(lower);
  const impact = isAdverse ? 'alerta' : isFavorable ? 'favorable' : 'neutral';

  // Specific financial category & tickers
  if (/bono|deuda|soberan|riesgo pa[ií]s|al30|gd30|canje|amortizaci[oó]n/i.test(lower)) {
    return { category: 'deuda_soberana', tickers: ['AL30', 'GD30'], impact };
  }
  if (/ypf|petr[oó]le|vaca muerta|gasoducto|oleoducto|pampa|hidrocarburo|crudo|barril|gnc/i.test(lower)) {
    return { category: 'energia', tickers: ['YPFD', 'PAMP'], impact };
  }
  if (/d[oó]lar|mep|ccl|blue|brecha|cambiari|divisas|parking/i.test(lower)) {
    return { category: 'regulaciones_bcra', tickers: ['MEP', 'CCL'], impact };
  }
  if (/banco|galicia|ggal|bbva|macro|cr[eé]dito|hipotecari|uva|bopreal/i.test(lower)) {
    return { category: 'balances', tickers: ['GGAL', 'BMA'], impact };
  }
  if (/tasa|inflaci[oó]n|ipc|bcra|reservas|lecap|boncap|fmi|indec|lefi/i.test(lower)) {
    return { category: 'macro_tasas', tickers: ['AL30', 'MEP'], impact };
  }
  if (/dow jones|s&p|nasdaq|cedear|wall street|apple|nvidia/i.test(lower)) {
    return { category: 'balances', tickers: ['SPY', 'NVDA'], impact };
  }

  return { category: 'macro_tasas', tickers: ['AL30', 'MEP'], impact };
}

/**
 * Builds real, live, grounded financial news for today directly from verified Argentine media articles.
 * Enforces STRICT EVENT COHERENCE:
 * Two articles can ONLY be grouped if they report on the EXACT SAME CONCRETE EVENT.
 * If articles report on different events, they remain separate news items with their own authentic source.
 */
export async function getLiveVerifiedArgentineNews(userTickers: string[] = []): Promise<NewsItem[]> {
  const candidates = await fetchRssCandidates(15);
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
      }
    }
  }

  console.log(`[LIVE VERIFIER] Total successfully verified authentic sources: ${verifiedSources.length}`);

  if (verifiedSources.length === 0) {
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
        console.log(`[EVENT MATCH] Grouped source "${src.originalHeadline}" (${src.mediaName}) with "${matchedCluster.headline}"`);
      }
    } else {
      // Independent concrete event!
      const ctx = analyzeArticleContext(src.originalHeadline);
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
        `Monitoreo de cotización e impacto evaluado en activos vinculados (${cluster.tickers.join(', ')}).`,
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
      relevanceType: 'impacto_precio',
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
  return freshNews;
}
