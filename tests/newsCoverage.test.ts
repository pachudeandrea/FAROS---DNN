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
async function api(gemini = true) {
  const child = fork(new URL('fixtures/native-api-server.mjs', import.meta.url), [pathToFileURL(path.join(artifact, 'api/index.js')).href], {
    cwd: root, execArgv: [], silent: true,
    env: { PATH: process.env.PATH, HOME: process.env.HOME, DATABASE_URL: '', POSTGRES_URL: '', POSTGRES_PRISMA_URL: '', POSTGRES_URL_NON_POOLING: '', GEMINI_API_KEY: gemini ? 'test-only-no-network' : '', NODE_ENV: 'production', VERCEL: '1', FAROS_TEST_NEWS: '1' }
  });
  children.add(child);
  let output = ''; child.stdout?.on('data', chunk => { output += chunk; }); child.stderr?.on('data', chunk => { output += chunk; });
  const port = await new Promise<number>((resolve, reject) => { const timer = setTimeout(() => reject(new Error(output || 'API de noticias no inició')), 10000); child.once('message', (message: any) => { clearTimeout(timer); resolve(message.port); }); child.once('exit', () => { clearTimeout(timer); reject(new Error(output)); }); });
  const pulse = async (body: Record<string, unknown>) => {
    const res = await fetch(`http://127.0.0.1:${port}/api/news/pulse`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(10000) });
    assert.equal(res.status, 200, output); return res.json();
  };
  const stats = () => new Promise<any>(resolve => { child.once('message', resolve); child.send({ type: 'news-test-stats' }); });
  return { pulse, stats, get output() { return output; } };
}

test('la API Gemini agrupa fuentes verificadas y conserva caché, actualización y cartera', { timeout: 30000 }, async () => {
  const server = await api();
  const args = { portfolioId: 'coverage-fixture', tickers: ['AL30'], profile: 'moderado' };
  const fresh = await server.pulse(args);
  assert.equal(fresh.cached, false);
  const item = fresh.news[0]; assert.ok(item, server.output);
  assert.deepEqual(item.sources.map((s: MediaCoverage) => s.mediaName).sort(), ['El Cronista', 'Infobae', 'Ámbito'].sort(), server.output);
  assert.equal(item.coverageCount, 3); assert.equal(item.sources[0].sourceUrl, articles[0].url);
  assert.equal(item.briefSummary, 'Síntesis de prueba sin cambios.');
  assert.equal(item.audioScript, 'Audio de prueba sin cambios.'); assert.deepEqual(item.affectedAssetIds, ['AL30']);
  assert.equal((await server.stats()).searches, 1);
  const cached = await server.pulse(args); assert.equal(cached.cached, true); assert.deepEqual(cached.news, fresh.news);
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
  const result = await server.pulse({ portfolioId: 'rss-fixture', tickers: ['AL30'], profile: 'moderado' });
  const item = result.news.find((item: NewsItem) => item.headline === articles[0].title);
  assert.ok(item, server.output); assert.equal(item.coverageCount, 3, server.output);
  assert.ok(item.sources.every((source: MediaCoverage) => source.publishedTimestamp && source.publishedDateIso));
  assert.equal(result.news.filter((item: NewsItem) => item.headline.includes('oleoducto')).length, 1);
  assert.ok(result.news.some((item: NewsItem) => item.headline.includes('naftas')), 'Mantener un hecho distinto como noticia independiente');
  assert.equal((await server.stats()).searches, 0);
});
