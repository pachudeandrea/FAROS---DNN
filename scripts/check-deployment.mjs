import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
export async function checkDeployment({ origin, revision, fetcher = fetch }) {
  const base = new URL(origin);
  assert.ok(['https:', 'http:'].includes(base.protocol), 'Se requiere una URL HTTP(S).');
  assert.match(revision, /^[a-f0-9]{40}$/i, 'Se requiere el SHA completo esperado.');
  async function json(path) {
    const response = await fetcher(new URL(path, base), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
    assert.equal(response.status, 200, `${path} debe responder 200`);
    assert.match(response.headers.get('content-type') || '', /application\/json/, `${path} debe responder JSON`);
    return response.json();
  }
  const version = await json('/api/version');
  assert.equal(version.revision, revision, 'Producción todavía no sirve el commit esperado.');
  assert.ok(version.newsVersion, 'Falta la versión del caché de noticias.');
  const health = await json('/api/health');
  assert.equal(health.status, 'ok'); assert.equal(health.database, 'postgresql');
  const page = await fetcher(new URL('/', base), { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  assert.equal(page.status, 200); const html = await page.text();
  assert.match(html, /id="root"/, 'La aplicación debe incluir su raíz React.');
  const asset = html.match(/src="([^" ]+\.js)"/);
  assert.ok(asset, 'La aplicación debe incluir su bundle compilado.');
  const assetUrl = new URL(asset[1], base); assert.equal(assetUrl.origin, base.origin);
  const bundle = await fetcher(assetUrl, { signal: AbortSignal.timeout(15000) });
  assert.equal(bundle.status, 200); assert.ok((await bundle.text()).includes(revision), 'El bundle debe corresponder al mismo commit que la API.');
  return { revision: version.revision, newsVersion: version.newsVersion, health: health.status };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [origin = 'https://faros-dnn.vercel.app', revision = process.env.EXPECTED_REVISION || ''] = process.argv.slice(2);
  let success = false;
  for (let attempt = 1; attempt <= 6; attempt++) {
    try { console.log(JSON.stringify(await checkDeployment({ origin, revision }))); success = true; break; }
    catch { console.error(`Comprobación ${attempt}/6 pendiente: versión, salud o recursos todavía no coinciden.`); if (attempt < 6) await new Promise(resolve => setTimeout(resolve, 10000)); }
  }
  if (!success) process.exitCode = 1;
}
