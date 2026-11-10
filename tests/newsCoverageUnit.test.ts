import { test } from 'node:test';
import { readFileSync } from 'node:fs';
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

test('equivalencia de prima argentina exige nivel, dirección propia y jornada verificada', () => {
  const a = fixture('Los bonos suben y el riesgo país bajó a 830 puntos');
  const b = fixture('La prima de riesgo argentina cayó a 830 puntos', 'cronista.com');
  assert.equal(sourcesCoverSameEvent(a, b), true);
  for (const title of ['La prima de riesgo argentina cayó a 831 puntos', 'La prima de riesgo argentina cayó a 1.830 puntos', 'Los bonos suben, la prima de riesgo argentina en 830 puntos', 'La prima de riesgo argentina subió a 830 puntos', 'Los bonos suben y la prima de riesgo argentina en 830 puntos', 'La prima de riesgo argentina cayó a 830 puntos y Brasil acompaña']) {
    assert.equal(sourcesCoverSameEvent(a, fixture(title, 'cronista.com')), false, title);
  }
  assert.equal(sourcesCoverSameEvent(a, { ...b, publishedTimestamp: NaN, publishedDateIso: undefined }), false);
  assert.equal(sourcesCoverSameEvent(a, { ...b, publishedTimestamp: Date.parse('2030-06-14T16:00:00Z') }), false);
});


test('recuperación amplia: no une movimientos opuestos del mismo activo ni toma el verbo de otra métrica', () => {
  for (const [a, b] of [
    ['El dólar MEP sube y amplía la brecha', 'El dólar MEP baja y amplía la brecha'],
    ['Las acciones de Apple suben tras el balance', 'Las acciones de Apple caen tras el balance'],
    ['Los bonos argentinos suben tras la elección', 'Los bonos argentinos caen tras la elección']
  ]) assert.equal(sourcesCoverSameEvent(fixture(a), fixture(b, 'cronista.com')), false, `${a} / ${b}`);
  assert.equal(sourcesCoverSameEvent(fixture('Las acciones de Apple suben mientras las acciones de Microsoft caen'), fixture('Las acciones de Apple caen mientras las acciones de Microsoft suben', 'cronista.com')), false);
});

test('publicaciones reales: agrupa la caída intradiaria y la investigación con los tres titulares originales', () => {
  const captured = JSON.parse(readFileSync(new URL('./fixtures/nvidia-coverage-production-2026-11-09.json', import.meta.url), 'utf8')) as NewsItem[];
  const publications = captured.filter(item => item.impact === 'alerta').map(item => item.sources[0]);
  assert.equal(publications.length, 3);
  for (const primary of publications) for (const candidate of publications) {
    assert.equal(sourcesCoverSameEvent(primary, candidate), true, `${primary.mediaName} / ${candidate.mediaName}`);
  }
  const generalMarket = captured.find(item => item.impact === 'neutral')!.sources[0];
  for (const publication of publications) {
    assert.equal(sourcesCoverSameEvent(publication, generalMarket), false, 'La mención contextual de Nvidia en una nota de petróleo no comparte su caída');
    assert.equal(sourcesCoverSameEvent(generalMarket, publication), false);
  }
  const originals = structuredClone(publications);
  const item = { ...captured[0], sources: [publications[0]] };
  const grouped = enrichNewsCoverage([item], publications, new Date('2026-11-09T17:00:00Z'))[0];
  assert.equal(grouped.coverageCount, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(grouped.sources)), originals, 'Las cifras5/8%, fechas, extractos y enlaces originales se conservan para comparar');
});

test('regla general: otros emisores comparten un catalizador aunque cambie la cotización y el vocabulario', () => {
  const sets = [
    [
      'Las acciones de Tesla caen 3% tras una investigación de las autoridades sobre su sistema de conducción autónoma',
      'Tesla se desplomó 6% mientras avanza la investigación de su sistema de conducción autónoma',
      'Los papeles de Tesla pierden 4% por la pesquisa regulatoria sobre la conducción autónoma'
    ],
    [
      'Las acciones de Microsoft suben 3% tras ganancias trimestrales que crecieron 12%',
      'Los papeles de Microsoft escalan 5% después de resultados con ganancias que crecieron 12 por ciento'
    ],
    [
      'Las acciones de Apple caen 2% tras una multa por prácticas antimonopolio',
      'Apple se hundió 4% en la bolsa por la sanción por prácticas antimonopolio'
    ]
  ];
  for (const headlines of sets) for (const primary of headlines) for (const candidate of headlines) {
    assert.equal(sourcesCoverSameEvent(fixture(primary), fixture(candidate, 'cronista.com')), true, `${primary} / ${candidate}`);
  }
});

test('cifras variables solo en cotización: no absorbe porcentajes de resultados, producción, dividendos o estadísticas', () => {
  const pairs = [
    ['Las acciones de Microsoft suben 3% tras ganancias trimestrales que crecieron 12%', 'Las acciones de Microsoft suben 5% tras ganancias trimestrales que crecieron 15%'],
    ['Las ganancias de Microsoft subieron 12% en el trimestre', 'Las ganancias de Microsoft subieron 15% en el trimestre'],
    ['La producción de Tesla cayó 3% mientras avanza una investigación', 'La producción de Tesla cayó 6% mientras avanza una investigación'],
    ['Tesla anunció un dividendo de 3%', 'Tesla anunció un dividendo de 6%'],
    ['El INDEC publicó una inflación de noviembre del 3%', 'El INDEC publicó una inflación de noviembre del 6%'],
    ['La Fed recortó la tasa en 25 puntos básicos', 'La Fed recortó la tasa en 50 puntos básicos'],
    ['Apple cayó 3% tras una multa de USD125 millones', 'Apple cayó 5% tras una multa de USD130 millones']
  ];
  for (const [a, b] of pairs) for (const [primary, candidate] of [[a, b], [b, a]]) {
    assert.equal(sourcesCoverSameEvent(fixture(primary), fixture(candidate, 'cronista.com')), false, `${primary} / ${candidate}`);
  }
});

test('una empresa y una caída no bastan: exige la misma causa, dirección y jornada comprobada', () => {
  const pairs = [
    ['Tesla cae 3% tras una investigación sobre su conducción autónoma', 'Tesla cae 6% por una pesquisa antimonopolio'],
    ['Apple cae 3% tras una investigación por espionaje', 'Apple cae 6% tras una investigación por fraude'],
    ['Tesla cae 3% tras una investigación', 'Tesla cae 6% tras su balance trimestral'],
    ['Tesla cae hoy 3% tras una investigación', 'Tesla cayó ayer 3% tras una investigación'],
    ['Las acciones de Apple caen 3% tras su balance Q2', 'Las acciones de Apple caen 3% tras su balance Q3'],
    ['Las acciones de Apple caen 3% tras su balance del primer trimestre', 'Las acciones de Apple caen 3% tras su balance del tercer trimestre'],
    ['Apple se hunde 3% tras una multa', 'Apple rebota 5% tras una multa'],
    ['Las acciones de Apple caen 3% tras su balance', 'Las acciones de Microsoft caen 3% tras su balance']
  ];
  for (const [a, b] of pairs) for (const [primary, candidate] of [[a, b], [b, a]]) {
    assert.equal(sourcesCoverSameEvent(fixture(primary), fixture(candidate, 'cronista.com')), false, `${primary} / ${candidate}`);
  }
  const title = 'Tesla cae 3% tras una investigación de su conducción autónoma';
  assert.equal(sourcesCoverSameEvent(fixture(title), fixture(title, 'cronista.com', '2030-06-14T16:00:00Z')), false);
  const distinctQuote = fixture('Tesla cae 6% tras una pesquisa de su conducción autónoma', 'cronista.com');
  assert.equal(sourcesCoverSameEvent(fixture(title), { ...distinctQuote, publishedTimestamp: NaN, publishedDateIso: undefined }), false);
});

test('una investigación genérica no une casos concretos diferentes ni depende de una lista cerrada de delitos', () => {
  const fiscal = fixture('Las acciones de Tesla caen 5% por una investigación sobre evasión fiscal');
  for (const percentage of [5, 8]) {
    const espionage = fixture(`Tesla se desploma ${percentage}% por una investigación sobre espionaje de su CEO`, 'cronista.com');
    assert.equal(sourcesCoverSameEvent(fiscal, espionage), false);
    assert.equal(sourcesCoverSameEvent(espionage, fiscal), false, 'También se separan con la misma cotización, antes del fallback léxico');
  }
  const sameUnknownCause = fixture('Los papeles de Tesla pierden 8% por una pesquisa sobre evasión fiscal', 'cronista.com');
  assert.equal(sourcesCoverSameEvent(fiscal, sameUnknownCause), true, 'Un caso no enumerado también se reconoce por sus detalles sustantivos');
  const unrelatedUnknownCause = fixture('Los papeles de Tesla pierden 8% por una pesquisa sobre abuso laboral', 'cronista.com');
  assert.equal(sourcesCoverSameEvent(fiscal, unrelatedUnknownCause), false);
  const vague = fixture('Los papeles de Tesla pierden 8% mientras avanza una investigación', 'cronista.com');
  assert.equal(sourcesCoverSameEvent(fiscal, vague), false, 'Empresa, caída e investigación sin caso concreto no alcanzan');
  const verifiedDetail = { ...vague, articleSummary: 'La autoridad inició una pesquisa sobre evasión fiscal de la compañía.' };
  assert.equal(sourcesCoverSameEvent(fiscal, verifiedDetail), true, 'El extracto original del editor puede aclarar el caso del titular genérico');
  const differentDetail = { ...vague, articleSummary: 'La autoridad inició una pesquisa sobre abuso laboral de la compañía.' };
  assert.equal(sourcesCoverSameEvent(fiscal, differentDetail), false);
});
