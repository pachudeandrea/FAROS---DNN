import test from 'node:test';
import assert from 'node:assert/strict';
import { ASSET_CATALOG, searchAssets, portfolioAssets } from '../src/data/assetCatalog';
import { recognizeAssetIds } from '../src/utils/assetNews';
import { isFinancialCandidate, analyzeArticleContext } from '../src/utils/liveFinancialNews';
import { createManualAsset, validateCustomAssets } from '../src/utils/manualAssets';
import { newsClientCacheKey, portfolioNewsScope } from '../src/utils/newsCache';
import { getEffectiveImpactForPortfolio } from '../src/types';

export const manualFixture = { symbol: 'TEST01', name: 'Instrumento exclusivo de prueba', issuer: 'Emisor exclusivo de prueba', category: 'tesoro' as const, currency: 'ARS', market: 'BYMA', sourceUrl: 'https://example.test/prospecto' };
test('catálogo compartido sin duplicados, sin precios ficticios y compatible con IDs anteriores', () => {
  assert.ok(ASSET_CATALOG.length > 100);
  assert.equal(new Set(ASSET_CATALOG.map(a => a.id)).size, ASSET_CATALOG.length);
  assert.equal(new Set(ASSET_CATALOG.map(a => `${a.market}:${a.currency}:${a.symbol}`)).size, ASSET_CATALOG.length);
  for (const id of ['AL30', 'GD30', 'BOPREAL', 'YPFD', 'GGAL', 'PAMP', 'AAPL', 'NVDA', 'SPY', 'MELI', 'MEP', 'CCL']) assert.ok(ASSET_CATALOG.find(a => a.id === id));
  for (const asset of ASSET_CATALOG) { assert.ok(asset.issuer && asset.market && asset.sourceUrl?.startsWith('https://')); assert.equal(asset.lastPrice, 'Sin cotización'); assert.equal(asset.dayChange, '—'); }
});
test('búsqueda por emisor, alias y categorías, sin acentos ni distinción de mayúsculas', () => {
  const cases = [['  pAmPa   energia ', 'PAMP'], ['google', 'GOOGL'], ['mercado libre', 'MELI'], ['cOrdOba', 'CO29'], ['Nasdaq 100', 'QQQ'], ['ypf obligaciones', 'YMCJO'], ['tesoro cer', 'TX28']];
  for (const [query, id] of cases) assert.ok(searchAssets(query).some(a => a.id === id), query);
  assert.equal(searchAssets('AL30D')[0].id, 'AL30D');
  assert.equal(searchAssets('AL30')[0].id, 'AL30');
  assert.notEqual(searchAssets('AL30')[0].currency, searchAssets('AL30D')[0].currency);
  assert.ok(recognizeAssetIds('AL30 sube en la Bolsa').includes('AL30D'), 'La noticia del mismo bono alcanza sus especies sin fusionarlas');
});
test('noticias por ticker, nombre, alias, emisor e instrumento sin asignaciones sectoriales fijas', () => {
  const cases = [['Microsoft presentó ganancias récord en su balance', 'MSFT'], ['Google anunció una inversión millonaria', 'GOOGL'], ['Bonos de la Provincia de Córdoba: sube su calificación crediticia', 'CO29'], ['YPF paga el cupón de su deuda', 'YMCJO'], ['TX28 sube en la Bolsa', 'TX28'], ['Nasdaq 100: las acciones suben', 'QQQ'], ['$C sube tras el balance de Citigroup', 'C']];
  for (const [headline, id] of cases) { assert.ok(recognizeAssetIds(headline).includes(id), headline); assert.equal(isFinancialCandidate(headline, 'https://www.ambito.com/finanzas/noticia'), true); }
  assert.ok(!recognizeAssetIds('Microsoft presenta ganancias récord').includes('NVDA'));
  assert.ok(!recognizeAssetIds('La empresa coloca deuda corporativa').includes('AL30'));
  assert.ok(!recognizeAssetIds('BlackRock informó ganancias en su balance').includes('IWM'));
  assert.deepEqual(analyzeArticleContext('Microsoft presentó ganancias récord').tickers, ['MSFT']);
});
test('palabras comunes, tickers parciales y noticias no financieras no generan relaciones falsas', () => {
  for (const headline of ['La gente come bien cada día y vale la pena', 'Un viaje de ida a Santa Fe', 'La visa para visitar Canadá', 'La visa para invertir en el mercado laboral', 'Una vista de la pampa', 'Una manzana de Apple en una receta', 'COMETA ilumina el cielo', 'MSFTX no es el ticker MSFT2']) assert.deepEqual(recognizeAssetIds(headline), [], headline);
  assert.equal(isFinancialCandidate('YPF gana un partido de fútbol', 'https://www.ambito.com/deportes/partido'), false);
});
test('carga manual separa especies, conserva metadatos y rechaza duplicados o referencias incompletas', () => {
  const asset = createManualAsset(manualFixture);
  assert.equal(asset.id, 'BYMA:ARS:TEST01');
  assert.deepEqual(validateCustomAssets(JSON.parse(JSON.stringify([asset]))), [asset]);
  assert.throws(() => validateCustomAssets([asset, asset]), /duplicados/);
  assert.throws(() => createManualAsset({ ...manualFixture, symbol: 'AL30' }), /catálogo/);
  assert.throws(() => createManualAsset({ ...manualFixture, sourceUrl: 'http://example.test' }), /HTTPS/);
  assert.throws(() => validateCustomAssets([{ ...asset, id: 'AL30' }]), /identificador/);
  assert.notEqual(createManualAsset({ ...manualFixture, currency: 'USD' }).id, asset.id);
  assert.ok(portfolioAssets({ customAssets: [asset] }).some(a => a.id === asset.id));
  assert.ok(recognizeAssetIds('TEST01 paga un cupón', portfolioAssets({ customAssets: [asset] })).includes(asset.id));
});
test('caché cambia con altas, bajas, perfil, metadatos y posiciones; orden no duplica consultas', () => {
  const scope = (ids: string[], profile = 'moderado', positions = {}, custom: unknown[] = []) => newsClientCacheKey('p_' + portfolioNewsScope(ids, profile, positions, custom), '2030-01-01_12');
  assert.equal(scope(['AL30', 'MSFT']), scope(['MSFT', 'AL30', 'MSFT']));
  assert.notEqual(scope(['AL30']), scope(['AL30', 'MSFT']));
  assert.notEqual(scope(['AL30']), scope([]));
  assert.notEqual(scope(['MSFT']), scope(['MSFT'], 'dinamico'));
  assert.notEqual(scope(['MSFT']), scope(['MSFT'], 'moderado', { MSFT: 'short' }));
  assert.notEqual(scope(['MSFT']), scope(['MSFT'], 'moderado', {}, [createManualAsset(manualFixture)]));
  assert.equal(getEffectiveImpactForPortfolio('favorable', ['MSFT'], { MSFT: 'short' }), 'alerta');
  assert.equal(getEffectiveImpactForPortfolio('alerta', ['CO29'], { CO29: 'short' }), 'favorable');
});
