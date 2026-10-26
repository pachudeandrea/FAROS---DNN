import { MediaCoverage } from '../types';

export const DOMAIN_MEDIA_MAP: Record<string, string> = {
  'cronista.com': 'El Cronista',
  'ambito.com': 'Ámbito',
  'infobae.com': 'Infobae',
  'bloomberglinea.com': 'Bloomberg Línea',
  'lanacion.com.ar': 'La Nación',
  'clarin.com': 'Clarín',
  'reuters.com': 'Reuters',
  'econojournal.com.ar': 'EconoJournal',
  'iprofesional.com': 'iProfesional',
  'eleconomista.com.ar': 'El Economista',
  'baenegocios.com': 'BAE Negocios',
  'forbesargentina.com': 'Forbes Argentina',
  'perfil.com': 'Perfil',
  'wsj.com': 'The Wall Street Journal',
  'bloomberg.com': 'Bloomberg',
  'ft.com': 'Financial Times',
  'cnbc.com': 'CNBC',
  'rava.com': 'Rava Bursátil',
  'adnsur.com.ar': 'ADN Sur',
  'swissinfo.ch': 'Swissinfo',
  'ypf.com': 'YPF Oficial',
  'bcra.gob.ar': 'BCRA Oficial',
  'a24.com': 'A24',
  'rionegro.com.ar': 'Diario Río Negro',
  'diarioelnorte.com.ar': 'El Norte'
};

/**
 * Validates if a URL is a legitimate article link (https with path, not just homepage/root domain).
 */
export function isValidArticleUrl(url: string | undefined): boolean {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('https://')) return false;

  try {
    const parsed = new URL(url);
    // Vertex grounding redirects are specifically valid
    if (parsed.hostname.includes('vertexaisearch.cloud.google.com')) {
      return parsed.pathname.length > 5;
    }

    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    // Must have a path, not just the root domain
    if (!cleanPath || cleanPath === '/' || cleanPath === '') {
      return false;
    }

    // Exclude generic root sections without article path
    const genericSections = [
      '/economia',
      '/finanzas',
      '/finanzas-mercados',
      '/mercados',
      '/negocios',
      '/latinoamerica'
    ];
    if (genericSections.includes(cleanPath)) {
      return false;
    }

    // Exclude foreign editions and non-financial topics
    const disallowedPatterns = [
      '/mexico/', '/colombia/', '/peru/', '/espana/', '/america/', '/estados-unidos/',
      '/deportes/', '/entretenimiento/', '/teleshow/', '/sociedad/', '/policiales/',
      '/espectaculos/', '/virales/', '/autos/', '/turismo/', '/cultura/', '/horoscopo/'
    ];
    const lowerPath = cleanPath.toLowerCase();
    if (disallowedPatterns.some(p => lowerPath.includes(p))) {
      return false;
    }

    // Infobae must be in /economia/
    const host = parsed.hostname.toLowerCase();
    if (host.includes('infobae.com') && !lowerPath.includes('/economia/')) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Derives the media name from domain according to the mapping or falls back to domain.
 */
export function getMediaNameFromDomain(domain: string, title?: string): string {
  const cleanDomain = domain.toLowerCase().replace(/^www\./, '').trim();

  for (const [key, name] of Object.entries(DOMAIN_MEDIA_MAP)) {
    if (cleanDomain.includes(key)) {
      return name;
    }
  }

  // If domain is vertex redirect, infer from title if available
  if (cleanDomain.includes('vertexaisearch') && title) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('cronista')) return 'El Cronista';
    if (lowerTitle.includes('ámbito') || lowerTitle.includes('ambito')) return 'Ámbito';
    if (lowerTitle.includes('infobae')) return 'Infobae';
    if (lowerTitle.includes('bloomberg línea') || lowerTitle.includes('bloomberg linea')) return 'Bloomberg Línea';
    if (lowerTitle.includes('la nación') || lowerTitle.includes('la nacion')) return 'La Nación';
    if (lowerTitle.includes('clarín') || lowerTitle.includes('clarin')) return 'Clarín';
    if (lowerTitle.includes('reuters')) return 'Reuters';
    if (lowerTitle.includes('econojournal')) return 'EconoJournal';
    if (lowerTitle.includes('iprofesional')) return 'iProfesional';
    if (lowerTitle.includes('bae negocios')) return 'BAE Negocios';
    if (lowerTitle.includes('ypf')) return 'YPF Oficial';
    if (lowerTitle.includes('bcra')) return 'BCRA Oficial';
  }

  return cleanDomain || 'Medio financiero';
}

/**
 * Normalizes a list of grounding sources, ensuring every source is real, unique, and has a valid URL.
 */
export function sanitizeGroundingSources(sources: MediaCoverage[]): MediaCoverage[] {
  const validSources: MediaCoverage[] = [];
  const seenUrls = new Set<string>();
  const seenTitles = new Set<string>();

  for (const src of sources) {
    if (!isValidArticleUrl(src.sourceUrl)) {
      continue;
    }

    // Deduplicate identical URLs or identical titles
    const normalizedUrl = src.sourceUrl.trim();
    const normalizedTitle = (src.originalHeadline || '').trim().toLowerCase();

    if (seenUrls.has(normalizedUrl) || (normalizedTitle && seenTitles.has(normalizedTitle))) {
      continue;
    }

    seenUrls.add(normalizedUrl);
    if (normalizedTitle) seenTitles.add(normalizedTitle);

    validSources.push({
      mediaName: src.mediaName,
      originalHeadline: src.originalHeadline,
      sourceUrl: normalizedUrl,
      publishedTime: src.publishedTime && src.publishedTime !== 'Hoy' ? src.publishedTime : undefined,
      domain: src.domain
    });
  }

  return validSources;
}
