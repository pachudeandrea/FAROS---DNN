import type { NewsItem } from '../types';
export type NewsQueryState = { status: 'idle' | 'loading' | 'success' | 'cached' | 'error' | 'partial'; checkedAt: string | null; error?: string; partial?: boolean };
export type NewsSnapshot = { news: NewsItem[]; checkedAt: string | null };
export function readNewsSnapshot(raw: string | null): NewsSnapshot | null {
  try {
    const value = JSON.parse(raw || 'null');
    if (Array.isArray(value)) return { news: value, checkedAt: null };
    if (!value || !Array.isArray(value.news)) return null;
    return { news: value.news, checkedAt: typeof value.checkedAt === 'string' && Number.isFinite(Date.parse(value.checkedAt)) ? value.checkedAt : null };
  } catch { return null; }
}
export function describeNewsQuery(query: NewsQueryState, count: number): string {
  const time = query.checkedAt ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).format(new Date(query.checkedAt)) + ' (Buenos Aires)' : null;
  if (query.status === 'partial') return 'Noticias disponibles. Completando la comparación entre medios.';
  const previous = query.partial && count ? ' Mostrando las noticias verificadas hasta ahora.' : count ? ' Mostrando información de una consulta anterior.' : '';
  if (query.status === 'loading') return 'Buscando noticias.' + previous;
  if (query.status === 'error') return 'Error al actualizar.' + previous + (time ? ' Última consulta: ' + time + '.' : '') + ' Volvé a intentarlo.';
  if (query.status === 'cached') return 'Mostrando información de una consulta anterior.' + (time ? ' Consultada el ' + time + '.' : ' Horario de consulta no disponible.');
  if (query.status === 'success') return (count ? 'Actualización completada.' : 'Sin novedades verificadas en esta consulta.') + (time ? ' ' + time + '.' : '');
  return 'Todavía no se realizó una consulta.';
}

/** Reuse recent completed data only for the exact same portfolio selection. */
export function findRecentNewsSnapshot(storage: Pick<Storage, 'length' | 'key' | 'getItem'>, prefix: string, now = Date.now()): NewsSnapshot | null {
  let latest: NewsSnapshot | null = null;
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix) || !/^\d{4}-\d{2}-\d{2}_\d{2}$/.test(key.slice(prefix.length))) continue;
    const snapshot = readNewsSnapshot(storage.getItem(key));
    const checked = snapshot?.checkedAt ? Date.parse(snapshot.checkedAt) : NaN;
    if (!snapshot?.news.length || !Number.isFinite(checked) || checked > now || now - checked > 2 * 3600000) continue;
    const news = snapshot.news.map(item => ({ ...item, sources: item.sources.filter(source => {
      const at = source.publishedTimestamp ?? Date.parse(source.publishedDateIso || '');
      return !Number.isFinite(at) || at >= now - 48 * 3600000 && at <= now + 5 * 60000;
    }) })).filter(item => item.sources.length).map(item => ({ ...item, coverageCount: item.sources.length }));
    if (news.length && (!latest?.checkedAt || checked > Date.parse(latest.checkedAt))) latest = { news, checkedAt: snapshot.checkedAt };
  }
  return latest;
}

/** Remove obsolete formats and old data without discarding the midnight fallback. */
export function pruneNewsSnapshotCache(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'removeItem'>, currentPrefix: string, todayKey: string, now = Date.now()): void {
  const remove: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith('faros_news_')) continue;
    const day = key.match(/_(\d{4}-\d{2}-\d{2})_\d{2}$/)?.[1];
    if (key.startsWith(currentPrefix) && day === todayKey) continue;
    const snapshot = key.startsWith(currentPrefix) ? readNewsSnapshot(storage.getItem(key)) : null;
    const checked = snapshot?.checkedAt ? Date.parse(snapshot.checkedAt) : NaN;
    if (day && Number.isFinite(checked) && checked <= now && now - checked <= 2 * 3600000) continue;
    remove.push(key);
  }
  remove.forEach(key => storage.removeItem(key));
}
