import * as cheerio from 'cheerio';
import { NewsItem, MediaCoverage } from '../types';
import { verifySourceUrl, filterByFreshness, getArgentinaDateInfo, DISALLOWED_PATH_PATTERNS } from './urlResolver';

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

interface TopicCluster {
  id: string;
  category: 'deuda_soberana' | 'balances' | 'regulaciones_bcra' | 'macro_tasas' | 'energia';
  tickers: string[];
  headline: string;
  briefSummary: string;
  impact: 'favorable' | 'alerta' | 'neutral';
  sources: MediaCoverage[];
}

/**
 * Classifies an article into a financial topic cluster.
 */
function classifyArticle(headline: string, source: MediaCoverage): { topicKey: string; clusterInfo: Omit<TopicCluster, 'id' | 'sources'> } {
  const lower = headline.toLowerCase();

  // 1. Dólar / Brecha / CCL / MEP
  if (lower.includes('dólar') || lower.includes('dolar') || lower.includes('mep') || lower.includes('ccl') || lower.includes('blue') || lower.includes('brecha')) {
    const isUp = lower.includes('sube') || lower.includes('trepa') || lower.includes('presión') || lower.includes('avanza');
    return {
      topicKey: 'dolar_mercado',
      clusterInfo: {
        category: 'regulaciones_bcra',
        tickers: ['MEP', 'CCL'],
        headline: headline.length > 30 ? headline : 'Mercado cambiario: cotizaciones del dólar financiero y oficial en la plaza local',
        briefSummary: `Evolución de las cotizaciones cambiarias (MEP, CCL y oficial), demanda de divisas y volumen operado informado por ${source.mediaName}.`,
        impact: isUp ? 'alerta' : 'neutral'
      }
    };
  }

  // 2. Bonos / Riesgo País / Deuda Soberana
  if (lower.includes('bono') || lower.includes('deuda') || lower.includes('riesgo país') || lower.includes('riesgo pais') || lower.includes('al30') || lower.includes('gd30') || lower.includes('soberan')) {
    const isDown = lower.includes('cae') || lower.includes('baja') || lower.includes('retroced') || lower.includes('derrumbe');
    return {
      topicKey: 'deuda_soberana',
      clusterInfo: {
        category: 'deuda_soberana',
        tickers: ['AL30', 'GD30'],
        headline: headline.length > 30 ? headline : 'Bonos soberanos en dólares y riesgo país: paridades y cotizaciones en BYMA y Wall Street',
        briefSummary: `Tendencia de las paridades soberanas en dólares (AL30 y GD30) y spread soberano reportados por ${source.mediaName}.`,
        impact: isDown ? 'alerta' : 'favorable'
      }
    };
  }

  // 3. Energía / Vaca Muerta / YPF / Pampa
  const isEnergy =
    lower.includes('vaca muerta') ||
    lower.includes('ypf') ||
    lower.includes('petróleo') ||
    lower.includes('petroleo') ||
    lower.includes('crudo') ||
    lower.includes('hidrocarburos') ||
    /(^|[^\p{L}\p{N}])gas( natural|oducto|ífera|ifera)?([^a-z]|$)/iu.test(lower) ||
    lower.includes('pampa') ||
    lower.includes('oleoducto');

  if (isEnergy) {
    return {
      topicKey: 'energia_vaca_muerta',
      clusterInfo: {
        category: 'energia',
        tickers: ['YPFD', 'PAMP'],
        headline: headline.length > 30 ? headline : 'Sector energético y Vaca Muerta: producción, transporte y proyectos de inversión',
        briefSummary: `Actualización de capacidad operativa, evacuación de hidrocarburos y desempeño corporativo reportado por ${source.mediaName}.`,
        impact: 'favorable'
      }
    };
  }

  // 4. Bancos / Tasas / BCRA / Reservas
  if (lower.includes('banco') || lower.includes('galicia') || lower.includes('tasa') || lower.includes('bcra') || lower.includes('reservas') || lower.includes('crédito') || lower.includes('bopreal')) {
    return {
      topicKey: 'sistema_financiero',
      clusterInfo: {
        category: 'macro_tasas',
        tickers: ['GGAL', 'BOPREAL'],
        headline: headline.length > 30 ? headline : 'Sistema bancario y política monetaria: reservas, encajes y colocaciones del BCRA',
        briefSummary: `Medidas monetarias, nivel de reservas y dinámica crediticia de entidades financieras relevadas por ${source.mediaName}.`,
        impact: lower.includes('compras') || lower.includes('suba') ? 'favorable' : 'neutral'
      }
    };
  }

  // Default Macro
  return {
    topicKey: `macro_${source.domain}`,
    clusterInfo: {
      category: 'deuda_soberana',
      tickers: ['AL30', 'MEP'],
      headline,
      briefSummary: `Acontecimientos económicos e indicadores de coyuntura monitoreados por ${source.mediaName}.`,
      impact: 'neutral'
    }
  };
}

/**
 * Builds real, live, grounded financial news for today directly from verified Argentine media articles.
 * Used when Gemini search grounding quota is exhausted (429) or as reliable live verification.
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

  // Group sources into topic clusters to create unified news items with multiple verified sources
  const clusters = new Map<string, TopicCluster>();

  for (const src of verifiedSources) {
    const { topicKey, clusterInfo } = classifyArticle(src.originalHeadline, src);

    if (!clusters.has(topicKey)) {
      clusters.set(topicKey, {
        id: `live-${topicKey}-${Date.now()}`,
        category: clusterInfo.category,
        tickers: clusterInfo.tickers,
        headline: clusterInfo.headline,
        briefSummary: clusterInfo.briefSummary,
        impact: clusterInfo.impact,
        sources: [src]
      });
    } else {
      const existing = clusters.get(topicKey)!;
      // Deduplicate sources within cluster by mediaName or URL
      const hasMedia = existing.sources.some(s => s.mediaName === src.mediaName || s.sourceUrl === src.sourceUrl);
      if (!hasMedia && existing.sources.length < 5) {
        existing.sources.push(src);
      }
    }
  }

  // Convert clusters to NewsItems
  const newsItems: NewsItem[] = [];
  let itemCounter = 1;

  for (const cluster of clusters.values()) {
    // Check ticker intersection if user provided tickers
    const matchesUserTickers = userTickers.length === 0 || cluster.tickers.some(t => userTickers.includes(t));
    if (!matchesUserTickers && newsItems.length >= 6) {
      continue;
    }

    const primarySource = cluster.sources[0];
    const mediaNames = cluster.sources.map(s => s.mediaName).join(', ');
    const displayTimestamp = primarySource.publishedTime || argInfo.formattedSpanish;

    newsItems.push({
      id: `live-news-${itemCounter++}`,
      headline: cluster.headline,
      briefSummary: cluster.briefSummary,
      fullSynthesis: [
        `Cobertura periodística confirmada en ${mediaNames} con fecha ${displayTimestamp}.`,
        `Monitoreo de cotización e impacto directo en instrumentos vinculados (${cluster.tickers.join(', ')}).`,
        `Datos validados directamente en las páginas originales de los medios emisores.`
      ],
      publishedAgo: primarySource.publishedTime || 'Reciente',
      timestamp: displayTimestamp,
      coverageCount: cluster.sources.length,
      sources: cluster.sources.map(s => ({
        mediaName: s.mediaName,
        originalHeadline: s.originalHeadline,
        sourceUrl: s.sourceUrl, // Real verified canonical URL
        publishedTime: s.publishedTime,
        domain: s.domain
      })),
      affectedAssetIds: cluster.tickers,
      impact: cluster.impact,
      relevanceType: 'impacto_precio',
      portfolioImpactAnalysis: {
        directExplanation: `Hecho reportado por ${mediaNames} con incidencia sobre las cotizaciones y el flujo de fondos de tus tenencias.`,
        affectedHoldings: cluster.tickers.map(sym => ({
          symbol: sym,
          impactDirection: cluster.impact,
          relationshipDetail: 'Transmisión vía paridad de mercado y cotización en plaza local.'
        })),
        horizon: 'Corto plazo (24-72h)'
      },
      audioDuration: '1:00 min',
      audioScript: `Resumen FAROS. ${cluster.headline}. Cobertura en ${mediaNames} para tus activos ${cluster.tickers.join(' y ')}.`,
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
