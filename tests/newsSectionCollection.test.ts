import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveVerifiedArgentineNews, createCollectionDiagnostics } from '../src/utils/liveFinancialNews.ts';
import { purgeUrlVerificationCache } from '../src/utils/urlResolver.ts';
import { argentinaNewsDay } from '../src/utils/dailyNews.ts';
import type { PublicationCandidate } from '../src/utils/publisherSections.ts';

const publications = [
  { publisher: 'lanacion.com.ar', url: 'https://www.lanacion.com.ar/economia/section-only-ypf-production/', title: 'YPF presenta novedades de su producción petrolera', description: 'YPF aumentó su producción de petróleo durante el trimestre.', impact: 'favorable' },
  { publisher: 'clarin.com', url: 'https://www.clarin.com/economia/section-only-ypf-judicial.html', title: 'YPF enfrenta una nueva decisión judicial', description: 'La Justicia ordenó a YPF pagar una indemnización millonaria.', impact: 'alerta' },
  { publisher: 'iprofesional.com', url: 'https://www.iprofesional.com/finanzas/section-only-ypf-report', title: 'YPF explica los detalles de su balance trimestral', description: 'YPF presentó su balance trimestral ante los inversores.', impact: 'neutral' }
];
const isFeed = (url: string) => url.includes('/rss/') || url.includes('/outboundfeeds/');
function article(title: string, description: string, at = new Date().toISOString()) {
  return new Response(`<html><head><meta property="og:title" content="${title}"><meta property="og:description" content="${description}"><meta property="article:published_time" content="${at}"></head><body><h1>${title}</h1></body></html>`, { headers: { 'Content-Type': 'text/html' } });
}

test('La Nación, Clarín e iProfesional aportan hechos propios aunque ningún RSS los contenga; la evidencia determina cada dirección', async () => {
  const original = globalThis.fetch; purgeUrlVerificationCache();
  const calls: string[] = [];
  const old = { publisher: 'clarin.com', url: 'https://www.clarin.com/economia/section-only-ypf-yesterday.html', title: 'YPF inauguró un oleoducto para exportar petróleo' };
  globalThis.fetch = async input => {
    const url = String(input); calls.push(url);
    if (isFeed(url)) return new Response('<rss><channel></channel></rss>');
    if (url === 'https://www.infobae.com/economia/') return new Response('<html></html>');
    if (url === old.url) return article(old.title, 'YPF inauguró un nuevo oleoducto.', new Date(Date.now() - 86400000).toISOString());
    const publication = publications.find(item => item.url === url); assert.ok(publication, 'Ninguna petición accede a la red');
    return article(publication.title, publication.description);
  };
  try {
    const diagnostics = createCollectionDiagnostics();
    const news = await getLiveVerifiedArgentineNews(['YPFD'], diagnostics, undefined, undefined, argentinaNewsDay(), Promise.resolve([...publications, old]));
    assert.equal(news.length, 3);
    for (const publication of publications) {
      const item = news.find(item => item.sources[0].sourceUrl === publication.url)!;
      assert.ok(item, `El hecho independiente de ${publication.publisher} debe crear una tarjeta`);
      assert.equal(item.impact, publication.impact);
      assert.equal(item.relevanceType, 'valoracion_mercado');
      assert.equal(item.portfolioImpactAnalysis.affectedHoldings.find(holding => holding.symbol === 'YPFD')?.impactDirection, publication.impact);
      assert.ok(item.sources[0].articleSummary?.includes(publication.description));
      assert.equal(calls.filter(url => url === publication.url).length, 1);
    }
    assert.ok(news.every(item => item.sources.every(source => argentinaNewsDay(source.publishedTimestamp!) === argentinaNewsDay())));
    assert.equal(diagnostics.sources.length, 3);
    assert.ok(diagnostics.verification.peakConcurrency <= 4);
  } finally { globalThis.fetch = original; purgeUrlVerificationCache(); }
});

test('una sección válida recupera noticias cuando todos los RSS fallan, conservando neutral una nota sin señal direccional', async () => {
  const original = globalThis.fetch; purgeUrlVerificationCache();
  const publication = publications[2];
  globalThis.fetch = async input => String(input) === publication.url ? article(publication.title, publication.description) : new Response('No disponible', { status: 503 });
  try {
    const progress: string[] = [];
    const news = await getLiveVerifiedArgentineNews(['YPFD'], undefined, undefined, items => progress.push(...items.map(item => item.headline)), argentinaNewsDay(), Promise.resolve([publication]));
    assert.equal(news.length, 1); assert.equal(news[0].impact, 'neutral');
    assert.ok(progress.includes(publication.title));
  } finally { globalThis.fetch = original; purgeUrlVerificationCache(); }
});

test('las secciones emiten noticias antes de acabar un RSS lento y comparten la verificación de URLs repetidas', async () => {
  const original = globalThis.fetch; purgeUrlVerificationCache();
  const publication = { publisher: 'ambito.com', url: 'https://www.ambito.com/economia/section-rss-shared-ypf', title: 'YPF aumentó su producción de petróleo' };
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let notified!: () => void; const firstNews = new Promise<void>(resolve => { notified = resolve; });
  let slowFinished = false; let articleCalls = 0; let timer: ReturnType<typeof setTimeout> | undefined;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url === publication.url) { articleCalls++; return article(publication.title, 'YPF aumentó su producción de petróleo durante el trimestre.'); }
    if (url.includes('cronista.com')) { await gate; slowFinished = true; return new Response('<rss><channel></channel></rss>'); }
    if (url.includes('ambito.com')) return new Response(`<rss><channel><item><title>${publication.title}</title><link>${publication.url}</link></item></channel></rss>`);
    return isFeed(url) ? new Response('<rss><channel></channel></rss>') : new Response('<html></html>');
  };
  try {
    const collecting = getLiveVerifiedArgentineNews(['YPFD'], undefined, undefined, news => {
      assert.ok(news.some(item => item.headline === publication.title)); assert.equal(slowFinished, false); notified();
    }, argentinaNewsDay(), Promise.resolve([publication, publication] as PublicationCandidate[]));
    await Promise.race([firstNews, new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Las secciones siguen esperando al RSS lento')), 3000); })]);
    release();
    const news = await collecting;
    assert.equal(news.length, 1); assert.equal(news[0].impact, 'favorable'); assert.equal(articleCalls, 1);
  } finally { if (timer) clearTimeout(timer); release(); globalThis.fetch = original; purgeUrlVerificationCache(); }
});
