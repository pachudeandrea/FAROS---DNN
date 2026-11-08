import test from 'node:test';
import assert from 'node:assert/strict';
import { COVERAGE_PUBLISHERS, extractSectionCandidates } from '../src/utils/publisherSections.ts';
import { validateArticleUrl, verifySourceUrl, purgeUrlVerificationCache } from '../src/utils/urlResolver.ts';
import { getMediaNameFromDomain, getPublisherKey, isValidArticleUrl } from '../src/utils/sourceGrounding.ts';

const additions = [
  { domain: 'pagina12.com.ar', name: 'Página/12', path: '/786757-ypf-presenta-sus-resultados-del-trimestre', rejected: '/secciones/economia' },
  { domain: 'perfil.com', name: 'Perfil', path: '/noticias/economia/ypf-presenta-sus-resultados-del-trimestre.phtml', rejected: '/seccion/economia' },
  { domain: 'eldestapeweb.com', name: 'El Destape', path: '/economia/ypf/ypf-presenta-sus-resultados-del-trimestre-2026118143600', rejected: '/economia/ypf' },
  { domain: 'tiempoar.com.ar', name: 'Tiempo Argentino', path: '/ta_article/ypf-presenta-sus-resultados-del-trimestre/', rejected: '/economia/' },
  { domain: 'eleconomista.com.ar', name: 'El Economista', path: '/finanzas/ypf-presenta-sus-resultados-del-trimestre-n123456', rejected: '/finanzas/' },
  { domain: 'econojournal.com.ar', name: 'EconoJournal', path: '/2026/11/ypf-presenta-sus-resultados-del-trimestre/', rejected: '/2026/11/' }
];
const title = 'YPF presenta sus resultados del trimestre y explica su producción';

test('la recopilación tiene al menos doce medios argentinos distintos y seis incorporaciones con índices propios', () => {
  const domains = new Set(COVERAGE_PUBLISHERS.map(publisher => publisher.domain));
  assert.ok(domains.size >= 12);
  assert.equal(domains.size, COVERAGE_PUBLISHERS.length, 'No contar dos secciones del mismo medio como medios diferentes');
  for (const addition of additions) {
    const publisher = COVERAGE_PUBLISHERS.find(publisher => publisher.domain === addition.domain)!;
    assert.ok(publisher?.sections.length, addition.domain);
    assert.ok(publisher.sections.every(section => new URL(section).hostname.replace(/^www\./, '') === addition.domain));
  }
});

test('cada medio nuevo extrae artículos propios y excluye secciones, impostores y enlaces ajenos', () => {
  for (const addition of additions) {
    const section = COVERAGE_PUBLISHERS.find(publisher => publisher.domain === addition.domain)!.sections[0];
    const url = new URL(addition.path, section).href;
    const html = `<a href="${addition.path}?utm_source=test"><h2>${title}</h2></a>
      <a href="${addition.path}">${title}</a>
      <a href="${addition.rejected}">${title}</a>
      <a href="https://www.${addition.domain}.example.org${addition.path}">${title}</a>
      <a href="https://user:password@www.${addition.domain}${addition.path}">${title}</a>
      <a href="https://www.${addition.domain}:8443${addition.path}">${title}</a>
      <a href="https://www.ambito.com/finanzas/otra-noticia">${title}</a>`;
    const candidates = extractSectionCandidates(html, section, addition.domain);
    assert.deepEqual(candidates, [{ publisher: addition.domain, url, title }], addition.domain);
    assert.equal(validateArticleUrl(url, 200, 'text/html', `<title>${title}</title>`).valid, true, addition.domain);
    assert.equal(validateArticleUrl(`https://www.${addition.domain}${addition.rejected}`, 200, 'text/html', `<title>${title}</title>`).valid, false);
  }
});

test('la verificación de los seis medios usa el título, fecha y evidencia del artículo original', async () => {
  const previousFetch = globalThis.fetch;
  purgeUrlVerificationCache();
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input); calls.push(url);
    const addition = additions.find(addition => new URL(url).hostname === `www.${addition.domain}`)!;
    assert.ok(addition, 'La prueba no hace solicitudes externas');
    return new Response(`<html><head><meta property="og:title" content="${title}">
      <meta property="og:description" content="YPF aumentó su producción de petróleo durante el trimestre.">
      <meta property="article:published_time" content="2026-11-08T15:00:00-03:00">
      <link rel="canonical" href="${url}"></head><body><h1>${title}</h1></body></html>`, { headers: { 'Content-Type': 'text/html' } });
  };
  try {
    for (const addition of additions) {
      const url = `https://www.${addition.domain}${addition.path}`;
      const result = await verifySourceUrl(url, 'Un título propuesto distinto', undefined, addition.domain);
      assert.equal(result.verified, true, addition.domain);
      assert.equal(result.source?.originalHeadline, title);
      assert.equal(result.source?.mediaName, addition.name);
      assert.equal(result.source?.publishedTimestamp, Date.parse('2026-11-08T15:00:00-03:00'));
      assert.match(result.source?.articleSummary || '', /YPF aumentó su producción/);
      assert.equal(result.source?.sourceUrl, url);
      assert.equal(getPublisherKey(result.source!), addition.domain);
      assert.equal(getMediaNameFromDomain(`${addition.domain}.example.org`), `${addition.domain}.example.org`);
    }
    assert.equal(calls.length, additions.length);
  } finally { globalThis.fetch = previousFetch; purgeUrlVerificationCache(); }
});

test('las portadas nuevas y los artículos no financieros no son fuentes de una noticia', () => {
  for (const url of [
    'https://www.pagina12.com.ar/secciones/economia',
    'https://www.perfil.com/seccion/economia',
    'https://www.eldestapeweb.com/sociedad/ypf-cultura-2026118143600',
    'https://www.tiempoar.com.ar/cultura/ypf-patrocina-un-festival/',
    'https://eleconomista.com.ar/deportes/un-partido-n123456',
    'https://econojournal.com.ar/2026/11/'
  ]) assert.equal(validateArticleUrl(url, 200, 'text/html', '<title>Información financiera de YPF y sus resultados</title>').valid, false, url);
  assert.equal(isValidArticleUrl('https://www.pagina12.com.ar/secciones/economia'), false);
  assert.equal(isValidArticleUrl('https://www.perfil.com/seccion/economia'), false);
});
