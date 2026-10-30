import * as cheerio from 'cheerio';
import { MediaCoverage, NewsItem } from '../types/index.js';
import { DOMAIN_MEDIA_MAP, getMediaNameFromDomain } from './sourceGrounding.js';

const BROWSER_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// Allowed Argentine and major financial media domains
export const ALLOWED_MEDIA_DOMAINS = [
  'ambito.com',
  'cronista.com',
  'infobae.com',
  'bloomberglinea.com',
  'lanacion.com.ar',
  'lanacion.com',
  'clarin.com',
  'reuters.com',
  'econojournal.com.ar',
  'iprofesional.com',
  'eleconomista.com.ar',
  'baenegocios.com',
  'forbesargentina.com',
  'perfil.com',
  'bcra.gob.ar',
  'ypf.com',
  'rava.com',
  'a24.com',
  'rionegro.com.ar',
  'diarioelnorte.com.ar',
  'swissinfo.ch',
  'bloomberg.com',
  'wsj.com',
  'ft.com',
  'cnbc.com'
];

// Disallowed URL path patterns: foreign national editions, entertainment, sports, lifestyle
export const DISALLOWED_PATH_PATTERNS = [
  // Foreign local/national news editions (non-Argentine)
  '/mexico/',
  '/colombia/',
  '/peru/',
  '/espana/',
  '/america/',
  '/estados-unidos/',
  '/venezuela/',
  '/chile/',
  '/uruguay/',
  '/cdmx/',
  // Non-financial topics
  '/deportes/',
  '/entretenimiento/',
  '/teleshow/',
  '/sociedad/',
  '/policiales/',
  '/judiciales/',
  '/espectaculos/',
  '/gente/',
  '/tendencias/',
  '/estilo/',
  '/gastronomia/',
  '/salud/',
  '/virales/',
  '/autos/',
  '/turismo/',
  '/cultura/',
  '/horoscopo/',
  '/show/',
  '/celebrities/',
  '/fama/',
  '/moda/',
  '/recetas/',
  '/cine/',
  '/series/',
  '/musica/',
  '/clima/',
  '/informacion-general/'
];

// For general-interest newspapers, require economic/financial section
export const MEDIA_REQUIRED_SECTIONS: Record<string, string[]> = {
  'infobae.com': ['/economia/'],
  'clarin.com': ['/economia/', '/rural/'],
  'lanacion.com.ar': ['/economia/', '/el-campo/', '/propiedades/'],
  'lanacion.com': ['/economia/', '/el-campo/', '/propiedades/'],
  'perfil.com': ['/noticias/economia/', '/noticias/finanzas/', '/economia/', '/finanzas/'],
  'a24.com': ['/economia/', '/dinero/', '/agro/']
};

export interface ArgentinaDateInfo {
  year: number;
  month: number;
  day: number;
  hour: number;
  isoDate: string; // YYYY-MM-DD
  dayOfWeek: string;
  formattedSpanish: string; // e.g. "martes, 20 de octubre de 2026"
  timestamp: number;
}

/**
 * Calculates the current date and time strictly in the America/Argentina/Buenos_Aires timezone.
 * Never hardcoded; computed dynamically on each request.
 */
export function getArgentinaDateInfo(date = new Date()): ArgentinaDateInfo {
  const timeZone = 'America/Argentina/Buenos_Aires';

  const isoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date); // "2026-10-20"

  const [yearStr, monthStr, dayStr] = isoParts.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const hourStr = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    hour12: false
  }).format(date);
  const hour = parseInt(hourStr, 10);

  const formattedSpanish = new Intl.DateTimeFormat('es-AR', {
    timeZone,
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  }).format(date);

  const dayOfWeek = new Intl.DateTimeFormat('es-AR', {
    timeZone,
    weekday: 'long'
  }).format(date);

  return {
    year,
    month,
    day,
    hour,
    isoDate: isoParts,
    dayOfWeek,
    formattedSpanish,
    timestamp: date.getTime()
  };
}

/**
 * Builds the cache key per portfolio, date (YYYY-MM-DD in Argentina), and hour.
 */
export function buildCacheKey(portfolioId: string, date = new Date()): { cacheKey: string; dateKey: string; hourKey: string } {
  const argInfo = getArgentinaDateInfo(date);
  const dateKey = argInfo.isoDate;
  const hourKey = `${dateKey}_${String(argInfo.hour).padStart(2, '0')}`;
  const cacheKey = `v3_coherent_${portfolioId || 'default'}_${hourKey}`;
  return { cacheKey, dateKey, hourKey };
}

export interface ResolvedUrlResult {
  finalUrl: string;
  responseStatus: number;
  contentType: string;
  html: string;
}

/**
 * Resolves the final canonical URL for a source by following HTTP redirects,
 * using browser User-Agent and a 5-second timeout.
 * Returns response.url as the final canonical URL.
 */
export async function resolveFinalUrl(uri: string, timeoutMs = 5000): Promise<ResolvedUrlResult | null> {
  if (!uri || typeof uri !== 'string' || !uri.startsWith('http')) {
    return null;
  }

  try {
    const response = await fetch(uri, {
      redirect: 'follow',
      signal: AbortSignal.timeout(timeoutMs),
      headers: {
        'User-Agent': BROWSER_USER_AGENT,
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-AR,es;q=0.9,en;q=0.8'
      }
    });

    const finalUrl = response.url || uri;
    const responseStatus = response.status;
    const contentType = response.headers.get('content-type') || '';
    const html = await response.text();

    return {
      finalUrl,
      responseStatus,
      contentType,
      html
    };
  } catch (err: any) {
    return null;
  }
}

export interface ValidationResult {
  valid: boolean;
  reason?: string;
  domain?: string;
}

/**
 * Validates the final article URL and response against strict criteria:
 * 1. Status 2xx
 * 2. Protocol HTTPS
 * 3. Content-type text/html
 * 4. Non-empty, non-root, non-generic section pathname
 * 5. Not a soft-404
 * 6. Belongs to allowed financial media domains
 */
export function validateArticleUrl(
  finalUrl: string,
  responseStatus: number,
  contentType: string,
  html: string
): ValidationResult {
  // 1. Status 2xx
  if (responseStatus < 200 || responseStatus >= 300) {
    return { valid: false, reason: `HTTP status ${responseStatus} no es 2xx` };
  }

  // 2. HTTPS protocol
  if (!finalUrl.startsWith('https://')) {
    return { valid: false, reason: 'Protocolo no es HTTPS' };
  }

  // 3. Content-Type text/html
  if (!contentType.toLowerCase().includes('text/html')) {
    return { valid: false, reason: `Content-Type '${contentType}' no es text/html` };
  }

  // 4. Pathname validation
  let parsed: URL;
  try {
    parsed = new URL(finalUrl);
  } catch {
    return { valid: false, reason: 'URL malformada' };
  }

  const cleanPath = parsed.pathname.replace(/\/+$/, '').toLowerCase();
  if (!cleanPath || cleanPath === '' || cleanPath === '/') {
    return { valid: false, reason: 'URL redirigió a la portada principal (home)' };
  }

  const genericSections = [
    '/economia',
    '/finanzas',
    '/finanzas-mercados',
    '/mercados',
    '/politica',
    '/economia-politica',
    '/negocios',
    '/latinoamerica',
    '/argentina',
    '/usa',
    '/dolar',
    '/campo',
    '/sociedad',
    '/el-pais',
    '/opinion',
    '/ultimo-momento',
    '/noticias'
  ];

  if (genericSections.includes(cleanPath)) {
    return { valid: false, reason: `URL corresponde a una sección general (${cleanPath}), no a un artículo` };
  }

  // Path must be substantive enough to be an article (not just /a or /1)
  if (cleanPath.length < 5) {
    return { valid: false, reason: `Ruta de URL demasiado corta (${cleanPath})` };
  }

  // 4b. Disallow foreign country news and non-financial sections (entertainment, sports, lifestyle, police)
  for (const pattern of DISALLOWED_PATH_PATTERNS) {
    if (cleanPath.includes(pattern)) {
      return { valid: false, reason: `URL contiene sección descartada (${pattern}): no corresponde a finanzas de Argentina` };
    }
  }

  // 4c. Enforce economic/financial sections for general interest newspapers (e.g. Infobae -> /economia/)
  const domain = parsed.hostname.replace(/^www\./, '').toLowerCase();
  for (const [mediaDomain, requiredSections] of Object.entries(MEDIA_REQUIRED_SECTIONS)) {
    if (domain === mediaDomain || domain.endsWith(`.${mediaDomain}`)) {
      const hasRequiredSection = requiredSections.some(sec => cleanPath.startsWith(sec) || cleanPath.includes(sec));
      if (!hasRequiredSection) {
        return {
          valid: false,
          reason: `Medio '${domain}' requiere sección económica (${requiredSections.join(', ')}). Ruta actual: ${cleanPath}`
        };
      }
    }
  }

  // 5. Soft-404 check
  if (html && html.length > 0) {
    try {
      const $ = cheerio.load(html.slice(0, 50000));
      const pageTitle = ($('title').text() || '').trim().toLowerCase();
      const h1Text = ($('h1').first().text() || '').trim().toLowerCase();

      const soft404Regex = /(\b404\b|página no encontrada|pagina no encontrada|page not found|no encontramos la página|contenido no disponible|error 404|nota no encontrada)/i;
      if (soft404Regex.test(pageTitle) || soft404Regex.test(h1Text)) {
        return { valid: false, reason: 'Página detectada como soft-404 o nota inexistente' };
      }
    } catch {}
  }

  // 6. Allowed media domain check
  const isAllowed = ALLOWED_MEDIA_DOMAINS.some(allowed => domain === allowed || domain.endsWith(`.${allowed}`));

  if (!isAllowed) {
    return { valid: false, reason: `Dominio '${domain}' no pertenece a la lista de medios autorizados`, domain };
  }

  return { valid: true, domain };
}

export interface ExtractedArticleMeta {
  headline: string;
  publishedTime?: string;
  publishedDateIso?: string;
  publishedTimestamp?: number;
  canonicalUrl: string;
  domain: string;
  mediaName: string;
}

/**
 * Strips media brand suffixes from headlines (e.g. " | Ámbito", " - El Cronista").
 */
function cleanHeadlineText(raw: string): string {
  if (!raw) return '';
  return raw
    .replace(/( \| | - | — | : ).*(Ámbito|El Cronista|Cronista|Infobae|Bloomberg Línea|Bloomberg|La Nación|Clarín|Reuters|EconoJournal|iProfesional|BAE Negocios|Forbes|Perfil|Swissinfo|WSJ|CNBC|Rava|A24).*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizes a date string or timestamp into Argentina timezone.
 */
function parseDateToArgentina(rawDate: string | number | undefined): { isoString: string; displayString: string; timestamp: number } | null {
  if (!rawDate) return null;

  let d: Date;
  if (typeof rawDate === 'number') {
    d = new Date(rawDate);
  } else {
    d = new Date(rawDate);
  }

  if (isNaN(d.getTime())) return null;

  const timeZone = 'America/Argentina/Buenos_Aires';

  const isoParts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(d);

  const timeParts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  }).format(d);

  const displayString = new Intl.DateTimeFormat('es-AR', {
    timeZone,
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit'
  }).format(d);

  return {
    isoString: `${isoParts}T${timeParts}:00-03:00`,
    displayString,
    timestamp: d.getTime()
  };
}

/**
 * Extracts the real headline, publication date, and canonical URL from the article HTML.
 */
export function extractArticleMeta(html: string, finalUrl: string, fallbackTitle?: string): ExtractedArticleMeta | null {
  const $ = cheerio.load(html.slice(0, 100000));

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(finalUrl);
  } catch {
    return null;
  }

  const domain = parsedUrl.hostname.replace(/^www\./, '').toLowerCase();

  // 1. Headline extraction (Priority: og:title -> twitter:title -> <title> -> h1)
  const ogTitle = $('meta[property="og:title"]').attr('content') || $('meta[name="og:title"]').attr('content');
  const twitterTitle = $('meta[name="twitter:title"]').attr('content') || $('meta[property="twitter:title"]').attr('content');
  const tagTitle = $('title').first().text();
  const h1Title = $('h1').first().text();

  let candidateHeadline = cleanHeadlineText(ogTitle || twitterTitle || tagTitle || h1Title || fallbackTitle || '');

  // Prohibit using domain or generic text as headline
  const lowerCandidate = candidateHeadline.toLowerCase();
  const domainRoot = domain.split('.')[0];
  if (
    !candidateHeadline ||
    candidateHeadline.length < 8 ||
    lowerCandidate === domain ||
    lowerCandidate.includes(`${domainRoot}.com`) ||
    lowerCandidate === 'home' ||
    lowerCandidate === 'inicio' ||
    lowerCandidate === 'noticias'
  ) {
    if (fallbackTitle && fallbackTitle.length > 15 && !fallbackTitle.toLowerCase().includes(domainRoot)) {
      candidateHeadline = cleanHeadlineText(fallbackTitle);
    } else {
      return null;
    }
  }

  // Reject headlines with non-financial topics (entertainment, sports, crime, parades, mascots)
  const nonFinancialHeadlineRegex = /(^|[^\p{L}\p{N}])(botargas?|carrera de|maratón|maraton|desfile|recital|concierto|farándula|farandula|espectáculos?|espectaculos?|fútbol|futbol|partido de|champions league|copa libertadores|asesinato|homicidio|femicidio|detenido por|accidente vial|choque en|clima para hoy|pronóstico del tiempo|horóscopo|horoscopo|signos del zodíaco)([^\\p{L}\\p{N}]|$)/iu;
  if (nonFinancialHeadlineRegex.test(candidateHeadline)) {
    return null;
  }

  // 2. Canonical URL extraction
  const canonicalHref = $('link[rel="canonical"]').attr('href') || $('meta[property="og:url"]').attr('content');
  let canonicalUrl = finalUrl;
  if (canonicalHref) {
    try {
      canonicalUrl = new URL(canonicalHref, finalUrl).toString();
    } catch {
      canonicalUrl = finalUrl;
    }
  }
  // Remove marketing UTM params from canonical
  try {
    const cUrl = new URL(canonicalUrl);
    ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'fbclid', 'gclid'].forEach(p => cUrl.searchParams.delete(p));
    canonicalUrl = cUrl.toString();
  } catch {}

  // 3. Publication Date extraction (JSON-LD -> meta tags -> <time> -> URL pattern)
  let rawDate: string | undefined = undefined;

  // JSON-LD
  $('script[type="application/ld+json"]').each((_, el) => {
    if (rawDate) return;
    try {
      const text = $(el).text();
      const parsed = JSON.parse(text);
      const items = Array.isArray(parsed) ? parsed : [parsed];
      for (const item of items) {
        if (!item) continue;
        if (item.datePublished) {
          rawDate = item.datePublished;
          break;
        }
        if (Array.isArray(item['@graph'])) {
          const match = item['@graph'].find((g: any) => g && (g.datePublished || g.dateCreated));
          if (match) {
            rawDate = match.datePublished || match.dateCreated;
            break;
          }
        }
        if (item.dateCreated) {
          rawDate = item.dateCreated;
          break;
        }
      }
    } catch {}
  });

  // Meta tags if JSON-LD didn't have datePublished
  if (!rawDate) {
    rawDate =
      $('meta[property="article:published_time"]').attr('content') ||
      $('meta[property="og:article:published_time"]').attr('content') ||
      $('meta[name="date"]').attr('content') ||
      $('meta[name="pubdate"]').attr('content') ||
      $('meta[name="publish_date"]').attr('content') ||
      $('meta[name="publication_date"]').attr('content') ||
      $('meta[name="sailthru.date"]').attr('content') ||
      $('time[datetime]').attr('datetime');
  }

  // URL pattern fallback (e.g. /2026/10/20/ or -20261020-)
  if (!rawDate) {
    const ymdMatch = finalUrl.match(/\/(\d{4})\/(\d{1,2})\/(\d{1,2})\//);
    if (ymdMatch) {
      rawDate = `${ymdMatch[1]}-${ymdMatch[2].padStart(2, '0')}-${ymdMatch[3].padStart(2, '0')}T12:00:00-03:00`;
    }
  }

  const dateResult = parseDateToArgentina(rawDate);
  const mediaName = getMediaNameFromDomain(domain, candidateHeadline);

  return {
    headline: candidateHeadline,
    publishedTime: dateResult?.displayString,
    publishedDateIso: dateResult?.isoString,
    publishedTimestamp: dateResult?.timestamp,
    canonicalUrl,
    domain,
    mediaName
  };
}

export interface VerifiedSourceResult {
  verified: boolean;
  discardReason?: string;
  source?: MediaCoverage & {
    canonicalUrl: string;
    publishedTimestamp?: number;
    publishedDateIso?: string;
  };
}

// In-memory URL verification cache (TTL 6 hours)
const urlVerificationCache = new Map<string, { result: VerifiedSourceResult; timestamp: number }>();
const VERIFICATION_CACHE_TTL_MS = 6 * 60 * 60 * 1000;

/**
 * Verifies a source URL through the complete verification pipeline with 6-hour caching and debug logs.
 */
export async function verifySourceUrl(
  rawUri: string,
  rawTitle?: string
): Promise<VerifiedSourceResult> {
  const cached = urlVerificationCache.get(rawUri);
  if (cached && Date.now() - cached.timestamp < VERIFICATION_CACHE_TTL_MS) {
    return cached.result;
  }

  // 1. Resolve final URL (following redirects)
  const resolved = await resolveFinalUrl(rawUri, 5000);
  if (!resolved) {
    const fail: VerifiedSourceResult = {
      verified: false,
      discardReason: 'Fallo de conexión o timeout al resolver la URL'
    };
    console.log(`[SOURCE DISCARDED] reason="${fail.discardReason}" rawUri="${rawUri}"`);
    urlVerificationCache.set(rawUri, { result: fail, timestamp: Date.now() });
    return fail;
  }

  const { finalUrl, responseStatus, contentType, html } = resolved;

  // 2. Validate URL criteria
  const validation = validateArticleUrl(finalUrl, responseStatus, contentType, html);
  if (!validation.valid) {
    const fail: VerifiedSourceResult = {
      verified: false,
      discardReason: validation.reason
    };
    console.log(`[SOURCE DISCARDED] reason="${validation.reason}" rawUri="${rawUri}" finalUrl="${finalUrl}"`);
    urlVerificationCache.set(rawUri, { result: fail, timestamp: Date.now() });
    return fail;
  }

  // 3. Extract metadata (title & date)
  const meta = extractArticleMeta(html, finalUrl, rawTitle);
  if (!meta) {
    const fail: VerifiedSourceResult = {
      verified: false,
      discardReason: 'No se pudo extraer titular válido del HTML de la nota'
    };
    console.log(`[SOURCE DISCARDED] reason="${fail.discardReason}" rawUri="${rawUri}" finalUrl="${finalUrl}"`);
    urlVerificationCache.set(rawUri, { result: fail, timestamp: Date.now() });
    return fail;
  }

  // Check if date could be extracted
  if (!meta.publishedDateIso) {
    const fail: VerifiedSourceResult = {
      verified: false,
      discardReason: 'No se pudo extraer la fecha de publicación del HTML de la nota'
    };
    console.log(`[SOURCE DISCARDED] reason="${fail.discardReason}" rawUri="${rawUri}" finalUrl="${finalUrl}"`);
    urlVerificationCache.set(rawUri, { result: fail, timestamp: Date.now() });
    return fail;
  }

  const success: VerifiedSourceResult = {
    verified: true,
    source: {
      mediaName: meta.mediaName,
      originalHeadline: meta.headline,
      sourceUrl: finalUrl, // STRICTLY the canonical resolved final URL, NEVER vertexaisearch
      publishedTime: meta.publishedTime,
      publishedDateIso: meta.publishedDateIso,
      publishedTimestamp: meta.publishedTimestamp,
      canonicalUrl: meta.canonicalUrl,
      domain: meta.domain
    }
  };

  console.log(`[SOURCE ACCEPTED] media="${meta.mediaName}" title="${meta.headline}" date="${meta.publishedTime}" url="${finalUrl}"`);
  urlVerificationCache.set(rawUri, { result: success, timestamp: Date.now() });
  urlVerificationCache.set(finalUrl, { result: success, timestamp: Date.now() });
  urlVerificationCache.set(meta.canonicalUrl, { result: success, timestamp: Date.now() });

  return success;
}

/**
 * Filter by Freshness:
 * - Accepts notes published today (primary window in Argentina date).
 * - If fewer than 3 notes from today, expands to last 48 hours and displays the real date.
 * - Discards any note without a confirmed date.
 * - Discards any news item that ends up with 0 verified sources.
 * - Returns [] if no fresh verified news remain.
 */
export function filterByFreshness(newsList: NewsItem[], now = new Date()): NewsItem[] {
  const argInfo = getArgentinaDateInfo(now);
  const todayYMD = argInfo.isoDate; // "YYYY-MM-DD" in Argentina
  const cutoff48h = now.getTime() - 48 * 60 * 60 * 1000;

  // Helper to check if source date is from today
  const isFromToday = (src: MediaCoverage): boolean => {
    const iso = (src as any).publishedDateIso;
    if (typeof iso === 'string' && iso.startsWith(todayYMD)) return true;
    const timeStr = src.publishedTime || '';
    return timeStr.includes(`${argInfo.day} de`) || timeStr.includes(argInfo.formattedSpanish);
  };

  // Helper to check if source date is within 48h
  const isWithin48h = (src: MediaCoverage): boolean => {
    const ts = (src as any).publishedTimestamp;
    if (typeof ts === 'number' && !isNaN(ts)) {
      return ts >= cutoff48h;
    }
    const iso = (src as any).publishedDateIso;
    if (typeof iso === 'string') {
      const d = new Date(iso);
      if (!isNaN(d.getTime())) return d.getTime() >= cutoff48h;
    }
    // If from today, obviously within 48h
    return isFromToday(src);
  };

  // 1. Sanitize each news item by filtering its sources
  const cleanedNews = newsList.map(item => {
    const validSources = (item.sources || []).filter(src => {
      // Must have verified sourceUrl (not vertex redirect) and confirmed publication date
      const hasDate = Boolean((src as any).publishedDateIso || src.publishedTime);
      return Boolean(src && src.sourceUrl && !src.sourceUrl.includes('vertexaisearch') && hasDate);
    });

    return {
      ...item,
      sources: validSources,
      coverageCount: validSources.length
    };
  }).filter(item => item.sources.length > 0);

  // 2. Count news items with coverage from Today
  const todayItems = cleanedNews.map(item => {
    const todaySources = item.sources.filter(isFromToday);
    return {
      ...item,
      sources: todaySources,
      coverageCount: todaySources.length
    };
  }).filter(item => item.sources.length > 0);

  // 3. Primary window: Today. If >= 3 news items from today, use todayItems.
  if (todayItems.length >= 3) {
    console.log(`[FRESHNESS FILTER] Keeping ${todayItems.length} news items published TODAY (${todayYMD}).`);
    return todayItems;
  }

  // 4. Expansion window: Last 48 hours if fewer than 3 items from today
  console.log(`[FRESHNESS FILTER] Fewer than 3 news items from today (${todayItems.length} found). Expanding window to last 48 hours.`);
  const items48h = cleanedNews.map(item => {
    const sources48h = item.sources.filter(isWithin48h);
    return {
      ...item,
      sources: sources48h,
      coverageCount: sources48h.length
    };
  }).filter(item => item.sources.length > 0);

  return items48h;
}

/**
 * Clears URL verification cache (used on daily rollover).
 */
export function purgeUrlVerificationCache(): void {
  urlVerificationCache.clear();
}
