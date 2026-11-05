import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import type { NewsItem, MediaCoverage } from '../src/types/index.js';
import { discoverMissingCoverage, createCoverageDiscoveryDiagnostics } from '../src/utils/coverageDiscovery.js';
import { extractSectionCandidates } from '../src/utils/publisherSections.js';
import { purgeUrlVerificationCache } from '../src/utils/urlResolver.js';

const topics = [
  ['El BCRA compró USD 125 millones y sumó reservas', 'El Banco Central adquirió USD 125 millones y elevó sus reservas'],
  ['El BCRA mantiene las tasas de interés al 40%', 'La autoridad monetaria dejó sin cambios la tasa de interés al 40%'],
  ['El INDEC publicó la inflación de octubre en 3,5%', 'Inflación de octubre: el INDEC informó un 3.5 por ciento'],
  ['YPF inauguró el oleoducto Vaca Muerta Sur', 'YPF inauguró Vaca Muerta Sur y amplió el transporte de crudo'],
  ['El Banco Galicia lanzó créditos hipotecarios UVA para vivienda', 'Galicia relanzó los créditos hipotecarios UVA para vivienda'],
  ['Apple publicó sus ganancias trimestrales y el balance', 'Apple presentó su balance de ganancias trimestrales']
];
const at = new Date(Date.now() - 60000).toISOString();
const source = (headline: string, index: number): MediaCoverage => ({ mediaName: 'Ámbito', originalHeadline: headline, sourceUrl: `https://www.ambito.com/finanzas/broad-${index}`, publishedDateIso: at, publishedTimestamp: Date.parse(at) });
const items = () => topics.map(([headline], index) => ({ id: `event-${index}`, headline, sources: [source(headline, index)], coverageCount: 1, affectedAssetIds: ['AL30'], portfolioImpactAnalysis: { directExplanation: `Análisis ${index}`, affectedHoldings: [] } } as unknown as NewsItem));
const article = (headline: string, date = at) => new Response(`<html><head><meta property="og:title" content="${headline}"><meta property="article:published_time" content="${date}"></head><body><h1>${headline}</h1></body></html>`, { headers: { 'content-type': 'text/html' } });

function installTransport(t: TestContext, publication: (index: number) => Response | Promise<Response> = index => article(topics[index][1])) {
  const original = globalThis.fetch; purgeUrlVerificationCache();
  t.after(() => { globalThis.fetch = original; purgeUrlVerificationCache(); });
  const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input)); calls.push(url.href);
    if (url.hostname === 'www.bing.com') return new Response('<rss><channel><item><title>Contenido ajeno</title><link>https://other.test/unrelated</link></item></channel></rss>');
    const index = url.pathname.match(/^\/finanzas-mercados\/broad-(\d+)\/$/);
    if (index) return publication(Number(index[1]));
    const links = url.hostname === 'www.cronista.com' ? topics.map(([, title], index) => `<a href="/finanzas-mercados/broad-${index}/"><h2>${title}</h2></a>`).join('') : '';
    return new Response(`<html><body>${links}</body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  return calls;
}

test('revisa todas las tarjetas y reúne seis hechos distintos desde secciones aunque Bing sea inútil', async t => {
  const calls = installTransport(t); const input = items(); const diagnostics = createCoverageDiscoveryDiagnostics();
  const result = await discoverMissingCoverage(input, diagnostics);
  assert.equal(result.length, 6);
  assert.ok(result.every(item => item.coverageCount === 2));
  for (let index = 0; index < result.length; index++) {
    assert.equal(result[index].sources[1].originalHeadline, topics[index][1]);
    assert.match(result[index].sources[1].sourceUrl, new RegExp(`broad-${index}/$`));
    assert.deepEqual(result[index].portfolioImpactAnalysis, input[index].portfolioImpactAnalysis);
    assert.deepEqual(result[index].affectedAssetIds, input[index].affectedAssetIds);
  }
  assert.equal(diagnostics.events.length, 6);
  assert.ok(diagnostics.events.every(event => event.status === 'enriched' && event.matched > 0));
  assert.ok(diagnostics.queries.every(query => query.status === 'irrelevant_results'));
  assert.equal(diagnostics.added, 6);
  assert.equal(diagnostics.summary.multiMedia, 6);
  assert.equal(diagnostics.summary.singleSource, 0);
  assert.equal(calls.filter(url => url === 'https://www.cronista.com/finanzas-mercados/').length, 1, 'Un índice compartido, no una descarga por tarjeta');
  assert.ok(calls.filter(url => /\/broad-\d+\/$/.test(url)).length <= topics.length, 'Se reutiliza la verificación de URLs');
  assert.ok(input.every(item => item.sources.length === 1));
});

test('la sección solo descubre: otro monto, país, jornada o hecho en el artículo original impide añadirlo', async t => {
  installTransport(t, index => article(index === 0 ? 'El BCRA compró USD 130 millones y sumó reservas' : index === 1 ? 'El Banco Central de Australia mantiene las tasas al 40%' : topics[index][1], index === 2 ? new Date(Date.now() - 7 * 86400000).toISOString() : at));
  const diagnostics = createCoverageDiscoveryDiagnostics();
  const result = await discoverMissingCoverage(items(), diagnostics);
  assert.deepEqual(result.slice(0, 3).map(item => item.sources.length), [1, 1, 1]);
  assert.ok(diagnostics.events.slice(0, 3).every(event => event.differentEvent > 0));
  assert.ok(result.slice(3).every(item => item.sources.length === 2));
});

test('un presupuesto agotado no abandona silenciosamente las últimas tarjetas ni inventa ausencia de cobertura', async t => {
  installTransport(t, () => new Promise(() => {}));
  const diagnostics = createCoverageDiscoveryDiagnostics();
  const result = await discoverMissingCoverage(items(), diagnostics, { verificationBudgetMs: 30 });
  assert.ok(result.every(item => item.sources.length === 1));
  assert.equal(diagnostics.verification.budgetExhausted, true);
  assert.ok(diagnostics.verification.skipped >= 2);
  assert.equal(diagnostics.events.length, 6);
  assert.ok(diagnostics.events.every(event => event.status === 'incomplete'));
});

test('los índices admiten enlaces relativos y JSON-LD, sin seguir impostores ni secciones ajenas', () => {
  const title = 'El BCRA mantiene las tasas de interés al 40%';
  const html = `<a href="/finanzas-mercados/article/">${title}</a><a href="https://cronista.com.evil.test/finanzas-mercados/fake/">${title}</a><a href="/deportes/noticia/">${title}</a><script type="application/ld+json">${JSON.stringify({ itemListElement: [{ item: { url: '/finanzas-mercados/article/', name: title } }, { url: '/economia-politica/other/', headline: title }] })}</script>`;
  const result = extractSectionCandidates(html, 'https://www.cronista.com/finanzas-mercados/', 'cronista.com');
  assert.deepEqual(result.map(candidate => candidate.url), ['https://www.cronista.com/finanzas-mercados/article/', 'https://www.cronista.com/economia-politica/other/']);
});

test('verifica las seis editoriales permitidas y conserva el límite de cinco fuentes distintas', async t => {
  const original = globalThis.fetch; purgeUrlVerificationCache();
  t.after(() => { globalThis.fetch = original; purgeUrlVerificationCache(); });
  const headline = topics[0][0];
  const paths = new Map([
    ['www.cronista.com', '/finanzas-mercados/multiple-fixture/'],
    ['www.infobae.com', '/economia/2030/01/01/multiple-fixture/'],
    ['www.lanacion.com.ar', '/economia/multiple-fixture-nid123/'],
    ['www.clarin.com', '/economia/multiple-fixture.html'],
    ['www.iprofesional.com', '/finanzas/123-multiple-fixture']
  ]);
  const inspected = new Set<string>();
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'www.bing.com') return new Response('<rss><channel/></rss>');
    if (paths.get(url.hostname) === url.pathname) { inspected.add(url.hostname); return article(headline); }
    const path = paths.get(url.hostname);
    return new Response(`<html><a href="${path}"><h2>${headline}</h2></a></html>`, { headers: { 'content-type': 'text/html' } });
  };
  const diagnostics = createCoverageDiscoveryDiagnostics();
  const result = await discoverMissingCoverage([items()[0]], diagnostics);
  assert.equal(inspected.size, 5);
  assert.equal(result[0].sources.length, 5);
  assert.equal(new Set(result[0].sources.map(source => source.mediaName)).size, 5);
  assert.ok(result[0].sources.some(source => source.mediaName === 'La Nación'));
  assert.ok(result[0].sources.some(source => source.mediaName === 'Clarín'));
});
