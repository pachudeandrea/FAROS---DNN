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
import bcrypt from 'bcryptjs';
import { Pool } from 'pg';
import { databaseConfig } from '../src/server/database';

const root = new URL('../', import.meta.url);
let artifact: string;
const children = new Set<ChildProcess>();
const digest = (value: string) => createHash('sha256').update(value).digest('hex');

before(async () => {
  artifact = await mkdtemp(path.join(tmpdir(), 'faros-recovery-api-'));
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
  children.add(child);
  let output = '';
  child.stdout?.on('data', chunk => { output += chunk; }); child.stderr?.on('data', chunk => { output += chunk; });
  const port = await new Promise<number>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('La API de recuperación no arrancó.')), 10000);
    child.once('message', (message: any) => { clearTimeout(timer); resolve(message.port); });
    child.once('exit', () => { clearTimeout(timer); reject(new Error('La API terminó al arrancar.')); });
  });
  return { child, url: `http://127.0.0.1:${port}`, get output() { return output; } };
}
async function request(base: string, route: string, method = 'GET', body?: unknown, token?: string) {
  const response = await fetch(base + route, { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }), ...(token ? { Authorization: `Bearer ${token}` } : {}) }, signal: AbortSignal.timeout(15000) });
  assert.match(response.headers.get('content-type') || '', /json/);
  return { status: response.status, data: await response.json(), cookie: response.headers.get('set-cookie') };
}

test('registro directo y recuperación con código en API compilada y PostgreSQL local', { timeout: 90000 }, async t => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Se requiere PostgreSQL LOCAL de pruebas.');
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)); assert.match(url.pathname, /test/i);
  const admin = new Pool(databaseConfig(url.toString()));
  const schema = `faros_recovery_test_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const testUrl = url.toString();
  const db = new Pool(databaseConfig(testUrl));
  const messages: any[] = [];
  let rejectMail = false;
  let invalidReceipt = false;
  const mail = createServer(async (req, res) => {
    if (req.headers.authorization !== 'Bearer test-only-key' && req.headers['api-key'] !== 'test-only-key') { res.writeHead(401).end(); return; }
    const chunks: Buffer[] = []; for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const data = JSON.parse(Buffer.concat(chunks).toString());
    const addresses = data.to?.map((value: any) => typeof value === 'string' ? value : value.email) || [];
    if (!addresses.length || addresses.some((value: string) => !value.endsWith('.test'))) { res.writeHead(400).end(); return; }
    messages.push(data); res.setHeader('Content-Type', 'application/json');
    if (rejectMail) res.writeHead(503).end('{"message":"Test provider unavailable"}');
    else res.end(JSON.stringify(invalidReceipt ? {} : data.htmlContent ? { messageId: 'local-brevo-message' } : { id: 'local-resend-message' }));
  });
  mail.listen(0, '127.0.0.1'); await once(mail, 'listening');
  const port = (mail.address() as { port: number }).port;
  const settings = { BREVO_API_KEY: ' test-only-key ', EMAIL_FROM: 'faros@example.test', FAROS_TEST_EMAIL_ENDPOINT: `http://127.0.0.1:${port}/emails` };
  t.after(async () => {
    for (const child of children) await stop(child);
    await new Promise<void>(resolve => mail.close(() => resolve()));
    await db.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  });
  const migration = spawn(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { cwd: root, env: environment(testUrl), stdio: ['ignore', 'pipe', 'pipe'] });
  migration.stdout.resume(); migration.stderr.resume(); assert.equal((await once(migration, 'exit'))[0], 0);
  const one = await start(testUrl, settings);
  let two = await start(testUrl, settings);
  const account = { name: 'Prueba correo', email: 'new@example.test', password: 'InicialSegura123!', termsAccepted: true, profile: 'moderado', assets: [] };
  const releaseCooldown = () => db.query('UPDATE faros_email_rate_limits SET window_started_at = 0');
  const wrongCode = (code: string) => code === '000000' ? '000001' : '000000';
  function codeFor(address: string) {
    const message = [...messages].reverse().find(message => message.to.some((value: any) => (typeof value === 'string' ? value : value.email) === address));
    assert.ok(message, 'Debe existir un correo capturado por el proveedor local.');
    const text = message.textContent || message.text;
    assert.doesNotMatch(text, /#reset-password|#verify-email/);
    const found = text.match(/\b[0-9]{6}\b/);
    assert.ok(found, 'El correo debe contener un código de seis dígitos.');
    return found[0] as string;
  }
  const storedCode = () => db.query('SELECT * FROM faros_password_reset_codes WHERE email_hash = $1', [digest(account.email)]);
  let session: string; let userId: string; let originalPortfolio: unknown;

  await t.test('el registro activa la cuenta y crea sesión sin enviar correo, aun con Brevo configurado', async () => {
    const result = await request(one.url, '/api/auth/register', 'POST', account);
    assert.equal(result.status, 201); assert.ok(result.data.user); assert.ok(result.data.token);
    assert.equal(result.data.verificationRequired, undefined); assert.equal(messages.length, 0);
    assert.match(result.cookie || '', /HttpOnly/); assert.match(result.cookie || '', /Secure/);
    const stored = (await db.query('SELECT data FROM faros_users WHERE email = $1', [account.email])).rows[0].data;
    userId = stored.id; originalPortfolio = stored.portfolio; session = result.data.token;
    assert.equal(stored.emailVerificationRequired, undefined); assert.equal(stored.emailVerified, undefined);
    assert.equal((await storedCode()).rowCount, 0);
    assert.equal((await request(two.url, '/api/auth/me', 'GET', undefined, session)).status, 200);
    assert.equal((await request(two.url, '/api/auth/login', 'POST', account)).status, 200);
  });

  await t.test('las cuentas antes pendientes pueden entrar y las rutas de confirmación ya no existen', async () => {
    const older = { ...account, email: 'pending@example.test' };
    const result = await request(one.url, '/api/auth/register', 'POST', older);
    await db.query('UPDATE faros_users SET data = data || $2::jsonb WHERE id = $1', [result.data.user.id, JSON.stringify({ emailVerificationRequired: true, emailVerified: false })]);
    const login = await request(two.url, '/api/auth/login', 'POST', older);
    assert.equal(login.status, 200);
    assert.equal((await request(one.url, '/api/auth/me', 'GET', undefined, login.data.token)).status, 200);
    assert.equal(messages.length, 0);
    for (const route of ['verify-email', 'resend-verification']) assert.equal((await request(one.url, `/api/auth/${route}`, 'POST', {})).status, 404);
  });

  await t.test('el registro y acceso funcionan con correo ausente, parcial o proveedor caído', async () => {
    for (const [index, config] of [{}, { ...settings, EMAIL_FROM: '' }].entries()) {
      const api = await start(testUrl, config);
      const result = await request(api.url, '/api/auth/register', 'POST', { ...account, email: `no-mail-${index}@example.test` });
      assert.equal(result.status, 201); assert.ok(result.data.token);
      assert.equal((await request(api.url, '/api/auth/login', 'POST', account)).status, 200);
      assert.equal((await request(api.url, '/api/auth/forgot-password', 'POST', { email: account.email })).status, 503);
    }
    rejectMail = true;
    try { assert.equal((await request(one.url, '/api/auth/register', 'POST', { ...account, email: 'outage@example.test' })).status, 201); }
    finally { rejectMail = false; }
    assert.equal(messages.length, 0);
  });

  await t.test('la recuperación normaliza el correo y no revela cuentas ni devuelve códigos', async () => {
    await releaseCooldown(); const count = messages.length;
    const missing = await request(one.url, '/api/auth/forgot-password', 'POST', { email: 'missing@example.test' });
    assert.equal(messages.length, count);
    const found = await request(two.url, '/api/auth/forgot-password', 'POST', { email: ' NEW@EXAMPLE.TEST ' });
    assert.equal(found.status, 200); assert.deepEqual(found.data, missing.data);
    assert.equal(found.data.code, undefined); assert.equal(found.data.resetToken, undefined); assert.equal(found.data.token, undefined);
    const code = codeFor(account.email); const row = (await storedCode()).rows[0];
    assert.equal(row.user_id, userId); assert.equal(row.attempts, 0);
    assert.notEqual(row.code_hash, code); assert.ok(await bcrypt.compare(code, row.code_hash));
    assert.ok(Number(row.expires_at) > Date.now() && Number(row.expires_at) <= Date.now() + 600000);
    assert.equal((await request(one.url, '/api/auth/forgot-password', 'POST', { email: 'invalid' })).status, 400);
  });

  await t.test('un reenvío invalida el código anterior sin cambiar la contraseña', async () => {
    const oldCode = codeFor(account.email); await releaseCooldown();
    assert.equal((await request(one.url, '/api/auth/forgot-password', 'POST', { email: account.email })).status, 200);
    const code = codeFor(account.email); assert.notEqual(code, oldCode);
    assert.equal((await request(two.url, '/api/auth/reset-password', 'POST', { email: account.email, code: oldCode, newPassword: 'NoDebeCambiar123!' })).status, 400);
    assert.equal((await storedCode()).rows[0].attempts, 1, 'Un intento inválido debe persistir entre instancias.');
  });

  await t.test('el código permite cambiar contraseña tras reinicio, revoca sesiones y conserva cartera', async () => {
    const other = await request(one.url, '/api/auth/login', 'POST', account);
    const code = codeFor(account.email);
    await stop(two.child); two = await start(testUrl, settings);
    const changed = await request(two.url, '/api/auth/reset-password', 'POST', { email: account.email, code, newPassword: 'NuevaSegura456!' });
    assert.equal(changed.status, 200); assert.match(changed.cookie || '', /faros_session=;/);
    for (const token of [session, other.data.token]) assert.equal((await request(one.url, '/api/auth/me', 'GET', undefined, token)).status, 401);
    assert.equal((await request(one.url, '/api/auth/login', 'POST', account)).status, 401);
    assert.equal((await request(two.url, '/api/auth/login', 'POST', { ...account, password: 'NuevaSegura456!' })).status, 200);
    assert.equal((await request(one.url, '/api/auth/reset-password', 'POST', { email: account.email, code, newPassword: 'OtraSegura789!' })).status, 400);
    const stored = (await db.query('SELECT data FROM faros_users WHERE id = $1', [userId])).rows[0].data;
    assert.deepEqual(stored.portfolio, originalPortfolio); assert.equal(stored.profile, account.profile);
    assert.equal(stored.emailVerified, undefined, 'Recuperar la clave no vuelve a introducir la verificación del registro.');
  });

  await t.test('cinco errores bloquean el código, incluso desde distintas instancias', async () => {
    await releaseCooldown(); await request(one.url, '/api/auth/forgot-password', 'POST', { email: account.email });
    const code = codeFor(account.email);
    for (let i = 0; i < 5; i++) {
      const api = i % 2 ? one : two;
      assert.equal((await request(api.url, '/api/auth/reset-password', 'POST', { email: account.email, code: wrongCode(code), newPassword: 'NoDebeCambiar123!' })).status, 400);
    }
    assert.equal((await storedCode()).rows[0].attempts, 5);
    assert.equal((await request(one.url, '/api/auth/reset-password', 'POST', { email: account.email, code, newPassword: 'NoDebeCambiar123!' })).status, 400);
    await releaseCooldown(); await request(one.url, '/api/auth/forgot-password', 'POST', { email: account.email });
    assert.equal((await storedCode()).rows[0].attempts, 0);
  });

  await t.test('dos instancias no pueden consumir el mismo código', async () => {
    const code = codeFor(account.email);
    const results = await Promise.all([one, two].map((api, i) => request(api.url, '/api/auth/reset-password', 'POST', { email: account.email, code, newPassword: `CarreraSegura${i}123!` })));
    assert.deepEqual(results.map(r => r.status).sort(), [200, 400]);
    const winner = results.findIndex(r => r.status === 200);
    assert.equal((await request(one.url, '/api/auth/login', 'POST', { ...account, password: `CarreraSegura${winner}123!` })).status, 200);
  });

  await t.test('los errores concurrentes no exceden cinco intentos ni habilitan el código', async () => {
    await releaseCooldown(); await request(one.url, '/api/auth/forgot-password', 'POST', { email: account.email });
    const code = codeFor(account.email);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => request((i % 2 ? one : two).url, '/api/auth/reset-password', 'POST', { email: account.email, code: wrongCode(code), newPassword: 'NoDebeCambiar123!' })));
    assert.ok(results.every(result => result.status === 400)); assert.equal((await storedCode()).rows[0].attempts, 5);
    assert.equal((await request(one.url, '/api/auth/reset-password', 'POST', { email: account.email, code, newPassword: 'NoDebeCambiar123!' })).status, 400);
  });

  await t.test('el vencimiento, el correo equivocado y contraseñas inválidas no cambian la cuenta', async () => {
    await releaseCooldown(); await request(one.url, '/api/auth/forgot-password', 'POST', { email: account.email });
    const code = codeFor(account.email);
    assert.equal((await request(one.url, '/api/auth/reset-password', 'POST', { email: account.email, code, newPassword: 'corta' })).status, 400);
    assert.equal((await storedCode()).rows[0].attempts, 0);
    assert.equal((await request(one.url, '/api/auth/reset-password', 'POST', { email: 'different@example.test', code, newPassword: 'NoDebeCambiar123!' })).status, 400);
    await db.query('UPDATE faros_password_reset_codes SET expires_at = 0 WHERE user_id = $1', [userId]);
    assert.equal((await request(two.url, '/api/auth/reset-password', 'POST', { email: account.email, code, newPassword: 'NoDebeCambiar123!' })).status, 400);
    assert.equal((await request(one.url, '/api/auth/reset-password', 'POST', { token: 'a'.repeat(64), newPassword: 'NoDebeCambiar123!' })).status, 400);
  });

  await t.test('una respuesta rechazada o sin comprobante no simula un envío y descarta el código', async () => {
    for (const kind of ['rejection', 'receipt']) {
      await releaseCooldown(); rejectMail = kind === 'rejection'; invalidReceipt = kind === 'receipt';
      try {
        const failed = await request(one.url, '/api/auth/forgot-password', 'POST', { email: account.email });
        assert.equal(failed.status, 503); assert.equal(failed.data.code, 'EMAIL_DELIVERY_FAILED');
        assert.equal((await storedCode()).rowCount, 0);
        assert.equal((await request(two.url, '/api/auth/reset-password', 'POST', { email: account.email, code: codeFor(account.email), newPassword: 'NoDebeCambiar123!' })).status, 400);
      } finally { rejectMail = false; invalidReceipt = false; }
    }
  });

  await t.test('las direcciones inexistentes tienen el mismo mensaje y límites de solicitud', async () => {
    await releaseCooldown(); const email = 'nonexistent@example.test'; const count = messages.length;
    assert.equal((await request(one.url, '/api/auth/forgot-password', 'POST', { email })).status, 200);
    assert.equal(messages.length, count);
    assert.equal((await request(two.url, '/api/auth/forgot-password', 'POST', { email })).status, 429);
    assert.equal((await request(one.url, '/api/auth/reset-password', 'POST', { email, code: '000000', newPassword: 'NoDebeCambiar123!' })).status, 400);
  });

  await t.test('Resend también entrega códigos y no exige un enlace ni APP_URL para enviarlos', async () => {
    await releaseCooldown();
    const resend = await start(testUrl, { EMAIL_PROVIDER: 'resend', RESEND_API_KEY: 'test-only-key', EMAIL_FROM: settings.EMAIL_FROM, FAROS_TEST_EMAIL_ENDPOINT: settings.FAROS_TEST_EMAIL_ENDPOINT, APP_URL: '' });
    const fresh = { ...account, email: 'resend@example.test' };
    assert.equal((await request(resend.url, '/api/auth/register', 'POST', fresh)).status, 201);
    assert.equal((await request(resend.url, '/api/auth/forgot-password', 'POST', { email: fresh.email })).status, 200);
    assert.equal((await request(two.url, '/api/auth/reset-password', 'POST', { email: fresh.email, code: codeFor(fresh.email), newPassword: 'NuevaSegura123!' })).status, 200);
  });

  await t.test('los registros distinguen aceptación, rechazo y cuenta inexistente sin datos sensibles', () => {
    const logs = one.output + two.output;
    assert.match(logs, /provider=brevo status=accepted/); assert.match(logs, /status=account_not_found/);
    assert.match(logs, /status=http_503/); assert.match(logs, /status=invalid_receipt/);
    const events = logs.split('\n').filter(line => line.includes('[PASSWORD RECOVERY]')).join('\n');
    assert.doesNotMatch(events, /@|test-only-key|password|code_hash/);
    for (const message of messages) {
      const text = message.textContent || message.text;
      assert.ok(!events.includes(text.match(/\b[0-9]{6}\b/)[0]));
    }
  });
});
