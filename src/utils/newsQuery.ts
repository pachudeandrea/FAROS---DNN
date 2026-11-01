import type { NewsItem } from '../types';
export type NewsQueryState = { status: 'idle' | 'loading' | 'success' | 'cached' | 'error'; checkedAt: string | null; error?: string };
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
  const previous = count ? ' Mostrando información de una consulta anterior.' : '';
  if (query.status === 'loading') return 'Buscando noticias.' + previous;
  if (query.status === 'error') return 'Error al actualizar.' + previous + (time ? ' Última consulta: ' + time + '.' : '') + ' Volvé a intentarlo.';
  if (query.status === 'cached') return 'Mostrando información de una consulta anterior.' + (time ? ' Consultada el ' + time + '.' : ' Horario de consulta no disponible.');
  if (query.status === 'success') return (count ? 'Actualización completada.' : 'Sin novedades verificadas en esta consulta.') + (time ? ' ' + time + '.' : '');
  return 'Todavía no se realizó una consulta.';
}
