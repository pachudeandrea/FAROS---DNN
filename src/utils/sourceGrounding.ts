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

/**
 * Removes newspaper branding suffixes, accents, and normalizes text for entity and event comparison.
 */
export function cleanHeadlineText(headline: string): string {
  if (!headline) return '';
  return headline
    .replace(/\s*[-–—|]\s*(Ámbito|El Cronista|Cronista|Infobae|Clarín|Clarin|La Nación|La Nacion|Bloomberg Línea|Bloomberg|Reuters|EconoJournal|iProfesional|BAE Negocios|Perfil).*$/i, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^\w\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

const STOP_AND_GENERIC_WORDS = new Set([
  'de', 'la', 'que', 'el', 'en', 'y', 'a', 'los', 'del', 'se', 'las', 'por', 'un', 'para', 'con', 'no',
  'una', 'su', 'al', 'lo', 'como', 'mas', 'pero', 'sus', 'le', 'ya', 'o', 'fue', 'este', 'ha', 'si',
  'porque', 'esta', 'son', 'entre', 'era', 'sobre', 'ser', 'cada', 'tras', 'ante', 'contra', 'durante',
  'mediante', 'hacia', 'sin', 'muy', 'hasta', 'desde', 'segun', 'tambien', 'esto', 'estos', 'estas',
  'hoy', 'ayer', 'dia', 'dias', 'semana', 'mes', 'ano', 'anos', 'nuevo', 'nueva', 'nuevos', 'nuevas',
  'argentina', 'argentino', 'argentinos', 'argentinas', 'pais', 'local', 'locales', 'mercado', 'mercados',
  'economia', 'economico', 'economica', 'economicos', 'economicas', 'financiero', 'financiera', 'clave'
]);

/**
 * Extracts key specific tokens (words length >= 4 that are not common noise)
 */
function extractMeaningfulTokens(text: string): Set<string> {
  const words = cleanHeadlineText(text).split(' ');
  const tokens = new Set<string>();
  for (const w of words) {
    if (w.length >= 3 && !STOP_AND_GENERIC_WORDS.has(w)) {
      tokens.add(w);
    }
  }
  return tokens;
}

/**
 * Incompatible event domain signatures:
 * Prevents false-positive groupings between completely disparate topics that happen to share generic words like "tasa" or "dólar".
 */
interface DomainRule {
  name: string;
  matches: (text: string) => boolean;
  incompatibleWith: string[];
}

const INCOMPATIBLE_DOMAIN_RULES: DomainRule[] = [
  {
    name: 'us_wall_street_indices',
    matches: (t) => /dow jones|s&p|sp 500|nasdaq|wall street|bolsas de ny|acciones en nueva york/i.test(t),
    incompatibleWith: ['arg_mortgages_credit', 'arg_bcra_reserves', 'arg_oil_vaca_muerta', 'arg_retail_fuel']
  },
  {
    name: 'arg_mortgages_credit',
    matches: (t) => /credito hipotecario|creditos hipotecarios|creditos uva|prestamos hipotecarios|credito para vivienda/i.test(t),
    incompatibleWith: ['us_wall_street_indices', 'arg_sovereign_bonds_risk', 'arg_oil_vaca_muerta', 'arg_retail_fuel']
  },
  {
    name: 'arg_bcra_reserves',
    matches: (t) => /(bcra|banco central).*compr(o|a|as).*reserva|reservas.*(bcra|banco central)|compras netas.*mulc/i.test(t),
    incompatibleWith: ['us_wall_street_indices', 'arg_mortgages_credit', 'arg_retail_fuel']
  },
  {
    name: 'arg_retail_fuel',
    matches: (t) => /surtidor|aumento de nafta|precio de la nafta|precio del combustible|estaciones de servicio|naftas y gasoil/i.test(t),
    incompatibleWith: ['arg_oil_pipeline_infra', 'us_wall_street_indices', 'arg_mortgages_credit', 'arg_sovereign_bonds_risk']
  },
  {
    name: 'arg_oil_pipeline_infra',
    matches: (t) => /oleoducto|gasoducto|vaca muerta sur|duplicar capacidad|transporte de crudo|obra de evacuacion/i.test(t),
    incompatibleWith: ['arg_retail_fuel', 'arg_mortgages_credit', 'us_wall_street_indices']
  },
  {
    name: 'arg_sovereign_bonds_risk',
    matches: (t) => /riesgo pais.*(cae|baja|sube|minimos)|bonos.*dolares.*(suben|trepan|caen)|paridades.*(al30|gd30)/i.test(t),
    incompatibleWith: ['arg_mortgages_credit', 'arg_retail_fuel']
  }
];

/**
 * Strict validation: Determines whether two articles report on the exact same concrete event.
 *
 * Rules:
 * 1. Checks for topic/domain incompatibilities (e.g. Wall Street vs Mortgage Loans).
 * 2. Compares core entity and specific action overlap.
 * 3. Enforces significant Jaccard lexical overlap of non-stop words.
 * 4. Defaults to FALSE if relation is doubtful.
 */
export function areSourcesReportingSameEvent(headlineA: string, headlineB: string): boolean {
  if (!headlineA || !headlineB) return false;

  const cleanA = cleanHeadlineText(headlineA);
  const cleanB = cleanHeadlineText(headlineB);

  // Exact or near-identical headline
  if (cleanA === cleanB) return true;

  // 1. Check domain incompatibility rules
  for (const rule of INCOMPATIBLE_DOMAIN_RULES) {
    const aMatches = rule.matches(cleanA);
    const bMatches = rule.matches(cleanB);

    if (aMatches && !bMatches) {
      for (const incomp of rule.incompatibleWith) {
        const incompRule = INCOMPATIBLE_DOMAIN_RULES.find(r => r.name === incomp);
        if (incompRule && incompRule.matches(cleanB)) {
          return false; // Direct incompatibility detected!
        }
      }
    } else if (!aMatches && bMatches) {
      for (const incomp of rule.incompatibleWith) {
        const incompRule = INCOMPATIBLE_DOMAIN_RULES.find(r => r.name === incomp);
        if (incompRule && incompRule.matches(cleanA)) {
          return false; // Direct incompatibility detected!
        }
      }
    }
  }

  // 2. Extract meaningful tokens
  const tokensA = extractMeaningfulTokens(headlineA);
  const tokensB = extractMeaningfulTokens(headlineB);

  if (tokensA.size === 0 || tokensB.size === 0) return false;

  // Intersect tokens
  const intersection = new Set<string>();
  for (const t of tokensA) {
    if (tokensB.has(t)) {
      intersection.add(t);
    }
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  const jaccard = unionSize > 0 ? intersection.size / unionSize : 0;

  // High Jaccard similarity across content words (>= 0.40) is strong evidence of same event
  if (jaccard >= 0.40 && intersection.size >= 3) {
    return true;
  }

  // 3. Specific Anchor Entities and Event Action Match
  const KEY_ANCHORS = [
    { entity: /(bcra|banco central)/, actions: [/(compr[oóa]|adquiri[oó]|reservas|acumul[oó]|mulc)/, /(tasa|politica monetaria|encajes|lefi)/] },
    { entity: /(ypf|petroleras?)/, actions: [/(oleoducto|vaca muerta sur|transporte|exportacion|puerto)/, /(nafta|combustible|surtidor|aumento)/, /(balance|ganancia|ebitda)/] },
    { entity: /(al30|gd30|bonos en dolares|deuda soberana)/, actions: [/(riesgo pais|paridades|suba|trepan|caen|wall street)/, /(licitacion|amortizacion|canje|rescate)/] },
    { entity: /(dolar mep|dolar ccl|dolar blue|brecha)/, actions: [/(sube|trepa|presion|baja|cae|brecha|parking|cnv)/] },
    { entity: /(credito hipotecario|creditos uva|prestamos)/, actions: [/(bancos|tasa|vivienda|lanzan|relanzan|lineas)/] },
    { entity: /(indec|inflacion|ipc)/, actions: [/(costo de vida|desacelera|sube|porcentaje|dato|octubre|noviembre)/] },
    { entity: /(dow jones|s&p|nasdaq|wall street)/, actions: [/(cierran|abren|suben|caen|tasas de la fed|powell)/] }
  ];

  for (const anchor of KEY_ANCHORS) {
    const matchA = anchor.entity.test(cleanA);
    const matchB = anchor.entity.test(cleanB);

    if (matchA && matchB) {
      // Both match the same anchor entity. Check if they also match the SAME specific action subcategory:
      for (const act of anchor.actions) {
        const actA = act.test(cleanA);
        const actB = act.test(cleanB);
        if (actA && actB) {
          // Both match the exact same action category for the entity!
          return true;
        }
        // If one matches an action category and the other matches a DIFFERENT action category for the same entity:
        if (actA !== actB) {
          // e.g. YPF pipeline vs YPF fuel pump increase: reject!
          const otherActMatches = anchor.actions.some(otherAct => otherAct !== act && (actA ? otherAct.test(cleanB) : otherAct.test(cleanA)));
          if (otherActMatches) {
            return false;
          }
        }
      }
    }
  }

  // If intersection has at least 3 distinct meaningful keywords and Jaccard >= 0.30
  if (intersection.size >= 3 && jaccard >= 0.30) {
    return true;
  }

  // When in doubt, DO NOT GROUP!
  return false;
}

/**
 * Filters a candidate list of sources for a specific news item headline.
 * Ensures that EVERY retained source genuinely discusses that specific event.
 * If secondary sources do not report on the same event as the primary source/headline,
 * they are removed, returning only the authentic coherent sources (even if just 1).
 */
export function validateAndFilterSourcesForHeadline(
  primaryHeadline: string,
  sources: MediaCoverage[]
): MediaCoverage[] {
  if (!sources || sources.length === 0) return [];
  if (sources.length === 1) return sources;

  const validSources = sanitizeGroundingSources(sources);
  if (validSources.length <= 1) return validSources;

  const anchorHeadline = primaryHeadline || validSources[0].originalHeadline;
  const coherentSources: MediaCoverage[] = [validSources[0]];

  for (let i = 1; i < validSources.length; i++) {
    const candidate = validSources[i];
    const isCoherentWithAnchor = areSourcesReportingSameEvent(anchorHeadline, candidate.originalHeadline);
    const isCoherentWithFirstSource = areSourcesReportingSameEvent(validSources[0].originalHeadline, candidate.originalHeadline);

    if (isCoherentWithAnchor || isCoherentWithFirstSource) {
      coherentSources.push(candidate);
    } else {
      console.log(`[COHERENCE FILTER] Discarded incompatible source "${candidate.originalHeadline}" (${candidate.mediaName}) from news "${anchorHeadline}".`);
    }
  }

  return coherentSources;
}

