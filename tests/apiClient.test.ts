import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiRequest, ApiError } from '../src/utils/apiClient';
import { databaseConfig } from '../src/server/database';

test('mensajes distintos para rutas, protocolo, validación, DB y red', async t => {
  const originalFetch = globalThis.fetch;
  t.after(() => { globalThis.fetch = originalFetch; });
  for (const [status, body, contentType, code] of [
    [404, '<html>Not found</html>', 'text/html', 'API_NOT_FOUND'],
    [200, '<html>SPA</html>', 'text/html', 'API_NON_JSON'],
    [502, '<html>Gateway</html>', 'text/html', 'API_NON_JSON'],
    [200, '{broken', 'application/json', 'API_INVALID_JSON'],
    [400, '{"error":"Contraseña inválida"}', 'application/json', 'VALIDATION_ERROR'],
    [503, '{"code":"DB_NOT_CONFIGURED","error":"Falta configurar la base"}', 'application/json', 'DB_NOT_CONFIGURED'],
    [503, '{"code":"DB_UNAVAILABLE","error":"Base no disponible"}', 'application/json', 'DB_UNAVAILABLE']
  ] as const) {
    globalThis.fetch = async () => new Response(body, { status, headers: { 'Content-Type': contentType } });
    await assert.rejects(apiRequest('/api/auth/register'), error => error instanceof ApiError && error.code === code && !error.message.includes('<html>'));
  }
  globalThis.fetch = async () => { throw new TypeError('fetch failed'); };
  await assert.rejects(apiRequest('/api/auth/register'), error => error instanceof ApiError && error.code === 'NETWORK_ERROR');
});

test('TLS remoto verifica certificados incluso con sslmode=require', () => {
  const config = databaseConfig('postgresql://test:unused@example.com/neondb?sslmode=require');
  assert.equal((config.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
  assert.ok(!config.connectionString?.includes('sslmode'));
  const disabled = databaseConfig('postgresql://test:unused@example.com/neondb?sslmode=disable');
  assert.equal((disabled.ssl as { rejectUnauthorized: boolean }).rejectUnauthorized, true);
  assert.equal(databaseConfig('postgresql://postgres@127.0.0.1/faros_test').ssl, false);
});
