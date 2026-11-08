import test from 'node:test';
import assert from 'node:assert/strict';
import { extractArticleMeta, purgeUrlVerificationCache, verifySourceUrl } from '../src/utils/urlResolver';
import { sanitizeGroundingSources } from '../src/utils/sourceGrounding';

const url = 'https://www.cronista.com/columnistas/juicio-ypf-mucho-ruido-y-una-premisa-equivocada/';
const headline = 'Juicio YPF: mucho ruido y una premisa equivocada';
const description = 'El amicus de los 15 Estados confunde jurisdicción con derecho aplicable: el Segundo Circuito sí juzgó a la Argentina, pero aplicó ley argentina.';
const opening = 'Quince Estados de los EE.UU presentaron un amicus curiae ante la Corte Suprema de los EE.UU para apoyar la revisión del fallo que favoreció a la Argentina.';
const article = (body = opening) => `<script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', headline, description, articleBody: body, datePublished: '2026-11-07T13:15:20Z' })}</script>`;
const page = (extra = '') => `<html><head><meta property="og:title" content="${headline}"><meta property="og:description" content="${description}">${extra}</head><body><aside><article><h2>YPF condenada a pagar una multa</h2><p>Contenido de una recomendación ajena a esta nota.</p></article></aside></body></html>`;

test('la evidencia incluye la bajada y el inicio del artículo verificado, sin confundir el amicus con otra noticia', () => {
  const meta = extractArticleMeta(page(article()), url)!;
  assert.equal(meta.headline, headline);
  assert.ok(meta.articleSummary?.includes(description));
  assert.ok(meta.articleSummary?.includes(opening));
  assert.doesNotMatch(meta.articleSummary!, /condenada|recomendación/);
});

test('la descripción genérica y los artículos JSON-LD de otras notas no aportan evidencia', () => {
  const other = `<script type="application/ld+json">${JSON.stringify({ '@type': 'NewsArticle', headline: 'Microsoft recibe una sanción por privacidad', articleBody: 'Microsoft debe pagar una multa millonaria.' })}</script>`;
  const generic = `<html><head><title>${headline}</title><meta name="description" content="Todas las noticias de hoy de economía, finanzas y negocios de Argentina.">${other}<script type="application/ld+json">${JSON.stringify({ '@type': 'NewsMediaOrganization', description: opening })}</script></head><body><article><p>YPF condenada a pagar una multa</p></article></body></html>`;
  assert.equal(extractArticleMeta(generic, url)?.articleSummary, undefined);
});

test('una bajada relacionada funciona sin JSON-LD y el texto se limpia y limita a 1200 caracteres', () => {
  const text = '<html><head><title>YPF recibe una decisión judicial favorable</title><meta property="og:description" content="YPF obtuvo una decisión judicial favorable que libera una restricción sobre sus activos."></head></html>';
  assert.match(extractArticleMeta(text, url)?.articleSummary || '', /YPF obtuvo/);
  const summary = extractArticleMeta(page(article(`<b>${opening}</b>\n${'Evidencia de la nota. '.repeat(200)}`)), url)?.articleSummary || '';
  assert.equal(summary.length, 1200);
  assert.doesNotMatch(summary, /<b>|\n/);
  assert.ok(summary.includes(opening));
});

test('la evidencia del editor sobrevive la verificación y la normalización sin solicitudes adicionales', async () => {
  const originalFetch = globalThis.fetch; let calls = 0;
  purgeUrlVerificationCache();
  globalThis.fetch = async () => { calls++; return new Response(page(article()), { headers: { 'Content-Type': 'text/html' } }); };
  try {
    const result = await verifySourceUrl(url, headline);
    assert.equal(result.verified, true);
    assert.ok(result.source?.articleSummary?.includes(opening));
    assert.equal(sanitizeGroundingSources([result.source!])[0].articleSummary, result.source?.articleSummary);
    assert.equal(calls, 1, 'La evidencia procede del HTML ya descargado');
  } finally { globalThis.fetch = originalFetch; purgeUrlVerificationCache(); }
});
