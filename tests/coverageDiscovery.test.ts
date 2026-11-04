import test from 'node:test';
import assert from 'node:assert/strict';
import type { NewsItem } from '../src/types/index.js';
import { discoverMissingCoverage, createCoverageDiscoveryDiagnostics } from '../src/utils/coverageDiscovery.js';
import { purgeUrlVerificationCache } from '../src/utils/urlResolver.js';

const title = 'El BCRA compró USD 125 millones y elevó sus reservas';
const source = (headline = title, publisher = 'ambito.com', date = new Date().toISOString()) => ({
  mediaName: publisher, originalHeadline: headline, sourceUrl: `https://www.${publisher}/economia/coverage-fixture`,
  publishedDateIso: date, publishedTimestamp: Date.parse(date)
});
const item = (): NewsItem => ({ id: 'coverage-fixture', headline: title, sources: [source()], coverageCount: 1,
  affectedAssetIds: ['AL30'], portfolioImpactAnalysis: { directExplanation: 'Análisis de cartera conservado', affectedHoldings: [] } } as unknown as NewsItem);

test('busca explícitamente medios ausentes y verifica publicaciones fuera de los RSS', async t => {
  const original = globalThis.fetch;
  const searches: string[] = [];
  const publications: string[] = [];
  purgeUrlVerificationCache();
  t.after(() => { globalThis.fetch = original; purgeUrlVerificationCache(); });
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'www.bing.com') {
      searches.push(url.searchParams.get('q')!);
      const publisher = url.searchParams.get('q')!.match(/^site:(\S+)/)![1];
      return new Response(`<rss><channel><item><title>Texto del buscador no se usa como evidencia</title><link>${source(title, publisher).sourceUrl}</link></item></channel></rss>`);
    }
    publications.push(url.href);
    const headline = 'El Banco Central adquirió USD 125 millones y sumó reservas';
    return new Response(`<html><head><meta property="og:title" content="${headline}"><meta property="article:published_time" content="${new Date().toISOString()}"></head><body><h1>${headline}</h1></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  const input = item();
  const diagnostics = createCoverageDiscoveryDiagnostics();
  const result = (await discoverMissingCoverage([input], diagnostics))[0];
  assert.equal(searches.length, 2);
  assert.ok(searches.some(query => query.startsWith('site:cronista.com ')));
  assert.ok(searches.some(query => query.startsWith('site:infobae.com ')));
  assert.equal(publications.length, 2);
  assert.equal(result.coverageCount, 3);
  assert.ok(result.sources.slice(1).every(source => source.originalHeadline.includes('adquirió')));
  assert.deepEqual(result.portfolioImpactAnalysis, input.portfolioImpactAnalysis);
  assert.equal(input.sources.length, 1);
  assert.equal(diagnostics.added, 2);
});

test('una búsqueda caída no inventa fuentes ni elimina la publicación disponible', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('No disponible', { status: 503 });
  const input = item();
  const diagnostics = createCoverageDiscoveryDiagnostics();
  assert.deepEqual(await discoverMissingCoverage([input], diagnostics), [input]);
  assert.equal(diagnostics.unavailable, 2);
  assert.equal(diagnostics.added, 0);
});

test('no acepta el titular del buscador si el artículo verificado informa otro país, cifra o fecha', async t => {
  const original = globalThis.fetch;
  purgeUrlVerificationCache();
  t.after(() => { globalThis.fetch = original; purgeUrlVerificationCache(); });
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'www.bing.com') {
      const publisher = url.searchParams.get('q')!.match(/^site:(\S+)/)![1];
      return new Response(`<rss><channel>${[1, 2, 3].map(i => `<item><title>${title}</title><link>https://www.${publisher}/economia/coverage-fixture-${i}</link></item>`).join('')}<item><link>https://cronista.com.evil.test/economia/fake</link></item></channel></rss>`);
    }
    assert.ok(!url.hostname.endsWith('evil.test'));
    const headline = url.pathname.endsWith('-1') ? 'El BCRA compró USD 130 millones y elevó sus reservas' : url.pathname.endsWith('-2') ? 'El banco central de Australia compró USD 125 millones y elevó sus reservas' : title;
    const at = url.pathname.endsWith('-3') ? new Date(Date.now() - 7 * 86400000) : new Date();
    return new Response(`<html><head><meta property="og:title" content="${headline}"><meta property="article:published_time" content="${at.toISOString()}"></head><body><h1>${headline}</h1></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  const input = item();
  const result = await discoverMissingCoverage([input]);
  assert.equal(result[0].coverageCount, 1);
  assert.deepEqual(result[0].sources, input.sources);
});

test('no hace búsquedas adicionales cuando ya hay varios medios', async t => {
  const original = globalThis.fetch;
  t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => { throw new Error('No se debe consultar'); };
  const input = item(); input.sources.push(source(title, 'cronista.com')); input.coverageCount = 2;
  assert.equal(await discoverMissingCoverage([input]).then(news => news[0]), input);
});
