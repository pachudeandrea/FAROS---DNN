import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, createECDH, createHash, randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { databaseConfig } from '../src/server/database';
import { notificationJobSlot, validateSubscription, validateCalendar } from '../src/server/notifications';

const root = new URL('../', import.meta.url);
const children = new Set<ChildProcess>();
let artifact: string;
before(async () => {
  artifact = await mkdtemp(path.join(tmpdir(), 'faros-notification-api-'));
  const compiler = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json', '--outDir', artifact], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; compiler.stdout.on('data', chunk => { output += chunk; }); compiler.stderr.on('data', chunk => { output += chunk; });
  assert.equal((await once(compiler, 'exit'))[0], 0, output);
  await writeFile(path.join(artifact, 'package.json'), '{"type":"module"}');
  await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(artifact, 'node_modules'), 'dir');
});
after(async () => { for (const child of children) await stop(child); if (artifact) await rm(artifact, { recursive: true, force: true }); });
function environment(url: string) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(DATABASE_URL|POSTGRES_|EMAIL_|BREVO_API_KEY|RESEND_API_KEY|APP_URL|ADMIN_EMAILS|CRON_SECRET|FAROS_TEST_)/.test(key)) delete env[key];
  return { ...env, DATABASE_URL: url, POSTGRES_URL: '', POSTGRES_PRISMA_URL: '', POSTGRES_URL_NON_POOLING: '', APP_URL: '', NODE_ENV: 'production', VERCEL: '1', FAROS_TEST_PUSH: '1' };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exit = once(child, 'exit'); child.kill('SIGTERM'); const timer = setTimeout(() => child.kill('SIGKILL'), 3000); await exit; clearTimeout(timer); children.delete(child);
}
async function start(url: string) {
  const pushes: any[] = [];
  const child = fork(new URL('fixtures/native-api-server.mjs', import.meta.url), [pathToFileURL(path.join(artifact, 'api/index.js')).href], { cwd: root, execArgv: [], silent: true, env: environment(url) });
  children.add(child);
  let output = ''; child.stdout?.on('data', chunk => { output += chunk; }); child.stderr?.on('data', chunk => { output += chunk; });
  child.on('message', (message: any) => { if (message.type === 'test-push') pushes.push(message); });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('La API de alertas no arrancó.')), 10000);
    child.once('message', (message: any) => { clearTimeout(timer); resolve(message.port); }); child.once('exit', () => { clearTimeout(timer); reject(new Error('La API terminó al arrancar.')); });
  });
  const command = (action: string, data: Record<string, unknown> = {}) => new Promise<any>((resolve, reject) => {
    const id = randomUUID(); const timer = setTimeout(() => reject(new Error('No terminó la prueba de alertas.')), 10000);
    const handle = (message: any) => { if (message.type === 'notification-test-result' && message.id === id) { clearTimeout(timer); child.off('message', handle); message.error ? reject(new Error(message.error)) : resolve(message.result); } };
    child.on('message', handle); child.send({ type: 'notification-test-command', id, action, ...data });
  });
  return { child, pushes, command, url: `http://127.0.0.1:${port}`, get output() { return output; } };
}
async function request(base: string, route: string, method = 'GET', body?: unknown, token?: string) {
  const response = await fetch(base + route, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(15000) });
  assert.match(response.headers.get('content-type') || '', /json/);
  return { status: response.status, data: await response.json() };
}
function subscription(id: string) {
  const key = createECDH('prime256v1'); key.generateKeys();
  return { endpoint: `https://fcm.googleapis.com/fcm/send/test-${id}`, keys: { p256dh: key.getPublicKey().toString('base64url'), auth: randomBytes(16).toString('base64url') } };
}
const hash = (value: string) => createHash('sha256').update(value).digest('hex');

test('el calendario programado usa dos franjas de Argentina y valida destinos y recordatorios', () => {
  assert.equal(notificationJobSlot(new Date('2030-06-15T11:59:59Z')), null);
  assert.equal(notificationJobSlot(new Date('2030-06-15T12:00:00Z')), '2030-06-15:morning');
  assert.equal(notificationJobSlot(new Date('2030-06-15T20:00:00Z')), '2030-06-15:evening');
  const valid = subscription('validation'); assert.equal(validateSubscription(valid).endpoint, valid.endpoint);
  for (const endpoint of ['http://fcm.googleapis.com/test', 'https://127.0.0.1/test', 'https://evil.example.test/test', 'https://fcm.googleapis.com.evil.test/test', 'https://user:secret@fcm.googleapis.com/test', 'https://fcm.googleapis.com:444/test']) assert.throws(() => validateSubscription({ ...valid, endpoint }));
  assert.throws(() => validateSubscription({ ...valid, keys: { auth: 'bad', p256dh: 'bad' } }));
  const event = { id: 'one', date: '2030-06-15', assetSymbol: 'AL30', action: 'cobro', reminders: ['same_day'], createdAt: 1 };
  assert.equal(validateCalendar([event]).length, 1);
  for (const events of [[{ ...event, date: '2030-02-30' }], [event, event], [{ ...event, action: 'unknown' }], [{ ...event, reminders: ['every_second'] }], [{ ...event, note: 'x'.repeat(501) }]]) assert.throws(() => validateCalendar(events));
});

test('alertas Web Push persistentes, privadas y con consentimiento, sin enviar a dispositivos reales', { timeout: 90000 }, async t => {
  assert.ok(process.env.TEST_DATABASE_URL);
  const url = new URL(process.env.TEST_DATABASE_URL); assert.ok(['127.0.0.1', 'localhost'].includes(url.hostname)); assert.match(url.pathname, /test/i);
  const admin = new Pool(databaseConfig(url.toString())); const schema = `faros_push_test_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`); url.searchParams.set('options', `-c search_path=${schema}`); const testUrl = url.toString(); const db = new Pool(databaseConfig(testUrl));
  t.after(async () => { for (const child of children) await stop(child); await db.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });
  const migration = spawn(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { cwd: root, env: environment(testUrl), stdio: ['ignore', 'pipe', 'pipe'] }); migration.stdout.resume(); migration.stderr.resume(); assert.equal((await once(migration, 'exit'))[0], 0);
  const one = await start(testUrl); let two = await start(testUrl);
  const payload = { name: 'Prueba push', email: 'push@example.test', password: 'InicialSegura123!', recoveryKey: '0042', termsAccepted: true, assets: [{ symbol: 'AL30', position: 'long' }] };
  const created = await request(one.url, '/api/auth/register', 'POST', payload); assert.equal(created.status, 201);
  const userId = created.data.user.id; const token = created.data.token;
  const other = await request(two.url, '/api/auth/register', 'POST', { ...payload, email: 'other@example.test' }); const otherToken = other.data.token;
  const device = subscription('phone'); const deviceId = hash(device.endpoint);
  const releaseLimits = () => db.query('UPDATE faros_notification_limits SET window_started_at = 0');
  const state = (api = one, auth = token, id = deviceId) => request(api.url, `/api/notifications?device=${id}`, 'GET', undefined, auth);
  const allPushes = () => [...one.pushes, ...two.pushes];
  const fixtureNews = { id: 'live-news-1', headline: 'Noticia de prueba sobre AL30', briefSummary: 'Hecho utilizado únicamente en pruebas locales.', sources: [{ mediaName: 'Medio de prueba', sourceUrl: 'https://example.test/article-1', publishedTime: '15/06/2030' }], affectedAssetIds: ['AL30'], impact: 'alerta', relevanceType: 'impacto_precio', factCheck: { status: 'confirmado' }, topicCategory: 'deuda_soberana' };

  await t.test('el alta no activa alertas y las rutas privadas exigen una sesión', async () => {
    assert.equal(created.data.user.preferences.notificationsEnabled, false);
    assert.equal(allPushes().length, 0);
    for (const route of ['/api/notifications', '/api/notifications/reminders']) assert.equal((await request(one.url, route)).status, 401);
    assert.equal((await request(one.url, '/api/notifications/subscription', 'POST', { consent: true, subscription: device })).status, 401);
  });
  await t.test('las claves públicas son estables entre instancias y nunca se expone la privada', async () => {
    const [a,b] = await Promise.all([state(one), state(two)]); assert.equal(a.status, 200); assert.equal(a.data.publicKey, b.data.publicKey);
    const keys = (await db.query('SELECT * FROM faros_push_credentials')).rows; assert.equal(keys.length, 1);
    assert.equal(a.data.userId, userId); assert.equal(a.data.subscribed, false); assert.equal(a.data.enabled, false);
    assert.ok(!JSON.stringify(a.data).includes(keys[0].private_key));
  });
  await t.test('la suscripción requiere consentimiento, valida el servicio y rechaza sesiones desactualizadas', async () => {
    assert.equal((await request(one.url, '/api/notifications/subscription', 'POST', { subscription: device }, token)).status, 400);
    assert.equal((await request(one.url, '/api/notifications/subscription', 'POST', { consent: true, subscription: { ...device, endpoint: 'https://127.0.0.1/private' } }, token)).status, 400);
    assert.equal((await request(one.url, '/api/notifications/subscription', 'POST', { consent: true, subscription: device, expectedUserId: other.data.user.id }, token)).status, 409);
    assert.equal((await db.query('SELECT * FROM faros_push_subscriptions')).rowCount, 0);
  });
  await t.test('activar guarda el dispositivo, activa la preferencia y cifra el aviso de prueba', async () => {
    const result = await request(one.url, '/api/notifications/subscription', 'POST', { consent: true, subscription: device }, token);
    assert.equal(result.status, 200); assert.equal(result.data.testSent, true); assert.equal(result.data.preferences.notificationsEnabled, true);
    const pushed = allPushes().filter(item => item.status === 201); assert.equal(pushed.length, 1); assert.equal(pushed[0].encrypted, true); assert.equal(pushed[0].payload.userId, userId);
    assert.equal(pushed[0].payload.title, 'Prueba de alertas de FAROS');
    const resultState = await state(two); assert.equal(resultState.data.subscribed, true); assert.equal(resultState.data.notifications.length, 1);
    await stop(two.child); two = await start(testUrl); assert.equal((await state(two)).data.subscribed, true);
  });
  await t.test('la bandeja y el marcado de leídas están aislados por cuenta', async () => {
    assert.equal((await state(one, otherToken)).data.notifications.length, 0);
    await request(two.url, '/api/notifications/read', 'POST', {}, otherToken);
    assert.equal((await state()).data.notifications[0].read, false);
    await request(one.url, '/api/notifications/read', 'POST', {}, token);
    assert.equal((await state(two)).data.notifications[0].read, true);
  });
  await t.test('los recordatorios se guardan por cuenta y se validan antes de modificar datos', async () => {
    const events = [{ id: 'calendar-one', date: '2030-06-15', assetSymbol: 'AL30', action: 'cobro', note: 'Nota privada de prueba', reminders: ['same_day'], createdAt: Date.now() }];
    assert.equal((await request(one.url, '/api/notifications/reminders', 'PUT', { events }, token)).status, 200);
    assert.deepEqual((await request(two.url, '/api/notifications/reminders', 'GET', undefined, token)).data.events, events);
    assert.deepEqual((await request(one.url, '/api/notifications/reminders', 'GET', undefined, otherToken)).data.events, []);
    assert.equal((await request(one.url, '/api/notifications/reminders', 'PUT', { events: [{ ...events[0], date: 'invalid' }] }, token)).status, 400);
    assert.equal((await request(one.url, '/api/notifications/reminders', 'GET', undefined, token)).data.events.length, 1);
  });
  await t.test('el ciclo programado envía con la aplicación cerrada y evita duplicados entre instancias', async () => {
    const before = allPushes().length;
    await Promise.all([one, two].map(api => api.command('daily', { now: '2030-06-15T12:00:00Z', news: [fixtureNews] })));
    const pushed = allPushes().slice(before).filter(item => item.status === 201);
    assert.equal(pushed.length, 1); assert.equal(pushed[0].payload.userId, userId); assert.ok(!pushed[0].payload.body.includes('Nota privada'));
    const records = (await state()).data.notifications; assert.ok(records.some((item: any) => item.calendarEventId === 'calendar-one')); assert.ok(records.some((item: any) => item.sourceUrl === fixtureNews.sources[0].sourceUrl));
    const count = records.length;
    await two.command('daily', { now: '2030-06-15T20:00:00Z', news: [fixtureNews] });
    assert.equal((await state()).data.notifications.length, count);
    assert.equal(allPushes().length, before + 1);
  });
  await t.test('solo se generan alertas para hechos confirmados y activos propios', async () => {
    const before = (await state()).data.notifications.length;
    const no = [ { ...fixtureNews, id: 'no-1', headline: 'Otra noticia', factCheck: { status: 'en_analisis' } }, { ...fixtureNews, id: 'no-2', affectedAssetIds: ['AAPL'], sources: [{ ...fixtureNews.sources[0], sourceUrl: 'https://example.test/no-holding' }] } ];
    await one.command('publish', { userId, news: no });
    assert.equal((await state()).data.notifications.length, before);
    await one.command('publish', { userId, news: [{ ...fixtureNews, id: 'rotating-id', sources: [{ ...fixtureNews.sources[0], sourceUrl: 'https://example.test/article-1?utm_source=other' }] }] });
    assert.equal((await state()).data.notifications.length, before);
  });
  await t.test('los dispositivos expirados se eliminan sin simular una activación', async () => {
    await releaseLimits(); const expired = subscription('expired');
    const result = await request(one.url, '/api/notifications/subscription', 'POST', { consent: true, subscription: expired }, token);
    assert.equal(result.status, 503); assert.equal(result.data.code, 'PUSH_SUBSCRIPTION_EXPIRED');
    assert.equal((await db.query('SELECT * FROM faros_push_subscriptions WHERE endpoint_hash = $1', [hash(expired.endpoint)])).rowCount, 0);
  });
  await t.test('un fallo transitorio se conserva para reintento por dispositivo', async () => {
    await releaseLimits(); const temporary = subscription('temporary');
    const result = await request(one.url, '/api/notifications/subscription', 'POST', { consent: true, subscription: temporary }, token);
    assert.equal(result.status, 200); assert.equal(result.data.testSent, false);
    await one.command('drain', { userId });
    const row = await db.query('SELECT * FROM faros_push_outbox WHERE endpoint_hash = $1', [hash(temporary.endpoint)]);
    assert.ok(row.rows.every(value => value.delivered_at !== null));
    assert.equal(allPushes().filter(item => item.endpoint === temporary.endpoint && item.status === 201).length, 1);
  });
  await t.test('desvincular un dispositivo al salir conserva las alertas de los demás', async () => {
    await releaseLimits(); const tablet = subscription('tablet');
    assert.equal((await request(one.url, '/api/notifications/subscription', 'POST', { consent: true, subscription: tablet }, token)).status, 200);
    const removed = await request(two.url, '/api/notifications/subscription', 'DELETE', { device: hash(tablet.endpoint) }, token);
    assert.equal(removed.status, 200); assert.equal(removed.data.preferences.notificationsEnabled, true);
    assert.equal((await state()).data.subscribed, true);
    assert.equal((await db.query('SELECT 1 FROM faros_push_subscriptions WHERE endpoint_hash = $1', [hash(tablet.endpoint)])).rowCount, 0);
  });
  await t.test('el aviso manual solo se dirige al dispositivo propio y limita repeticiones', async () => {
    await releaseLimits();
    assert.equal((await request(one.url, '/api/notifications/test', 'POST', { device: deviceId }, otherToken)).status, 400);
    const before = allPushes().length;
    assert.equal((await request(one.url, '/api/notifications/test', 'POST', { device: deviceId }, token)).data.testSent, true);
    assert.equal(allPushes().slice(before).filter(item => item.status === 201).length, 1);
    assert.equal((await request(two.url, '/api/notifications/test', 'POST', { device: deviceId }, token)).status, 429);
  });
  await t.test('desactivar impide nuevos envíos y cerrar sesión permite desvincular solo el dispositivo', async () => {
    const disabled = await request(one.url, '/api/notifications/subscription', 'DELETE', { device: deviceId, disableAll: true }, token);
    assert.equal(disabled.status, 200); assert.equal(disabled.data.preferences.notificationsEnabled, false);
    const before = allPushes().length;
    await one.command('publish', { userId, news: [{ ...fixtureNews, sources: [{ ...fixtureNews.sources[0], sourceUrl: 'https://example.test/disabled' }] }] });
    assert.equal(allPushes().length, before); assert.equal((await state()).data.enabled, false);
    await request(one.url, '/api/notifications/subscription', 'DELETE', { device: hash(subscription('not-owned').endpoint) }, otherToken);
    assert.equal((await db.query('SELECT * FROM faros_push_subscriptions WHERE user_id = $1', [userId])).rowCount, 1);
  });
  await t.test('eliminar la cuenta revoca dispositivos, recordatorios y bandeja', async () => {
    assert.equal((await request(one.url, '/api/auth/account', 'DELETE', undefined, token)).status, 200);
    for (const table of ['faros_push_subscriptions','faros_notification_calendars','faros_notifications']) assert.equal((await db.query(`SELECT 1 FROM ${table} WHERE user_id = $1`, [userId])).rowCount, 0);
    assert.equal((await state()).status, 401);
    const secret = (await db.query('SELECT private_key FROM faros_push_credentials')).rows[0].private_key;
    assert.ok(!(one.output + two.output).includes(secret)); assert.ok(!(one.output + two.output).includes(device.keys.auth));
  });
});
