import test from 'node:test';
import assert from 'node:assert/strict';
import { NewsJobs } from '../src/server/newsJobs.js';
import { readNewsResponse, NewsRequestError, normalizeNewsError, retryableNewsError, newsRetryDelay } from '../src/utils/newsResponse.js';
import { findRecentNewsSnapshot, describeNewsQuery } from '../src/utils/newsQuery.js';
import type { NewsItem } from '../src/types/index.js';
const news = [{ id: 'verified', headline: 'Noticia verificada', sources: [{ sourceUrl: 'https://www.ambito.com/finanzas/fixture' }] }] as NewsItem[];
const deferred = <T>() => { let resolve!: (value: T) => void; const promise = new Promise<T>(done => { resolve = done; }); return { promise, resolve }; };

test('muestra noticias verificadas antes de completar cobertura y no espera al cierre de la conexión', async () => {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({ start(value) { controller = value; }, cancel() { cancelled = true; } });
  const response = new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } });
  const first = deferred<void>(); let finished = false;
  const pending = readNewsResponse(response, data => { assert.deepEqual(data.news, news); first.resolve(); }).then(data => { finished = true; return data; });
  const encoder = new TextEncoder();
  const frame = encoder.encode(JSON.stringify({ type: 'progress', news }) + '\n');
  controller.enqueue(frame.slice(0, 13)); controller.enqueue(frame.slice(13));
  await first.promise;
  assert.equal(finished, false, 'Se puede leer mientras la comparación sigue pendiente');
  controller.enqueue(encoder.encode(JSON.stringify({ type: 'complete', news, checkedAt: '2026-11-05T21:00:00Z' }) + '\n'));
  assert.deepEqual((await pending).news, news);
  assert.equal(cancelled, true, 'No se espera indefinidamente al EOF después del resultado completo');
});

test('una interrupción conserva los progresos pero no los declara una consulta completa', async () => {
  const encoded = new TextEncoder().encode(JSON.stringify({ type: 'progress', news }) + '\n');
  let updates = 0;
  await assert.rejects(readNewsResponse(new Response(encoded, { headers: { 'content-type': 'application/x-ndjson' } }), () => { updates++; }), /incompleta/);
  assert.equal(updates, 1);
  assert.match(describeNewsQuery({ status: 'partial', checkedAt: null, partial: true }, 1), /Completando/);
  assert.match(describeNewsQuery({ status: 'error', checkedAt: null, partial: true }, 1), /verificadas hasta ahora/);
  assert.deepEqual((await readNewsResponse(Response.json({ news: [] }), () => assert.fail())).news, []);
});

test('solicitudes simultáneas de la misma selección comparten trabajo y los nuevos lectores reciben progreso', async () => {
  const jobs = new NewsJobs<NewsItem[]>(); const gate = deferred<NewsItem[]>(); let calls = 0;
  const work = async (publish: (news: NewsItem[]) => void) => { calls++; publish(news); return gate.promise; };
  const first = jobs.getOrCreate('portfolio-scope', work);
  await new Promise(resolve => setImmediate(resolve));
  const second = jobs.getOrCreate('portfolio-scope', work);
  let replayed = false;
  const stop = second.subscribe(progress => { replayed = true; assert.deepEqual(progress.news, news); });
  assert.equal(first, second); assert.equal(calls, 1); assert.equal(replayed, true);
  stop(); gate.resolve(news); assert.deepEqual(await first.promise, news);
  await jobs.getOrCreate('portfolio-scope', work).promise;
  assert.equal(calls, 2, 'No se confunde trabajo en curso con un caché permanente');
  await jobs.getOrCreate('different-selection', work).promise;
  assert.equal(calls, 3, 'Selecciones diferentes siguen aisladas');
});

test('el respaldo diario respeta selección, fecha argentina y publicaciones de la jornada', () => {
  const now = Date.parse('2026-11-05T22:01:00Z');
  const snapshot = (checkedAt: string, date = '2026-11-05T20:00:00Z') => JSON.stringify({ news: [{ ...news[0], sources: [{ ...news[0].sources[0], publishedDateIso: date }] }], checkedAt });
  const entries = new Map([
    ['same_2026-11-05_18', snapshot('2026-11-05T21:59:00Z')],
    ['different_2026-11-05_19', snapshot('2026-11-05T22:00:00Z')],
    ['same_2026-11-05_16', snapshot('2026-11-05T18:00:00Z')],
    ['same_2026-11-05_19', snapshot('2026-11-05T22:00:00Z', '2026-11-01T00:00:00Z')]
  ]);
  const storage = { get length() { return entries.size; }, key: (index: number) => [...entries.keys()][index], getItem: (key: string) => entries.get(key) || null };
  assert.equal(findRecentNewsSnapshot(storage, 'same_', now)?.checkedAt, '2026-11-05T21:59:00Z');
  assert.equal(findRecentNewsSnapshot(storage, 'absent_', now), null);
  assert.equal(findRecentNewsSnapshot(storage, 'same_', Date.parse('2026-11-06T03:00:00Z')), null, 'A las00:00 argentina no se recupera el día anterior');
});

test('una verificación RSS exitosa se reutiliza para cobertura solo dentro de la misma editorial', async t => {
  const { verifySourceUrl, purgeUrlVerificationCache } = await import('../src/utils/urlResolver.js');
  const original = globalThis.fetch; purgeUrlVerificationCache();
  t.after(() => { globalThis.fetch = original; purgeUrlVerificationCache(); });
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response(`<html><head><meta property="og:title" content="El BCRA compró dólares y sumó reservas"><meta property="article:published_time" content="${new Date().toISOString()}"></head><body><h1>El BCRA compró dólares y sumó reservas</h1></body></html>`, { headers: { 'content-type': 'text/html' } });
  };
  const url = 'https://www.ambito.com/finanzas/cache-shared-fixture';
  assert.equal((await verifySourceUrl(url)).verified, true);
  assert.equal((await verifySourceUrl(url, undefined, undefined, 'ambito.com')).verified, true);
  assert.equal(calls, 1, 'La segunda fase no vuelve a descargar una publicación ya verificada');
  assert.equal((await verifySourceUrl(url, undefined, undefined, 'cronista.com')).verified, false);
  assert.equal(calls, 1, 'La caché no autoriza dominios ajenos al medio solicitado');
});

test('un lector desconectado no hace fallar el trabajo compartido de los demás', async () => {
  const jobs = new NewsJobs<NewsItem[]>(); const gate = deferred<void>(); let received = 0;
  const job = jobs.getOrCreate('scope', async publish => { await gate.promise; publish(news); return news; });
  job.subscribe(() => { throw new Error('Lector desconectado'); });
  job.subscribe(() => { received++; });
  gate.resolve();
  assert.deepEqual(await job.promise, news); assert.equal(received, 1);
});


test('conserva código/estado de un fallo HTTP sin exponer mensajes internos y respeta Retry-After', async () => {
  const response = Response.json({ code: 'DB_UNAVAILABLE', error: 'postgresql://secret@private SQL stack' }, { status: 503, headers: { 'retry-after': '9' } });
  await assert.rejects(readNewsResponse(response, () => assert.fail()), error => {
    assert.ok(error instanceof NewsRequestError); assert.equal(error.status, 503); assert.equal(error.code, 'DB_UNAVAILABLE');
    assert.doesNotMatch(error.message, /secret|postgresql|private|SQL/);
    assert.equal(retryableNewsError(error), true); assert.equal(newsRetryDelay(error, 0), 9000); return true;
  });
  const notFound = new NewsRequestError('No disponible', 'API_NOT_FOUND', 404);
  assert.equal(retryableNewsError(notFound), false);
  assert.equal(retryableNewsError(new NewsRequestError('Selección inválida', 'INVALID_SELECTION', 400)), false);
  assert.equal(retryableNewsError(new NewsRequestError('Ocupado', 'RATE_LIMIT', 429)), true);
  assert.equal(newsRetryDelay(new NewsRequestError('Ocupado', 'RATE_LIMIT', 429), 0), 2000);
  assert.equal(newsRetryDelay(new NewsRequestError('Ocupado', 'RATE_LIMIT', 429), 1), 5000);
  assert.equal(normalizeNewsError(new Error('AbortError'), true).code, 'TIMEOUT');
});

test('un error de stream conserva su código y un EOF incompleto es recuperable, sin declarar éxito', async () => {
  const encoder = new TextEncoder();
  const errorResponse = new Response(encoder.encode(JSON.stringify({ type: 'error', code: 'NEWS_SOURCES_UNAVAILABLE', error: '<upstream internals>' })+'\n'), { headers: { 'content-type': 'application/x-ndjson' } });
  await assert.rejects(readNewsResponse(errorResponse, () => assert.fail()), error => {
    assert.ok(error instanceof NewsRequestError); assert.equal(error.code, 'NEWS_SOURCES_UNAVAILABLE');
    assert.equal(retryableNewsError(error), true); assert.doesNotMatch(error.message, /upstream|internals/); return true;
  });
  await assert.rejects(readNewsResponse(new Response('', { headers: { 'content-type': 'application/x-ndjson' } }), () => assert.fail()), error => {
    assert.ok(error instanceof NewsRequestError); assert.equal(error.code, 'NEWS_STREAM_INCOMPLETE'); assert.equal(retryableNewsError(error), true); return true;
  });
});
