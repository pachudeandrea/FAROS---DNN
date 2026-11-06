import { Pool } from 'pg';
import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { databaseConfig } from '../src/server/database.js';
import { readNewsResponse } from '../src/utils/newsResponse.js';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, fork, type ChildProcess } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, writeFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import type { MediaCoverage, NewsItem } from '../src/types';
import { enrichNewsCoverage, sourcesCoverSameEvent } from '../src/utils/newsCoverage';
import { distinctMediaSources, sanitizeGroundingSources } from '../src/utils/sourceGrounding';
import { NEWS_CACHE_VERSION } from '../src/utils/newsCache';
import { articles } from './fixtures/news-transport.mjs';

const now = new Date('2030-06-15T16:00:00Z');
const source = (title: string, domain = 'ambito.com', at = '2030-06-15T14:00:00Z'): MediaCoverage => ({ mediaName: domain, originalHeadline: title, sourceUrl: `https://${domain}/economia/${encodeURIComponent(title)}`, publishedDateIso: at, publishedTimestamp: Date.parse(at) });
const reserve = source('El BCRA compró USD 125 millones y elevó sus reservas');
const secondary = source('El Banco Central adquirió USD 125 millones y sumó reservas', 'cronista.com');
const base: NewsItem = { id: 'original', headline: reserve.originalHeadline, briefSummary: 'Síntesis original', fullSynthesis: ['Análisis original'], publishedAgo: 'Hoy', timestamp: 'original', coverageCount: 1, sources: [reserve], affectedAssetIds: ['AL30'], impact: 'favorable', relevanceType: 'impacto_precio', topicCategory: 'deuda_soberana', audioDuration: '1:00', audioScript: 'Audio original', factCheck: { status: 'confirmado', officialSource: 'fuente original', detail: 'detalle original' }, portfolioImpactAnalysis: { directExplanation: 'cartera original', affectedHoldings: [{ symbol: 'AL30', impactDirection: 'favorable', relationshipDetail: 'relación original' }] } };

test('enriquece el mismo hecho con medios distintos y preserva el análisis personalizado', () => {
  const input = structuredClone(base);
  const result = enrichNewsCoverage([input], [reserve, secondary, source('Reservas: el BCRA cerró la jornada con compras por USD 125 millones', 'infobae.com')], now)[0];
  assert.equal(result.coverageCount, 3);
  const { sources, coverageCount, ...unchanged } = result;
  const { sources: originalSources, coverageCount: originalCount, ...original } = base;
  assert.deepEqual(unchanged, original);
  assert.deepEqual(input, base, 'No mutar la noticia ni la cartera original');
  assert.deepEqual(JSON.parse(JSON.stringify(result.sources[0])), reserve);
});

test('conserva un titular idéntico publicado en dos medios y cuenta cada editorial una vez', () => {
  const duplicate = source(reserve.originalHeadline, 'cronista.com');
  const samePublisher = { ...reserve, sourceUrl: 'https://finanzas.ambito.com/economia/otra-publicacion', originalHeadline: 'El BCRA volvió a comprar reservas' };
  assert.equal(sanitizeGroundingSources([reserve, duplicate]).length, 2);
  assert.equal(distinctMediaSources([reserve, samePublisher, duplicate]).length, 2);
  assert.equal(enrichNewsCoverage([base], [samePublisher, duplicate], now)[0].coverageCount, 2);
});

test('separa hechos distintos de la misma empresa, sector y categoría', () => {
  const pairs = [
    ['YPF inaugura el oleoducto Vaca Muerta Sur', 'YPF aumenta el precio de los combustibles en surtidor'],
    ['El BCRA compró reservas y acumuló divisas', 'El BCRA subió las tasas de interés'],
    ['El BCRA bajó tasas para frenar la inflación de octubre', 'El INDEC publicó el dato de inflación de octubre'],
    ['El INDEC publicó la inflación de octubre', 'El INDEC publicó la inflación de septiembre'],
    ['El dólar MEP sube y amplía la brecha', 'El dólar blue sube y amplía la brecha'],
    ['Apple presentó su balance con fuertes ganancias trimestrales', 'Nvidia presentó su balance con fuertes ganancias trimestrales'],
    ['YPF presentó su balance trimestral', 'YPF inauguró el oleoducto Vaca Muerta Sur']
  ];
  for (const [a, b] of pairs) assert.equal(sourcesCoverSameEvent(source(a), source(b, 'cronista.com')), false, `${a} / ${b}`);
});

test('descarta fuentes antiguas, sin fecha, enlaces inválidos y otra rueda diaria', () => {
  const old = source(secondary.originalHeadline, 'cronista.com', '2030-06-12T14:00:00Z');
  const yesterday = source(secondary.originalHeadline, 'cronista.com', '2030-06-14T14:00:00Z');
  const undated = { ...secondary, publishedDateIso: undefined, publishedTimestamp: undefined };
  const invalid = { ...secondary, sourceUrl: 'https://www.cronista.com/' };
  assert.equal(enrichNewsCoverage([base], [old, yesterday, undated, invalid], now)[0].coverageCount, 1);
  assert.equal(enrichNewsCoverage([base], [], now)[0].coverageCount, 1, 'Una sola fuente sigue disponible sin inventar otra');
  assert.equal(sanitizeGroundingSources([reserve])[0].publishedTimestamp, reserve.publishedTimestamp);
});

const root = new URL('../', import.meta.url);
const children = new Set<ChildProcess>();
let artifact: string;
before(async () => {
  artifact = await mkdtemp(path.join(tmpdir(), 'faros-news-api-'));
  const compiler = spawn(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.server.json', '--outDir', artifact], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  let output = ''; compiler.stdout.on('data', chunk => { output += chunk; }); compiler.stderr.on('data', chunk => { output += chunk; });
  assert.equal((await once(compiler, 'exit'))[0], 0, output);
  await writeFile(path.join(artifact, 'package.json'), '{"type":"module"}');
  await symlink(fileURLToPath(new URL('../node_modules', import.meta.url)), path.join(artifact, 'node_modules'), 'dir');
});
async function stop(child: ChildProcess) { if (child.exitCode !== null) return; const exit = once(child, 'exit'); child.kill('SIGTERM'); await exit; children.delete(child); }
after(async () => { for (const child of children) await stop(child); if (artifact) await rm(artifact, { recursive: true, force: true }); });
async function api(gemini = true, singleMedium = false, discovery = false, section = false, gated = false, databaseUrl = '', directional = false) {
  const child = fork(new URL('fixtures/native-api-server.mjs', import.meta.url), [pathToFileURL(path.join(artifact, 'api/index.js')).href], {
    cwd: root, execArgv: [], silent: true,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: databaseUrl, POSTGRES_URL: '', POSTGRES_PRISMA_URL: '', POSTGRES_URL_NON_POOLING: '', GEMINI_API_KEY: gemini ? 'test-only-no-network' : '', NODE_ENV: 'production', VERCEL: '1', VERCEL_GIT_COMMIT_SHA: 'a'.repeat(40), FAROS_TEST_NEWS: '1', FAROS_TEST_NEWS_DIRECTIONAL: directional ? '1' : '', FAROS_TEST_NEWS_ONE_MEDIUM: singleMedium ? '1' : '', FAROS_TEST_NEWS_DISCOVERY: discovery ? '1' : '', FAROS_TEST_NEWS_SECTION: section ? '1' : '', FAROS_TEST_NEWS_GATED: gated ? '1' : '' }
  });
  children.add(child);
  let output = ''; child.stdout?.on('data', chunk => { output += chunk; }); child.stderr?.on('data', chunk => { output += chunk; });
  const port = await new Promise<number>((resolve, reject) => { const timer = setTimeout(() => reject(new Error(output || 'API de noticias no inició')), 10000); child.once('message', (message: any) => { clearTimeout(timer); resolve(message.port); }); child.once('exit', () => { clearTimeout(timer); reject(new Error(output)); }); });
  const pulse = async (body: Record<string, unknown>) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/news/pulse`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    assert.equal(res.status, 200, output); return res.json();
  };
  const stats = () => new Promise<any>(resolve => { child.once('message', resolve); child.send({ type: 'news-test-stats' }); });
  const version = () => fetch(`http://127.0.0.1:${port}/api/version`);
  const stream = (body: Record<string, unknown>) => fetch(`http://127.0.0.1:${port}/api/news/pulse`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/x-ndjson' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
  return { pulse, stream, releaseCoverage: () => child.send({ type: 'news-release-coverage' }), stats, version, get output() { return output; } };
}

test('la API Gemini agrupa fuentes verificadas y conserva caché, actualización y cartera', { timeout: 30000 }, async () => {
  const server = await api();
  const version = await server.version(); assert.equal(version.status, 200); assert.equal(version.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await version.json(), { revision: 'a'.repeat(40), newsVersion: NEWS_CACHE_VERSION });
  const args = { portfolioId: 'coverage-fixture', tickers: ['AL30'], profile: 'moderado' };
  const fresh = await server.pulse(args);
  assert.equal(fresh.cached, false);
  assert.ok(Number.isFinite(Date.parse(fresh.checkedAt)), 'La consulta incluye un horario real');
  assert.equal(fresh.newsVersion, NEWS_CACHE_VERSION);
  const item = fresh.news[0]; assert.ok(item, server.output);
  assert.deepEqual(item.sources.map((s: MediaCoverage) => s.mediaName).sort(), ['El Cronista', 'Infobae', 'Ámbito'].sort(), server.output);
  assert.equal(item.coverageCount, 3); assert.equal(item.sources[0].sourceUrl, articles[0].url);
  assert.equal(item.briefSummary, 'Síntesis de prueba sin cambios.');
  assert.ok(item.audioScript.includes(articles[0].title)); assert.match(item.audioScript, /macroeconómica/); assert.equal(item.impact, 'neutral'); assert.equal(item.relevanceType, 'contexto_macro'); assert.deepEqual(item.affectedAssetIds, ['AL30']);
  assert.equal((await server.stats()).searches, 1);
  const cached = await server.pulse(args); assert.equal(cached.cached, true);
  assert.equal(cached.checkedAt, fresh.checkedAt, 'Leer el caché no inventa una consulta nueva'); assert.deepEqual(cached.news, fresh.news);
  assert.equal((await server.stats()).searches, 1, 'El caché evita repetir búsquedas');
  await server.pulse({ ...args, forceRefresh: true }); assert.equal((await server.stats()).searches, 2);
  const energy = await server.pulse({ portfolioId: 'energy-fixture', tickers: ['YPFD'], profile: 'dinamico' });
  assert.deepEqual(energy.news[0].affectedAssetIds, ['YPFD']);
  assert.equal(energy.news[0].coverageCount, 2, server.output);
  assert.ok(energy.news[0].sources.every((s: MediaCoverage) => !s.sourceUrl.includes('combustibles')));
  const prompts = (await server.stats()).prompts.join('\n'); assert.match(prompts, /Perfil del inversor: dinamico/); assert.match(prompts, /Activos bajo monitoreo: YPFD/);
});

test('la alternativa RSS conserva la cobertura de tres medios y las fechas verificadas', { timeout: 30000 }, async () => {
  const server = await api(false);
  const result = await server.pulse({ portfolioId: 'rss-fixture', tickers: ['AL30', 'YPFD'], profile: 'moderado' });
  const item = result.news.find((item: NewsItem) => item.headline === articles[0].title);
  assert.ok(item, server.output); assert.equal(item.coverageCount, 3, server.output);
  assert.ok(item.sources.every((source: MediaCoverage) => source.publishedTimestamp && source.publishedDateIso));
  assert.equal(result.news.filter((item: NewsItem) => item.sources.some(source => source.sourceUrl === articles[4].url)).length, 1);
  assert.ok(result.news.some((item: NewsItem) => item.sources.some(source => source.sourceUrl === articles[5].url)), 'Mantener un hecho distinto como noticia independiente');
  assert.equal((await server.stats()).searches, 0);
});


test('Gemini usa los metadatos del catálogo y valida relaciones aunque el modelo proponga otro ticker; caché se renueva al modificar cartera', async () => {
  const server = await api();
  const args = { portfolioId: 'same-portfolio', tickers: ['MSFT'], profile: 'moderado' };
  const microsoft = await server.pulse(args);
  assert.deepEqual(microsoft.news[0].affectedAssetIds, ['MSFT']);
  assert.equal(microsoft.news[0].impact, 'neutral');
  assert.equal(microsoft.news[0].relevanceType, 'valoracion_mercado');
  assert.equal(microsoft.news[0].portfolioImpactAnalysis.affectedHoldings[0].impactDirection, 'neutral');
  assert.equal(microsoft.news[0].portfolioImpactAnalysis.horizon, undefined);
  assert.equal((await server.pulse(args)).cached, true);
  const before = (await server.stats()).searches;
  for (const ticker of ['CO29', 'YMCJO', 'TX28']) {
    const changed = await server.pulse({ ...args, tickers: [ticker] });
    assert.equal(changed.cached, false);
    assert.deepEqual(changed.news[0].affectedAssetIds, [ticker]);
    assert.ok(changed.news[0].sources.every((source: MediaCoverage) => articles.some(article => article.url === source.sourceUrl)));
  }
  assert.equal((await server.stats()).searches, before + 3);
  const prompts = (await server.stats()).prompts.join('\n');
  assert.match(prompts, /Microsoft.*emisor: Microsoft/); assert.match(prompts, /Provincia de Córdoba/); assert.match(prompts, /Obligación negociable/);
});

test('RSS incorpora nuevos emisores y prioriza la selección conservando publicaciones verificadas', async () => {
  const server = await api(false);
  for (const [ticker, headline] of [['MSFT', 'Microsoft'], ['CO29', 'Provincia de Córdoba'], ['YMCJO', 'obligaciones negociables'], ['TX28', 'TX28']]) {
    const result = await server.pulse({ portfolioId: 'rss-changing-assets', tickers: [ticker] });
    assert.equal(result.cached, false);
    const item = result.news.find((item: NewsItem) => item.headline.includes(headline));
    assert.ok(item, headline); assert.ok(item.affectedAssetIds.includes(ticker));
    assert.ok(item.sources.every((source: MediaCoverage) => source.publishedTimestamp && articles.some(article => article.url === source.sourceUrl)));
  }
});


test('Gemini y RSS conservan rumores como ruido y atribuyen movimientos por activo, sin copiar el sentimiento propuesto por el modelo', async () => {
  for (const gemini of [true, false]) {
    const server = await api(gemini);
    const rumor = await server.pulse({ portfolioId: 'coherent-rumor', tickers: ['PAMP'], profile: 'moderado' });
    const item = rumor.news.find((item: NewsItem) => item.headline.includes('Rumores: Pampa'));
    assert.ok(item); assert.doesNotMatch(item.briefSummary, /conviene comprar|recomendaci[oó]n/i); assert.equal(item.relevanceType, 'ruido'); assert.equal(item.impact, 'neutral'); assert.equal(item.factCheck.status, 'en_analisis');
    assert.equal(item.portfolioImpactAnalysis.affectedHoldings.find((holding: any) => holding.symbol === 'PAMP').impactDirection, 'neutral');
    assert.doesNotMatch(item.portfolioImpactAnalysis.directExplanation, /ganancia asegurada|comprar|vender|24-72h/i);
    const mixed = await server.pulse({ portfolioId: 'coherent-mixed', tickers: ['AAPL', 'MSFT'], profile: 'moderado' });
    const prices = mixed.news.find((item: NewsItem) => item.headline.includes('MSFT cae mientras'));
    assert.ok(prices); assert.equal(prices.relevanceType, 'impacto_precio'); assert.equal(prices.impact, 'neutral');
    assert.equal(prices.portfolioImpactAnalysis.affectedHoldings.find((holding: any) => holding.symbol === 'AAPL').impactDirection, 'favorable');
    assert.equal(prices.portfolioImpactAnalysis.affectedHoldings.find((holding: any) => holding.symbol === 'MSFT').impactDirection, 'alerta');
  }
});


test('RSS completa otros medios aunque Gemini solo encuentre Ámbito, sin duplicar el acontecimiento', async () => {
  const server = await api(true, true);
  const result = await server.pulse({ portfolioId: 'parallel-sources-proof', tickers: ['AL30'], profile: 'moderado' });
  const events = result.news.filter((item: NewsItem) => item.sources.some(source => source.sourceUrl === articles[0].url));
  assert.equal(events.length, 1);
  assert.deepEqual(events[0].sources.map((source: MediaCoverage) => source.mediaName).sort(), ['El Cronista', 'Infobae', 'Ámbito'].sort());
  assert.equal(events[0].coverageCount, 3);
  const stats = await server.stats(); assert.equal(stats.searches, 1); assert.equal(stats.feeds, 4);
});

test('la API encuentra otros medios aunque sus RSS no incluyan la publicación, sin Gemini', async () => {
  const server = await api(false, false, true);
  const result = await server.pulse({ portfolioId: 'targeted-coverage', tickers: ['AL30'], profile: 'moderado' });
  const reserves = result.news.find((item: NewsItem) => item.headline === articles[0].title);
  assert.ok(reserves);
  assert.equal(reserves.coverageCount, 3, server.output);
  assert.deepEqual(reserves.sources.map((source: MediaCoverage) => source.mediaName).sort(), ['El Cronista', 'Infobae', 'Ámbito'].sort());
  assert.ok(result.coverageDiscovery.queries.some((query: any) => query.publisher === 'cronista.com' && query.accepted > 0));
  assert.ok(result.coverageDiscovery.queries.some((query: any) => query.publisher === 'infobae.com' && query.accepted > 0));
  assert.equal(result.coverageDiscovery.added, 2);
});


test('una tarjeta reúne Ámbito RSS, Infobae sección y Cronista búsqueda con seguimiento', async () => {
  const server = await api(false, false, true, true);
  const result = await server.pulse({ portfolioId: 'section-and-search', tickers: ['AL30'], profile: 'moderado' });
  const events = result.news.filter((item: NewsItem) => item.sources.some(source => source.sourceUrl === articles[0].url));
  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.coverageCount, 3);
  assert.deepEqual(event.sources.map((source: MediaCoverage) => source.mediaName).sort(), ['Ámbito', 'Infobae', 'El Cronista'].sort());
  for (const article of articles.slice(0, 3)) {
    const publication = event.sources.find((source: MediaCoverage) => source.sourceUrl === article.url);
    assert.ok(publication); assert.equal(publication.originalHeadline, article.title);
  }
  assert.ok(event.affectedAssetIds.includes('AL30'));
  assert.ok(event.portfolioImpactAnalysis.affectedHoldings.some((holding: any) => holding.symbol === 'AL30'));
  assert.ok(result.diagnostics.sections.some((section: any) => section.accepted > 0));
  assert.ok(result.coverageDiscovery.queries.some((query: any) => query.publisher === 'cronista.com' && query.accepted > 0));
  assert.equal((await server.stats()).sections, 2, 'La sección se consulta también en la búsqueda general de cobertura');
});


test('la API entrega noticias verificadas antes de acabar la cobertura y comparte una actualización simultánea', { timeout: 20000 }, async () => {
  const server = await api(false, false, true, true, true);
  const body = { portfolioId: 'progressive-fixture', tickers: ['AL30'], forceRefresh: true };
  let firstDone = false; let resolveFirst!: () => void;
  const firstFrame = new Promise<void>(resolve => { resolveFirst = resolve; });
  const response = await server.stream(body);
  assert.match(response.headers.get('content-type') || '', /application\/x-ndjson/);
  const first = readNewsResponse(response, progress => {
    assert.ok(progress.news.length > 0);
    assert.ok(progress.news.every(item => item.sources.length && item.affectedAssetIds.includes('AL30')));
    resolveFirst();
  }).then(result => { firstDone = true; return result; });
  await firstFrame;
  assert.equal(firstDone, false, 'El lector ya ve noticias mientras Bing sigue bloqueado por el transporte de prueba');
  let resolveSecond!: () => void;
  const secondFrame = new Promise<void>(resolve => { resolveSecond = resolve; });
  const second = readNewsResponse(await server.stream(body), () => resolveSecond());
  await secondFrame;
  assert.equal((await server.stats()).feeds, 4, 'Las dos conexiones comparten una recopilación RSS');
  server.releaseCoverage();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a.news, b.news);
  assert.ok(a.news.some(item => item.sources.length === 3), 'El resultado completo conserva la cobertura de tres medios');
  const cached = await server.pulse({ ...body, forceRefresh: false });
  assert.equal(cached.cached, true); assert.deepEqual(cached.news, a.news);
});


test('el caché completo sobrevive entre instancias y carteras equivalentes, sin convertir un respaldo horario en final', { timeout: 30000 }, async t => {
  const value = process.env.TEST_DATABASE_URL;
  assert.ok(value, 'Se requiere TEST_DATABASE_URL local para verificar persistencia real');
  const url = new URL(value); assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)); assert.match(url.pathname, /test/i);
  const admin = new Pool(databaseConfig(value)); const schema = `pulse_cache_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE SCHEMA "${schema}"`); url.searchParams.set('options', `-c search_path=${schema}`);
  const db = new Pool(databaseConfig(url.toString()));
  t.after(async () => { for (const child of children) await stop(child); await db.end(); await admin.query(`DROP SCHEMA "${schema}" CASCADE`); await admin.end(); });
  const migration = await readFile(new URL('../migrations/008_news_pulse_cache.sql', import.meta.url), 'utf8');
  await db.query(migration); await db.query(migration);
  const first = await api(false, false, false, false, false, url.toString());
  const args = { portfolioId: 'first-account-id', tickers: ['AL30'], profile: 'moderado' };
  const fresh = await first.pulse(args); assert.equal(fresh.cached, false);
  assert.equal((await db.query('SELECT * FROM faros_news_pulse_cache')).rowCount, 1);
  const second = await api(false, false, false, false, false, url.toString());
  const shared = await second.pulse({ ...args, portfolioId: 'another-account-id' });
  assert.equal(shared.cached, true); assert.deepEqual(shared.news, fresh.news); assert.equal(shared.checkedAt, fresh.checkedAt);
  assert.equal((await second.stats()).feeds, 0, 'Una instancia nueva no descarga otra vez los medios para la misma selección');
  const other = await second.pulse({ ...args, tickers: ['YPFD'] });
  assert.equal(other.cached, false, 'Otra selección no recibe análisis de AL30');
  assert.ok((await second.stats()).feeds > 0);
  // Seed a previous-hour snapshot without changing its real check time. A new
  // instance must publish it early, then complete a genuinely refreshed query.
  await db.query("UPDATE faros_news_pulse_cache SET hour_key='previous-hour', checked_at=NOW()-INTERVAL '30 minutes'");
  const third = await api(false, false, false, false, false, url.toString());
  const progress: any[] = [];
  const refreshed = await readNewsResponse(await third.stream(args), frame => progress.push(frame));
  assert.equal(progress[0].cached, true); assert.ok(progress[0].news.length);
  assert.ok(Date.parse(progress[0].checkedAt) < Date.parse(refreshed.checkedAt!));
  assert.equal(refreshed.cached, false); assert.ok((await third.stats()).feeds > 0);
  const countBeforeFailure = (await db.query('SELECT * FROM faros_news_pulse_cache')).rowCount!;
  const fourth = await api(false, false, false, false, false, url.toString());
  const lock = await db.connect();
  try {
    await lock.query('BEGIN'); await lock.query('LOCK TABLE faros_news_pulse_cache IN ACCESS EXCLUSIVE MODE');
    const started = performance.now();
    const available = await fourth.pulse({ ...args, tickers: ['MSFT'] });
    assert.equal(available.cached, false); assert.ok(available.news.length);
    assert.ok((await fourth.stats()).feeds > 0, 'Un caché bloqueado no impide consultar fuentes');
    assert.ok(performance.now() - started < 4000, 'La consulta opcional de caché no hereda el timeout de 8 segundos de la base principal');
  } finally { await lock.query('ROLLBACK'); lock.release(); }
  assert.equal((await db.query('SELECT * FROM faros_news_pulse_cache')).rowCount, countBeforeFailure);
  await fourth.pulse({ ...args, tickers: ['MSFT'], forceRefresh: true });
  assert.equal((await db.query('SELECT * FROM faros_news_pulse_cache')).rowCount, countBeforeFailure + 1, 'Una lectura fallida no impide escribir el resultado de la siguiente colección completada');
});


test('los titulares reales conservan clasificación favorable/alerta en RSS, Gemini y caché completa', { timeout: 30000 }, async () => {
  for (const gemini of [false, true]) {
    const server = await api(gemini, false, false, false, false, '', true);
    const args = { portfolioId: 'public-direction-fixture', tickers: ['AL30', 'GD30'], profile: 'moderado' };
    const result = await server.pulse(args);
    assert.equal(result.cached, false); assert.equal(result.news.length, 3);
    const expected = new Map([
      ['Los bonos en dólares rebotan y el riesgo país se sostiene por debajo de los 900 puntos', 'favorable'],
      ['El riesgo país saltó 8,6% y superó los 900 puntos, mientras el MSCI Merval tuvo su peor caída diaria desde junio', 'alerta'],
      ['Cae el riesgo país argentino, pero sigue sobre los 900 puntos, mientras Wall Street insinúa un rebote', 'favorable']
    ]);
    for (const item of result.news) {
      assert.equal(item.impact, expected.get(item.headline), item.headline);
      assert.equal(item.relevanceType, 'valoracion_mercado');
      for (const holding of item.portfolioImpactAnalysis.affectedHoldings) assert.equal(holding.impactDirection, item.impact);
      assert.equal(item.sources[0].originalHeadline, item.headline);
      assert.match(item.portfolioImpactAnalysis.directExplanation, /sin afirmar una cotización individual/);
    }
    if (gemini) assert.ok((await server.stats()).extractions > 0);
    const cached = await server.pulse(args);
    assert.equal(cached.cached, true); assert.deepEqual(cached.news, result.news);
  }
});
