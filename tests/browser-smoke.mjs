import { argentinaNewsHour } from '../src/utils/dailyNews.ts';
import { newsClientCacheKey, portfolioNewsScope } from '../src/utils/newsCache.ts';
import { readFileSync } from 'node:fs';
import { analyzeNewsRelevance } from '../src/utils/newsRelevance.ts';
import { publicationUrls, publicationDay, samePublication } from '../src/utils/newsLibrary.ts';
// Isolated UI checks: every API and external request is intercepted. The push
// transport is simulated; the actual service worker and Notification API run.
import assert from 'node:assert/strict';
import { createECDH, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { mkdir, access } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { chromium } from 'playwright-core';
import { MOCK_PORTFOLIOS, DEFAULT_PREFERENCES } from '../src/data/mockData.ts';
import { REAL_GROUNDED_NEWS } from '../src/data/groundedRealNews.ts';
import { ASSET_CATALOG } from '../src/data/assetCatalog.ts';

// Playable test tone: validates decoding/progress, not the quality or availability of a live voice.
const sampleRate = 8000; const sampleCount = sampleRate * 4;
const audioFixture = Buffer.alloc(44 + sampleCount * 2);
audioFixture.write('RIFF'); audioFixture.writeUInt32LE(audioFixture.length - 8, 4); audioFixture.write('WAVEfmt ', 8);
audioFixture.writeUInt32LE(16, 16); audioFixture.writeUInt16LE(1, 20); audioFixture.writeUInt16LE(1, 22);
audioFixture.writeUInt32LE(sampleRate, 24); audioFixture.writeUInt32LE(sampleRate * 2, 28); audioFixture.writeUInt16LE(2, 32); audioFixture.writeUInt16LE(16, 34);
audioFixture.write('data', 36); audioFixture.writeUInt32LE(sampleCount * 2, 40);
for (let index = 0; index < sampleCount; index++) audioFixture.writeInt16LE(Math.round(Math.sin(index * 2 * Math.PI * 440 / sampleRate) * 1000), 44 + index * 2);
const audioBase64 = audioFixture.toString('base64');

const artifacts = process.env.BROWSER_ARTIFACTS || path.join(tmpdir(), 'faros-browser-checks');
await mkdir(artifacts, { recursive: true });
const candidates = [process.env.CHROMIUM_PATH, '/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome'].filter(Boolean);
let executablePath;
for (const candidate of candidates) {
  try { await access(candidate); executablePath = candidate; break; } catch {}
}
if (!executablePath) throw new Error('Instalá Chromium y definí CHROMIUM_PATH para ejecutar npm run test:browser.');
const listener = createServer();
listener.listen(0, '127.0.0.1'); await once(listener, 'listening');
const port = listener.address().port; await new Promise(resolve => listener.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ['--import', 'tsx', 'server.ts'], {
  env: { PATH: process.env.PATH, HOME: process.env.HOME, TMPDIR: tmpdir(), NODE_ENV: 'production', PORT: String(port), DATABASE_URL: '', POSTGRES_URL: '', POSTGRES_PRISMA_URL: '', POSTGRES_URL_NON_POOLING: '', GEMINI_API_KEY: '', APP_URL: origin },
  stdio: ['ignore', 'pipe', 'pipe']
});
let serverOutput = '';
server.stdout.on('data', chunk => { serverOutput += chunk; });
server.stderr.on('data', chunk => { serverOutput += chunk; });
const startup = Date.now();
while (!serverOutput.includes('FAROS server running')) {
  if (server.exitCode !== null || Date.now() - startup > 20000) { server.kill(); throw new Error(`El servidor de prueba no inició: ${serverOutput}`); }
  await new Promise(resolve => setTimeout(resolve, 100));
}

const curve = createECDH('prime256v1'); curve.generateKeys();
const publicKey = curve.getPublicKey().toString('base64url');
const subscription = { endpoint: 'https://fcm.googleapis.com/fcm/send/faros-browser-test', keys: { p256dh: publicKey, auth: randomBytes(16).toString('base64url') } };
const fixture = {
  id: 'usr_browser_test', name: 'Cuenta de prueba', email: 'ui@example.test', provider: 'email', hasRecoveryKey: true,
  termsAccepted: true, profile: 'moderado', createdAt: '2026-10-31T12:00:00.000Z',
  portfolio: structuredClone(MOCK_PORTFOLIOS[0]), preferences: { ...DEFAULT_PREFERENCES, notificationsEnabled: false }
};
const news = structuredClone(REAL_GROUNDED_NEWS.slice(0, 3));
// Default pulse fixtures are publications of this Argentina day. Historical
// publication dates belong in explicit news/library overrides.
for (const item of news) for (const source of item.sources) {
  source.publishedTimestamp = Date.now(); source.publishedDateIso = new Date().toISOString();
}
// Two outlets can publish the same agency headline; both must remain visible.
news[0].sources[1].originalHeadline = news[0].sources[0].originalHeadline;
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const pageErrors = [];
let checks = 0;
async function check(name, run) { if (process.env.BROWSER_CHECK && !name.includes(process.env.BROWSER_CHECK)) return; await run(); checks++; console.log(`ok ${checks} - ${name}`); }
async function setup({ anonymous = false, admin = false, permission = 'granted', longName = false, legacyNews = false, portfolioOverride, newsOverride, audioMode = 'ok', audioDelay = 0, progressiveNews = false, pulseFailures = [], pulseCacheSeeds = [], clockAt, savedNewsOverride, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  if (pulseCacheSeeds.length) await context.addInitScript(entries => { for (const [key, value] of entries) localStorage.setItem(key, value); }, pulseCacheSeeds);
  if (legacyNews) await context.addInitScript(({ item, portfolioId, version }) => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }).format(new Date());
    localStorage.setItem(`faros_news_${version}_${portfolioId}_${date}_${hour}`, JSON.stringify([{ ...item, sources: item.sources.slice(0, 1), coverageCount: 1 }]));
    localStorage.setItem('faros_session_token', 'browser-test-existing-session');
    localStorage.setItem('faros_custom_events:usr_browser_test', '[]');
  }, { item: news[0], portfolioId: fixture.portfolio.id, version: typeof legacyNews === 'string' ? legacyNews : 'v4_coverage' });
  // Permission state and subscriptions are simulated, so no push service is
  // contacted. Permission requests still have to originate from a button.
  await context.addInitScript(({ permission, subscription }) => {
    window.__permissionRequests = 0;
    let current = 'default';
    Object.defineProperty(Notification, 'permission', { configurable: true, get: () => current });
    Notification.requestPermission = async () => { window.__permissionRequests++; current = permission; return current; };
    const local = () => localStorage.getItem('test_push') === 'yes' ? {
      ...subscription, options: {}, toJSON: () => subscription,
      unsubscribe: async () => { localStorage.removeItem('test_push'); return true; }
    } : null;
    PushManager.prototype.getSubscription = async () => local();
    PushManager.prototype.subscribe = async () => { localStorage.setItem('test_push', 'yes'); return local(); };
  }, { permission, subscription });
  const libraries = new Map();
  const state = { librarySaveFailure: false, pulseFailures: [...pulseFailures], libraries, user: structuredClone(fixture), active: false, calls: [], events: [], newsData: news, newsMode: 'ok', revision: null, saveFailure: false, delayNews: 0, audioMode, audioDelay, checkedAt: clockAt || new Date().toISOString() };
  if (portfolioOverride) state.user.portfolio = structuredClone(portfolioOverride);
  if (newsOverride) state.newsData = structuredClone(newsOverride);
  if (savedNewsOverride) libraries.set(state.user.id, savedNewsOverride.map((item, index) => ({
    id: `saved-fixture-${index}`, news: structuredClone(item), day: publicationDay(item), urls: publicationUrls(item), savedAt: state.checkedAt, seenAt: state.checkedAt
  })));
  if (admin) state.user.isAdmin = true;
  if (longName) state.user.portfolio.name = 'Cartera' + 'Diversificada'.repeat(12);
  await context.route('**/*', async route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.origin !== origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const body = request.postDataJSON() || {};
    state.calls.push({ path: url.pathname, method: request.method(), body });
    let data = { success: true };
    let status = 200;
    if (url.pathname === '/api/auth/me') data = anonymous ? { authenticated: false } : { authenticated: true, user: state.user };
    if (url.pathname === '/api/news/pulse') {
      if (state.delayNews) await new Promise(resolve => setTimeout(resolve, state.delayNews));
      status = state.pulseFailures.shift() || (state.newsMode === 'error' ? 503 : 200);
      data = status !== 200 ? { code: status === 404 ? 'API_NOT_FOUND' : 'NEWS_SOURCES_UNAVAILABLE', error: 'Fuentes no disponibles.' } : { news: state.newsMode === 'empty' ? [] : state.newsData, checkedAt: state.checkedAt };
    }
    if (url.pathname === '/api/news/library' || url.pathname.startsWith('/api/news/library/')) {
      const owner = state.user.id;
      if (!libraries.has(owner)) libraries.set(owner, []);
      const entries = libraries.get(owner);
      const refs = () => entries.filter(entry => entry.savedAt).map(entry => ({ id: entry.id, day: entry.day, urls: entry.urls, savedAt: entry.savedAt }));
      const put = (item, saved) => {
        const day = publicationDay(item);
        const old = entries.find(entry => entry.day === day && samePublication(entry.news, item));
        const entry = { id: old?.id || `library-${owner}-${entries.length}`, news: old?.savedAt ? old.news : item, urls: [...new Set([...(old?.urls || []), ...publicationUrls(item)])], day, seenAt: new Date().toISOString(), savedAt: saved === undefined ? old?.savedAt || null : saved ? old?.savedAt || state.checkedAt : null };
        if (old) entries[entries.indexOf(old)] = entry; else entries.push(entry);
        return entry;
      };
      if (url.pathname.endsWith('/bookmark')) {
        if (state.librarySaveFailure) { status = 503; data = { error: 'No se pudo guardar la noticia de prueba.' }; }
        else data = { item: put(body.news, body.saved), saved: refs() };
      } else if (url.pathname.endsWith('/history')) data = { items: body.news.map(item => put(item)) };
      else {
        const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
        const items = entries.filter(entry => url.searchParams.get('view') === 'saved' ? entry.savedAt : entry.day < today).filter(entry => !url.searchParams.get('day') || entry.day === url.searchParams.get('day')).sort((a,b) => b.day.localeCompare(a.day));
        data = { items, saved: refs(), days: [...new Set(entries.map(entry => entry.day))].sort().reverse(), next: null };
      }
    }
    if (url.pathname === '/api/version') data = { revision: state.revision, newsVersion: 'v4_coverage' };
    if (url.pathname === '/api/auth/user') {
      state.user = { ...state.user, ...body };
      data = { success: true, user: state.user };
    }
    if (url.pathname === '/api/auth/register') { state.user = { ...state.user, ...body, preferences: { ...state.user.preferences, ...body.preferences }, portfolio: { ...state.user.portfolio, assetIds: [], assetPositions: {} } }; data = { success: true, user: state.user, token: 'local-browser-test' }; }
    if (url.pathname === '/api/audio/synthesize') {
      if (state.audioDelay) await new Promise(resolve => setTimeout(resolve, state.audioDelay));
      status = state.audioMode === 'error' ? 503 : 200;
      data = state.audioMode === 'error' ? { success: false, error: 'Fallo simulado del proveedor de audio.' }
        : { success: true, audioBase64, mimeType: 'audio/wav', engine: 'test', voice: 'es-AR-TomasNeural' };
    }
    if (url.pathname === '/api/calendar/events') data = { events: [] };
    if (url.pathname === '/api/admin/check') data = { isAdmin: !!state.user.isAdmin };
    if (url.pathname === '/api/notifications') data = { userId: fixture.id, notifications: [], enabled: state.active, subscribed: state.active, publicKey };
    if (url.pathname === '/api/notifications/subscription') {
      state.active = request.method() === 'POST'; state.user.preferences.notificationsEnabled = state.active;
      data = { success: true, preferences: state.user.preferences, subscribed: state.active, testSent: true };
    }
    if (url.pathname === '/api/notifications/test') data = { success: true, testSent: true };
    if (url.pathname === '/api/notifications/reminders') {
      if (state.saveFailure && request.method() === 'PUT') { status = 503; data = { error: 'No se pudo guardar el recordatorio.' }; } else {
      if (request.method() === 'PUT') state.events = body.events;
      data = { success: true, events: state.events };
      }
    }
    try { await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) }); } catch (error) { if (url.pathname !== '/api/audio/synthesize') throw error; }
  });
  if (progressiveNews) await context.addInitScript(({ items }) => {
    const original = window.fetch.bind(window);
    window.__newsStarts = 0;
    window.fetch = (input, init) => {
      if (new URL(typeof input === 'string' ? input : input.url, location.href).pathname !== '/api/news/pulse') return original(input, init);
      window.__newsStarts++;
      const encoder = new TextEncoder();
      const stream = new ReadableStream({ start(controller) {
        const send = frame => controller.enqueue(encoder.encode(JSON.stringify(frame) + '\n'));
        window.__finishNews = () => { send({ type: 'complete', news: items, checkedAt: new Date().toISOString() }); controller.close(); };
        window.__failNews = () => controller.error(new Error('Interrupción de prueba'));
        send({ type: 'progress', news: items.slice(0, 1), checkedAt: new Date().toISOString() });
        init?.signal?.addEventListener('abort', () => { try { controller.error(new DOMException('Aborted', 'AbortError')); } catch {} }, { once: true });
      } });
      return Promise.resolve(new Response(stream, { headers: { 'content-type': 'application/x-ndjson' } }));
    };
  }, { items: state.newsData });
  const page = await context.newPage();
  if (clockAt) await page.clock.install({ time: new Date(clockAt) });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(origin, { waitUntil: 'networkidle' });
  if (!anonymous) {
    try { await page.getByRole('heading', { name: '¿Querés recibir alertas de FAROS?' }).waitFor({ timeout: 10000 }); }
    catch (error) { console.error({ pageErrors, calls: state.calls.map(call => `${call.method} ${call.path}`), text: (await page.locator('body').innerText()).slice(0, 500) }); throw error; }
  }
  return { context, page, state };
}
async function clickVisible(page, name) {
  const matches = page.getByRole('button', { name, exact: true });
  try { await matches.first().waitFor({ state: 'visible', timeout: 10000 }); } catch (error) { console.error({ name, pageErrors, text: (await page.locator('body').innerText()).slice(0, 5000) }); throw error; }
  for (const match of await matches.all()) if (await match.isVisible()) { await match.click(); return; }
  throw new Error(`No se encontró el botón visible: ${name}`);
}
async function fits(page, label) {
  const size = await page.evaluate(() => ({ viewport: innerWidth, document: document.documentElement.scrollWidth }));
  if (size.document > size.viewport + 1) { console.error(await page.locator('body *').evaluateAll(els => els.filter(el => el.getBoundingClientRect().right > innerWidth + 1).map(el => ({ tag: el.tagName, class: el.className, text: el.textContent?.slice(0,120), right: el.getBoundingClientRect().right })).slice(-20))); await page.screenshot({ path: path.join(artifacts, 'overflow.png') }); }
  assert.ok(size.document <= size.viewport + 1, `${label}: ${JSON.stringify(size)}`);
}
async function dialogFits(page) {
  await page.waitForTimeout(100);
  const bounds = await page.getByRole('dialog').evaluate(el => {
    const rect = el.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, height: innerHeight, width: innerWidth, scroll: el.scrollWidth, client: el.clientWidth, maxHeight: getComputedStyle(el).maxHeight };
  });
  assert.ok(bounds.top >= -1 && bounds.bottom <= bounds.height + 1 && bounds.left >= 0 && bounds.right <= bounds.width, JSON.stringify(bounds));
  assert.ok(bounds.scroll <= bounds.client + 1, `Desborde dentro del diálogo: ${JSON.stringify(bounds)}`);
}

try {
  await check('Catálogo ampliado: selección, LONG/SHORT, guardado y feed al cambiar la cartera en tres tamaños', async () => {
    for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
      const { context, page, state } = await setup({ viewport: size });
      await clickVisible(page, 'Ahora no'); await clickVisible(page, 'Mi cartera');
      const search = page.getByPlaceholder('Escribí el símbolo o nombre del activo...');
      for (const [query, id] of [['microsoft', 'MSFT'], ['cordoba', 'CO29'], ['YPF obligaciones', 'YMCJO'], ['tesoro cer', 'TX28'], ['nasdaq 100', 'QQQ']]) {
        await search.fill(query);
        const result = page.getByRole('button').filter({ has: page.getByText(id, { exact: true }) });
        await result.first().waitFor(); await fits(page, `Resultados ${id} a ${size.width}`);
        await result.first().click();
        if (id === 'MSFT') await page.getByRole('button', { name: /SHORT.*baja/i }).click();
        const before = state.calls.filter(call => call.path === '/api/news/pulse').length;
        await clickVisible(page, `Agregar a mi cartera (${id === 'MSFT' ? 'SHORT' : 'LONG'})`);
        await page.waitForFunction(() => !document.querySelector('input[placeholder="Escribí el símbolo o nombre del activo..."]')?.value);
        assert.ok(state.user.portfolio.assetIds.includes(id));
        assert.equal(state.user.portfolio.assetPositions[id], id === 'MSFT' ? 'short' : 'long');
        for (let attempt = 0; attempt < 30 && state.calls.filter(call => call.path === '/api/news/pulse').length <= before; attempt++) await page.waitForTimeout(50);
        assert.ok(state.calls.filter(call => call.path === '/api/news/pulse').length > before, 'Debe consultar aunque exista caché para el mismo ID de cartera');
        assert.ok(state.calls.filter(call => call.path === '/api/news/pulse').at(-1).body.tickers.includes(id));
      }
      await fits(page, `Cartera ampliada a ${size.width}`);
      const before = state.calls.filter(call => call.path === '/api/news/pulse').length;
      await clickVisible(page, 'Quitar MSFT');
      for (let attempt = 0; attempt < 30 && state.calls.filter(call => call.path === '/api/news/pulse').length <= before; attempt++) await page.waitForTimeout(50);
      assert.ok(!state.user.portfolio.assetIds.includes('MSFT'));
      assert.ok(!state.calls.filter(call => call.path === '/api/news/pulse').at(-1).body.tickers.includes('MSFT'));
      await page.reload(); await clickVisible(page, 'Mi cartera');
      await page.getByRole('button', { name: 'Quitar CO29', exact: true }).waitFor();
      await fits(page, `Cartera recuperada a ${size.width}`);
      await context.close();
    }
  });
  await check('Lista completa incluye los activos ya seleccionados y evita duplicados al buscar Apple en tres tamaños', async () => {
    for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
      const { context, page, state } = await setup({ viewport: size });
      await clickVisible(page, 'Ahora no'); await clickVisible(page, 'Mi cartera');
      const search = page.getByPlaceholder('Escribí el símbolo o nombre del activo...');
      const available = ASSET_CATALOG.filter(asset => !state.user.portfolio.assetIds.includes(asset.id));
      const list = page.getByRole('region', { name: 'Activos disponibles', exact: true });
      await list.waitFor();
      assert.equal(await search.inputValue(), '');
      assert.equal(await page.getByText('¿No encontrás tu instrumento? Cargar identificación', { exact: true }).count(), 0);
      assert.equal(await page.getByLabel('Identificador o especie', { exact: true }).count(), 0);
      assert.ok(available.length > 60, 'La prueba debe alcanzar opciones que antes se ocultaban');
      assert.equal(await list.getByRole('button').count(), ASSET_CATALOG.length, 'Todo el catálogo, incluidos los activos propios, debe aparecer sin escribir');
      const listedIds = await list.getByRole('button').evaluateAll(buttons => buttons.map(button => button.dataset.assetId));
      assert.deepEqual(listedIds.sort(), ASSET_CATALOG.map(asset => asset.id).sort(), 'La lista contiene cada instrumento del catálogo exactamente una vez');
      const disabledIds = await list.getByRole('button').evaluateAll(buttons => buttons.filter(button => button.disabled).map(button => button.dataset.assetId));
      assert.deepEqual(disabledIds.sort(), [...state.user.portfolio.assetIds].sort(), 'Los activos propios permanecen visibles y no se pueden agregar de nuevo');
      assert.equal(await list.getByText('Ya seleccionado', { exact: true }).count(), state.user.portfolio.assetIds.length);
      const bounds = await list.evaluate(element => ({ height: element.clientHeight, scroll: element.scrollHeight, overflow: getComputedStyle(element).overflowY }));
      assert.ok(bounds.height > 0 && bounds.height <= size.height / 2, `La lista debe ocupar un espacio acotado: ${JSON.stringify(bounds)}`);
      assert.ok(bounds.scroll > bounds.height && ['auto', 'scroll'].includes(bounds.overflow), 'Todas las opciones deben alcanzarse con scroll');
      await fits(page, `Lista completa a ${size.width}`);
      await page.locator('[data-tour="portfolio-search"]').screenshot({ path: path.join(artifacts, `asset-selector-${size.width}.png`) });

      await search.fill('microsoft');
      await list.getByText('MSFT', { exact: true }).waitFor();
      assert.equal(await list.getByRole('button').count(), 1, 'La búsqueda filtra la misma lista');
      await search.fill('');
      const last = available.at(-1);
      const option = list.locator(`button[data-asset-id="${last.id}"]`);
      await option.waitFor();
      assert.equal(await list.getByRole('button').count(), ASSET_CATALOG.length, 'Limpiar la búsqueda restaura todo el catálogo');
      assert.equal(await option.isDisabled(), false);
      await option.getByText('Seleccionar', { exact: true }).waitFor();
      await option.click();
      await clickVisible(page, 'Agregar a mi cartera (LONG)');
      await page.getByRole('button', { name: `Quitar ${last.id}`, exact: true }).waitFor();
      assert.ok(state.user.portfolio.assetIds.includes(last.id), 'Debe guardarse una opción situada más allá de las primeras 60');
      await list.waitFor();
      assert.equal(await list.getByRole('button').count(), ASSET_CATALOG.length);
      await option.getByText('Ya seleccionado', { exact: true }).waitFor();
      assert.equal(await option.isDisabled(), true, 'La opción incorporada permanece visible pero no permite duplicarla');
      await page.reload(); await clickVisible(page, 'Mi cartera');
      await page.getByRole('button', { name: `Quitar ${last.id}`, exact: true }).waitFor();
      assert.equal(await list.getByRole('button').count(), ASSET_CATALOG.length, 'La selección y la lista completa se recuperan al recargar');
      assert.equal(await option.isDisabled(), true);
      await fits(page, `Lista recuperada a ${size.width}`);

      await search.fill('apple');
      const apple = list.locator('button[data-asset-id="AAPL"]');
      await apple.getByText('Ya seleccionado', { exact: true }).waitFor();
      assert.equal(await list.getByRole('button').count(), 1, 'Apple debe encontrarse aunque AAPL ya esté en la cartera');
      assert.equal(await apple.isDisabled(), true);
      assert.equal(state.user.portfolio.assetIds.filter(id => id === 'AAPL').length, 1);
      await clickVisible(page, 'Quitar AAPL');
      await page.getByRole('button', { name: 'Quitar AAPL', exact: true }).waitFor({ state: 'hidden' });
      await apple.getByText('Seleccionar', { exact: true }).waitFor();
      assert.equal(await apple.isDisabled(), false, 'Quitar el activo vuelve a habilitarlo sin ocultar el resultado de búsqueda');
      assert.ok(!state.user.portfolio.assetIds.includes('AAPL'));
      await apple.click(); await clickVisible(page, 'Agregar a mi cartera (LONG)');
      await page.getByRole('button', { name: 'Quitar AAPL', exact: true }).waitFor();
      await apple.getByText('Ya seleccionado', { exact: true }).waitFor();
      assert.equal(await apple.isDisabled(), true);
      assert.equal(state.user.portfolio.assetIds.filter(id => id === 'AAPL').length, 1, 'Volver a incorporar Apple guarda una sola posición');
      await page.reload(); await clickVisible(page, 'Mi cartera'); await search.fill('apple');
      await apple.getByText('Ya seleccionado', { exact: true }).waitFor();
      assert.equal(await apple.isDisabled(), true, 'Apple sigue encontrándose como seleccionado tras recargar');
      assert.equal(await list.getByRole('button').count(), 1);
      await fits(page, `Apple seleccionado a ${size.width}`);
      await context.close();
    }
  });
  await check('Noticias muestran solo los activos afectados seleccionados, también al quitar posiciones o vaciar la cartera', async () => {
    const scopedNews = {
      ...structuredClone(news[0]), id: 'selected-holdings-only', headline: 'Reporte de prueba de activos seleccionados',
      briefSummary: 'Publicación de prueba para comprobar la selección de instrumentos.',
      fullSynthesis: ['Síntesis utilizada únicamente en la prueba local.'],
      affectedAssetIds: ['GD30D', 'AL29', 'AL30', 'CCL'], impact: 'favorable',
      portfolioImpactAnalysis: { directExplanation: 'Relación de prueba con las posiciones de la cartera.', affectedHoldings: ['GD30D', 'AL29', 'AL30', 'CCL'].map(symbol => ({ symbol, impactDirection: 'favorable', relationshipDetail: 'Relación exclusiva de prueba.' })) }
    };
    const selected = { ...structuredClone(fixture.portfolio), assetIds: ['AL30', 'CCL', 'MSFT'], assetPositions: { CCL: 'short' } };
    // AL30 is a legacy LONG holding with no explicit position entry. MSFT is
    // selected but unrelated; GD30D must not be merged with another bond species.
    for (const size of [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 1000 }]) {
      const { context, page, state } = await setup({ viewport: size, portfolioOverride: selected, newsOverride: [scopedNews] });
      await clickVisible(page, 'Ahora no');
      const card = page.locator('article').filter({ has: page.getByRole('button', { name: scopedNews.headline, exact: true }) });
      const holdings = card.getByRole('region', { name: 'Activos de tu cartera afectados', exact: true });
      await holdings.waitFor();
      assert.equal(await holdings.getByText('AL30', { exact: true }).count(), 1);
      assert.equal(await holdings.getByText('CCL', { exact: true }).count(), 1);
      assert.equal(await holdings.getByText('LONG', { exact: true }).count(), 1, 'La pertenencia no depende de que exista una posición LONG explícita');
      assert.equal(await holdings.getByText('SHORT', { exact: true }).count(), 1);
      assert.doesNotMatch(await holdings.innerText(), /\b(AL29|GD30D|MSFT)\b/);
      assert.equal(await card.locator('div.font-mono').first().innerText(), 'AL', 'El avatar corresponde a un activo propio, no al primer activo externo de la noticia');
      await fits(page, `Noticia personalizada a ${size.width}`);
      await card.screenshot({ path: path.join(artifacts, `news-selected-assets-${size.width}.png`) });
      await card.getByRole('button', { name: 'Ver impacto', exact: true }).click();
      const detail = page.getByRole('dialog', { name: scopedNews.headline, exact: true });
      await detail.getByText('Desglose activo por activo (2)', { exact: true }).waitFor();
      assert.doesNotMatch(await detail.innerText(), /\b(AL29|GD30D|MSFT)\b/);
      assert.equal(await detail.getByRole('region', { name: 'Comparación de medios' }).getByRole('link').count(), scopedNews.sources.length, 'Las fuentes y comparación se conservan');
      await clickVisible(page, 'Cerrar detalle y detener audio');

      await clickVisible(page, 'Mi cartera'); await clickVisible(page, 'Quitar AL30');
      await page.getByRole('button', { name: 'Quitar AL30', exact: true }).waitFor({ state: 'hidden' });
      assert.deepEqual(state.user.portfolio.assetIds, ['CCL', 'MSFT']);
      await clickVisible(page, 'Noticias');
      await holdings.getByText('CCL', { exact: true }).waitFor();
      assert.equal(await holdings.getByText('AL30', { exact: true }).count(), 0, 'Quitar el activo actualiza la noticia sin recargar');
      assert.equal(await holdings.getByText('SHORT', { exact: true }).count(), 1);
      assert.doesNotMatch(await holdings.innerText(), /\b(AL29|GD30D|MSFT)\b/);
      await context.close();
    }

    // Stale position metadata must not turn an explicitly empty selection into
    // holdings, even when a cached/provider news item lists those same tickers.
    const { context, page } = await setup({ portfolioOverride: { ...selected, assetIds: [], assetPositions: { AL30: 'long', CCL: 'short' } }, newsOverride: [scopedNews] });
    await clickVisible(page, 'Ahora no'); await clickVisible(page, 'Noticias');
    const card = page.locator('article').filter({ has: page.getByRole('button', { name: scopedNews.headline, exact: true }) });
    await card.waitFor();
    assert.equal(await card.getByRole('region', { name: 'Activos de tu cartera afectados', exact: true }).count(), 0);
    assert.equal(await card.locator('div.font-mono').first().innerText(), 'MK');
    await card.getByRole('button', { name: 'Ver impacto', exact: true }).click();
    const detail = page.getByRole('dialog', { name: scopedNews.headline, exact: true });
    const noImpact = detail.getByText('Esta noticia no tiene impacto directo sobre los activos de tu cartera actual', { exact: true });
    await noImpact.waitFor();
    assert.doesNotMatch(await noImpact.locator('..').locator('..').innerText(), /\b(AL29|AL30|GD30D|CCL|MSFT)\b/, 'Una cartera vacía no debe enumerar instrumentos ajenos en su bloque personalizado');
    await context.close();
  });
  await check('Renueva noticias de la versión anterior sin tocar la sesión ni el calendario', async () => {
    const { context, page, state } = await setup({ legacyNews: true });
    assert.ok(state.calls.some(call => call.path === '/api/news/pulse'), 'El caché anterior oculta la comparación e impide consultar la versión nueva');
    await page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).first().waitFor();
    const saved = await page.evaluate(() => ({ oldNews: Object.keys(localStorage).filter(key => key.startsWith('faros_news_v4_coverage_')), session: localStorage.getItem('faros_session_token'), calendar: localStorage.getItem('faros_custom_events:usr_browser_test') }));
    assert.deepEqual(saved.oldNews, []);
    assert.equal(saved.session, 'browser-test-existing-session'); assert.equal(saved.calendar, '[]');
    const before = state.calls.filter(call => call.path === '/api/news/pulse').length;
    await Promise.all([page.waitForResponse(response => new URL(response.url()).pathname === '/api/news/pulse'), clickVisible(page, 'Actualizar pulso')]);
    assert.ok(state.calls.filter(call => call.path === '/api/news/pulse').length > before);
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').at(-1).body.forceRefresh, true);
    const refreshed = state.calls.filter(call => call.path === '/api/news/pulse').length;
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).first().waitFor();
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, refreshed, 'El caché de la versión actual sigue evitando búsquedas repetidas');
    await context.close();
  });
  await check('Noticias, Calendario y Mi cartera sin desborde en ocho anchos', async () => {
    const { context, page } = await setup();
    for (const width of [320, 360, 390, 430, 768, 820, 1024, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of ['Noticias', 'Calendario', 'Mi cartera']) {
        await clickVisible(page, tab);
        if (tab === 'Calendario') await page.getByRole('button', { name: 'Agregar evento', exact: true }).waitFor();
        if (tab === 'Mi cartera') await page.getByRole('navigation', { name: 'Secciones de Mi cartera' }).waitFor();
        await page.waitForTimeout(100); await fits(page, `${width} ${tab}`);
        if ([320, 390, 768, 1024, 1440].includes(width)) {
          await page.evaluate(() => scrollTo(0, 0));
          await page.screenshot({ path: path.join(artifacts, `${tab === 'Noticias' ? 'feed' : tab === 'Calendario' ? 'calendar' : 'portfolio'}-${width}.png`) });
        }
      }
    }
    assert.equal(await page.evaluate(() => window.__permissionRequests), 0, 'No debe pedir permiso al abrir o navegar');
    await context.close();
  });
  await check('Compara titulares de medios distintos con enlaces reales en celular y tablet', async () => {
    const { context, page } = await setup();
    await page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).first().click();
    const dialog = page.getByRole('dialog', { name: 'Comparación de medios', exact: true });
    await dialog.waitFor();
    const comparison = page.getByRole('region', { name: 'Comparación de medios' });
    await comparison.getByRole('heading', { name: 'El mismo hecho en 4 medios' }).waitFor();
    const links = comparison.getByRole('link', { name: /^Ver noticia en / });
    assert.equal(await links.count(), 4);
    assert.deepEqual((await links.evaluateAll(items => items.map(item => item.href))).sort(), news[0].sources.map(source => source.sourceUrl).sort());
    assert.equal(await comparison.getByText(news[0].sources[0].originalHeadline, { exact: false }).count(), 2, 'Ambos medios conservan el titular de agencia');
    for (const width of [320, 390, 768, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      await dialogFits(page); await fits(page, `Comparación ${width}`);
      await comparison.scrollIntoViewIfNeeded();
      if (width === 390 || width === 768) await page.screenshot({ path: path.join(artifacts, `comparison-${width}.png`) });
    }
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    await clickVisible(page, 'Calendario'); await clickVisible(page, 'Noticias');
    await context.close();
  });
  await check('Nombres largos, búsqueda y formularios del calendario en pantalla corta', async () => {
    const { context, page, state } = await setup({ longName: true, viewport: { width: 320, height: 568 } });
    await fits(page, 'Nombre de cartera sin espacios');
    await clickVisible(page, 'Buscar');
    await page.getByPlaceholder('Buscar activo o palabra clave...').fill('AL30'); await fits(page, 'Búsqueda abierta');
    await clickVisible(page, 'Calendario');
    await page.getByRole('button', { name: 'Agregar evento', exact: true }).click();
    await dialogFits(page);
    await page.getByPlaceholder('Ej: Cobro de renta semestral para reinversión en GD30...').fill('Recordatorio de prueba');
    await page.getByRole('button', { name: 'Crear Evento', exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Crear Evento', exact: true }).click();
    await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(state.events.length, 1, 'El evento debe guardarse en la cuenta');
    await page.setViewportSize({ width: 768, height: 400 });
    await page.getByRole('button', { name: 'Agregar evento', exact: true }).click();
    await dialogFits(page);
    await page.getByRole('button', { name: 'Cancelar', exact: true }).scrollIntoViewIfNeeded();
    await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
    await clickVisible(page, 'Mi cartera'); await fits(page, 'Cartera larga');
    await context.close();
  });
  await check('Registro y recuperación de cuatro dígitos en celular y horizontal', async () => {
    const { context, page } = await setup({ anonymous: true, viewport: { width: 320, height: 568 } });
    await clickVisible(page, 'Crear cuenta'); await dialogFits(page);
    await page.getByPlaceholder('Tu nombre').fill('Cuenta de prueba');
    await page.getByPlaceholder('tu.nombre@ejemplo.com').fill('ui@example.test');
    await page.getByPlaceholder('Mínimo 8 caracteres').fill('PasswordTest42!');
    await page.getByPlaceholder('Repetí la contraseña ingresada').fill('PasswordTest42!');
    await page.getByPlaceholder('4 dígitos').fill('0042');
    await page.getByLabel('Repetir código de recuperación', { exact: true }).fill('0042');
    assert.equal(await page.getByPlaceholder('4 dígitos').inputValue(), '0042');
    assert.equal(await page.getByPlaceholder('4 dígitos').evaluate(el => getComputedStyle(el).fontSize), '16px');
    await clickVisible(page, 'Continuar');
    await page.getByLabel('Fecha de nacimiento', { exact: false }).fill('1990-01-01');
    assert.equal(await page.getByText('Tu ALyC / Broker principal (opcional)', { exact: true }).count(), 0);
    const optionalConsent = page.getByRole('checkbox').nth(1);
    assert.equal(await optionalConsent.isChecked(), false, 'El consentimiento debe ser voluntario');
    await page.getByRole('checkbox').first().check(); await dialogFits(page);
    await page.setViewportSize({ width: 768, height: 400 }); await dialogFits(page);
    await clickVisible(page, 'Cerrar registro'); await clickVisible(page, 'Iniciar sesión');
    await clickVisible(page, '¿Olvidaste tu contraseña?');
    await page.getByPlaceholder('4 dígitos').fill('0042'); await dialogFits(page);
    await page.setViewportSize({ width: 320, height: 568 }); await dialogFits(page); await fits(page, 'Recuperación');
    await page.screenshot({ path: path.join(artifacts, 'recovery-320.png') });
    await context.close();
  });
  await check('Permiso por clic, alta con consentimiento, prueba y desactivación', async () => {
    const { context, page, state } = await setup();
    assert.equal(await page.evaluate(() => window.__permissionRequests), 0);
    await clickVisible(page, 'Activar alertas');
    await page.getByText('Alertas activadas en este dispositivo.', { exact: true }).first().waitFor();
    assert.equal(await page.evaluate(() => window.__permissionRequests), 1);
    const enrollment = state.calls.find(call => call.path.endsWith('/subscription') && call.method === 'POST');
    assert.equal(enrollment.body.consent, true);
    assert.equal(enrollment.body.expectedUserId, fixture.id);
    assert.equal(enrollment.body.subscription.endpoint, subscription.endpoint);
    await clickVisible(page, 'Mi cartera'); await clickVisible(page, 'Alertas');
    await clickVisible(page, 'Enviar aviso de prueba');
    await page.getByText('El aviso de prueba fue aceptado para este dispositivo.').first().waitFor();
    await clickVisible(page, 'Desactivar alertas');
    await page.getByText('Alertas desactivadas.', { exact: true }).first().waitFor();
    assert.equal(state.active, false);
    assert.ok(state.calls.some(call => call.method === 'DELETE' && call.body.disableAll === true));
    assert.equal(await page.evaluate(() => localStorage.getItem('test_push')), null);
    await context.close();
  });
  await check('Permiso rechazado sin alta de dispositivo', async () => {
    const { context, page, state } = await setup({ permission: 'denied' });
    await clickVisible(page, 'Activar alertas');
    await page.getByText('Las notificaciones están bloqueadas.', { exact: false }).first().waitFor();
    assert.equal(state.calls.filter(call => call.path.endsWith('/subscription')).length, 0);
    await context.close();
  });
  await check('Ahora no persiste y permite activar más tarde desde Mi cartera', async () => {
    const { context, page } = await setup();
    await clickVisible(page, 'Ahora no'); await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.getByRole('heading', { name: '¿Querés recibir alertas de FAROS?' }).count(), 0);
    await clickVisible(page, 'Mi cartera'); await clickVisible(page, 'Alertas');
    await page.getByRole('button', { name: 'Activar alertas', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.__permissionRequests), 0);
    await context.close();
  });
  await check('iPhone informa la instalación requerida sin solicitar permiso', async () => {
    const { context, page } = await setup({ userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' });
    await page.getByText('Compartir → Agregar a pantalla de inicio', { exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Activar alertas', exact: true }).count(), 0);
    assert.equal(await page.evaluate(() => window.__permissionRequests), 0);
    await fits(page, 'Instrucciones de iPhone');
    await context.close();
  });
  await check('Guardadas: conserva noticias completas 24 horas fuera del pulso y tras recargar', async () => {
    const old = [1,2].map((days, index) => {
      const item = structuredClone(news[0]); const at = new Date(Date.now() - days * 86400000).toISOString();
      item.id = `past-${index}`; item.headline = `Noticia anterior conservada ${index + 1}`;
      item.sources = item.sources.map(source => ({ ...source, publishedDateIso: at, publishedTimestamp: Date.parse(at) }));
      return item;
    });
    const { context, page, state } = await setup({ newsOverride: [], savedNewsOverride: old });
    await clickVisible(page, 'Ahora no');
    await page.getByRole('button', { name: 'Guardadas (2)', exact: true }).waitFor();
    state.newsMode = 'empty';
    await clickVisible(page, 'Actualizar pulso');
    await page.getByText('Sin novedades verificadas en esta consulta.', { exact: false }).waitFor();
    await clickVisible(page, 'Guardadas (2)');
    for (const item of old) await page.getByRole('button', { name: item.headline, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Quitar de guardadas', exact: true }).count(), 2);
    await page.reload({ waitUntil: 'networkidle' }); await clickVisible(page, 'Guardadas (2)');
    for (const item of old) await page.getByRole('button', { name: item.headline, exact: true }).waitFor();
    const card = page.locator('article').filter({ has: page.getByRole('button', { name: old[0].headline, exact: true }) });
    await card.getByRole('button', { name: 'Quitar de guardadas', exact: true }).click();
    await page.getByRole('button', { name: 'Guardadas (1)', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Noticias anteriores', exact: true }).count(), 0);
    assert.equal(await page.getByLabel('Fecha de noticias').count(), 0);
    assert.equal(state.calls.filter(call => call.path.endsWith('/history')).length, 0);
    await fits(page, 'Guardadas en móvil');
    await page.clock.install();
    const savedAt = Date.parse(state.libraries.get(state.user.id).find(entry => entry.savedAt).savedAt);
    await page.clock.setSystemTime(savedAt + 86400000 - 1000);
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('button', { name: 'Guardadas (1)', exact: true }).waitFor();
    await page.clock.runFor(1000);
    await page.getByRole('button', { name: 'Guardadas (0)', exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: old[1].headline, exact: true }).count(), 0);
    state.user.id = 'another-library-account'; state.user.email = 'another-library@example.test';
    await page.reload({ waitUntil: 'networkidle' }); await clickVisible(page, 'Guardadas (0)');
    assert.equal(await page.getByRole('button', { name: old[1].headline, exact: true }).count(), 0, 'No filtrar noticias guardadas de otra cuenta');
    await context.close();
  });
  await check('Guardadas: un fallo de almacenamiento no infla el contador ni marca una noticia como guardada', async () => {
    const { context, page, state } = await setup(); await clickVisible(page, 'Ahora no');
    await page.getByRole('button', { name: 'Guardadas (0)', exact: true }).waitFor();
    state.librarySaveFailure = true;
    const card = page.locator('article').first();
    await card.getByRole('button', { name: 'Guardar noticia', exact: true }).click();
    await page.getByText('No se pudo guardar la noticia de prueba.', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Guardadas (0)', exact: true }).waitFor();
    await card.getByRole('button', { name: 'Guardar noticia', exact: true }).waitFor();
    state.librarySaveFailure = false;
    await card.getByRole('button', { name: 'Guardar noticia', exact: true }).click();
    await page.getByRole('button', { name: 'Guardadas (1)', exact: true }).waitFor();
    await context.close();
  });
  await check('Carga progresiva: muestra noticias y habilita audio antes de completar medios; solo guarda el resultado final', async () => {
    const { context, page } = await setup({ progressiveNews: true });
    await clickVisible(page, 'Ahora no');
    const hero = page.getByRole('region', { name: 'Resumen de tu cartera' });
    await hero.getByText('Completando la comparación entre medios.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).count(), 1);
    assert.equal(await hero.getByRole('button', { name: 'Escuchar resumen del día' }).isEnabled(), true);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('faros_news_')).length), 0, 'El avance no se guarda como una consulta completa');
    await page.evaluate(() => window.__finishNews());
    await hero.getByText('Actualización completada.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).count(), news.length);
    await page.reload({ waitUntil: 'networkidle' });
    await hero.getByText('Mostrando información de una consulta anterior.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => window.__newsStarts), 0, 'La visita siguiente recupera la consulta completa sin esperar la red');
    await context.close();
  });
  await check('Una selección idéntica no reinicia el pulso pendiente ni elimina su caché', async () => {
    const { context, page, state } = await setup({ progressiveNews: true });
    await clickVisible(page, 'Ahora no');
    assert.equal(await page.evaluate(() => window.__newsStarts), 1);
    await clickVisible(page, 'Mi cartera'); await clickVisible(page, 'Preferencias');
    for (let index = 0; index < 2; index++) {
      await Promise.all([
        page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/user' && response.request().method() === 'PUT'),
        page.getByRole('radio', { name: 'Moderado', exact: true }).click()
      ]);
      // The response and a render must complete before checking request identity.
      await page.waitForFunction(() => document.querySelector('[role="radio"][aria-label="Moderado"]')?.getAttribute('aria-checked') === 'true');
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.equal(await page.evaluate(() => window.__newsStarts), 1, 'No se debe abortar y repetir una consulta por nuevas referencias de la misma selección');
    }
    await clickVisible(page, 'Noticias');
    await page.evaluate(() => window.__finishNews());
    await page.getByText('Actualización completada.', { exact: false }).first().waitFor();
    await clickVisible(page, 'Mi cartera'); await clickVisible(page, 'Preferencias');
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/auth/user' && response.request().method() === 'PUT'),
      page.getByRole('radio', { name: 'Moderado', exact: true }).click()
    ]);
    await page.reload({ waitUntil: 'networkidle' });
    assert.equal(await page.evaluate(() => window.__newsStarts), 0, 'Guardar la misma selección conserva la caché completa para la próxima visita');
    assert.ok(state.calls.filter(call => call.path === '/api/auth/user').length >= 3);
    await context.close();
  });
  await check('Una carga progresiva interrumpida conserva noticias verificadas y permite reintentar', async () => {
    const { context, page } = await setup({ progressiveNews: true });
    await clickVisible(page, 'Ahora no');
    const hero = page.getByRole('region', { name: 'Resumen de tu cartera' });
    await hero.getByText('Completando la comparación entre medios.', { exact: false }).waitFor();
    await page.evaluate(() => window.__failNews());
    await hero.getByText('Error al actualizar.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).count(), 1);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('faros_news_')).length), 0);
    assert.equal(await hero.getByRole('button', { name: 'Actualizar pulso' }).isEnabled(), true);
    await context.close();
  });
  await check('Recuperación: una caché de la hora con noticias de ayer no bloquea consultar ni recuperar la jornada', async () => {
    const clockAt = '2030-06-15T16:30:00Z';
    const dated = (index, at) => { const item = structuredClone(news[index]); item.sources = item.sources.map(source => ({ ...source, publishedTimestamp: Date.parse(at), publishedDateIso: at })); return item; };
    const older = dated(1, '2030-06-15T14:00:00Z');
    const current = dated(0, '2030-06-15T16:00:00Z');
    const invalid = dated(2, '2030-06-14T16:00:00Z');
    const portfolio = fixture.portfolio;
    const scope = `${portfolio.id}_${portfolioNewsScope(portfolio.assetIds, portfolio.profile, portfolio.assetPositions, portfolio.customAssets)}`;
    const currentKey = newsClientCacheKey(scope, argentinaNewsHour(Date.parse(clockAt)));
    const previousKey = newsClientCacheKey(scope, argentinaNewsHour(Date.parse(clockAt) - 3600000));
    const { context, page, state } = await setup({ clockAt, newsOverride: [current], pulseFailures: [503], pulseCacheSeeds: [
      [currentKey, JSON.stringify({ news: [invalid], checkedAt: clockAt })],
      [previousKey, JSON.stringify({ news: [older], checkedAt: '2030-06-15T15:00:00Z' })]
    ] });
    await clickVisible(page, 'Ahora no');
    await page.getByRole('button', { name: current.headline, exact: true }).waitFor();
    await page.getByRole('button', { name: older.headline, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: invalid.headline, exact: true }).count(), 0);
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, 2);
    await context.close();
  });
  await check('Recuperación: una consulta vacía de la hora conserva el acumulado válido anterior sin repetir la red', async () => {
    const clockAt = '2030-06-15T16:30:00Z';
    const older = structuredClone(news[0]);
    older.sources = older.sources.map(source => ({ ...source, publishedTimestamp: Date.parse('2030-06-15T14:00:00Z'), publishedDateIso: '2030-06-15T14:00:00Z' }));
    const portfolio = fixture.portfolio;
    const scope = `${portfolio.id}_${portfolioNewsScope(portfolio.assetIds, portfolio.profile, portfolio.assetPositions, portfolio.customAssets)}`;
    const { context, page, state } = await setup({ clockAt, pulseCacheSeeds: [
      [newsClientCacheKey(scope, argentinaNewsHour(Date.parse(clockAt))), JSON.stringify({ news: [], checkedAt: clockAt })],
      [newsClientCacheKey(scope, argentinaNewsHour(Date.parse(clockAt) - 3600000)), JSON.stringify({ news: [older], checkedAt: '2030-06-15T15:00:00Z' })]
    ] });
    await clickVisible(page, 'Ahora no');
    await page.getByRole('button', { name: older.headline, exact: true }).waitFor();
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, 0);
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: older.headline, exact: true }).waitFor();
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, 0);
    await context.close();
  });
  await check('Recuperación: la primera consulta se recupera automáticamente de un503 sin esperar otra hora', async () => {
    const { context, page, state } = await setup({ pulseFailures: [503] });
    await clickVisible(page, 'Ahora no');
    await page.getByRole('button', { name: news[0].headline, exact: true }).waitFor();
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, 2);
    assert.equal(await page.locator('#news-feed-section article').count(), news.length);
    await context.close();
  });
  await check('Recuperación: un404 no dispara reintentos automáticos ni consultas repetidas al recuperar foco', async () => {
    const { context, page, state } = await setup({ pulseFailures: [404] });
    await clickVisible(page, 'Ahora no');
    await page.getByText('El servicio de noticias no está disponible en esta versión.', { exact: false }).waitFor();
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(6000);
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, 1);
    assert.equal(await page.locator('#news-feed-section article').count(), 0);
    await context.close();
  });
  await check('Recuperación: los fallos transitorios agotan dos reintentos y no crean una tormenta de consultas', async () => {
    const { context, page, state } = await setup({ pulseFailures: [503, 503, 503] });
    await clickVisible(page, 'Ahora no');
    await page.waitForFunction(() => !document.body.innerText.includes('Reintentando automáticamente.') && document.body.innerText.includes('Error al actualizar.'), undefined, { timeout: 15000 });
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, 3);
    await page.evaluate(() => { window.dispatchEvent(new Event('focus')); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(2200);
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, 3);
    await context.close();
  });
  await check('Actualización confiable: búsqueda, error con contenido anterior, vacío y caché con horario real', async () => {
    const { context, page, state } = await setup();
    const checkedTime = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit' }).format(new Date(state.checkedAt));
    await page.getByText(checkedTime, { exact: false }).first().waitFor();
    const hero = page.getByRole('region', { name: 'Resumen de tu cartera' });
    const bounds = await hero.boundingBox(); assert.ok(bounds.height < 360, `Resumen demasiado alto: ${bounds.height}`);
    state.newsMode = 'error'; state.delayNews = 500;
    await clickVisible(page, 'Actualizar pulso');
    await hero.getByText('Buscando noticias.', { exact: false }).waitFor();
    await hero.getByText('Error al actualizar.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).count(), news.length);
    state.newsMode = 'empty'; state.delayNews = 0;
    await clickVisible(page, 'Actualizar pulso');
    await hero.getByText('Actualización completada.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).count(), news.length, 'Una actualización sin novedades conserva lo acumulado en la jornada');
    const before = state.calls.filter(call => call.path === '/api/news/pulse').length;
    await page.reload({ waitUntil: 'networkidle' });
    await hero.getByText('Mostrando información de una consulta anterior.', { exact: false }).waitFor();
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, before, 'La visita siguiente recupera la jornada completa sin repetir la consulta');
    await context.close();
  });
  await check('Jornada diaria: actualiza por hora, acumula y reinicia a medianoche sin perder Guardadas', async () => {
    const dated = (index, at) => {
      const item = structuredClone(news[index]);
      item.sources = item.sources.map(source => ({ ...source, publishedDateIso: at, publishedTimestamp: Date.parse(at) }));
      return item;
    };
    const first = dated(0, '2026-11-06T12:30:00Z');
    const second = dated(1, '2026-11-06T13:00:00Z');
    const tomorrow = dated(2, '2026-11-07T03:00:00Z');
    const { context, page, state } = await setup({ clockAt: '2026-11-06T12:59:55Z', newsOverride: [first] });
    await clickVisible(page, 'Ahora no');
    await page.getByRole('button', { name: first.headline, exact: true }).waitFor();
    const card = page.locator('article').first();
    await card.getByRole('button', { name: 'Guardar noticia', exact: true }).click();
    await page.getByRole('button', { name: 'Guardadas (1)', exact: true }).waitFor();
    const beforeHour = state.calls.filter(call => call.path === '/api/news/pulse').length;
    state.newsData = [second]; state.checkedAt = '2026-11-06T13:00:00Z';
    await page.clock.runFor(5100);
    await page.getByRole('button', { name: second.headline, exact: true }).waitFor();
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, beforeHour + 1);
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').at(-1).body.forceRefresh, false);
    assert.equal(await page.locator('#news-feed-section article').count(), 2);
    await page.getByRole('button', { name: first.headline, exact: true }).waitFor();
    state.newsMode = 'empty';
    await clickVisible(page, 'Actualizar pulso');
    await page.getByText('Actualización completada.', { exact: false }).first().waitFor();
    assert.equal(await page.locator('#news-feed-section article').count(), 2, 'Una actualización vacía no borra noticias de la mañana');
    const beforeReload = state.calls.filter(call => call.path === '/api/news/pulse').length;
    await page.reload({ waitUntil: 'networkidle' });
    await page.getByRole('button', { name: first.headline, exact: true }).waitFor();
    await page.getByRole('button', { name: second.headline, exact: true }).waitFor();
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, beforeReload);
    await page.clock.setSystemTime(new Date('2026-11-07T02:59:59Z'));
    state.checkedAt = '2026-11-07T02:59:59Z';
    await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/news/pulse'),
      page.evaluate(() => window.dispatchEvent(new Event('focus')))
    ]);
    await page.getByRole('button', { name: first.headline, exact: true }).click();
    await page.getByRole('dialog').waitFor();
    state.newsMode = 'ok'; state.newsData = [first, tomorrow]; state.checkedAt = '2026-11-07T03:00:00Z';
    await page.clock.runFor(1100);
    await page.getByRole('button', { name: tomorrow.headline, exact: true }).waitFor();
    assert.equal(await page.getByRole('dialog').count(), 0, 'La noticia seleccionada de ayer se cierra a las00:00');
    assert.equal(await page.getByRole('button', { name: first.headline, exact: true }).count(), 0);
    assert.equal(await page.getByRole('button', { name: second.headline, exact: true }).count(), 0);
    assert.equal(await page.locator('#news-feed-section article').count(), 1);
    assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => key.startsWith('faros_news_') && key.includes('_2026-11-06_')).length), 0);
    await clickVisible(page, 'Guardadas (1)');
    await page.getByRole('button', { name: first.headline, exact: true }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Guardadas (1)', exact: true }).count(), 1, 'El cambio de jornada no vence una guardada con menos de24horas');
    await context.close();
  });
  await check('Pestaña suspendida: recuperar foco después de medianoche retira ayer incluso si falla la consulta', async () => {
    const first = structuredClone(news[0]);
    first.sources = first.sources.map(source => ({ ...source, publishedDateIso: '2026-11-06T02:30:00Z', publishedTimestamp: Date.parse('2026-11-06T02:30:00Z') }));
    const { context, page, state } = await setup({ clockAt: '2026-11-06T02:59:50Z', newsOverride: [first] });
    await clickVisible(page, 'Ahora no');
    await page.getByRole('button', { name: first.headline, exact: true }).waitFor();
    const before = state.calls.filter(call => call.path === '/api/news/pulse').length;
    state.newsMode = 'error'; state.checkedAt = '2026-11-06T03:05:00Z';
    await page.clock.setSystemTime(new Date(state.checkedAt));
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.getByText('Error al actualizar.', { exact: false }).first().waitFor();
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, before + 1);
    assert.equal(await page.locator('#news-feed-section article').count(), 0, 'Ayer no reaparece como respaldo de una consulta fallida del nuevo día');
    assert.equal(await page.getByRole('button', { name: first.headline, exact: true }).count(), 0);
    await context.close();
  });
  await check('Secciones de cartera, posiciones LONG/SHORT, guardadas, audio y controles por teclado', async () => {
    const { context, page, state } = await setup();
    await clickVisible(page, 'Mi cartera');
    await clickVisible(page, 'Preferencias'); await page.getByRole('heading', { name: 'Mi Perfil de Inversor' }).waitFor();
    const toggle = page.getByRole('switch', { name: /Impacto en precio/ });
    await toggle.focus(); await page.keyboard.press(' ');
    assert.ok(state.calls.some(call => call.path === '/api/auth/user' && call.body.preferences));
    await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'false');
    await toggle.focus(); await page.keyboard.press(' ');
    await page.waitForFunction(() => document.querySelector('[role="switch"]')?.getAttribute('aria-checked') === 'true');
    await clickVisible(page, 'Cuenta y privacidad');
    await page.getByLabel('Tu ALyC / broker (opcional)').fill('Broker de prueba'); await clickVisible(page, 'Guardar datos opcionales');
    await page.getByText('Datos guardados en tu cuenta.', { exact: true }).waitFor();
    await clickVisible(page, 'Activos y carteras');
    // Existing position controls retain their LONG/SHORT semantics.
    const controls = page.locator('[data-tour="portfolio-assets-list"] button').filter({ hasText: /LONG|SHORT/ });
    await controls.first().click(); await page.waitForTimeout(100);
    assert.ok(state.calls.some(call => call.path === '/api/auth/user' && call.body.portfolio?.assetPositions));
    await clickVisible(page, 'Ver noticias de mi cartera');
    await page.getByRole('button', { name: news[0].headline, exact: true }).waitFor();
    const card = page.locator('article').filter({ has: page.getByRole('button', { name: news[0].headline, exact: true }) });
    await card.getByRole('button', { name: 'Guardar noticia', exact: true }).click();
    await card.getByRole('button', { name: 'Quitar de guardadas', exact: true }).waitFor();
    await card.getByRole('button', { name: 'Quitar de guardadas', exact: true }).click();
    await card.getByRole('button', { name: 'Guardar noticia', exact: true }).waitFor();
    await card.getByRole('button', { name: /Escuchar síntesis/ }).click();
    await page.waitForTimeout(150);
    assert.ok(state.calls.some(call => call.path === '/api/audio/synthesize' && call.body.voice === 'es-AR-TomasNeural' && typeof call.body.text === 'string'));
    await page.screenshot({ path: path.join(artifacts, 'audio-390.png') });
    await context.close();
  });
  await check('Audio reproduce bytes reales, permite pausa y reintento, y arranca también el resumen del día', async () => {
    const { context, page, state } = await setup({ audioMode: 'error' });
    await clickVisible(page, 'Ahora no');
    const card = page.locator('article').first();
    await card.getByRole('button', { name: /Escuchar síntesis/ }).click();
    const player = page.getByRole('region', { name: 'Reproductor de audio', exact: true });
    await player.getByRole('alert').getByText('Fallo simulado del proveedor de audio.', { exact: true }).waitFor();
    assert.equal(await player.getByRole('button', { name: 'Cancelar preparación del audio', exact: true }).count(), 0);
    state.audioMode = 'ok';
    await player.getByRole('button', { name: 'Reintentar', exact: true }).click();
    await player.getByRole('button', { name: 'Pausar audio', exact: true }).waitFor();
    const progress = player.getByRole('slider');
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Reproductor de audio"] [role="slider"]')?.getAttribute('aria-valuenow')) > 0.2);
    await player.getByRole('button', { name: 'Pausar audio', exact: true }).click();
    const paused = Number(await progress.getAttribute('aria-valuenow'));
    await page.waitForTimeout(350);
    assert.ok(Math.abs(Number(await progress.getAttribute('aria-valuenow')) - paused) < 0.2, 'La pausa detiene el audio real');
    await player.getByRole('button', { name: 'Reproducir audio', exact: true }).click();
    await player.getByRole('button', { name: 'Pausar audio', exact: true }).waitFor();
    await player.getByRole('button', { name: 'Cerrar reproductor y detener audio', exact: true }).click();
    await player.waitFor({ state: 'hidden' });
    await clickVisible(page, 'Escuchar resumen del día');
    await player.getByText('Resumen del día', { exact: true }).waitFor();
    await player.getByRole('button', { name: 'Pausar audio', exact: true }).waitFor();
    await page.waitForFunction(() => Number(document.querySelector('[aria-label="Reproductor de audio"] [role="slider"]')?.getAttribute('aria-valuenow')) > 0.2);
    assert.ok(state.calls.filter(call => call.path === '/api/audio/synthesize').every(call => call.body.voice === 'es-AR-TomasNeural'));
    await page.screenshot({ path: path.join(artifacts, 'audio-reliable-390.png') });
    await player.getByRole('button', { name: 'Cerrar reproductor y detener audio', exact: true }).click();
    await player.waitFor({ state: 'hidden' }); await context.close();
  });
  await check('Cerrar mientras se prepara audio impide que una respuesta tardía vuelva a reproducir', async () => {
    const { context, page, state } = await setup({ audioMode: 'error' });
    await clickVisible(page, 'Ahora no'); state.audioMode = 'ok'; state.audioDelay = 700;
    await page.locator('article').first().getByRole('button', { name: /Escuchar síntesis/ }).click();
    const player = page.getByRole('region', { name: 'Reproductor de audio', exact: true });
    await player.getByRole('button', { name: 'Cancelar preparación del audio', exact: true }).waitFor();
    await player.getByRole('button', { name: 'Cerrar reproductor y detener audio', exact: true }).click();
    await player.waitFor({ state: 'hidden' }); await page.waitForTimeout(1000);
    assert.equal(await player.count(), 0); await context.close();
  });
  await check('Agenda móvil, error de guardado sin perder borrador, edición y eliminación sincronizadas', async () => {
    const { context, page, state } = await setup({ viewport: { width: 320, height: 568 } });
    await clickVisible(page, 'Calendario');
    await page.getByRole('region', { name: 'Agenda próxima', exact: true }).waitFor();
    assert.equal(await page.locator('[data-tour="calendar-grid"]').isVisible(), false);
    await clickVisible(page, 'Vista mensual'); assert.equal(await page.locator('[data-tour="calendar-grid"]').isVisible(), true);
    await clickVisible(page, 'Agenda próxima');
    await clickVisible(page, 'Agregar evento');
    await page.getByPlaceholder('Ej: Cobro de renta semestral para reinversión en GD30...').fill('No perder este borrador');
    state.saveFailure = true; await clickVisible(page, 'Crear Evento');
    await page.getByText('No se pudo guardar el recordatorio.', { exact: true }).first().waitFor();
    assert.equal(await page.getByPlaceholder('Ej: Cobro de renta semestral para reinversión en GD30...').inputValue(), 'No perder este borrador');
    state.saveFailure = false; await clickVisible(page, 'Crear Evento'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(state.events.length, 1);
    await page.getByText('Recordatorios guardados en tu cuenta.', { exact: true }).waitFor();
    await clickVisible(page, 'Editar');
    await page.getByLabel('Nota u observación (opcional)').fill('Recordatorio editado');
    await clickVisible(page, 'Guardar Cambios'); await page.getByRole('dialog').waitFor({ state: 'hidden' });
    assert.equal(state.events[0].note, 'Recordatorio editado');
    const agenda = page.getByRole('region', { name: 'Agenda próxima', exact: true });
    await agenda.getByRole('button', { name: /Recordatorio personal/ }).first().click();
    await page.getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.getByRole('dialog', { name: 'Eliminar evento', exact: true }).getByRole('button', { name: 'Eliminar', exact: true }).click();
    await page.getByRole('dialog', { name: 'Eliminar evento', exact: true }).waitFor({ state: 'hidden' });
    assert.equal(state.events.length, 0);
    await page.getByRole('dialog', { name: 'Eventos del día', exact: true }).getByRole('button', { name: 'Cerrar', exact: true }).click();
    await page.screenshot({ path: path.join(artifacts, 'agenda-320.png') });
    await context.close();
  });
  await check('Aviso de versión protege un recordatorio pendiente y permite actualizar después de cancelar', async () => {
    const { context, page, state } = await setup();
    await clickVisible(page, 'Calendario'); await clickVisible(page, 'Agregar evento');
    await page.getByPlaceholder('Ej: Cobro de renta semestral para reinversión en GD30...').fill('Borrador protegido');
    state.revision = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    await page.getByRole('button', { name: 'Actualizar FAROS', exact: true }).waitFor();
    // The notice is behind the modal; activate it programmatically to verify the reload guard.
    await page.getByRole('button', { name: 'Actualizar FAROS', exact: true }).evaluate(button => button.click());
    await page.getByText('Guardá o cancelá los cambios pendientes antes de actualizar.', { exact: false }).waitFor({ state: 'attached' });
    assert.equal(await page.getByPlaceholder('Ej: Cobro de renta semestral para reinversión en GD30...').inputValue(), 'Borrador protegido');
    await clickVisible(page, 'Cancelar');
    await Promise.all([page.waitForEvent('load'), clickVisible(page, 'Actualizar FAROS')]);
    await context.close();
  });
  await check('Lectura ampliada, secciones y paisaje corto con foco y controles cómodos', async () => {
    const { context, page } = await setup();
    await clickVisible(page, 'Ahora no');
    await page.setViewportSize({ width: 320, height: 568 });
    await page.evaluate(() => { document.documentElement.style.fontSize = '20px'; });
    await fits(page, 'Texto ampliado');
    await page.evaluate(() => { document.documentElement.style.fontSize = ''; });
    await clickVisible(page, 'Mi cartera');
    for (const section of ['Activos y carteras', 'Preferencias', 'Alertas', 'Cuenta y privacidad']) {
      await clickVisible(page, section); await fits(page, `Sección ${section}`);
      await page.screenshot({ path: path.join(artifacts, `settings-${section.replaceAll(' ', '-')}-320.png`) });
    }
    for (const size of [{ width: 568, height: 320 }, { width: 768, height: 400 }]) {
      await page.setViewportSize(size);
      for (const tab of ['Noticias', 'Calendario', 'Mi cartera']) { await clickVisible(page, tab); await page.waitForTimeout(100); await fits(page, `${tab} horizontal`); }
    }
    await clickVisible(page, 'Noticias');
    const compare = page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).first();
    await compare.focus(); await page.keyboard.press('Enter'); await dialogFits(page);
    await page.keyboard.press('Shift+Tab');
    assert.ok(await page.getByRole('dialog').evaluate(el => el.contains(document.activeElement)), 'El foco permanece en la comparación');
    await page.keyboard.press('Escape'); assert.ok(await compare.evaluate(el => el === document.activeElement), 'Al cerrar se recupera el foco');
    await page.screenshot({ path: path.join(artifacts, 'landscape-768.png') });
    await context.close();
  });
  await check('Registro de dos pasos lleva a elegir activos sin tutorial obligatorio', async () => {
    const { context, page, state } = await setup({ anonymous: true });
    await clickVisible(page, 'Crear cuenta');
    await page.getByLabel('Nombre', { exact: true }).fill('Nueva cuenta');
    await page.getByLabel('Correo electrónico', { exact: true }).fill('nueva@example.test');
    await page.getByLabel('Contraseña', { exact: true }).fill('PasswordTest42!');
    await page.getByLabel('Confirmar contraseña', { exact: true }).fill('PasswordTest42!');
    await page.getByPlaceholder('4 dígitos').fill('0042');
    await page.getByLabel('Repetir código de recuperación', { exact: true }).fill('0042');
    await clickVisible(page, 'Continuar'); await page.getByLabel('Fecha de nacimiento', { exact: false }).fill('1990-01-01'); await page.getByRole('checkbox').first().check();
    await clickVisible(page, 'Crear mi cuenta en FAROS');
    await page.getByText('Buscá tu primer activo, elegí LONG o SHORT y agregalo a tu cartera.', { exact: true }).waitFor();
    const registration = state.calls.find(call => call.path === '/api/auth/register');
    assert.equal(registration.body.termsAccepted, true); assert.equal(registration.body.notificationsOptIn, false);
    assert.equal(registration.body.recoveryKey, '0042'); assert.equal(registration.body.birthDate, '1990-01-01');
    assert.equal(await page.getByText('¡Bienvenido a FAROS!', { exact: true }).count(), 0);
    await context.close();
  });
  await check('Única fuente verificada y recuperación cuando falla la carga de una pantalla', async () => {
    const singleSource = [{ ...news[0], sources: [news[0].sources[0]], coverageCount: 1 }];
    const { context, page } = await setup({ newsOverride: singleSource });
    await clickVisible(page, 'Actualizar pulso');
    await page.getByRole('button', { name: 'Ver única fuente verificada', exact: true }).click();
    await page.getByRole('heading', { name: 'Una fuente verificada', exact: true }).waitFor();
    assert.equal(await page.getByRole('region', { name: 'Comparación de medios' }).getByRole('link').count(), 1);
    await page.keyboard.press('Escape');
    await page.route('**/assets/FinancialCalendar-*.js', route => route.abort());
    await clickVisible(page, 'Calendario');
    await page.getByText('No pudimos cargar esta pantalla.', { exact: false }).waitFor();
    await page.getByRole('button', { name: 'Volver a cargar FAROS', exact: true }).waitFor();
    await clickVisible(page, 'Noticias');
    await page.getByRole('button', { name: 'Ver única fuente verificada', exact: true }).waitFor();
    await context.close();
  });
  await check('Clasificación real: señales de bonos y riesgo, contador, filtro, detalle y LONG/SHORT', async () => {
    const publications = JSON.parse(readFileSync(new URL('./fixtures/classification-production-2026-11-06.json', import.meta.url), 'utf8'));
    const headlines = [...publications.map(item => item.headline), 'El BCRA compró dólares y sumó reservas'];
    const classified = headlines.map((headline, index) => {
      const analysis = analyzeNewsRelevance(headline);
      const item = structuredClone(news[0]);
      return { ...item, id: `classification-${index}`, headline, impact: analysis.impact, relevanceType: analysis.relevanceType,
        affectedAssetIds: analysis.affectedAssetIds, briefSummary: headline, fullSynthesis: [analysis.explanation],
        sources: [{ ...item.sources[0], sourceUrl: `https://www.ambito.com/finanzas/classification-${index}`, originalHeadline: headline }], coverageCount: 1,
        portfolioImpactAnalysis: { directExplanation: analysis.explanation, affectedHoldings: Object.entries(analysis.assetImpacts).map(([symbol, impactDirection]) => ({ symbol, impactDirection, relationshipDetail: analysis.relationships[symbol] })) } };
    });
    for (const position of ['long', 'short']) {
      const { context, page } = await setup({ legacyNews: position === 'long' ? 'v13_news_tracking_coverage' : 'v14_directional_classification', newsOverride: classified,
        portfolioOverride: { ...MOCK_PORTFOLIOS[0], assetIds: ['AL30'], assetPositions: { AL30: position } } });
      await clickVisible(page, 'Ahora no');
      const group = page.getByRole('group', { name: 'Filtrar noticias por impacto', exact: true });
      await group.getByRole('button', { name: `Favorables: ${position === 'long' ? 2 : 1} noticias`, exact: true }).waitFor();
      await group.getByRole('button', { name: `Alertas: ${position === 'long' ? 1 : 2} noticias`, exact: true }).waitFor();
      await group.getByRole('button', { name: 'Neutrales: 1 noticias', exact: true }).waitFor();
      const card = page.locator('article').filter({ has: page.getByRole('button', { name: headlines[1], exact: true }) });
      await card.getByText(position === 'long' ? 'Alerta' : 'Favorable', { exact: true }).waitFor();
      await card.getByRole('button', { name: headlines[1], exact: true }).click();
      await page.getByText(position === 'long' ? 'Desfavorable para posición Long (condicional)' : 'Favorable para posición Short (condicional)', { exact: true }).waitFor();
      await page.getByRole('button', { name: 'Cerrar detalle y detener audio', exact: true }).click();
      await group.getByRole('button', { name: `Alertas: ${position === 'long' ? 1 : 2} noticias`, exact: true }).click();
      await page.waitForFunction(expected => document.querySelectorAll('#news-feed-section article').length === expected, position === 'long' ? 1 : 2);
      assert.equal(await page.evaluate(() => Object.keys(localStorage).filter(key => /^faros_news_v(?:13|14)_/.test(key)).length), 0, 'No reutiliza la clasificación neutral antigua');
      assert.equal(await page.evaluate(() => localStorage.getItem('faros_session_token')), 'browser-test-existing-session', 'La renovación de noticias conserva la sesión');
      assert.equal(await page.getByRole('button', { name: 'Noticias anteriores', exact: true }).count(), 0);
      await fits(page, `Clasificación en móvil ${position}`);
      await page.screenshot({ path: path.join(artifacts, `classification-${position}.png`), fullPage: true });
      await context.close();
    }
  });
  await check('Clasificación judicial: catalizadores y producción generan señales antes de la cotización; opinión y LONG/SHORT conservan su sentido', async () => {
    const publications = [
      { headline: 'La Justicia ordenó a YPF pagar una indemnización millonaria', direction: 'alerta' },
      { headline: 'La Justicia rechazó la demanda contra YPF', direction: 'favorable' },
      { headline: 'YPF bajó 9% su producción', direction: 'alerta' },
      { headline: 'Juicio YPF: mucho ruido y una premisa equivocada', direction: 'neutral', articleSummary: 'El amicus de los 15 Estados confunde jurisdicción con derecho aplicable: el Segundo Circuito sí juzgó a la Argentina, pero aplicó ley argentina.' }
    ];
    const classified = publications.map(({ headline, direction, articleSummary }, index) => {
      const analysis = analyzeNewsRelevance(headline, ASSET_CATALOG, articleSummary);
      assert.equal(analysis.relevanceType, 'valoracion_mercado', 'Un catalizador no equivale a una cotización observada');
      assert.equal(analysis.assetImpacts.YPFD, direction, headline);
      const item = structuredClone(news[0]);
      return { ...item, id: `judicial-classification-${index}`, headline, impact: analysis.impact, relevanceType: analysis.relevanceType,
        affectedAssetIds: analysis.affectedAssetIds, briefSummary: headline, fullSynthesis: [analysis.explanation],
        sources: [{ ...item.sources[0], sourceUrl: `https://www.ambito.com/finanzas/judicial-classification-${index}`, originalHeadline: headline, articleSummary }], coverageCount: 1,
        portfolioImpactAnalysis: { directExplanation: analysis.explanation, affectedHoldings: Object.entries(analysis.assetImpacts).map(([symbol, impactDirection]) => ({ symbol, impactDirection, relationshipDetail: analysis.relationships[symbol] })) } };
    });
    for (const position of ['long', 'short']) {
      const { context, page } = await setup({ newsOverride: classified, portfolioOverride: { ...MOCK_PORTFOLIOS[0], assetIds: ['YPFD'], assetPositions: { YPFD: position } } });
      await clickVisible(page, 'Ahora no');
      const group = page.getByRole('group', { name: 'Filtrar noticias por impacto', exact: true });
      await group.getByRole('button', { name: `Alertas: ${position === 'long' ? 2 : 1} noticias`, exact: true }).waitFor();
      await group.getByRole('button', { name: `Favorables: ${position === 'long' ? 1 : 2} noticias`, exact: true }).waitFor();
      await group.getByRole('button', { name: 'Neutrales: 1 noticias', exact: true }).waitFor();
      const adverse = page.locator('article').filter({ has: page.getByRole('button', { name: publications[0].headline, exact: true }) });
      await adverse.getByText(position === 'long' ? 'Alerta' : 'Favorable', { exact: true }).waitFor();
      await adverse.getByText('Por qué se clasifica así', { exact: true }).click();
      await adverse.getByText(classified[0].portfolioImpactAnalysis.directExplanation, { exact: true }).waitFor();
      await adverse.getByRole('button', { name: publications[0].headline, exact: true }).click();
      await page.getByText(position === 'long' ? 'Desfavorable para posición Long (condicional)' : 'Favorable para posición Short (condicional)', { exact: true }).waitFor();
      await page.getByRole('dialog').getByText(classified[0].portfolioImpactAnalysis.directExplanation, { exact: true }).first().waitFor();
      await page.getByRole('button', { name: 'Cerrar detalle y detener audio', exact: true }).click();
      const opinion = page.locator('article').filter({ has: page.getByRole('button', { name: publications[3].headline, exact: true }) });
      await opinion.getByText('Neutral', { exact: true }).waitFor();
      await opinion.getByText('Valoración de mercado', { exact: true }).waitFor();
      await opinion.getByRole('button', { name: publications[3].headline, exact: true }).click();
      assert.match(classified[3].portfolioImpactAnalysis.directExplanation, /judicial/i);
      await page.getByRole('dialog').getByText(classified[3].portfolioImpactAnalysis.directExplanation, { exact: true }).first().waitFor();
      await page.getByRole('button', { name: 'Cerrar detalle y detener audio', exact: true }).click();
      await group.getByRole('button', { name: `Alertas: ${position === 'long' ? 2 : 1} noticias`, exact: true }).click();
      await page.waitForFunction(expected => document.querySelectorAll('#news-feed-section article').length === expected, position === 'long' ? 2 : 1);
      await fits(page, `Catalizadores judiciales ${position}`);
      await page.screenshot({ path: path.join(artifacts, `judicial-classification-${position}.png`), fullPage: true });
      await context.close();
    }
  });
  await check('Clasificación judicial: corrige una neutral antigua de la caché del día sin borrar noticias ni renovar su horario', async () => {
    const clockAt = '2030-06-15T16:30:00Z';
    const checkedAt = '2030-06-15T16:05:00Z';
    const headline = 'La Justicia ordenó a YPF pagar una indemnización millonaria';
    const stale = { ...structuredClone(news[0]), id: 'live-news-ypf-stale', headline, briefSummary: headline,
      impact: 'neutral', relevanceType: 'ruido', affectedAssetIds: ['YPFD'],
      sources: [{ mediaName: 'Ámbito', sourceUrl: 'https://www.ambito.com/finanzas/judicial-stale-fixture', originalHeadline: headline, publishedDateIso: '2030-06-15T15:00:00Z', publishedTimestamp: Date.parse('2030-06-15T15:00:00Z') }], coverageCount: 1,
      portfolioImpactAnalysis: { directExplanation: 'Clasificación neutral antigua.', affectedHoldings: [{ symbol: 'YPFD', impactDirection: 'neutral', relationshipDetail: 'Clasificación antigua.' }] } };
    const portfolio = { ...MOCK_PORTFOLIOS[0], assetIds: ['YPFD'], assetPositions: { YPFD: 'long' } };
    const scope = `${portfolio.id}_${portfolioNewsScope(portfolio.assetIds, portfolio.profile, portfolio.assetPositions, portfolio.customAssets)}`;
    const cacheKey = newsClientCacheKey(scope, argentinaNewsHour(Date.parse(clockAt)));
    const { context, page, state } = await setup({ clockAt, portfolioOverride: portfolio, pulseCacheSeeds: [[cacheKey, JSON.stringify({ news: [stale], checkedAt })]] });
    await clickVisible(page, 'Ahora no');
    await page.getByRole('group', { name: 'Filtrar noticias por impacto', exact: true }).getByRole('button', { name: 'Alertas: 1 noticias', exact: true }).waitFor();
    const card = page.locator('article').filter({ has: page.getByRole('button', { name: headline, exact: true }) });
    await card.getByText('Alerta', { exact: true }).waitFor();
    await card.getByText('Valoración de mercado', { exact: true }).waitFor();
    const expectedTime = await page.evaluate(at => new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(at)), checkedAt);
    assert.ok((await page.getByRole('region', { name: 'Resumen de tu cartera' }).getByRole('status').innerText()).includes(expectedTime), 'La tarjeta conserva la hora original con el formato local del navegador');
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, 0, 'La corrección de reglas no requiere repetir una consulta ya guardada');
    assert.equal(await page.evaluate(key => JSON.parse(localStorage.getItem(key)).checkedAt, cacheKey), checkedAt);
    await card.getByRole('button', { name: headline, exact: true }).click();
    assert.equal(await page.getByText('Clasificación neutral antigua.', { exact: true }).count(), 0);
    await page.getByText('Desfavorable para posición Long (condicional)', { exact: true }).waitFor();
    await context.close();
  });
  await check('Contadores visibles de impacto filtran inmediatamente la lista y permiten quitar el filtro', async () => {
    const { context, page, state } = await setup({ viewport: { width: 1440, height: 900 } });
    await clickVisible(page, 'Ahora no');
    state.newsData = news.map((item, index) => {
      const impact = ['favorable', 'alerta', 'neutral'][index];
      return { ...item, affectedAssetIds: ['AL30'], relevanceType: 'impacto_precio', impact,
        portfolioImpactAnalysis: { directExplanation: 'Clasificación exclusiva de prueba.', affectedHoldings: [{ symbol: 'AL30', impactDirection: impact, relationshipDetail: 'Relación exclusiva de prueba.' }] } };
    });
    await clickVisible(page, 'Actualizar pulso');
    const group = page.getByRole('group', { name: 'Filtrar noticias por impacto', exact: true });
    await group.getByRole('button', { name: 'Alertas: 1 noticias', exact: true }).waitFor();
    const hero = page.getByRole('region', { name: 'Resumen de tu cartera' });
    const heroBox = await hero.boundingBox(); const groupBox = await group.boundingBox();
    assert.ok(groupBox.x > heroBox.x + heroBox.width / 2, 'Los contadores ocupan el espacio derecho del resumen');
    await page.screenshot({ path: path.join(artifacts, 'impact-summary-1440.png') });
    for (const [index, label] of ['Favorables', 'Alertas', 'Neutrales'].entries()) {
      const button = group.getByRole('button', { name: `${label}: 1 noticias`, exact: true });
      await button.click();
      await page.waitForFunction(() => document.querySelectorAll('#news-feed-section article').length === 1);
      assert.equal(await page.locator('#news-feed-section article h3').innerText(), news[index].headline);
      assert.equal(await button.getAttribute('aria-pressed'), 'true');
      await page.waitForFunction(() => window.scrollY > 0);
      await button.click();
      await page.waitForFunction(() => document.querySelectorAll('#news-feed-section article').length === 3);
      assert.equal(await button.getAttribute('aria-pressed'), 'false');
    }
    for (const width of [320, 390, 768]) {
      await page.setViewportSize({ width, height: 900 });
      await page.evaluate(() => scrollTo(0, 0));
      await fits(page, `Contadores de impacto ${width}`);
      assert.equal(await group.getByRole('button').count(), 3);
      for (const button of await group.getByRole('button').all()) assert.equal(await button.isVisible(), true);
      await page.screenshot({ path: path.join(artifacts, `impact-summary-${width}.png`) });
    }
    await context.close();
  });
  await check('Activos del resumen filtran, bajan a las noticias y sincronizan la selección', async () => {
    const { context, page, state } = await setup();
    await clickVisible(page, 'Ahora no');
    state.newsData = news.map((item, index) => ({ ...item, affectedAssetIds: index === 0 ? ['AL30'] : index === 1 ? ['MEP'] : ['AL30', 'MEP'], impact: 'favorable' }));
    await clickVisible(page, 'Actualizar pulso');
    const hero = page.getByRole('region', { name: 'Resumen de tu cartera' });
    await hero.locator('summary').click();
    const al30 = hero.getByRole('button', { name: 'Filtrar noticias de AL30: 2', exact: true });
    const mep = hero.getByRole('button', { name: 'Filtrar noticias de MEP: 2', exact: true });
    await al30.click();
    await page.waitForFunction(() => document.querySelectorAll('#news-feed-section article').length === 2);
    assert.deepEqual((await page.locator('#news-feed-section article h3').allInnerTexts()).sort(), [news[0].headline, news[2].headline].sort());
    assert.equal(await al30.getAttribute('aria-pressed'), 'true');
    assert.equal(await page.locator('[data-tour="feed-filters"] select').inputValue(), 'AL30');
    await page.waitForFunction(() => window.scrollY > 0);
    await mep.click();
    await page.waitForFunction(() => document.querySelector('[data-tour="feed-filters"] select')?.value === 'MEP');
    assert.deepEqual((await page.locator('#news-feed-section article h3').allInnerTexts()).sort(), [news[1].headline, news[2].headline].sort());
    assert.equal(await al30.getAttribute('aria-pressed'), 'false');
    assert.equal(await mep.getAttribute('aria-pressed'), 'true');
    await mep.click();
    await page.waitForFunction(() => document.querySelectorAll('#news-feed-section article').length === 3);
    assert.equal(await mep.getAttribute('aria-pressed'), 'false');
    assert.equal(await page.locator('[data-tour="feed-filters"] select').inputValue(), 'todos');
    await context.close();
  });
  await check('Identidad Faros: logos originales, tokens, tipografía declarada y contraste de las pantallas', async () => {
    const { context, page } = await setup();
    await clickVisible(page, 'Ahora no');
    const report = [];
    let auditPage = page;
    const inspect = async label => {
      await auditPage.evaluate(async () => { await Promise.all([300,400,700].map(weight => document.fonts.load(`${weight} 16px "Basis Grotesque Arabic Pro"`, 'ÁÉÍÓÚÑáéíóúñ0123456789€'))); await document.fonts.ready; });
      await auditPage.waitForTimeout(250);
      const audit = await auditPage.evaluate(() => {
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const rgba = color => { ctx.clearRect(0,0,1,1); ctx.fillStyle = color; ctx.fillRect(0,0,1,1); return [...ctx.getImageData(0,0,1,1).data].map((x,i) => i === 3 ? x/255 : x); };
        const blend = (front, back) => front.slice(0,3).map((x,i) => x*front[3]+back[i]*(1-front[3]));
        const luminance = c => c.map(x => x/255).map(x => x <= .04045 ? x/12.92 : ((x+.055)/1.055)**2.4).reduce((n,x,i) => n+x*[.2126,.7152,.0722][i],0);
        const failures = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        while (walker.nextNode()) {
          const node = walker.currentNode; const el = node.parentElement; const text = node.textContent.trim();
          if (!text || !el || ['SCRIPT','STYLE','OPTION','SUMMARY'].includes(el.tagName) || el.closest('[disabled], [aria-disabled="true"], [aria-hidden="true"], .sr-only')) continue;
          const r = el.getBoundingClientRect(); const style = getComputedStyle(el);
          if (!r.width || !r.height || r.bottom < 0 || r.top > innerHeight || style.visibility === 'hidden') continue;
          const chain = []; let ancestor = el; let complex = false; let opacity = 1;
          while (ancestor) { const c = getComputedStyle(ancestor); if (c.backgroundImage !== 'none') complex = true; opacity *= Number(c.opacity); chain.unshift(rgba(c.backgroundColor)); ancestor = ancestor.parentElement; }
          if (complex || opacity < .9) continue;
          let background = [252,252,252]; for (const layer of chain) background = blend(layer, background);
          const foreground = blend(rgba(style.color),background);
          const [a,b] = [luminance(foreground),luminance(background)].sort((a,b) => a-b);
          const ratio = (b+.05)/(a+.05); const large = parseFloat(style.fontSize) >= 24 || (parseFloat(style.fontSize) >= 18.66 && Number(style.fontWeight) >= 700);
          if (ratio + .01 < (large ? 3 : 4.5)) failures.push({ text: text.slice(0,80), ratio: +ratio.toFixed(2), color: style.color, background, class: el.className });
        }
        return { failures, fontFamily: getComputedStyle(document.body).fontFamily, logoPaths: [...document.querySelectorAll('.brand-logo img')].filter(el => el.getClientRects().length).map(el => new URL(el.src).pathname), fontAvailable: document.fonts.check('16px "Basis Grotesque Arabic Pro"') };
      });
      report.push({ label, ...audit });
      assert.match(audit.fontFamily, /Basis Grotesque Arabic Pro/);
      assert.equal(audit.fontAvailable, true, 'La fuente real se descarga y está disponible');
      assert.ok(await auditPage.locator('.brand-logo img').evaluateAll(images => images.every(img => img.complete && img.naturalWidth > 0)), 'Los logos se cargan correctamente');
      assert.ok(audit.logoPaths.length > 0 && audit.logoPaths.every(path => /^\/brand\/faros-(logo|symbol)-(light|dark|gray)\.svg$/.test(path)));
      await auditPage.screenshot({ path: path.join(artifacts, `brand-${label}.png`), fullPage: false });
    };
    for (const width of [320,390,768,1024,1440]) {
      await page.setViewportSize({ width, height: 900 });
      for (const tab of ['Noticias','Calendario','Mi cartera']) {
        await clickVisible(page, tab);
        if (tab === 'Calendario') await page.getByRole('button', { name: 'Agregar evento', exact: true }).waitFor();
        if (tab === 'Mi cartera') await page.getByRole('navigation', { name: 'Secciones de Mi cartera' }).waitFor();
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await fits(page, `Marca ${tab} ${width}`);
        await inspect(`${tab === 'Noticias' ? 'feed' : tab === 'Calendario' ? 'calendar' : 'portfolio'}-${width}`);
      }
    }
    await clickVisible(page, 'Preferencias'); await inspect('preferences-1440');
    await clickVisible(page, 'Activos y carteras'); await clickVisible(page, 'Crear nueva cartera');
    await dialogFits(page); await inspect('onboarding-step-1');
    await clickVisible(page, 'Elegir activos');
    for (const width of [320, 390, 768, 832, 1440]) {
      await page.setViewportSize({ width, height: width < 500 ? 640 : 900 });
      await dialogFits(page);
      const categories = page.getByRole('group', { name: 'Filtrar activos por categoría' });
      const geometry = await categories.locator('button').evaluateAll(buttons => buttons.map(button => {
        const rect = button.getBoundingClientRect();
        const text = document.createRange(); text.selectNodeContents(button);
        const label = text.getBoundingClientRect();
        return { name: button.textContent, left: rect.left, right: rect.right, textLeft: label.left, textRight: label.right, height: rect.height };
      }));
      geometry.forEach((button, index) => {
        assert.ok(button.textLeft >= button.left - 1 && button.textRight <= button.right + 1, `Etiqueta fuera de su botón a ${width}: ${button.name}`);
        if (index) assert.ok(button.left >= geometry[index - 1].right, `Categorías superpuestas a ${width}: ${button.name}`);
        assert.ok(button.height >= 44, `Objetivo táctil insuficiente: ${button.name}`);
      });
      const last = categories.locator('button').last();
      await last.scrollIntoViewIfNeeded(); await last.click();
      assert.equal(await last.getAttribute('aria-pressed'), 'true');
      await fits(page, `Crear cartera ${width}`);
      await inspect(`onboarding-step-2-${width}`);
      await categories.getByRole('button', { name: 'Todos', exact: true }).scrollIntoViewIfNeeded();
      await categories.getByRole('button', { name: 'Todos', exact: true }).click();
    }
    await page.keyboard.press('Escape');
    await context.close();
    await import('node:fs/promises').then(fs => fs.writeFile(path.join(artifacts,'brand-audit.json'), JSON.stringify(report,null,2)));
    const anonymous = await setup({ anonymous: true, viewport: { width: 390, height: 844 } });
    auditPage = anonymous.page;
    await inspect('welcome-390');
    // Anonymous surfaces are also captured with the exact supplied dark-background logo.
    for (const action of ['Crear cuenta','Cerrar registro','Iniciar sesión','¿Olvidaste tu contraseña?']) {
      await clickVisible(anonymous.page, action);
      if (action !== 'Cerrar registro') await dialogFits(anonymous.page);
      await inspect(`auth-${action.replaceAll(' ','-').replaceAll('¿','').replaceAll('?','')}`);
      if (action === 'Crear cuenta') {
        await anonymous.page.getByLabel('Nombre', { exact: true }).fill('Cuenta de prueba');
        await anonymous.page.getByLabel('Correo electrónico', { exact: true }).fill('brand@example.test');
        await anonymous.page.getByLabel('Contraseña', { exact: true }).fill('PasswordTest42!');
        await anonymous.page.getByLabel('Confirmar contraseña', { exact: true }).fill('PasswordTest42!');
        await anonymous.page.getByPlaceholder('4 dígitos').fill('0042');
        await anonymous.page.getByLabel('Repetir código de recuperación', { exact: true }).fill('0042');
        await clickVisible(anonymous.page, 'Continuar'); await dialogFits(anonymous.page); await inspect('signup-step-2');
      }
    }
    await anonymous.context.close();
    const administrative = await setup({ admin: true, viewport: { width: 1440, height: 900 } });
    await clickVisible(administrative.page, 'Ahora no');
    await administrative.page.getByRole('button', { name: 'Abrir panel administrador', exact: true }).click();
    await administrative.page.getByTitle('Cambiar a modo oscuro', { exact: true }).waitFor();
    auditPage = administrative.page; await inspect('admin-light-1440');
    await administrative.page.getByTitle('Cambiar a modo oscuro', { exact: true }).click();
    await administrative.page.getByTitle('Cambiar a modo claro', { exact: true }).waitFor();
    await inspect('admin-dark-1440');
    await administrative.context.close();
    await import('node:fs/promises').then(fs => fs.writeFile(path.join(artifacts,'brand-audit.json'), JSON.stringify(report,null,2)));
    const failures = report.flatMap(item => item.failures.map(failure => ({ screen: item.label, ...failure })));
    assert.deepEqual(failures, [], 'Contraste AA en textos visibles sobre superficies planas');
  });
  await check('Landing con slogan y explicación visual; encabezado Faros PRO sin etiquetas redundantes', async () => {
    const anonymous = await setup({ anonymous: true });
    const { page } = anonymous;
    await page.getByRole('heading', { level: 1, name: 'No inviertas a ciegas, invertí con Faros.', exact: true }).waitFor();
    assert.equal(await page.getByText('Periodismo financiero consolidado en tiempo real', { exact: true }).count(), 0);
    const how = page.getByRole('region', { name: 'Cómo funciona Faros', exact: true });
    assert.equal(await how.getByRole('listitem').count(), 3);
    for (const title of ['Elegí tus activos','Entendé qué cambia','Seguí lo importante']) await how.getByRole('heading', { name: title, exact: true }).waitFor();
    for (const width of [320,390,768,1024,1440]) {
      await page.setViewportSize({ width, height: 900 }); await page.evaluate(() => scrollTo(0,0));
      await fits(page, `Landing ${width}`);
      await page.screenshot({ path: path.join(artifacts, `landing-slogan-${width}.png`), fullPage: true });
    }
    await clickVisible(page, 'Crear cuenta'); await dialogFits(page); await clickVisible(page, 'Cerrar registro');
    await clickVisible(page, 'Iniciar sesión'); await dialogFits(page); await clickVisible(page, 'Cerrar inicio de sesión');
    await anonymous.context.close();
    const authenticated = await setup(); await clickVisible(authenticated.page, 'Ahora no');
    assert.equal(await authenticated.page.getByText('Tu pulso financiero', { exact: true }).count(), 0);
    assert.equal(await authenticated.page.getByText('Filtro de Ruido Financiero', { exact: true }).count(), 0);
    for (const width of [320,390,768,1024,1440]) {
      await authenticated.page.setViewportSize({ width, height: 900 });
      await fits(authenticated.page, `Header Faros PRO ${width}`);
      const header = authenticated.page.locator('header').first();
      const logo = await header.locator('.brand-logo').boundingBox(); const pro = await header.getByText('PRO', { exact: true }).boundingBox();
      assert.ok(logo && pro && logo.x + logo.width <= pro.x, 'Logo y PRO quedan juntos, sin superposición');
      const logout = header.getByRole('button', { name: 'Cerrar sesión', exact: true });
      await logout.waitFor({ state: 'visible' });
      const exit = await logout.boundingBox();
      assert.ok(exit && exit.height >= 44 && exit.x >= 0 && exit.x + exit.width <= width, `Cerrar sesión visible y accesible a ${width}`);
      const configure = await header.getByRole('button', { name: /Configurar cartera:/ }).boundingBox();
      assert.ok(configure && configure.x + configure.width <= exit.x, 'La cartera y la salida no se superponen');
      await authenticated.page.screenshot({ path: path.join(artifacts, `header-pro-${width}.png`) });
    }
    await clickVisible(authenticated.page, 'Mi cartera');
    await authenticated.page.evaluate(() => scrollTo({ top: document.body.scrollHeight, behavior: 'instant' }));
    const exit = authenticated.page.locator('header').getByRole('button', { name: 'Cerrar sesión', exact: true });
    await exit.click();
    await authenticated.page.getByRole('button', { name: 'Iniciar sesión', exact: true }).first().waitFor();
    assert.equal(authenticated.state.calls.filter(call => call.path === '/api/auth/logout' && call.method === 'POST').length, 1);
    assert.equal(authenticated.state.calls.filter(call => call.path === '/api/auth/account' && call.method === 'DELETE').length, 0, 'Salir no elimina la cuenta');
    assert.equal(await authenticated.page.locator('header').getByRole('button', { name: 'Cerrar sesión', exact: true }).count(), 0);
    await authenticated.context.close();
  });
  await check('Worker real muestra avisos con la página cerrada y filtra otras cuentas', async () => {
    const context = await browser.newContext({ permissions: ['notifications'] });
    await context.route('**/api/**', route => route.fulfill({ contentType: 'application/json', body: '{"authenticated":false}' }));
    await context.route(/^https:\/\//, route => route.abort());
    const page = await context.newPage(); await page.goto(origin, { waitUntil: 'networkidle' });
    await page.evaluate(async () => {
      await navigator.serviceWorker.register('/sw.js'); const registration = await navigator.serviceWorker.ready;
      await new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = resolve; registration.active.postMessage({ type: 'FAROS_ACCOUNT', userId: 'worker-test' }, [channel.port2]); });
    });
    const worker = context.serviceWorkers().find(item => item.url().endsWith('/sw.js')); assert.ok(worker);
    await page.close();
    const result = await worker.evaluate(async () => {
      const send = async payload => {
        const event = new PushEvent('push', { data: JSON.stringify(payload) });
        let done; Object.defineProperty(event, 'waitUntil', { value: promise => { done = promise; } });
        self.dispatchEvent(event); await done;
      };
      await send({ id: 'own', userId: 'worker-test', title: 'Aviso con FAROS cerrado', body: 'Prueba local', url: '/?tab=calendar' });
      await send({ id: 'foreign', userId: 'another-account', title: 'Aviso de otra cuenta', url: '/' });
      await send({ id: 'external', userId: 'worker-test', title: 'Destino externo', url: 'https://example.test/redirect' });
      return (await self.registration.getNotifications()).map(item => ({ title: item.title, url: item.data.url }));
    });
    assert.equal(result.length, 2);
    assert.ok(result.some(item => item.title === 'Aviso con FAROS cerrado' && item.url === `${origin}/?tab=calendar`));
    assert.ok(result.every(item => item.url.startsWith(origin + '/')));
    const next = await context.newPage(); await next.goto(origin, { waitUntil: 'networkidle' });
    await next.evaluate(async () => {
      const registration = await navigator.serviceWorker.ready;
      await new Promise(resolve => { const channel = new MessageChannel(); channel.port1.onmessage = resolve; registration.active.postMessage({ type: 'FAROS_ACCOUNT', userId: null }, [channel.port2]); });
    });
    assert.equal(await worker.evaluate(async () => (await self.registration.getNotifications()).length), 0, 'Cerrar sesión debe retirar los avisos');
    await context.close();
  });
  assert.deepEqual(pageErrors, [], 'Errores de ejecución en la interfaz');
  console.log(`${checks} comprobaciones de navegador aprobadas. Capturas: ${artifacts}`);
} finally {
  await browser.close();
  server.kill('SIGTERM');
  await once(server, 'exit');
}
