import test from 'node:test';
import assert from 'node:assert/strict';
import { getLiveVerifiedArgentineNews, createCollectionDiagnostics } from '../src/utils/liveFinancialNews.ts';

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
    assert.equal(diagnostics.discarded.notFinancial, 4);
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
