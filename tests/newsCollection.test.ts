import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveVerifiedArgentineNews, createCollectionDiagnostics, verifyNewsCandidates, incrementalNewsVerification, type RawFeedItem } from '../src/utils/liveFinancialNews.ts';
import { purgeUrlVerificationCache } from '../src/utils/urlResolver.ts';

test('una caída de todas las fuentes no se convierte en una consulta sin novedades', async () => {
  const original = globalThis.fetch;
  const diagnostics = createCollectionDiagnostics();
  globalThis.fetch = async () => new Response('', { status: 503 });
  try {
    await assert.rejects(getLiveVerifiedArgentineNews([], diagnostics), /NEWS_SOURCES_UNAVAILABLE/);
    assert.equal(diagnostics.feeds.length, 4);
    assert.ok(diagnostics.feeds.every(feed => feed.status === 'http_error'));
    assert.doesNotMatch(JSON.stringify(diagnostics), /https:|email|token|portfolio|userId/);
  } finally { globalThis.fetch = original; }
});
test('una consulta RSS válida puede completar sin candidatos financieros y explica los descartes', async () => {
  const original = globalThis.fetch;
  const diagnostics = createCollectionDiagnostics();
  globalThis.fetch = async () => new Response('<rss><channel><item><title>Pronóstico del tiempo</title><link>https://www.ambito.com/clima</link></item></channel></rss>', { status: 200 });
  try {
    assert.deepEqual(await getLiveVerifiedArgentineNews([], diagnostics), []);
    assert.equal(diagnostics.feeds.length, 4);
    assert.equal(diagnostics.discarded.notFinancial, 3);
    assert.equal(diagnostics.discarded.section, 1);
    assert.equal(diagnostics.verified, 0);
  } finally { globalThis.fetch = original; }
});

test('una página HTML de error con estado 200 no cuenta como un RSS consultado', async () => {
  const original = globalThis.fetch;
  const diagnostics = createCollectionDiagnostics();
  globalThis.fetch = async () => new Response('<html><body>No disponible</body></html>');
  try {
    await assert.rejects(getLiveVerifiedArgentineNews([], diagnostics), /NEWS_SOURCES_UNAVAILABLE/);
    assert.ok(diagnostics.feeds.every(feed => feed.status === 'invalid_feed'));
  } finally { globalThis.fetch = original; }
});

test('consulta todos los RSS en paralelo y conserva los medios disponibles si otro tarda o falla', async () => {
  const original = globalThis.fetch;
  const diagnostics = createCollectionDiagnostics();
  let started = 0;
  let release: (response: Response) => void;
  const slow = new Promise<Response>(resolve => { release = resolve; });
  globalThis.fetch = async () => {
    started++;
    if (started === 1) return slow;
    if (started === 2) return new Response('', { status: 503 });
    return new Response('<rss><channel></channel></rss>');
  };
  try {
    const collecting = getLiveVerifiedArgentineNews([], diagnostics);
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(started, 5, 'Un RSS pendiente no impide iniciar los demás medios y la alternativa de Infobae');
    release!(new Response('<rss><channel></channel></rss>'));
    assert.deepEqual(await collecting, []);
    assert.deepEqual(diagnostics.feeds.map(feed => feed.status), ['ok', 'http_error', 'ok', 'ok']);
  } finally {
    release!(new Response('<rss><channel></channel></rss>'));
    globalThis.fetch = original;
  }
});

const fixtureCandidate = (publisher: string, index: number, title = 'Microsoft presentó su balance trimestral'): RawFeedItem => ({
  title, link: `https://www.${publisher}/economia/collection-fixture-${index}`, sourceFeed: publisher
});
const fixtureVerified = (candidate: RawFeedItem) => ({
  verified: true,
  source: { mediaName: candidate.sourceFeed, originalHeadline: candidate.title, sourceUrl: candidate.link, canonicalUrl: candidate.link,
    publishedDateIso: new Date().toISOString(), publishedTimestamp: Date.now() }
});

test('deduplica antes de verificar y reparte los turnos por medio con prioridad para la cartera', async () => {
  const candidates = ['ambito.com', 'cronista.com', 'infobae.com'].flatMap(publisher => [
    fixtureCandidate(publisher, 1),
    fixtureCandidate(publisher, 2, 'Apple sube tras presentar sus ganancias trimestrales'),
    fixtureCandidate(publisher, 3)
  ]);
  candidates.splice(3, 0, { ...candidates[1], link: `${candidates[1].link}?utm_source=rss#contenido`, sourceFeed: 'Segundo RSS de Ámbito' });
  const diagnostics = createCollectionDiagnostics();
  const calls: string[] = [];
  const pending: (() => void)[] = [];
  let active = 0;
  let peak = 0;
  const collection = verifyNewsCandidates(candidates, ['AAPL'], diagnostics, undefined, {
    budgetMs: 1000,
    verify: (url, title) => {
      calls.push(url); active++; peak = Math.max(peak, active);
      return new Promise(resolve => pending.push(() => {
        active--;
        resolve(fixtureVerified({ title: title!, link: url, sourceFeed: new URL(url).hostname }));
      }));
    }
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(calls.slice(0, 3), ['ambito.com', 'cronista.com', 'infobae.com'].map(publisher => fixtureCandidate(publisher, 2).link));
  assert.equal(calls.length, 4, 'Solo se inician cuatro verificaciones simultáneas');
  while (calls.length < 9 || pending.length) {
    for (const resolve of pending.splice(0)) resolve();
    await new Promise(resolve => setImmediate(resolve));
  }
  const verified = await collection;
  assert.equal(verified.length, 9);
  assert.equal(new Set(calls).size, 9);
  assert.equal(diagnostics.discarded.duplicate, 1);
  assert.equal(diagnostics.uniqueCandidates, 9);
  assert.equal(peak, 4);
  assert.equal(diagnostics.verification.peakConcurrency, 4);
  assert.ok(diagnostics.sources.every(source => source.attempted === 3 && source.verified === 3));
});

test('el presupuesto global corta la espera y no inicia nuevas verificaciones tras vencer', async () => {
  const candidates = ['ambito.com', 'cronista.com', 'infobae.com'].flatMap(publisher => [1, 2, 3].map(index => fixtureCandidate(publisher, index)));
  const diagnostics = createCollectionDiagnostics();
  let calls = 0;
  const verified = await verifyNewsCandidates(candidates, [], diagnostics, undefined, {
    budgetMs: 15,
    verify: async () => { calls++; return new Promise(() => {}); }
  });
  assert.deepEqual(verified, []);
  assert.equal(calls, 4);
  assert.equal(diagnostics.verification.budgetExhausted, true);
  assert.equal(diagnostics.verification.skipped, 5);
  assert.equal(diagnostics.discarded.connection, 4);
  assert.deepEqual(diagnostics.sources.map(source => source.attempted), [2, 1, 1], 'Todos los medios reciben un turno antes del corte');
  assert.equal(diagnostics.sources.reduce((sum, source) => sum + source.timedOut, 0), 4);
});

test('una caída de acceso a todas las publicaciones no se presenta como ausencia de noticias', async () => {
  const original = globalThis.fetch;
  purgeUrlVerificationCache();
  const diagnostics = createCollectionDiagnostics();
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('/rss/') || url.includes('/outboundfeeds/')) {
      return new Response('<rss><channel><item><title>El BCRA compró reservas</title><link>https://www.ambito.com/economia/collection-fixture-blocked</link></item></channel></rss>');
    }
    return new Response('Forbidden', { status: 403, headers: { 'content-type': 'text/html' } });
  };
  try {
    await assert.rejects(getLiveVerifiedArgentineNews([], diagnostics), /NEWS_SOURCES_UNAVAILABLE/);
    assert.equal(diagnostics.uniqueCandidates, 1);
    assert.equal(diagnostics.discarded.duplicate, 3);
    assert.equal(diagnostics.discarded.connection, 1);
  } finally { globalThis.fetch = original; purgeUrlVerificationCache(); }
});

test('agrupa el mismo hecho en tres medios, evita duplicados de RSS y separa hechos distintos de YPF', async () => {
  const original = globalThis.fetch;
  purgeUrlVerificationCache();
  const published = new Date(Date.now() - 60000).toISOString();
  // Publicaciones de prueba locales; ninguna petición sale de este transporte.
  const publications = [
    { publisher: 'ambito.com', title: 'El BCRA compró USD 125 millones y elevó sus reservas', path: 'reservas' },
    { publisher: 'cronista.com', title: 'El Banco Central adquirió USD 125 millones y sumó reservas', path: 'reservas' },
    { publisher: 'infobae.com', title: 'Reservas: el BCRA cerró la jornada con compras por USD 125 millones', path: 'reservas' },
    { publisher: 'ambito.com', title: 'YPF inauguró el oleoducto Vaca Muerta Sur para exportar petróleo', path: 'oleoducto' },
    { publisher: 'cronista.com', title: 'YPF anunció un aumento de naftas y gasoil en estaciones de servicio', path: 'combustibles' },
    { publisher: 'ambito.com', title: 'El banco central de Australia aumentó las tasas de interés hasta su nivel más alto en 18 años', path: 'australia' }
  ].map(publication => ({ ...publication, url: `https://www.${publication.publisher}/economia/collection-fixture-${publication.path}` }));
  const articleRequests: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('/rss/') || url.includes('/outboundfeeds/')) {
      const publisher = new URL(url).hostname.replace(/^www\./, '');
      const entries = publications.filter(publication => publication.publisher === publisher).map(publication => `<item><title>${publication.title}</title><link>${publication.url}${url.includes('finanzas.xml') ? '?utm_source=rss' : ''}</link></item>`).join('');
      return new Response(`<rss><channel>${entries}</channel></rss>`);
    }
    const publication = publications.find(publication => publication.url === url);
    assert.ok(publication, 'Un enlace inesperado falla sin consultar la red');
    articleRequests.push(url);
    return new Response(`<html><head><meta property="og:title" content="${publication.title}"><meta property="article:published_time" content="${published}"><link rel="canonical" href="${url}"></head><body><h1>${publication.title}</h1><p>Fixture local de recopilación de noticias.</p></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  const diagnostics = createCollectionDiagnostics();
  try {
    const news = await getLiveVerifiedArgentineNews(['AL30', 'YPFD'], diagnostics);
    const reserves = news.find(item => item.headline.includes('BCRA'));
    assert.ok(reserves);
    assert.equal(reserves.coverageCount, 3);
    assert.deepEqual(reserves.sources.map(source => source.mediaName).sort(), ['El Cronista', 'Infobae', 'Ámbito'].sort());
    assert.ok(reserves.sources.every(source => Number.isFinite(Date.parse(source.publishedDateIso!)) && source.publishedTimestamp === Date.parse(published) && source.sourceUrl.startsWith('https://')));
    assert.equal(news.filter(item => item.headline.includes('YPF')).length, 2);
    assert.ok(news.filter(item => item.headline.includes('YPF')).every(item => item.coverageCount === 1));
    assert.ok(news.every(item => item.affectedAssetIds.some(id => ['AL30', 'YPFD'].includes(id))));
    assert.ok(news.every(item => !item.headline.includes('Australia')), 'Una decisión extranjera sin vínculo demostrado no completa el feed argentino');
    assert.equal(articleRequests.length, 6, 'Los dos RSS de Ámbito no repiten la verificación');
    assert.equal(diagnostics.discarded.duplicate, 3);
    assert.equal(diagnostics.multiMedia, 1);
    purgeUrlVerificationCache();
    const progressive = await getLiveVerifiedArgentineNews(['AL30', 'YPFD'], undefined, undefined, () => {});
    const publications = (items: typeof news) => items.map(item => item.sources.map(source => source.sourceUrl).sort().join('|')).sort();
    assert.deepEqual(publications(progressive), publications(news), 'La verificación incremental conserva la comparación final y separa los mismos acontecimientos');
    const sovereignOnly = await getLiveVerifiedArgentineNews(['AL30']);
    assert.equal(sovereignOnly.length, 1);
    assert.ok(sovereignOnly[0].headline.includes('BCRA'));
    assert.ok(sovereignOnly.every(item => item.affectedAssetIds.includes('AL30')));
    const general = await getLiveVerifiedArgentineNews([]);
    assert.ok(general.some(item => item.headline.includes('Australia')), 'Sin cartera se permite consultar contexto general');
    assert.ok(general.find(item => item.headline.includes('Australia'))!.affectedAssetIds.length === 0);
  } finally { globalThis.fetch = original; purgeUrlVerificationCache(); }
});

test('no corta el RSS antes de encontrar una nota relevante situada después de quince candidatas', async t => {
  const original = globalThis.fetch;
  purgeUrlVerificationCache();
  t.after(() => { globalThis.fetch = original; purgeUrlVerificationCache(); });
  const headline = 'El BCRA compró USD 125 millones y elevó sus reservas';
  const requested: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    const host = new URL(url).hostname;
    if (url.includes('/rss/') || url.includes('/outboundfeeds/')) {
      const titles = [...Array.from({ length: 16 }, (_, i) => `Microsoft presentó su balance trimestral número ${i}`), headline];
      return new Response(`<rss><channel>${titles.map((title, i) => `<item><title>${title}</title><link>https://${host}/economia/deep-feed-fixture-${i}</link></item>`).join('')}</channel></rss>`);
    }
    requested.push(url);
    const title = url.endsWith('-16') ? headline : 'Microsoft presentó su balance trimestral';
    return new Response(`<html><head><meta property="og:title" content="${title}"><meta property="article:published_time" content="${new Date().toISOString()}"></head><body><h1>${title}</h1></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  const news = await getLiveVerifiedArgentineNews(['AL30']);
  assert.equal(news.length, 1);
  assert.equal(news[0].coverageCount, 3);
  assert.ok(requested.slice(0, 3).every(url => url.endsWith('-16')), 'Prioriza la nota relevante de cada medio antes de las generales');
});

test('la sección Infobae deduplica enlaces relativos, rechaza impostores y verifica la publicación original', async t => {
  const original = globalThis.fetch; purgeUrlVerificationCache();
  t.after(() => { globalThis.fetch = original; purgeUrlVerificationCache(); });
  const diagnostics = createCollectionDiagnostics();
  const headline = 'El BCRA compró USD 125 millones y sumó reservas';
  const pathname = '/economia/2030/01/01/section-fixture/';
  let rssSignal: AbortSignal | null | undefined; let sectionSignal: AbortSignal | null | undefined; let publications = 0;
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    if (url.pathname === '/economia/') {
      sectionSignal = init?.signal;
      return new Response(`<html><a href="${pathname}"><h2>${headline}</h2></a><a href="${pathname}?utm_source=duplicate">${headline}</a><a href="https://www.infobae.com.evil.test${pathname}">${headline}</a><a href="/politica/2030/01/01/fake/">${headline}</a></html>`);
    }
    if (url.pathname === pathname) {
      publications++;
      return new Response(`<html><head><meta property="og:title" content="${headline}"><meta property="article:published_time" content="${new Date().toISOString()}"></head><body><h1>${headline}</h1></body></html>`, { headers: { 'content-type': 'text/html' } });
    }
    if (url.hostname === 'www.infobae.com') rssSignal = init?.signal;
    return new Response('<rss><channel></channel></rss>');
  };
  const news = await getLiveVerifiedArgentineNews(['AL30'], diagnostics);
  assert.equal(news.length, 1); assert.equal(publications, 1);
  assert.equal(news[0].sources[0].sourceUrl, `https://www.infobae.com${pathname}`);
  assert.equal(diagnostics.sections[0].accepted, 1); assert.ok(diagnostics.discarded.section > 0);
  assert.ok(rssSignal); assert.equal(sectionSignal, rssSignal, 'RSS y sección comparten el mismo plazo');
});

test('el primer RSS verificado se muestra mientras otro feed sigue pendiente, sin volver a descargar la fuente', async () => {
  const original = globalThis.fetch;
  purgeUrlVerificationCache();
  const title = 'El BCRA compró USD 125 millones y elevó sus reservas';
  const article = 'https://www.ambito.com/economia/early-reservas-fixture';
  const published = new Date().toISOString();
  const rss = `<rss><channel><item><title>${title}</title><link>${article}</link><pubDate>${published}</pubDate></item></channel></rss>`;
  let articleCalls = 0;
  let firstMs: number | undefined;
  let totalMs = 0;
  let slowFinished = false;
  const started = performance.now();
  globalThis.fetch = async input => {
    const url = String(input);
    if (url === article) {
      articleCalls++;
      return new Response(`<html><head><meta property="og:title" content="${title}"><meta property="article:published_time" content="${published}"></head><body><h1>${title}</h1></body></html>`, { headers: { 'content-type': 'text/html' } });
    }
    if (url.includes('cronista.com')) {
      await new Promise(resolve => setTimeout(resolve, 300)); slowFinished = true;
      return new Response('<rss><channel></channel></rss>');
    }
    return new Response(rss);
  };
  try {
    const result = await getLiveVerifiedArgentineNews([], undefined, undefined, items => {
      assert.ok(items.length);
      if (firstMs === undefined) { firstMs = performance.now() - started; assert.equal(slowFinished, false); }
    });
    totalMs = performance.now() - started;
    assert.ok(result.length); assert.ok(firstMs !== undefined && firstMs < totalMs);
    assert.equal(articleCalls, 1, 'El resultado final reutiliza la verificación temprana');
    console.log(`[CONTROLLED RSS TIMING] first=${firstMs!.toFixed(1)}ms total=${totalMs.toFixed(1)}ms slowFeed=300ms`);
  } finally { globalThis.fetch = original; purgeUrlVerificationCache(); }
});

test('la cola incremental comparte cuatro verificaciones y da turno a un medio que llega después, sin repetir URLs', async () => {
  const diagnostics = createCollectionDiagnostics();
  const calls: string[] = [];
  const pending: (() => void)[] = [];
  let active = 0; let peak = 0;
  const queue = incrementalNewsVerification([], diagnostics, undefined, { budgetMs: 1000, verify: (url, title) => {
    calls.push(url); active++; peak = Math.max(peak, active);
    return new Promise(resolve => pending.push(() => { active--; resolve(fixtureVerified({ link: url, title: title!, sourceFeed: new URL(url).hostname })); }));
  } });
  const first = Array.from({ length: 6 }, (_, index) => fixtureCandidate('ambito.com', index));
  queue.add(first);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls.length, 4);
  queue.add([fixtureCandidate('cronista.com', 1), fixtureCandidate('cronista.com', 2), { ...first[0], link: first[0].link + '?utm_source=duplicate' }]);
  pending.shift()!();
  await new Promise(resolve => setImmediate(resolve));
  assert.ok(calls[4].includes('cronista.com'), 'Un feed posterior recibe turno antes de agotar el primer medio');
  let finished = false;
  const done = queue.finish().then(value => { finished = true; return value; });
  while (!finished) {
    for (const release of pending.splice(0)) release();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal((await done).length, 8); assert.equal(calls.length, 8); assert.equal(new Set(calls).size, 8);
  assert.equal(peak, 4); assert.equal(diagnostics.verification.peakConcurrency, 4);
  assert.equal(diagnostics.uniqueCandidates, 8); assert.equal(diagnostics.discarded.duplicate, 1);
  assert.equal(diagnostics.verification.skipped, 0);
});

test('feeds posteriores no reinician el presupuesto incremental ni inician solicitudes al agotarlo', async () => {
  const diagnostics = createCollectionDiagnostics(); let calls = 0;
  const queue = incrementalNewsVerification([], diagnostics, undefined, { budgetMs: 20, verify: async () => { calls++; return new Promise(() => {}); } });
  queue.add(Array.from({ length: 8 }, (_, index) => fixtureCandidate('ambito.com', index)));
  await new Promise(resolve => setTimeout(resolve, 30));
  queue.add(Array.from({ length: 4 }, (_, index) => fixtureCandidate('cronista.com', index)));
  assert.deepEqual(await queue.finish(), []);
  assert.equal(calls, 4); assert.equal(diagnostics.verification.budgetExhausted, true);
  assert.equal(diagnostics.verification.skipped, 8);
  assert.equal(diagnostics.sources.reduce((count, source) => count + source.timedOut, 0), 4);
});

test('una primera publicación ajena o vencida no impide mostrar otra relevante antes del RSS lento', { timeout: 5000 }, async () => {
  const original = globalThis.fetch; purgeUrlVerificationCache();
  const article = (index: number) => `https://www.ambito.com/economia/incremental-fixture-${index}`;
  const titles = ['Microsoft presentó su balance trimestral', 'El BCRA subió la tasa de interés', ...Array.from({ length: 16 }, (_, index) => `Microsoft presentó su balance trimestral número ${index}`), 'El BCRA compró USD 125 millones y elevó sus reservas'];
  const rss = `<rss><channel>${titles.map((title, index) => `<item><title>${title}</title><link>${article(index)}</link></item>`).join('')}</channel></rss>`;
  let release!: () => void; const slow = new Promise<void>(resolve => { release = resolve; });
  let progress!: () => void; const firstNews = new Promise<void>(resolve => { progress = resolve; });
  let slowFinished = false; let firstSeen = false; const calls: string[] = [];
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.includes('cronista.com')) { await slow; slowFinished = true; return new Response('<rss><channel></channel></rss>'); }
    if (url.includes('/rss/')) return new Response(rss);
    if (url.includes('/outboundfeeds/')) return new Response('<rss><channel></channel></rss>');
    if (url === 'https://www.infobae.com/economia/') return new Response('<html></html>');
    const index = titles.findIndex((_, index) => article(index) === url);
    assert.ok(index >= 0); calls.push(url);
    const published = new Date(Date.now() - (index === 1 ? 72 * 3600000 : 0)).toISOString();
    return new Response(`<html><head><meta property="og:title" content="${titles[index]}"><meta property="article:published_time" content="${published}"></head><body><h1>${titles[index]}</h1></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  let timeout: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = getLiveVerifiedArgentineNews(['AL30'], undefined, undefined, items => {
      if (firstSeen) return; firstSeen = true;
      assert.equal(slowFinished, false);
      assert.ok(items.some(item => item.headline === titles.at(-1)));
      assert.ok(items.every(item => item.headline !== titles[0] && item.headline !== titles[1]));
      progress();
    });
    await Promise.race([firstNews, new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error('La publicación relevante sigue esperando al RSS lento')), 3000); })]);
    release();
    const news = await result;
    assert.equal(news.length, 1); assert.equal(news[0].headline, titles.at(-1));
    assert.equal(calls.length, new Set(calls).size, 'Los dos feeds de Ámbito comparten verificaciones');
  } finally { if (timeout) clearTimeout(timeout); release(); globalThis.fetch = original; purgeUrlVerificationCache(); }
});
