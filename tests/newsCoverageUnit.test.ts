import { test } from 'node:test';
import assert from 'node:assert/strict';
import type { MediaCoverage, NewsItem } from '../src/types';
import { enrichNewsCoverage, mergeVerifiedNews, sourcesCoverSameEvent } from '../src/utils/newsCoverage';

// Synthetic headlines exercise matching only; these fixtures are not live news.
const at = '2030-06-15T16:00:00Z';
const fixture = (originalHeadline: string, publisher = 'ambito.com', date = at): MediaCoverage => ({
  mediaName: publisher, originalHeadline,
  sourceUrl: `https://${publisher}/economia/fixture-${encodeURIComponent(originalHeadline)}`,
  publishedDateIso: date, publishedTimestamp: Date.parse(date)
});

test('same-event fixtures: aliases retain the same actor and policy decision', () => {
  const pairs = [
    ['El BCRA mantiene las tasas de interés', 'La autoridad monetaria dejó sin cambios la tasa de interés'],
    ['El BCRA subió las tasas al 40%', 'El Banco Central elevó la tasa de interés al 40 por ciento'],
    ['El BCRA compró USD 125 millones y sumó reservas', 'El Banco Central adquirió 125 millones de dólares para sus reservas'],
    ['La Fed recortó las tasas en 25 puntos básicos', 'La Reserva Federal redujo su tasa en 25 pb'],
    ['El INDEC publicó la inflación de octubre en 3,5%', 'Inflación de octubre: el INDEC informó un 3.5 por ciento']
  ];
  for (const [a, b] of pairs) {
    assert.equal(sourcesCoverSameEvent(fixture(a), fixture(b, 'cronista.com')), true, `${a} / ${b}`);
    assert.equal(sourcesCoverSameEvent(fixture(b), fixture(a, 'cronista.com')), true, `symmetric: ${a} / ${b}`);
  }
});

test('same-event fixtures: separate countries, policy instruments, directions, figures and negation', () => {
  const pairs = [
    ['El BCRA subió las tasas de interés al 40%', 'El banco central de Australia subió las tasas de interés al 40%'],
    ['El Banco Central aumentó las tasas', 'El Banco Central de Brasil aumentó las tasas'],
    ['La Fed mantiene las tasas de interés', 'El BCE mantiene las tasas de interés'],
    ['El BCRA subió las tasas de interés', 'El BCRA bajó las tasas de interés'],
    ['El BCRA mantiene las tasas de interés', 'El BCRA subió las tasas de interés'],
    ['El BCRA bajó los encajes bancarios', 'El BCRA bajó las tasas de interés'],
    ['El BCRA no bajó las tasas de interés', 'El BCRA bajó las tasas de interés'],
    ['El BCRA compró USD 125 millones y sumó reservas', 'El BCRA no compró USD 125 millones y sumó reservas'],
    ['El BCRA compró USD 125 millones y sumó reservas', 'El BCRA vendió USD 125 millones y redujo reservas'],
    ['El BCRA compró USD 125 millones y sumó reservas', 'El Banco Central compró USD 130 millones y sumó reservas'],
    ['El BCRA subió las tasas al 40%', 'El Banco Central subió las tasas al 45%'],
    ['La Fed redujo las tasas en 25 puntos básicos', 'La Fed redujo las tasas en 50 puntos básicos'],
    ['El INDEC publicó la inflación de octubre en 3,5%', 'El INDEC publicó la inflación de octubre en 3,8%'],
    ['El INDEC publicó la inflación de octubre', 'El INDEC publicó la inflación de septiembre'],
    ['El BCRA compró reservas el 14 de junio', 'El BCRA compró reservas el 15 de junio'],
    ['Apple publicó sus ganancias trimestrales', 'Nvidia publicó sus ganancias trimestrales'],
    ['YPF inauguró el oleoducto Vaca Muerta Sur', 'YPF aumentó sus combustibles en surtidor']
  ];
  for (const [a, b] of pairs) {
    assert.equal(sourcesCoverSameEvent(fixture(a), fixture(b, 'cronista.com')), false, `${a} / ${b}`);
    assert.equal(sourcesCoverSameEvent(fixture(b), fixture(a, 'cronista.com')), false, `symmetric: ${a} / ${b}`);
  }
});

test('same-event fixtures: keep daily reserve purchases on their own market day', () => {
  const title = 'El BCRA compró USD 125 millones y sumó reservas';
  assert.equal(sourcesCoverSameEvent(fixture(title), fixture(title, 'cronista.com', '2030-06-14T16:00:00Z')), false);
  assert.equal(sourcesCoverSameEvent(fixture(title), fixture(title, 'cronista.com', '2030-06-15T18:00:00Z')), true);
});

test('coverage fixtures: remove a mismatched existing outlet before enriching the verified event', () => {
  const primary = fixture('El BCRA subió las tasas al 40%');
  const wrongCountry = fixture('El banco central de Australia subió las tasas al 40%', 'infobae.com');
  const sameEvent = fixture('El Banco Central elevó la tasa al 40%', 'cronista.com');
  const original = { id: 'synthetic-coverage', headline: primary.originalHeadline, sources: [primary, wrongCountry], affectedAssetIds: ['AL30'] } as NewsItem;
  const result = enrichNewsCoverage([original], [sameEvent, wrongCountry], new Date(at))[0];
  assert.deepEqual(JSON.parse(JSON.stringify(result.sources)), [primary, sameEvent]);
  assert.equal(result.coverageCount, 2);
  assert.deepEqual(result.affectedAssetIds, ['AL30']);
  assert.deepEqual(original.sources, [primary, wrongCountry], 'No mutation of the input');
});

const itemFixture = (id: string, sources: MediaCoverage[]): NewsItem => ({ id, headline: sources[0].originalHeadline, sources, affectedAssetIds: ['AL30'], briefSummary: `Synthetic analysis ${id}`, portfolioImpactAnalysis: { directExplanation: `Synthetic personalized analysis ${id}`, affectedHoldings: [] } } as unknown as NewsItem);

test('pipeline fixtures: merge the same verified event, preserve primary analysis and count publishers once', () => {
  const primary = itemFixture('primary', [fixture('El BCRA compró USD 125 millones y elevó sus reservas')]);
  const rss = itemFixture('rss', [fixture('El Banco Central adquirió USD 125 millones y sumó reservas', 'cronista.com')]);
  const duplicate = itemFixture('duplicate', [{ ...rss.sources[0], sourceUrl: `${rss.sources[0].sourceUrl}?duplicated=1` }]);
  const result = mergeVerifiedNews([primary], [rss, duplicate], new Date(at));
  assert.equal(result.length, 1);
  assert.equal(result[0].id, 'primary');
  assert.equal(result[0].briefSummary, primary.briefSummary);
  assert.deepEqual(result[0].portfolioImpactAnalysis, primary.portfolioImpactAnalysis);
  assert.deepEqual(result[0].sources.map(source => source.sourceUrl), [primary.sources[0].sourceUrl, rss.sources[0].sourceUrl]);
  assert.deepEqual(result[0].sources.map(source => source.publishedDateIso), [at, at]);
  assert.equal(result[0].coverageCount, 2);
  assert.equal(primary.sources.length, 1);
});

test('pipeline fixtures: retain distinct payments, days and countries without inventing coverage', () => {
  const reserve = itemFixture('reserve', [fixture('El BCRA compró USD 125 millones y sumó reservas')]);
  const otherAmount = itemFixture('other-amount', [fixture('El BCRA compró USD 130 millones y sumó reservas', 'cronista.com')]);
  const otherDay = itemFixture('other-day', [fixture('El BCRA compró USD 125 millones y sumó reservas', 'infobae.com', '2030-06-14T16:00:00Z')]);
  const localPolicy = itemFixture('local-policy', [fixture('El BCRA subió la tasa al 40%')]);
  const foreignPolicy = itemFixture('foreign-policy', [fixture('El banco central de Australia subió la tasa al 40%', 'cronista.com')]);
  const result = mergeVerifiedNews([reserve, localPolicy], [otherAmount, otherDay, foreignPolicy], new Date(at));
  assert.deepEqual(result.map(item => item.id), ['reserve', 'local-policy', 'other-amount', 'other-day', 'foreign-policy']);
  assert.ok(result.every(item => item.coverageCount === 1 && item.sources.length === 1));
});

test('pipeline fixtures: deduplicate the exact publication URL and cap distinct outlets at five', () => {
  const title = 'El BCRA mantiene la tasa de interés al 40%';
  const primary = itemFixture('primary', [fixture(title)]);
  const samePublication = itemFixture('same-url', [primary.sources[0]]);
  const outlets = ['cronista.com', 'infobae.com', 'lanacion.com.ar', 'clarin.com', 'perfil.com', 'iprofesional.com'];
  const secondary = outlets.map((publisher, index) => itemFixture(`outlet-${index}`, [fixture(title, publisher)]));
  const result = mergeVerifiedNews([primary], [samePublication, ...secondary], new Date(at));
  assert.equal(result.length, 1);
  assert.equal(result[0].coverageCount, 5);
  assert.equal(result[0].sources.length, 5);
  assert.equal(new Set(result[0].sources.map(source => source.mediaName)).size, 5);
});
