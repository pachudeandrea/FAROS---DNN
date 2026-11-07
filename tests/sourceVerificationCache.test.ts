import test from 'node:test';
import assert from 'node:assert/strict';
import { verifySourceUrl, purgeUrlVerificationCache } from '../src/utils/urlResolver';

const url = 'https://www.cronista.com/finanzas-mercados/verificacion-cache-prueba/';
const title = 'El BCRA mantiene la tasa de interés: publicación exclusiva de prueba';
const html = () => `<html><head><meta property="og:title" content="${title}"><meta property="article:published_time" content="${new Date().toISOString()}"><link rel="canonical" href="${url}"></head><body><h1>${title}</h1><p>Contenido de prueba local.</p></body></html>`;

test('un bloqueo temporal de un medio se vuelve a verificar a los 30 segundos, no queda excluido seis horas', async () => {
  const fetcher = globalThis.fetch; const clock = Date.now; let now = Math.floor(clock() / 3600000) * 3600000 + 15 * 60000; let calls = 0;
  purgeUrlVerificationCache();
  Date.now = () => now;
  globalThis.fetch = async () => { calls++; return calls === 1 ? new Response('', { status: 403 }) : new Response(html(), { headers: { 'Content-Type': 'text/html' } }); };
  try {
    assert.equal((await verifySourceUrl(url, title)).verified, false);
    assert.equal((await verifySourceUrl(url, title)).verified, false); assert.equal(calls, 1);
    now += 31000;
    assert.equal((await verifySourceUrl(url, title)).verified, true); assert.equal(calls, 2);
    now += 31000;
    assert.equal((await verifySourceUrl(url, title)).verified, true); assert.equal(calls, 2, 'La publicación verificada sí reutiliza caché');
  } finally { globalThis.fetch = fetcher; Date.now = clock; purgeUrlVerificationCache(); }
});

test('cancelar una verificación no guarda un fallo que envenene la consulta siguiente', async () => {
  const fetcher = globalThis.fetch; let calls = 0; purgeUrlVerificationCache();
  globalThis.fetch = async () => { calls++; return new Response(html(), { headers: { 'Content-Type': 'text/html' } }); };
  try {
    assert.equal((await verifySourceUrl(url, title, AbortSignal.abort())).verified, false); assert.equal(calls, 0);
    assert.equal((await verifySourceUrl(url, title)).verified, true); assert.equal(calls, 1);
  } finally { globalThis.fetch = fetcher; purgeUrlVerificationCache(); }
});


test('la misma publicación se vuelve a verificar al cambiar la hora argentina y recupera su titular actualizado', async () => {
  const fetcher = globalThis.fetch; const clock = Date.now;
  let now = Date.parse('2030-06-15T15:59:59Z'); let calls = 0;
  let headline = 'AL30 sube 3% en la Bolsa';
  purgeUrlVerificationCache(); Date.now = () => now;
  globalThis.fetch = async () => {
    calls++;
    return new Response(`<html><head><meta property="og:title" content="${headline}"><meta property="article:published_time" content="${new Date(now).toISOString()}"></head><body><h1>${headline}</h1></body></html>`, { headers: { 'Content-Type': 'text/html' } });
  };
  try {
    assert.equal((await verifySourceUrl(url, headline)).source?.originalHeadline, headline);
    assert.equal((await verifySourceUrl(url, headline)).source?.originalHeadline, headline); assert.equal(calls, 1);
    now += 1000; headline = 'AL30 cae 2% en la Bolsa';
    assert.equal((await verifySourceUrl(url, headline)).source?.originalHeadline, headline); assert.equal(calls, 2);
    await verifySourceUrl(url, headline); assert.equal(calls, 2, 'Se reutiliza dentro de la nueva hora');
  } finally { globalThis.fetch = fetcher; Date.now = clock; purgeUrlVerificationCache(); }
});
