import test from 'node:test';
import assert from 'node:assert/strict';
import { argentinaNewsDay, argentinaNewsHour, nextNewsHourDelay, dailyNewsItems, mergeDailyNews } from '../src/utils/dailyNews.js';
import { REAL_GROUNDED_NEWS } from '../src/data/groundedRealNews.js';
const day = '2026-11-06';
const item = (id: string, at = '2026-11-06T12:00:00-03:00', headline = 'El BCRA compró USD 125 millones y sumó reservas', publisher = 'ambito.com') => {
  const value = structuredClone(REAL_GROUNDED_NEWS[0]);
  return { ...value, id, headline, sources: [{ ...value.sources[0], mediaName: publisher, domain: publisher, sourceUrl: `https://www.${publisher}/economia/${id}`, originalHeadline: headline, publishedTimestamp: Date.parse(at), publishedDateIso: at }], coverageCount: 1 };
};
test('jornada y cambio de hora usan Argentina, con cierre exacto a las00:00 y no medianocheUTC', () => {
  const before = Date.parse('2026-11-07T02:59:59.999Z');
  assert.equal(argentinaNewsDay(before), day); assert.equal(argentinaNewsHour(before), `${day}_23`); assert.equal(nextNewsHourDelay(before), 1);
  assert.equal(argentinaNewsDay(before + 1), '2026-11-07'); assert.equal(argentinaNewsHour(before + 1), '2026-11-07_00'); assert.equal(nextNewsHourDelay(before + 1), 3600000);
  assert.equal(argentinaNewsDay(Date.parse('2026-11-07T00:00:00Z')), day);
});
test('solo conserva publicaciones de la jornada argentina, sin fechas desconocidas ni reanclar noticias viejas', () => {
  const today = item('today'); const yesterday = item('yesterday', '2026-11-06T02:59:59Z');
  const undated = item('undated'); undated.sources[0].publishedTimestamp = NaN; undated.sources[0].publishedDateIso = '';
  const overnight = { ...yesterday, sources: [...yesterday.sources, ...today.sources] };
  const tomorrow = item('tomorrow', '2026-11-07T03:00:00Z');
  assert.deepEqual(dailyNewsItems([today, yesterday, undated, overnight, tomorrow], day).map(n => n.id), ['today']);
  assert.equal(dailyNewsItems([today], '2026-11-07').length, 0);
});
test('una consulta vacía o con otra noticia no borra las publicadas antes en el día', () => {
  const morning = item('morning'); const afternoon = item('afternoon', '2026-11-06T16:00:00-03:00', 'YPF inauguró el oleoducto Vaca Muerta Sur');
  assert.deepEqual(mergeDailyNews([morning], [afternoon], day).map(n => n.id), ['morning', 'afternoon']);
  assert.deepEqual(mergeDailyNews([morning], [], day), [morning]);
  assert.deepEqual(mergeDailyNews([morning], [afternoon], '2026-11-07'), []);
});
test('la misma URL actualiza la tarjeta sin perder la comparación ya verificada', () => {
  const original = item('same');
  const other = item('other', '2026-11-06T12:10:00-03:00', 'El Banco Central compró USD 125 millones y elevó sus reservas', 'cronista.com');
  const first = mergeDailyNews([original], [other], day);
  assert.equal(first.length, 1); assert.equal(first[0].coverageCount, 2);
  const updated = { ...original, headline: 'El BCRA compró USD 125 millones y elevó sus reservas', briefSummary: 'Síntesis actualizada de la publicación verificada' };
  const result = mergeDailyNews(first, [updated], day);
  assert.equal(result.length, 1); assert.equal(result[0].briefSummary, updated.briefSummary); assert.equal(result[0].coverageCount, 2);
  assert.deepEqual(result[0].sources.map(source => source.sourceUrl).sort(), [...original.sources, ...other.sources].map(source => source.sourceUrl).sort());
  assert.equal(original.coverageCount, 1, 'No se muta el estado anterior');
});
test('separa acontecimientos con dirección o cifras diferentes sin duplicar URLs con seguimiento', () => {
  const first = item('same', undefined, 'AL30 sube 3% en la Bolsa');
  const second = item('down', undefined, 'AL30 cae 5% en la Bolsa');
  assert.equal(mergeDailyNews([first], [second], day).length, 2);
  const tracked = structuredClone(first); tracked.sources[0].sourceUrl += '?utm_source=feed#top';
  assert.equal(mergeDailyNews([first], [tracked], day).length, 1);
});


test('preserva la comparación entrante y no agrega fuentes viejas si cambia el hecho de la misma URL', () => {
  const first = item('changing', undefined, 'AL30 sube 3% en la Bolsa');
  const other = item('old-comparison', undefined, 'AL30 sube 3% en la Bolsa', 'cronista.com');
  const previous = { ...first, sources: [...first.sources, ...other.sources], coverageCount: 2 };
  const updated = item('changing', undefined, 'AL30 cae 5% en la Bolsa');
  const result = mergeDailyNews([previous], [updated], day);
  assert.equal(result.length, 1); assert.equal(result[0].coverageCount, 1);
  assert.equal(result[0].sources[0].originalHeadline, updated.headline);
});
