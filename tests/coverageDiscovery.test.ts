import test from 'node:test';
import assert from 'node:assert/strict';
import type { NewsItem } from '../src/types/index.js';
import { discoverMissingCoverage, createCoverageDiscoveryDiagnostics, coverageCandidateUrl, coverageEventQueries } from '../src/utils/coverageDiscovery.js';
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

test('busca el tercer medio cuando ya hay dos editoriales', async t => {
  const original = globalThis.fetch;
  purgeUrlVerificationCache();
  t.after(() => { globalThis.fetch = original; purgeUrlVerificationCache(); });
  const queries: string[] = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.hostname === 'www.bing.com') {
      queries.push(url.searchParams.get('q')!);
      const target = source(title, 'infobae.com').sourceUrl;
      return new Response(`<rss><channel><item><link>https://www.bing.com/ck/a?u=a1${Buffer.from(target).toString('base64url')}</link></item></channel></rss>`);
    }
    return new Response(`<html><head><meta property="og:title" content="${title}"><meta property="article:published_time" content="${new Date().toISOString()}"></head><body><h1>${title}</h1></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  const input = item(); input.sources.push(source(title, 'cronista.com')); input.coverageCount = 2;
  const result = await discoverMissingCoverage([input]);
  assert.equal(queries.length, 1); assert.match(queries[0], /^site:infobae.com /);
  assert.equal(result[0].coverageCount, 3);
});

test('decodifica formatos Bing conocidos y rechaza destinos impostores o arbitrarios', () => {
  const target = 'https://www.cronista.com/economia/articulo/';
  assert.equal(coverageCandidateUrl(`https://www.bing.com/ck/a?u=a1${Buffer.from(target).toString('base64url')}`, 'cronista.com'), target);
  assert.equal(coverageCandidateUrl(`https://www.bing.com/news/apiclick.aspx?url=${encodeURIComponent(target)}`, 'cronista.com'), target);
  assert.equal(coverageCandidateUrl('http://www.cronista.com/economia/articulo/', 'cronista.com'), 'http://www.cronista.com/economia/articulo/');
  for (const url of ['https://cronista.com.evil.test/a', 'https://evil.test/a', 'https://www.bing.com/redirect?url='+target, 'https://cronista.com@evil.test/a', 'https://www.cronista.com:444/a', 'javascript:alert(1)']) assert.equal(coverageCandidateUrl(url, 'cronista.com'), null, url);
});

test('intenta una consulta breve alternativa y distingue RSS vacío de descartes', async t => {
  const original = globalThis.fetch; t.after(() => { globalThis.fetch = original; });
  globalThis.fetch = async () => new Response('<rss><channel><item><link>https://evil.test/falso</link></item></channel></rss>');
  const diagnostics = createCoverageDiscoveryDiagnostics();
  await discoverMissingCoverage([item()], diagnostics);
  assert.equal(diagnostics.searches, 4); assert.equal(diagnostics.unavailable, 0);
  assert.ok(diagnostics.queries.every(query => query.raw === 1 && query.rejected === 1 && query.accepted === 0));
  assert.equal(coverageEventQueries(title).length, 2);
});

test('un candidato HTTP puede subir a HTTPS, pero nunca se sigue una redirección a otro dominio', async t => {
  const { verifySourceUrl } = await import('../src/utils/urlResolver.js');
  const original = globalThis.fetch; purgeUrlVerificationCache();
  t.after(() => { globalThis.fetch = original; purgeUrlVerificationCache(); });
  const calls: string[] = [];
  globalThis.fetch = async (input, init) => {
    const url = String(input); calls.push(url);
    assert.equal(init?.redirect, 'manual');
    if (url.startsWith('http:')) return new Response(null, { status: 301, headers: { location: url.replace('http:', 'https:') } });
    if (url.endsWith('unsafe')) return new Response(null, { status: 302, headers: { location: 'https://evil.test/private' } });
    return new Response(`<html><head><meta property="og:title" content="${title}"><meta property="article:published_time" content="${new Date().toISOString()}"></head><body><h1>${title}</h1></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  const valid = await verifySourceUrl('http://www.cronista.com/economia/http-fixture', title, undefined, 'cronista.com');
  assert.equal(valid.verified, true); assert.match(valid.source!.sourceUrl, /^https:/);
  assert.equal((await verifySourceUrl('https://www.cronista.com/economia/unsafe', title, undefined, 'cronista.com')).verified, false);
  assert.ok(calls.every(url => new URL(url).hostname === 'www.cronista.com'));
});
