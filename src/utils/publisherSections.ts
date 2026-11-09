import * as cheerio from 'cheerio';
import { resolveFinalUrl, DISALLOWED_PATH_PATTERNS, PUBLISHER_ARTICLE_PATHS } from './urlResolver.js';

export const COVERAGE_PUBLISHERS = [
  { domain: 'ambito.com', sections: ['https://www.ambito.com/finanzas/', 'https://www.ambito.com/economia/'] },
  { domain: 'cronista.com', sections: ['https://www.cronista.com/finanzas-mercados/', 'https://www.cronista.com/economia-politica/'] },
  { domain: 'infobae.com', sections: ['https://www.infobae.com/economia/'] },
  { domain: 'lanacion.com.ar', sections: ['https://www.lanacion.com.ar/economia/'] },
  { domain: 'clarin.com', sections: ['https://www.clarin.com/economia/'] },
  { domain: 'iprofesional.com', sections: ['https://www.iprofesional.com/finanzas', 'https://www.iprofesional.com/economia'] },
  { domain: 'pagina12.com.ar', sections: ['https://www.pagina12.com.ar/economia/', 'https://www.pagina12.com.ar/secciones/economia'] },
  { domain: 'perfil.com', sections: ['https://www.perfil.com/economia', 'https://www.perfil.com/seccion/economia'] },
  { domain: 'eldestapeweb.com', sections: ['https://www.eldestapeweb.com/economia'] },
  { domain: 'tiempoar.com.ar', sections: ['https://www.tiempoar.com.ar/economia/'] },
  { domain: 'eleconomista.com.ar', sections: ['https://eleconomista.com.ar/economia/', 'https://eleconomista.com.ar/finanzas/'] },
  { domain: 'econojournal.com.ar', sections: ['https://econojournal.com.ar/'] }
];
export interface PublicationCandidate { publisher: string; url: string; title: string }
export interface SectionReport { publisher: string; section: string; status: string; found: number; accepted: number }

/** Section titles rank candidates only. Evidence always comes from the article. */
export function extractSectionCandidates(html: string, section: string, publisher: string): PublicationCandidate[] {
  const $ = cheerio.load(html);
  const found = new Map<string, PublicationCandidate>();
  const accept = (raw: unknown, headline: unknown) => {
    if (typeof raw !== 'string' || typeof headline !== 'string') return;
    try {
      const url = new URL(raw, section);
      if (url.protocol !== 'https:' || url.username || url.password || url.port || !(url.hostname === publisher || url.hostname === `www.${publisher}`)) return;
      if (DISALLOWED_PATH_PATTERNS.some(path => url.pathname.toLowerCase().includes(path))) return;
      const articlePath = PUBLISHER_ARTICLE_PATHS[publisher] || (publisher === 'infobae.com' ? /^\/economia\/\d{4}\/\d{2}\/\d{2}\/[^/]+\/?$/
        : /^\/(?:finanzas|economia|finanzas-mercados|economia-politica|negocios|energia)\/[^/]+/);
      if (!articlePath.test(url.pathname)) return;
      const title = headline.replace(/\s+/g, ' ').trim().slice(0, 300);
      if (title.length < 20) return;
      url.hash = ''; url.search = '';
      if (found.size >= 150 && !found.has(url.href)) return;
      if (!found.has(url.href) || found.get(url.href)!.title.length < title.length) found.set(url.href, { publisher, url: url.href, title });
    } catch {}
  };
  $('a[href]').each((_, node) => {
    const link = $(node);
    accept(link.attr('href'), link.find('h1,h2,h3,h4').first().text() || link.attr('title') || link.attr('aria-label') || link.text());
  });
  // Some publishers render their section index in structured data.
  let visited = 0;
  const walk = (node: unknown, depth = 0): void => {
    if (!node || typeof node !== 'object' || depth > 10 || visited++ > 3000) return;
    const record = node as Record<string, unknown>;
    accept(record.url || record['@id'], record.headline || record.name);
    for (const child of Object.values(record)) walk(child, depth + 1);
  };
  $('script[type="application/ld+json"]').each((_, node) => { try { walk(JSON.parse($(node).text())); } catch {} });
  return [...found.values()];
}

export async function collectPublisherSections(publishers: typeof COVERAGE_PUBLISHERS, reports: SectionReport[], signal: AbortSignal): Promise<PublicationCandidate[]> {
  const batches = await Promise.all(publishers.flatMap(publisher => publisher.sections.map(async section => {
    const report: SectionReport = { publisher: publisher.domain, section: new URL(section).pathname, status: 'pending', found: 0, accepted: 0 };
    reports.push(report);
    const response = await resolveFinalUrl(section, 5000, signal, publisher.domain);
    if (!response) { report.status = signal.aborted ? 'timeout' : 'unavailable'; return []; }
    if (response.responseStatus !== 200 || !response.contentType.includes('text/html')) { report.status = 'invalid_response'; return []; }
    const candidates = extractSectionCandidates(response.html, section, publisher.domain);
    report.status = candidates.length ? 'ok' : 'empty';
    report.found = candidates.length; report.accepted = candidates.length;
    return candidates;
  })));
  return [...new Map(batches.flat().map(candidate => [candidate.url, candidate])).values()];
}
