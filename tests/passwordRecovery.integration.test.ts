import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { fork, spawn, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
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
  artifact = await mkdtemp(path.join(tmpdir(), 'faros-key-api-'));
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
  return { ...env, DATABASE_URL: url, POSTGRES_URL: '', POSTGRES_PRISMA_URL: '', POSTGRES_URL_NON_POOLING: '', APP_URL: '', NODE_ENV: 'production', VERCEL: '1' };
}
async function stop(child: ChildProcess) {
  if (child.exitCode !== null) return;
  const exited = once(child, 'exit'); child.kill('SIGTERM');
  const timer = setTimeout(() => child.kill('SIGKILL'), 3000);
  await exited; clearTimeout(timer); children.delete(child);
}
async function start(url: string) {
  const child = fork(new URL('fixtures/native-api-server.mjs', import.meta.url), [pathToFileURL(path.join(artifact, 'api/index.js')).href], { cwd: root, execArgv: [], silent: true, env: environment(url) });
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

test('recuperación con código de cuatro dígitos, sin correo, en API nativa y PostgreSQL', { timeout: 90000 }, async t => {
  assert.ok(process.env.TEST_DATABASE_URL, 'Se requiere PostgreSQL LOCAL de pruebas.');
  const url = new URL(process.env.TEST_DATABASE_URL);
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)); assert.match(url.pathname, /test/i);
  const admin = new Pool(databaseConfig(url.toString()));
  const schema = `faros_key_test_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`);
  url.searchParams.set('options', `-c search_path=${schema}`);
  const testUrl = url.toString();
  const db = new Pool(databaseConfig(testUrl));
  t.after(async () => {
    for (const child of children) await stop(child);
    await db.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end();
  });
  const migration = spawn(process.execPath, ['--import', 'tsx', 'scripts/migrate.ts'], { cwd: root, env: environment(testUrl), stdio: ['ignore', 'pipe', 'pipe'] });
  migration.stdout.resume(); migration.stderr.resume(); assert.equal((await once(migration, 'exit'))[0], 0);
  const one = await start(testUrl);
  let two = await start(testUrl);
  const account = { name: 'Prueba recupero', email: 'new@example.test', password: 'InicialSegura123!', recoveryKey: '0042', termsAccepted: true, profile: 'moderado', assets: [] };
  let currentPassword = account.password;
  let currentKey = account.recoveryKey;
  let session: string; let userId: string; let originalPortfolio: unknown;
  const releaseLimits = () => db.query('UPDATE faros_recovery_limits SET window_started_at = 0');
  t.beforeEach(async () => { await releaseLimits(); });
  const recover = (api: typeof one, recoveryKey = currentKey, newPassword = 'NuevaSegura456!', email = account.email) => request(api.url, '/api/auth/reset-password', 'POST', { email, recoveryKey, newPassword });
  const userData = async (id = userId) => (await db.query('SELECT data FROM faros_users WHERE id = $1', [id])).rows[0].data;
  const privateResponse = (data: unknown, values = [currentKey, currentPassword]) => {
    const text = JSON.stringify(data);
    assert.doesNotMatch(text, /recoveryKeyHash|passwordHash/);
    const strings = (value: unknown): string[] => typeof value === 'string' ? [value] : value && typeof value === 'object' ? Object.values(value).flatMap(strings) : [];
    for (const value of values) assert.ok(!strings(data).includes(value));
    assert.doesNotMatch(text, /"recoveryKey"\s*:/);
  };

  await t.test('el registro exige exactamente cuatro dígitos y rechaza letras, números JSON y otras longitudes', async () => {
    for (const recoveryKey of [undefined, '', '123', '12345', '12a4', 1234, '１２３４', account.password]) {
      const result = await request(one.url, '/api/auth/register', 'POST', { ...account, recoveryKey, recoveryKeyHash: 'forged' });
      assert.equal(result.status, 400); assert.equal(result.data.token, undefined);
    }
    assert.equal((await db.query('SELECT id FROM faros_users')).rowCount, 0);
  });

  await t.test('el registro crea sesión y guarda solo hashes, sin configurar correo', async () => {
    const result = await request(one.url, '/api/auth/register', 'POST', account);
    assert.equal(result.status, 201); assert.equal(result.data.user.hasRecoveryKey, true); assert.ok(result.data.token);
    privateResponse(result.data); assert.match(result.cookie || '', /HttpOnly/); assert.match(result.cookie || '', /Secure/);
    session = result.data.token; userId = result.data.user.id; originalPortfolio = result.data.user.portfolio;
    const stored = await userData();
    assert.ok(await bcrypt.compare(account.password, stored.passwordHash));
    assert.ok(await bcrypt.compare(account.recoveryKey, stored.recoveryKeyHash));
    assert.equal(await bcrypt.compare('42', stored.recoveryKeyHash), false, 'El código conserva sus ceros iniciales.');
    assert.equal(stored.recoveryKey, undefined); assert.equal(stored.password, undefined);
    assert.equal((await db.query('SELECT * FROM faros_password_reset_codes')).rowCount, 0);
    const me = await request(two.url, '/api/auth/me', 'GET', undefined, session);
    assert.equal(me.status, 200); assert.equal(me.data.user.hasRecoveryKey, true); privateResponse(me.data);
    for (const route of ['verify-email', 'resend-verification', 'forgot-password']) assert.equal((await request(one.url, `/api/auth/${route}`, 'POST', { email: account.email })).status, 404);
  });

  await t.test('recuperar con correo y clave funciona tras reinicio y revoca todas las sesiones', async () => {
    const other = await request(one.url, '/api/auth/login', 'POST', account);
    const before = await userData();
    await stop(two.child); two = await start(testUrl);
    const changed = await recover(two, currentKey, 'NuevaSegura456!', ' NEW@EXAMPLE.TEST ');
    assert.equal(changed.status, 200); privateResponse(changed.data); assert.match(changed.cookie || '', /faros_session=;/);
    for (const token of [session, other.data.token]) assert.equal((await request(one.url, '/api/auth/me', 'GET', undefined, token)).status, 401);
    assert.equal((await request(one.url, '/api/auth/login', 'POST', account)).status, 401);
    currentPassword = 'NuevaSegura456!';
    const login = await request(two.url, '/api/auth/login', 'POST', { email: account.email, password: currentPassword });
    assert.equal(login.status, 200); privateResponse(login.data); session = login.data.token;
    const after = await userData();
    assert.deepEqual(after.portfolio, originalPortfolio); assert.deepEqual(after.preferences, before.preferences);
    assert.equal(after.recoveryKeyHash, before.recoveryKeyHash); assert.equal(after.emailVerified, undefined);
  });

  await t.test('la clave guardada se puede reutilizar hasta que su dueño la reemplace', async () => {
    const changed = await recover(one, currentKey, 'OtraSegura789!');
    assert.equal(changed.status, 200); currentPassword = 'OtraSegura789!';
    assert.equal((await request(one.url, '/api/auth/me', 'GET', undefined, session)).status, 401);
    const login = await request(two.url, '/api/auth/login', 'POST', { email: account.email, password: currentPassword });
    assert.equal(login.status, 200); session = login.data.token;
  });

  await t.test('una clave incorrecta, un correo inexistente y una cuenta sin clave responden igual', async () => {
    const legacy = await request(one.url, '/api/auth/register', 'POST', { ...account, email: 'legacy@example.test' });
    await db.query("UPDATE faros_users SET data = data - 'recoveryKeyHash' WHERE id = $1", [legacy.data.user.id]);
    const before = await userData();
    const wrong = await recover(one, '7741');
    const missing = await recover(two, currentKey, 'NoDebeCambiar123!', 'missing@example.test');
    const unset = await recover(one, currentKey, 'NoDebeCambiar123!', 'legacy@example.test');
    assert.equal(wrong.status, 401); assert.deepEqual(wrong.data, missing.data); assert.deepEqual(wrong.data, unset.data);
    assert.deepEqual(await userData(), before);
  });

  await t.test('cinco intentos por cuenta persisten entre instancias y no bloquean el acceso normal', async () => {
    for (let i = 0; i < 5; i++) assert.equal((await recover(i % 2 ? one : two, '7741')).status, 401);
    await stop(two.child); two = await start(testUrl);
    assert.equal((await recover(two)).status, 429);
    assert.equal((await request(one.url, '/api/auth/login', 'POST', { email: account.email, password: currentPassword })).status, 200);
    await releaseLimits();
    assert.equal((await recover(two, currentKey, 'DespuesDeEspera123!')).status, 200); currentPassword = 'DespuesDeEspera123!';
    session = (await request(one.url, '/api/auth/login', 'POST', { email: account.email, password: currentPassword })).data.token;
  });

  await t.test('los intentos concurrentes no eluden el límite compartido de recuperación', async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => recover(i % 2 ? one : two, '7741')));
    assert.equal(results.filter(result => result.status === 401).length, 5);
    assert.equal(results.filter(result => result.status === 429).length, 3);
    assert.equal((await recover(one)).status, 429);
  });

  await t.test('el límite por IP también se aplica al cambiar de dirección de correo', async () => {
    for (let i = 0; i < 20; i++) assert.equal((await recover(one, currentKey, 'NoDebeCambiar123!', `missing-${i}@example.test`)).status, 401);
    assert.equal((await recover(two, currentKey, 'NoDebeCambiar123!', 'another@example.test')).status, 429);
  });

  await t.test('los datos inválidos y el código antiguo no cambian la cuenta ni sus claves', async () => {
    const before = await userData();
    for (const body of [
      { email: account.email, recoveryKey: currentKey, newPassword: 'corta' },
      { email: account.email, recoveryKey: currentKey, newPassword: currentKey },
      { email: account.email, recoveryKey: '123', newPassword: 'NuevaValida123!' },
      { email: account.email, recoveryKey: '12345', newPassword: 'NuevaValida123!' },
      { email: account.email, recoveryKey: '12a4', newPassword: 'NuevaValida123!' },
      { email: account.email, recoveryKey: '42', newPassword: 'NuevaValida123!' },
      { email: account.email, code: '123456', newPassword: 'NuevaValida123!' },
      { token: 'a'.repeat(64), newPassword: 'NuevaValida123!' }
    ]) assert.equal((await request(one.url, '/api/auth/reset-password', 'POST', body)).status, 400);
    assert.deepEqual(await userData(), before);
  });

  await t.test('las cuentas anteriores pueden entrar y configurar una clave con su contraseña actual', async () => {
    const email = 'legacy@example.test';
    const login = await request(one.url, '/api/auth/login', 'POST', { email, password: account.password });
    assert.equal(login.status, 200); assert.equal(login.data.user.hasRecoveryKey, false);
    const body = { currentPassword: account.password, recoveryKey: '0017' };
    const before = await userData(login.data.user.id);
    assert.equal((await request(one.url, '/api/auth/recovery-key', 'PUT', body)).status, 401);
    assert.equal((await request(two.url, '/api/auth/recovery-key', 'PUT', { ...body, currentPassword: 'NoEsLaClave123!' }, login.data.token)).status, 401);
    const saved = await request(one.url, '/api/auth/recovery-key', 'PUT', body, login.data.token);
    assert.equal(saved.status, 200); assert.equal(saved.data.user.hasRecoveryKey, true); privateResponse(saved.data, [body.currentPassword, body.recoveryKey]);
    const stored = await userData(login.data.user.id);
    assert.equal(stored.passwordHash, before.passwordHash); assert.deepEqual(stored.portfolio, before.portfolio);
    assert.ok(await bcrypt.compare(body.recoveryKey, stored.recoveryKeyHash));
    assert.equal((await request(two.url, '/api/auth/me', 'GET', undefined, login.data.token)).data.user.hasRecoveryKey, true);
    assert.equal((await recover(two, body.recoveryKey, 'NuevaParaAnterior123!', email)).status, 200);
  });

  await t.test('solo la sesión dueña puede cambiar su clave y la anterior deja de funcionar', async () => {
    const replacement = '0086';
    const saved = await request(one.url, '/api/auth/recovery-key', 'PUT', { currentPassword, recoveryKey: replacement, userId: 'someone-else', email: 'legacy@example.test' }, session);
    assert.equal(saved.status, 200); privateResponse(saved.data, [replacement, currentPassword]);
    assert.equal((await recover(two, currentKey)).status, 401);
    currentKey = replacement;
    assert.equal((await recover(two, currentKey, 'ConRespaldoNuevo123!')).status, 200); currentPassword = 'ConRespaldoNuevo123!';
    session = (await request(one.url, '/api/auth/login', 'POST', { email: account.email, password: currentPassword })).data.token;
  });

  await t.test('cambiar el código requiere contraseña actual y valida sus cuatro dígitos', async () => {
    const before = await userData();
    for (const recoveryKey of ['123', '12345', '12a4', 1234, currentPassword]) {
      assert.equal((await request(one.url, '/api/auth/recovery-key', 'PUT', { currentPassword, recoveryKey }, session)).status, 400);
    }
    assert.equal((await request(one.url, '/api/auth/recovery-key', 'PUT', { currentPassword: 'Incorrecta123!', recoveryKey: '9351' }, session)).status, 401);
    assert.deepEqual(await userData(), before);
  });

  await t.test('las actualizaciones normales no pueden inyectar ni exponer claves de recuperación', async () => {
    const before = await userData();
    const changed = await request(one.url, '/api/auth/user', 'PUT', { recoveryKeyHash: 'forged', recoveryKey: 'injected', hasRecoveryKey: false, passwordHash: 'forged' }, session);
    assert.equal(changed.status, 200); assert.equal(changed.data.user.hasRecoveryKey, true); privateResponse(changed.data);
    const after = await userData();
    assert.equal(after.recoveryKeyHash, before.recoveryKeyHash); assert.equal(after.passwordHash, before.passwordHash);
    assert.equal(after.recoveryKey, undefined);
  });

  await t.test('las claves largas anteriores permiten recuperar acceso y reemplazarlas por cuatro dígitos', async () => {
    const email = 'old-key@example.test';
    const oldKey = 'Frase-anterior-guardada-123!';
    const created = await request(one.url, '/api/auth/register', 'POST', { ...account, email });
    await db.query('UPDATE faros_users SET data = data || $2::jsonb WHERE id = $1', [created.data.user.id, JSON.stringify({ recoveryKeyHash: await bcrypt.hash(oldKey, 10) })]);
    assert.equal((await recover(two, oldKey, 'RecuperadaAnterior123!', email)).status, 200);
    const login = await request(one.url, '/api/auth/login', 'POST', { email, password: 'RecuperadaAnterior123!' });
    assert.equal(login.status, 200);
    const saved = await request(two.url, '/api/auth/recovery-key', 'PUT', { currentPassword: 'RecuperadaAnterior123!', recoveryKey: '0007' }, login.data.token);
    assert.equal(saved.status, 200);
    assert.equal((await recover(one, oldKey, 'NoDebeCambiar123!', email)).status, 401);
    assert.equal((await recover(one, '0007', 'RecuperadaConPIN123!', email)).status, 200);
  });

  await t.test('las claves no se escriben en registros y se conserva el perfil de la cuenta', async () => {
    const output = one.output + two.output;
    for (const secret of [account.password, currentPassword]) assert.ok(!output.includes(secret));
    assert.doesNotMatch(output, /["']recoveryKey["']\s*:/);
    for (const secret of [account.recoveryKey, currentKey]) assert.ok(!output.split(/\s+/).includes(secret));
    const stored = await userData();
    assert.deepEqual(stored.portfolio, originalPortfolio); assert.equal(stored.profile, account.profile);
    assert.equal((await db.query('SELECT * FROM faros_password_reset_codes')).rowCount, 0);
  });
});
