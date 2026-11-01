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
// Two outlets can publish the same agency headline; both must remain visible.
news[0].sources[1].originalHeadline = news[0].sources[0].originalHeadline;
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
const pageErrors = [];
let checks = 0;
async function check(name, run) { if (process.env.BROWSER_CHECK && !name.includes(process.env.BROWSER_CHECK)) return; await run(); checks++; console.log(`ok ${checks} - ${name}`); }
async function setup({ anonymous = false, permission = 'granted', longName = false, legacyNews = false, ...options } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, ...options });
  if (legacyNews) await context.addInitScript(({ item, portfolioId }) => {
    const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
    const hour = new Intl.DateTimeFormat('en-GB', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', hour12: false }).format(new Date());
    localStorage.setItem(`faros_news_v4_coverage_${portfolioId}_${date}_${hour}`, JSON.stringify([{ ...item, sources: item.sources.slice(0, 1), coverageCount: 1 }]));
    localStorage.setItem('faros_session_token', 'browser-test-existing-session');
    localStorage.setItem('faros_custom_events:usr_browser_test', '[]');
  }, { item: news[0], portfolioId: fixture.portfolio.id });
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
  const state = { user: structuredClone(fixture), active: false, calls: [], events: [], newsData: news, newsMode: 'ok', revision: null, saveFailure: false, delayNews: 0 };
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
      status = state.newsMode === 'error' ? 503 : 200;
      data = state.newsMode === 'error' ? { error: 'Fuentes no disponibles.' } : { news: state.newsMode === 'empty' ? [] : state.newsData, checkedAt: '2026-11-01T14:23:00.000Z' };
    }
    if (url.pathname === '/api/version') data = { revision: state.revision, newsVersion: 'v4_coverage' };
    if (url.pathname === '/api/auth/user') {
      state.user = { ...state.user, ...body };
      data = { success: true, user: state.user };
    }
    if (url.pathname === '/api/auth/register') { state.user = { ...state.user, ...body, preferences: { ...state.user.preferences, ...body.preferences }, portfolio: { ...state.user.portfolio, assetIds: [], assetPositions: {} } }; data = { success: true, user: state.user, token: 'local-browser-test' }; }
    if (url.pathname === '/api/audio/synthesize') data = { success: true, audioBase64: 'UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA', mimeType: 'audio/wav', engine: 'test', voice: 'test' };
    if (url.pathname === '/api/calendar/events') data = { events: [] };
    if (url.pathname === '/api/admin/check') data = { isAdmin: false };
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
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(data) });
  });
  const page = await context.newPage();
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
  await matches.first().waitFor({ state: 'visible', timeout: 10000 });
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
  await check('Actualización confiable: búsqueda, error con contenido anterior, vacío y caché con horario real', async () => {
    const { context, page, state } = await setup();
    await page.getByText('11:23', { exact: false }).first().waitFor();
    assert.equal(await page.getByText('11:45 hs', { exact: false }).count(), 0);
    const hero = page.getByRole('region', { name: 'Resumen de tu cartera' });
    const bounds = await hero.boundingBox(); assert.ok(bounds.height < 360, `Resumen demasiado alto: ${bounds.height}`);
    state.newsMode = 'error'; state.delayNews = 500;
    await clickVisible(page, 'Actualizar pulso');
    await hero.getByText('Buscando noticias.', { exact: false }).waitFor();
    await hero.getByText('Error al actualizar.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).count(), news.length);
    state.newsMode = 'empty'; state.delayNews = 0;
    await clickVisible(page, 'Actualizar pulso');
    await hero.getByText('Sin novedades verificadas en esta consulta.', { exact: false }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Comparar 4 medios', exact: true }).count(), 0);
    const before = state.calls.filter(call => call.path === '/api/news/pulse').length;
    await page.reload({ waitUntil: 'networkidle' });
    await hero.getByText('Mostrando información de una consulta anterior.', { exact: false }).waitFor();
    assert.equal(state.calls.filter(call => call.path === '/api/news/pulse').length, before, 'También se conserva el resultado vacío confirmado');
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
    assert.ok(state.calls.some(call => call.path === '/api/audio/synthesize' && call.body.trackId === news[0].id));
    await page.screenshot({ path: path.join(artifacts, 'audio-390.png') });
    await context.close();
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
    const { context, page, state } = await setup();
    state.newsData = [{ ...news[0], sources: [news[0].sources[0]], coverageCount: 1 }];
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
  await check('Contadores visibles de impacto filtran inmediatamente la lista y permiten quitar el filtro', async () => {
    const { context, page, state } = await setup({ viewport: { width: 1440, height: 900 } });
    await clickVisible(page, 'Ahora no');
    state.newsData = news.map((item, index) => ({ ...item, affectedAssetIds: ['AL30'], impact: ['favorable', 'alerta', 'neutral'][index] }));
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
