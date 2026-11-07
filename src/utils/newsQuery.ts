import type { NewsItem } from '../types';
import { argentinaNewsDay, dailyNewsItems, mergeDailyNews } from './dailyNews.js';
export type NewsQueryState = { status: 'idle' | 'loading' | 'success' | 'cached' | 'error' | 'partial'; checkedAt: string | null; error?: string; partial?: boolean; retrying?: boolean };
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
  if (query.status === 'error') return 'Error al actualizar.' + (query.error ? ' ' + query.error : '') + (query.retrying ? ' Reintentando automáticamente.' : '') + previous + (time ? ' Última consulta: ' + time + '.' : '') + ' Volvé a intentarlo.';
  if (query.status === 'cached') return 'Mostrando información de una consulta anterior.' + (time ? ' Consultada el ' + time + '.' : ' Horario de consulta no disponible.');
  if (query.status === 'success') return (count ? 'Actualización completada.' : 'Sin novedades verificadas en esta consulta.') + (time ? ' ' + time + '.' : '');
  return 'Todavía no se realizó una consulta.';
}

/** Recover this selection's accumulated current day, regardless of the last hour visited. */
export function findRecentNewsSnapshot(storage: Pick<Storage, 'length' | 'key' | 'getItem'>, prefix: string, now = Date.now()): NewsSnapshot | null {
  const today = argentinaNewsDay(now);
  const snapshots: NewsSnapshot[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith(prefix) || !/^\d{4}-\d{2}-\d{2}_\d{2}$/.test(key.slice(prefix.length)) || !key.slice(prefix.length).startsWith(today + '_')) continue;
    const snapshot = readNewsSnapshot(storage.getItem(key));
    const checked = snapshot?.checkedAt ? Date.parse(snapshot.checkedAt) : NaN;
    if (!snapshot || !Number.isFinite(checked) || checked > now || argentinaNewsDay(checked) !== today) continue;
    const news = dailyNewsItems(snapshot.news, today);
    if (snapshot.news.length && !news.length) continue;
    snapshots.push({ ...snapshot, news });
  }
  snapshots.sort((a,b) => Date.parse(a.checkedAt!) - Date.parse(b.checkedAt!));
  return snapshots.length ? { news: snapshots.reduce((news, snapshot) => mergeDailyNews(news, snapshot.news, today), [] as NewsItem[]), checkedAt: snapshots.at(-1)!.checkedAt } : null;
}

/** A new Argentina day must never restore yesterday's pulse; personal data is separate. */
export function pruneNewsSnapshotCache(storage: Pick<Storage, 'length' | 'key' | 'getItem' | 'removeItem'>, currentPrefix: string, todayKey: string, _now = Date.now()): void {
  const remove: string[] = [];
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index);
    if (!key?.startsWith('faros_news_')) continue;
    const day = key.match(/_(\d{4}-\d{2}-\d{2})_\d{2}$/)?.[1];
    if (!key.startsWith(currentPrefix) || day !== todayKey) remove.push(key);
  }
  remove.forEach(key => storage.removeItem(key));
}
