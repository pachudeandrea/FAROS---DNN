import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { randomBytes, createHash } from 'node:crypto';
import { readFile, mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import bcrypt from 'bcryptjs';
import { databaseConfig } from '../src/server/database';

const root = new URL('../', import.meta.url);
const children = new Set<ChildProcess>();
let artifact: string;

before(async () => {
  artifact = await mkdtemp(path.join(tmpdir(), 'faros-native-api-'));
  const compiler = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '--project', 'tsconfig.server.json', '--outDir', artifact], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  compiler.stdout.on('data', chunk => { output += chunk; });
  compiler.stderr.on('data', chunk => { output += chunk; });
  const [code] = await once(compiler, 'exit');
  assert.equal(code, 0, output);
  await writeFile(path.join(artifact, 'package.json'), JSON.stringify({ type: 'module' }));
  await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(artifact, 'node_modules'), 'dir');
});

after(async () => {
  for (const child of children) await stop(child);
  if (artifact) await rm(artifact, { recursive: true, force: true });
});

function environment(url = '') {
  const env = { ...process.env };
  for (const name of Object.keys(env)) {
    if (/^(DATABASE_URL|POSTGRES_|GOOGLE_|MICROSOFT_|GEMINI_API_KEY|APP_URL|ADMIN_EMAILS|EMAIL_|BREVO_API_KEY|RESEND_API_KEY)/.test(name)) delete env[name];
  }
  return { ...env, DATABASE_URL: url, POSTGRES_URL: '', POSTGRES_PRISMA_URL: '', POSTGRES_URL_NON_POOLING: '',
    GEMINI_API_KEY: '', GOOGLE_CLIENT_ID: '', GOOGLE_CLIENT_SECRET: '', MICROSOFT_CLIENT_ID: '', MICROSOFT_CLIENT_SECRET: '',
    APP_URL: '', ADMIN_EMAILS: '', NODE_ENV: 'production', VERCEL: '1' };
}

async function start(url = '', overrides: Record<string, string> = {}) {
  const child = fork(new URL('fixtures/native-api-server.mjs', import.meta.url), [pathToFileURL(path.join(artifact, 'api/index.js')).href], {
    cwd: root, execArgv: [], env: { ...environment(url), ...overrides }, silent: true
  });
  children.add(child);
  let output = '';
  child.stderr?.on('data', chunk => { output += chunk; });
  child.stdout?.resume();
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('La API no arrancó en 10 segundos.')), 10000);
    child.once('message', (data: any) => { clearTimeout(timer); resolve(data.port); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error(`La API terminó al arrancar: ${output}`)); });
  });
  return { child, url: `http://127.0.0.1:${port}` };
}

async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit');
  child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited;
  clearTimeout(timer);
  children.delete(child);
}

async function request(base: string, path: string, method = 'GET', body?: unknown, token?: string, extraHeaders: Record<string, string> = {}) {
  const response = await fetch(base + path, { method, headers: {
    ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extraHeaders
  }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(15000) });
  assert.match(response.headers.get('content-type') || '', /application\/json/);
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}

async function migrate(url: string) {
  const child = spawn(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { cwd: root, env: environment(url), stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume(); child.stderr.resume();
  const [code] = await once(child, 'exit');
  assert.equal(code, 0, 'La migración debe terminar correctamente.');
}

async function deploy(url = '', overrides: Record<string, string> = {}) {
  // Execute the command actually configured for Vercel, with test-only bindings.
  const config = JSON.parse(await readFile(new URL('../vercel.json', import.meta.url), 'utf8'));
  const script = config.buildCommand.match(/^npm run ([\w:-]+)$/)?.[1];
  assert.ok(script, 'El comando de Vercel debe ser un script npm ejecutable.');
  const child = spawn('npm', ['run', script], { cwd: root, env: { ...environment(url), VERCEL_ENV: 'production', ...overrides }, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  const [code] = await once(child, 'exit');
  return { code, output };
}

test('Vercel detiene el build si falta la base o no conecta, sin ocultar el error', { timeout: 30000 }, async () => {
  for (const [url, code] of [['', 'DB_NOT_CONFIGURED'], ['postgresql://postgres@127.0.0.1:1/faros_test', 'DB_UNAVAILABLE']]) {
    const result = await deploy(url);
    assert.notEqual(result.code, 0);
    assert.match(result.output, new RegExp(code));
    assert.doesNotMatch(result.output, /^> vite build$/m, 'No compilar/publicar después de fallar la migración.');
    assert.doesNotMatch(result.output, /postgresql:\/\//, 'No registrar la conexión ni credenciales.');
  }
});

test('la API arranca sin credenciales y responde errores JSON sin archivos locales', async t => {
  t.after(async () => { for (const child of children) await stop(child); });
  const api = await start();
  assert.equal((await request(api.url, '/api/date/info')).status, 200);
  assert.equal((await request(api.url, '/api/auth/register', 'POST', {})).status, 400);
  const missing = await request(api.url, '/api/auth/register', 'POST', { name: 'Prueba', email: 'missing@example.test', password: 'Prueba123!', termsAccepted: true });
  assert.equal(missing.status, 503); assert.equal(missing.data.code, 'DB_NOT_CONFIGURED');
  assert.equal((await request(api.url, '/api/health')).data.code, 'DB_NOT_CONFIGURED');
  assert.equal((await request(api.url, '/api/missing')).data.code, 'API_NOT_FOUND');
  assert.equal((await request(api.url, '/api/auth/google/url')).data.configured, false);
  assert.equal((await request(api.url, '/api/auth/microsoft/url')).data.configured, false);
  const recovery = await request(api.url, '/api/auth/forgot-password', 'POST', { email: 'any@example.test' });
  assert.equal(recovery.status, 503); assert.equal(recovery.data.resetToken, undefined);
  assert.equal((await request(api.url, '/api/auth/reset-password', 'POST', {})).status, 400);
  assert.equal((await request(api.url, '/api/audio/synthesize', 'POST', { text: '' })).status, 400);
  const calendar = await request(api.url, '/api/calendar/events', 'POST', { tickers: [], portfolioId: 'test-no-credentials' });
  assert.equal(calendar.status, 200); assert.ok(Array.isArray(calendar.data.events));
  const unavailable = await start('postgresql://postgres@127.0.0.1:1/faros_test');
  const failed = await request(unavailable.url, '/api/auth/register', 'POST', { name: 'Sin base', email: 'unavailable@example.test', password: 'Segura123!', termsAccepted: true });
  assert.equal(failed.status, 503); assert.equal(failed.data.code, 'DB_UNAVAILABLE');
  assert.equal(failed.data.user, undefined); assert.equal(failed.data.token, undefined);
  // Function routing headers must not turn a register request into /api/index.
  assert.equal((await request(api.url, '/api/auth/register', 'POST', {}, undefined, { 'x-matched-path': '/api/index', 'x-forwarded-uri': '/api/index' })).status, 400);
});

test('autenticación PostgreSQL entre instancias y reinicios', { timeout: 60000 }, async t => {
  const value = process.env.TEST_DATABASE_URL;
  assert.ok(value, 'Definí TEST_DATABASE_URL para una base PostgreSQL local de pruebas. No se usa DATABASE_URL.');
  const url = new URL(value);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Las pruebas de escritura solo aceptan PostgreSQL local.');
  assert.match(url.pathname, /test/i, 'El nombre de la base debe indicar que es de pruebas.');
  const admin = new Pool(databaseConfig(url.toString()));
  const schema = `faros_test_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const testUrl = url.toString();
  const db = new Pool(databaseConfig(testUrl));
  t.after(async () => {
    for (const child of children) await stop(child);
    await db.end();
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
    await admin.end();
  });
  let first = await start(testUrl);
  const missingSchema = await request(first.url, '/api/health');
  assert.equal(missingSchema.status, 503); assert.equal(missingSchema.data.code, 'DB_SCHEMA_MISSING');
  await t.test('Vercel migra una base vacía y compila usando POSTGRES_URL de la integración', async () => {
    const result = await deploy('', { POSTGRES_URL: testUrl });
    assert.equal(result.code, 0, result.output);
    assert.match(result.output, /\[FAROS MIGRATION\] Migración aplicada/);
    assert.match(result.output, /built in/);
    assert.match(await readFile(new URL('../dist/index.html', import.meta.url), 'utf8'), /id="root"/);
  });
  await migrate(testUrl);
  const second = await start(testUrl);
  assert.equal((await request(first.url, '/api/health')).status, 200);
  assert.equal((await db.query('SELECT id FROM faros_users')).rowCount, 0, 'No seedear cuentas JSON del repositorio.');
  const payload = { name: 'Prueba aislada', email: 'account@example.test', password: 'Segura123!', termsAccepted: true, profile: 'moderado', assets: [] };
  let created: Awaited<ReturnType<typeof request>>;

  await t.test('registro, hash, transacción de sesión y cookies seguras', async () => {
    created = await request(first.url, '/api/auth/register', 'POST', payload);
    assert.equal(created.status, 201);
    assert.equal(created.data.user.passwordHash, undefined);
    assert.match(created.cookie || '', /HttpOnly/); assert.match(created.cookie || '', /Secure/);
    assert.match(created.cookie || '', /SameSite=Lax/);
    const users = await db.query('SELECT data FROM faros_users');
    assert.equal(users.rowCount, 1);
    assert.ok(await bcrypt.compare(payload.password, users.rows[0].data.passwordHash));
    const sessions = await db.query('SELECT token FROM faros_sessions');
    assert.match(sessions.rows[0].token, /^sha256:/); assert.notEqual(sessions.rows[0].token, created.data.token);
  });

  await t.test('duplicados y validación sin cuentas incompletas', async () => {
    assert.equal((await request(second.url, '/api/auth/register', 'POST', { ...payload, email: 'ACCOUNT@example.test' })).status, 409);
    for (const password of [undefined, '', 'corta', 'á'.repeat(40)]) {
      assert.equal((await request(first.url, '/api/auth/register', 'POST', { ...payload, email: 'invalid@example.test', password })).status, 400);
    }
    assert.equal((await db.query('SELECT id FROM faros_users')).rowCount, 1);
  });

  await t.test('registro simultáneo respeta unicidad en PostgreSQL', async () => {
    const results = await Promise.all([first, second].map(api => request(api.url, '/api/auth/register', 'POST', { ...payload, email: 'race@example.test' })));
    assert.deepEqual(results.map(r => r.status).sort(), [201, 409]);
  });

  await t.test('el alta revierte si falla la escritura de su primera sesión', async () => {
    await db.query("CREATE FUNCTION reject_test_session() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'forced test failure'; END $$");
    await db.query('CREATE TRIGGER reject_session BEFORE INSERT ON faros_sessions FOR EACH ROW EXECUTE FUNCTION reject_test_session()');
    try {
      const failed = await request(first.url, '/api/auth/register', 'POST', { ...payload, email: 'rollback@example.test' });
      assert.equal(failed.status, 503); assert.equal(failed.data.token, undefined);
      assert.equal((await db.query('SELECT id FROM faros_users WHERE email = $1', ['rollback@example.test'])).rowCount, 0);
    } finally {
      await db.query('DROP TRIGGER reject_session ON faros_sessions');
      await db.query('DROP FUNCTION reject_test_session()');
    }
  });

  await t.test('no autenticar por email ni por identificadores OAuth del navegador', async () => {
    for (const provider of ['google', 'microsoft']) {
      const result = await request(second.url, '/api/auth/register', 'POST', { ...payload, provider, googleSub: 'forged', microsoftOid: 'forged' });
      assert.equal(result.status, 401); assert.equal(result.data.token, undefined);
    }
    const invalidTicket = await request(first.url, '/api/auth/register', 'POST', { ...payload, provider: 'google', signupTicket: 'a'.repeat(64) });
    assert.equal(invalidTicket.status, 401);
    assert.equal((await request(first.url, '/api/auth/login', 'POST', { email: payload.email, password: 'Incorrecta' })).status, 401);
    assert.equal((await request(first.url, '/api/auth/user', 'PUT', { name: 'Intruso' })).status, 401);
    assert.equal((await request(first.url, '/api/auth/account', 'DELETE')).status, 401);
  });

  await t.test('sesión por cookie y Bearer persiste tras reinicio', async () => {
    assert.equal((await request(second.url, '/api/auth/me', 'GET', undefined, created.data.token)).data.user.id, created.data.user.id);
    await stop(first.child);
    first = await start(testUrl);
    const me = await request(first.url, '/api/auth/me', 'GET', undefined, undefined, { Cookie: `faros_session=${created.data.token}` });
    assert.equal(me.status, 200); assert.equal(me.data.user.email, payload.email);
  });

  await t.test('cartera y preferencias se guardan, sin cambiar identidad ni privilegios', async () => {
    const portfolio = { ...created.data.user.portfolio, id: 'other-account', name: 'Mi cartera editada', assetIds: ['AL30'], assetPositions: { AL30: 'short' } };
    const saved = await request(first.url, '/api/auth/user', 'PUT', { portfolio, email: 'intruso@example.test', isAdmin: true, passwordHash: 'fake' }, created.data.token);
    assert.equal(saved.status, 200); assert.equal(saved.data.user.portfolio.id, created.data.user.portfolio.id);
    const prefs = { ...created.data.user.preferences, notificationsEnabled: false };
    assert.equal((await request(second.url, '/api/auth/user', 'PUT', { preferences: prefs }, created.data.token)).status, 200);
    const me = await request(second.url, '/api/auth/me', 'GET', undefined, created.data.token);
    assert.equal(me.data.user.portfolio.name, portfolio.name); assert.equal(me.data.user.email, payload.email);
    assert.equal(me.data.user.isAdmin, false); assert.equal(me.data.user.preferences.notificationsEnabled, false);
    const login = await request(first.url, '/api/auth/login', 'POST', { email: payload.email, password: payload.password });
    assert.equal(login.status, 200);
    assert.equal((await request(first.url, '/api/admin/overview', 'GET', undefined, created.data.token)).status, 403);
  });

  await t.test('logout revoca la sesión también en la otra instancia', async () => {
    assert.equal((await request(first.url, '/api/auth/logout', 'POST', undefined, created.data.token)).status, 200);
    assert.equal((await request(second.url, '/api/auth/me', 'GET', undefined, created.data.token)).status, 401);
  });

  await t.test('eliminación revoca todas las sesiones y no permite revivir la cuenta', async () => {
    const one = await request(first.url, '/api/auth/login', 'POST', payload);
    const two = await request(second.url, '/api/auth/login', 'POST', payload);
    assert.equal(one.status, 200); assert.equal(two.status, 200);
    assert.equal((await request(second.url, '/api/auth/account', 'DELETE', undefined, one.data.token)).status, 200);
    assert.equal((await request(first.url, '/api/auth/me', 'GET', undefined, two.data.token)).status, 401);
    assert.equal((await request(first.url, '/api/auth/login', 'POST', payload)).status, 401);
    assert.equal((await db.query('SELECT token FROM faros_sessions WHERE user_id = $1', [created.data.user.id])).rowCount, 0);
  });

  await t.test('ticket OAuth verificado es de un solo uso; no confiar en IDs del formulario', async () => {
    const ticket = randomBytes(32).toString('hex');
    const proof = { email: 'oauth@example.test', provider: 'google', googleSub: 'server-verified-sub' };
    await db.query('INSERT INTO faros_auth_flows (token_hash, kind, data, expires_at) VALUES ($1, $2, $3, $4)', [createHash('sha256').update(ticket).digest('hex'), 'signup', proof, Date.now() + 60000]);
    const result = await request(first.url, '/api/auth/register', 'POST', { ...payload, email: proof.email, provider: 'google', signupTicket: ticket, googleSub: 'forged' });
    assert.equal(result.status, 201);
    const stored = await db.query('SELECT data FROM faros_users WHERE email = $1', [proof.email]);
    assert.equal(stored.rows[0].data.googleSub, proof.googleSub);
    assert.equal(result.data.user.googleSub, undefined);
    assert.equal((await request(second.url, '/api/auth/register', 'POST', { ...payload, email: proof.email, provider: 'google', signupTicket: ticket })).status, 401);
  });

  await t.test('migración repetida conserva las cuentas existentes', async () => {
    const before = await db.query('SELECT id, data FROM faros_users ORDER BY id');
    await migrate(testUrl);
    assert.deepEqual((await db.query('SELECT id, data FROM faros_users ORDER BY id')).rows, before.rows);
  });

  await t.test('redesplegar repite la migración y conserva cuentas, sesiones y carteras', async () => {
    const before = await db.query('SELECT id, data FROM faros_users ORDER BY id');
    const sessions = await db.query('SELECT * FROM faros_sessions ORDER BY token');
    const result = await deploy(testUrl);
    assert.equal(result.code, 0, result.output);
    assert.deepEqual((await db.query('SELECT id, data FROM faros_users ORDER BY id')).rows, before.rows);
    assert.deepEqual((await db.query('SELECT * FROM faros_sessions ORDER BY token')).rows, sessions.rows);
  });
});
