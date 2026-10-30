import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Pool } from 'pg';
import { databaseConfig } from '../src/server/database';

const root = new URL('../', import.meta.url);
let artifact: string;
const children = new Set<ChildProcess>();

before(async () => {
  artifact = await mkdtemp(path.join(tmpdir(), 'faros-email-api-'));
  const compiler = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json', '--outDir', artifact], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = '';
  compiler.stdout.on('data', chunk => { output += chunk; }); compiler.stderr.on('data', chunk => { output += chunk; });
  assert.equal((await once(compiler, 'exit'))[0], 0, output);
  await writeFile(path.join(artifact, 'package.json'), '{"type":"module"}');
  await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(artifact, 'node_modules'), 'dir');
});
after(async () => {
  for (const child of children) await stop(child);
  if (artifact) await rm(artifact, { recursive: true, force: true });
});

function environment(url: string) {
  const env = { ...process.env };
  for (const key of Object.keys(env)) if (/^(DATABASE_URL|POSTGRES_|EMAIL_|BREVO_API_KEY|RESEND_API_KEY|APP_URL|ADMIN_EMAILS)/.test(key)) delete env[key];
  return { ...env, DATABASE_URL: url, POSTGRES_URL: '', POSTGRES_PRISMA_URL: '', POSTGRES_URL_NON_POOLING: '', APP_URL: 'https://faros-dnn.vercel.app', NODE_ENV: 'production', VERCEL: '1' };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited; clearTimeout(timer); children.delete(child);
}
async function start(url: string, settings: Record<string, string>) {
  const child = fork(new URL('fixtures/native-api-server.mjs', import.meta.url), [pathToFileURL(path.join(artifact, 'api/index.js')).href], { cwd: root, execArgv: [], silent: true, env: { ...environment(url), ...settings } });
  children.add(child); child.stdout?.resume(); child.stderr?.resume();
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('La API de correo no arrancó.')), 10000);
    child.once('message', (message: any) => { clearTimeout(timer); resolve(message.port); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('La API terminó al arrancar.')); });
  });
  return { child, url: `http://127.0.0.1:${port}` };
}
async function request(base: string, route: string, method = 'GET', body?: unknown, token?: string, headers: Record<string, string> = {}) {
  const response = await fetch(base + route, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers }, signal: AbortSignal.timeout(15000) });
  assert.match(response.headers.get('content-type') || '', /json/);
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}

test('confirmación y recuperación reales en API compilada, con proveedor de correo de pruebas', { timeout: 60000 }, async t => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Se requiere PostgreSQL LOCAL de pruebas.');
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)); assert.match(url.pathname, /test/i);
  const admin = new Pool(databaseConfig(url.toString()));
  const schema = `faros_email_test_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const testUrl = url.toString();
  const db = new Pool(databaseConfig(testUrl));
  const messages: any[] = [];
  let rejectMail = false;
  const mail = createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer test-only-key' && req.headers['api-key'] !== 'test-only-key') { res.writeHead(401).end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const data = JSON.parse(Buffer.concat(chunks).toString());
    const addresses = data.to?.map((value: any) => typeof value === 'string' ? value : value.email) || [];
    if (!addresses.length || addresses.some((value: string) => !value.endsWith('.test'))) { res.writeHead(400).end(); return; }
    messages.push(data); res.setHeader('Content-Type', 'application/json');
    if (rejectMail) res.writeHead(503).end('{"message":"Test provider unavailable"}');
    else res.end(JSON.stringify(data.htmlContent ? { messageId: 'local-brevo-message' } : { id: 'local-resend-message' }));
  });
  mail.listen(0, '127.0.0.1'); await once(mail, 'listening');
  const port = (mail.address() as { port: number }).port;
  const settings = { RESEND_API_KEY: 'test-only-key', EMAIL_FROM: 'faros@example.test', FAROS_TEST_EMAIL_ENDPOINT: `http://127.0.0.1:${port}/emails` };
  t.after(async () => {
    for (const child of children) await stop(child);
    await new Promise<void>(resolve => mail.close(() => resolve()));
    await db.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  });
  const migration = spawn(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { cwd: root, env: environment(testUrl), stdio: ['ignore', 'pipe', 'pipe'] });
  migration.stdout.resume(); migration.stderr.resume(); assert.equal((await once(migration, 'exit'))[0], 0);
  const one = await start(testUrl, settings);
  let two = await start(testUrl, settings);
  const legacy = await start(testUrl, {});
  const account = { name: 'Prueba correo', email: 'new@example.test', password: 'InicialSegura123!', termsAccepted: true, profile: 'moderado', assets: [] };
  const releaseCooldown = () => db.query('UPDATE faros_email_rate_limits SET window_started_at = 0');
  function link(address: string) {
    const message = [...messages].reverse().find(message => message.to.some((value: any) => (typeof value === 'string' ? value : value.email) === address));
    assert.ok(message, 'Debe existir un correo capturado en el proveedor local.');
    const found = (message.text || message.textContent).match(/https:\/\/[^\s]+/);
    assert.ok(found); const url = new URL(found[0]);
    assert.equal(url.origin, 'https://faros-dnn.vercel.app'); assert.equal(url.search, '');
    return new URLSearchParams(url.hash.slice(1));
  }
  let verifyToken: string; let session: string; let userId: string; let originalPortfolio: unknown;

  await t.test('nueva cuenta espera confirmación, sin entregar sesión ni token de correo al navegador', async () => {
    const result = await request(one.url, '/api/auth/register', 'POST', account);
    assert.equal(result.status, 201); assert.equal(result.data.verificationRequired, true);
    assert.equal(result.data.token, undefined); assert.equal(result.data.user, undefined); assert.equal(result.cookie, null);
    const stored = (await db.query('SELECT data FROM faros_users WHERE email = $1', [account.email])).rows[0].data;
    userId = stored.id; originalPortfolio = stored.portfolio;
    assert.equal(stored.emailVerified, false); assert.equal(stored.emailVerificationRequired, true);
    assert.equal((await db.query('SELECT * FROM faros_sessions WHERE user_id = $1', [userId])).rowCount, 0);
    verifyToken = link(account.email).get('verify-email')!; assert.match(verifyToken, /^[a-f0-9]{64}$/);
    const token = (await db.query('SELECT token_hash FROM faros_email_tokens WHERE user_id = $1', [userId])).rows[0];
    assert.equal(token.token_hash, createHash('sha256').update(verifyToken).digest('hex')); assert.notEqual(token.token_hash, verifyToken);
    const login = await request(two.url, '/api/auth/login', 'POST', account);
    assert.equal(login.status, 403); assert.equal(login.data.code, 'EMAIL_NOT_VERIFIED');
  });

  await t.test('abrir un enlace no lo consume; el reenvío invalida el anterior', async () => {
    assert.equal((await request(one.url, '/api/auth/verify-email?token=' + verifyToken)).status, 404);
    await releaseCooldown();
    assert.equal((await request(two.url, '/api/auth/resend-verification', 'POST', { email: account.email })).status, 200);
    const fresh = link(account.email).get('verify-email')!; assert.notEqual(fresh, verifyToken);
    assert.equal((await request(one.url, '/api/auth/verify-email', 'POST', { token: verifyToken })).status, 400);
    verifyToken = fresh;
  });

  await t.test('confirmación entre instancias y tras reinicio, de un solo uso', async () => {
    await stop(two.child); two = await start(testUrl, settings);
    const result = await request(two.url, '/api/auth/verify-email', 'POST', { token: verifyToken });
    assert.equal(result.status, 200); assert.equal(result.data.user.id, userId); assert.equal(result.data.user.emailVerified, true);
    session = result.data.token;
    assert.deepEqual(result.data.user.portfolio, originalPortfolio);
    assert.equal((await request(one.url, '/api/auth/me', 'GET', undefined, session)).status, 200);
    assert.equal((await request(one.url, '/api/auth/verify-email', 'POST', { token: verifyToken })).status, 400);
    assert.equal((await request(one.url, '/api/auth/login', 'POST', account)).status, 200);
  });

  await t.test('recuperación no revela cuentas, ni entrega enlaces o tokens en la respuesta', async () => {
    await releaseCooldown(); const count = messages.length;
    const missing = await request(one.url, '/api/auth/forgot-password', 'POST', { email: 'missing@example.test' });
    assert.equal(messages.length, count);
    const found = await request(two.url, '/api/auth/forgot-password', 'POST', { email: account.email }, undefined, { Host: 'spoofed.example' });
    assert.equal(found.status, 200); assert.deepEqual(found.data, missing.data);
    assert.equal(found.data.resetToken, undefined); assert.equal(found.data.token, undefined);
    assert.ok(link(account.email).get('reset-password'));
  });

  await t.test('cambiar contraseña cierra todas las sesiones y conserva cartera y perfil', async () => {
    const other = await request(one.url, '/api/auth/login', 'POST', account);
    const token = link(account.email).get('reset-password')!;
    assert.equal((await request(one.url, '/api/auth/verify-email', 'POST', { token })).status, 400);
    const changed = await request(two.url, '/api/auth/reset-password', 'POST', { token, newPassword: 'NuevaSegura456!' });
    assert.equal(changed.status, 200);
    assert.equal((await request(one.url, '/api/auth/me', 'GET', undefined, session)).status, 401);
    assert.equal((await request(one.url, '/api/auth/me', 'GET', undefined, other.data.token)).status, 401);
    assert.equal((await request(one.url, '/api/auth/login', 'POST', account)).status, 401);
    assert.equal((await request(two.url, '/api/auth/login', 'POST', { ...account, password: 'NuevaSegura456!' })).status, 200);
    assert.equal((await request(one.url, '/api/auth/reset-password', 'POST', { token, newPassword: 'OtraSegura789!' })).status, 400);
    const stored = (await db.query('SELECT data FROM faros_users WHERE id = $1', [userId])).rows[0].data;
    assert.deepEqual(stored.portfolio, originalPortfolio); assert.equal(stored.profile, account.profile);
  });

  await t.test('dos instancias no pueden consumir el mismo enlace de contraseña', async () => {
    await releaseCooldown();
    await request(one.url, '/api/auth/forgot-password', 'POST', { email: account.email });
    const token = link(account.email).get('reset-password')!;
    const results = await Promise.all([one, two].map((api, i) => request(api.url, '/api/auth/reset-password', 'POST', { token, newPassword: `CarreraSegura${i}123!` })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    const winner = results.findIndex(r => r.status === 200);
    assert.equal((await request(one.url, '/api/auth/login', 'POST', { ...account, password: `CarreraSegura${winner}123!` })).status, 200);
  });

  await t.test('los enlaces vencidos y las contraseñas inválidas no modifican cuentas', async () => {
    await releaseCooldown();
    await request(one.url, '/api/auth/forgot-password', 'POST', { email: account.email });
    const token = link(account.email).get('reset-password')!;
    assert.equal((await request(one.url, '/api/auth/reset-password', 'POST', { token, newPassword: 'corta' })).status, 400);
    await db.query('UPDATE faros_email_tokens SET expires_at = 0 WHERE user_id = $1', [userId]);
    assert.equal((await request(two.url, '/api/auth/reset-password', 'POST', { token, newPassword: 'NoDebeCambiar123!' })).status, 400);
    const expiredEmail = { ...account, email: 'expired@example.test' };
    assert.equal((await request(one.url, '/api/auth/register', 'POST', expiredEmail)).status, 201);
    const verify = link(expiredEmail.email).get('verify-email')!;
    await db.query("UPDATE faros_email_tokens SET expires_at = 0 WHERE purpose = 'verify_email'");
    assert.equal((await request(two.url, '/api/auth/verify-email', 'POST', { token: verify })).status, 400);
    assert.equal((await request(two.url, '/api/auth/login', 'POST', expiredEmail)).status, 403);
  });

  await t.test('un proveedor caído no simula envíos ni habilita una cuenta pendiente', async () => {
    await releaseCooldown(); rejectMail = true;
    try {
      const failed = { ...account, email: 'delivery-failed@example.test' };
      const result = await request(one.url, '/api/auth/register', 'POST', failed);
      assert.equal(result.status, 503); assert.equal(result.data.code, 'EMAIL_DELIVERY_FAILED'); assert.equal(result.data.token, undefined);
      assert.equal((await request(one.url, '/api/auth/login', 'POST', failed)).status, 403);
      const token = link(failed.email).get('verify-email')!;
      assert.equal((await request(two.url, '/api/auth/verify-email', 'POST', { token })).status, 400);
      const recovery = await request(one.url, '/api/auth/forgot-password', 'POST', { email: account.email });
      assert.equal(recovery.status, 503); assert.equal(recovery.data.code, 'EMAIL_DELIVERY_FAILED');
    } finally { rejectMail = false; }
  });

  await t.test('las cuentas anteriores y el acceso por correo siguen funcionando', async () => {
    const older = { ...account, email: 'legacy@example.test' };
    const result = await request(legacy.url, '/api/auth/register', 'POST', older);
    assert.equal(result.status, 201); assert.ok(result.data.token); assert.equal(result.data.verificationRequired, undefined);
    const count = messages.length;
    assert.equal((await request(one.url, '/api/auth/login', 'POST', older)).status, 200);
    assert.equal(messages.length, count, 'No enviar correos masivos a cuentas existentes.');
    const partial = await start(testUrl, { ...settings, EMAIL_FROM: '' });
    assert.equal((await request(partial.url, '/api/auth/register', 'POST', { ...account, email: 'partial@example.test' })).data.code, 'EMAIL_NOT_CONFIGURED');
    assert.equal((await request(partial.url, '/api/auth/login', 'POST', older)).status, 200);
  });

  await t.test('el límite de reenvíos también se aplica a direcciones inexistentes', async () => {
    await releaseCooldown(); const body = { email: 'nonexistent@example.test' };
    assert.equal((await request(one.url, '/api/auth/resend-verification', 'POST', body)).status, 200);
    const blocked = await request(two.url, '/api/auth/resend-verification', 'POST', body);
    assert.equal(blocked.status, 429); assert.equal(blocked.data.code, 'EMAIL_RATE_LIMITED');
  });

  await t.test('el adaptador Brevo usa el mismo flujo sin cambios de cuenta o cartera', async () => {
    await releaseCooldown();
    const brevo = await start(testUrl, { EMAIL_PROVIDER: 'brevo', BREVO_API_KEY: 'test-only-key', EMAIL_FROM: settings.EMAIL_FROM, FAROS_TEST_EMAIL_ENDPOINT: settings.FAROS_TEST_EMAIL_ENDPOINT });
    const fresh = { ...account, email: 'brevo@example.test' };
    assert.equal((await request(brevo.url, '/api/auth/register', 'POST', fresh)).status, 201);
    const token = link(fresh.email).get('verify-email')!;
    assert.equal((await request(brevo.url, '/api/auth/verify-email', 'POST', { token })).status, 200);
  });
});
