import test from 'node:test';
import assert from 'node:assert/strict';
import { checkDeployment } from '../scripts/check-deployment.mjs';
const revision = 'b'.repeat(40);
function fixture({ apiRevision = revision, bundleRevision = revision, healthy = true } = {}) {
  return async (input: Parameters<typeof fetch>[0]) => {
    const url = input instanceof Request ? new URL(input.url) : new URL(input);
    if (url.pathname === '/api/version') return Response.json({ revision: apiRevision, newsVersion: 'v4_coverage' });
    if (url.pathname === '/api/health') return healthy ? Response.json({ status: 'ok', database: 'postgresql' }) : Response.json({ error: 'DB_UNAVAILABLE' }, { status: 503 });
    if (url.pathname === '/') return new Response('<div id="root"></div><script src="/assets/app.js"></script>');
    return new Response('const revision="' + bundleRevision + '"');
  };
}
test('verifica API, PostgreSQL y bundle del mismo despliegue sin escribir datos', async () => {
  assert.deepEqual(await checkDeployment({ origin: 'https://faros.example', revision, fetcher: fixture() }), { revision, newsVersion: 'v4_coverage', health: 'ok' });
});
test('rechaza API anterior, base caída y HTML apuntando a un bundle viejo', async () => {
  for (const options of [{ apiRevision: 'c'.repeat(40) }, { healthy: false }, { bundleRevision: 'd'.repeat(40) }]) {
    await assert.rejects(checkDeployment({ origin: 'https://faros.example', revision, fetcher: fixture(options) }));
  }
});
