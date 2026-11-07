import type { NewsItem } from '../types/index.js';
export interface NewsResponse { news: NewsItem[]; checkedAt?: string | null; cached?: boolean; type?: string; error?: string; code?: string }

export class NewsRequestError extends Error {
  constructor(message: string, public code: string, public status = 0, public retryAfterMs = 0) { super(message); this.name = 'NewsRequestError'; }
}
const safeErrorMessage = (code: string, status: number) => {
  if (status === 429) return 'Hay demasiadas consultas simultáneas. Esperá un momento antes de reintentar.';
  if (status === 408 || status === 504 || code === 'TIMEOUT') return 'La consulta de noticias demoró demasiado en responder.';
  if (status === 404) return 'El servicio de noticias no está disponible en esta versión. Actualizá FAROS.';
  if (status === 400) return 'No se pudo consultar esa selección de activos. Revisá tu cartera.';
  if (status === 401 || status === 403) return 'No se pudo autorizar la consulta de noticias.';
  if (code === 'NEWS_SOURCES_UNAVAILABLE') return 'Las fuentes de noticias no respondieron a la consulta.';
  if (status >= 500) return 'El servicio de FAROS no respondió correctamente. Intentá nuevamente.';
  return 'No se pudo completar la consulta de noticias.';
};
export function normalizeNewsError(error: unknown, timedOut = false): NewsRequestError {
  if (timedOut) return new NewsRequestError(safeErrorMessage('TIMEOUT', 408), 'TIMEOUT', 408);
  if (error instanceof NewsRequestError) return error;
  return new NewsRequestError('La conexión con las noticias se interrumpió.', 'NETWORK_ERROR');
}
export function retryableNewsError(error: NewsRequestError): boolean {
  return [408, 429].includes(error.status) || error.status >= 500 || ['NETWORK_ERROR', 'NEWS_STREAM_INTERRUPTED', 'NEWS_STREAM_INCOMPLETE'].includes(error.code);
}
export function newsRetryDelay(error: NewsRequestError, attempt: number): number {
  return Math.max(attempt === 0 ? 2000 : 5000, error.retryAfterMs);
}
async function responseError(response: Response): Promise<NewsRequestError> {
  let code = 'NEWS_HTTP_ERROR';
  try { const data = await response.json(); if (/^[A-Z][A-Z0-9_]{0,79}$/.test(data?.code || '')) code = data.code; } catch {}
  const retry = response.headers.get('retry-after');
  let retryAfterMs = 0;
  if (retry) {
    const seconds = Number(retry);
    retryAfterMs = Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : Math.max(0, Date.parse(retry) - Date.now()) || 0;
  }
  // Do not reflect upstream HTML, SQL errors, URLs or provider text into the UI.
  return new NewsRequestError(safeErrorMessage(code, response.status), code, response.status, retryAfterMs);
}

/** JSON compatibility plus incremental frames; partial data is never a completed snapshot. */
export async function readNewsResponse(response: Response, onProgress: (data: NewsResponse) => void): Promise<NewsResponse> {
  if (!response.ok) throw await responseError(response);
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
    let data: NewsResponse;
    try { data = await response.json(); } catch { throw new NewsRequestError('La respuesta de noticias no pudo leerse.', 'NEWS_INVALID_RESPONSE', response.status); }
    if (!Array.isArray(data?.news)) throw new NewsRequestError('La respuesta de noticias no es válida.', 'NEWS_INVALID_RESPONSE', response.status);
    return data;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new NewsRequestError('La actualización quedó incompleta.', 'NEWS_STREAM_INCOMPLETE');
  const decoder = new TextDecoder();
  let buffer = ''; let complete: NewsResponse | undefined;
  const frame = (line: string) => {
    if (!line.trim()) return;
    let data: NewsResponse;
    try { data = JSON.parse(line); } catch { throw new NewsRequestError('La respuesta de noticias no es válida.', 'NEWS_INVALID_RESPONSE', response.status); }
    if (!data || typeof data !== 'object') throw new NewsRequestError('La respuesta de noticias no es válida.', 'NEWS_INVALID_RESPONSE', response.status);
    if (data.type === 'error') {
      const code = /^[A-Z][A-Z0-9_]{0,79}$/.test(data.code || '') ? data.code! : 'NEWS_SOURCES_UNAVAILABLE';
      throw new NewsRequestError(safeErrorMessage(code, 503), code, 503);
    }
    if (!Array.isArray(data.news)) throw new NewsRequestError('La respuesta de noticias no es válida.', 'NEWS_INVALID_RESPONSE', response.status);
    if (data.type === 'progress') onProgress(data);
    else if (data.type === 'complete') complete = data;
    else throw new NewsRequestError('La respuesta de noticias no es válida.', 'NEWS_INVALID_RESPONSE', response.status);
  };
  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      let newline;
      while ((newline = buffer.indexOf('\n')) >= 0) { frame(buffer.slice(0, newline)); buffer = buffer.slice(newline + 1); if (complete) return complete; }
      if (done) break;
    }
    if (buffer.trim()) frame(buffer);
    if (!complete) throw new NewsRequestError('La actualización quedó incompleta.', 'NEWS_STREAM_INCOMPLETE');
    return complete;
  } catch (error) {
    if (error instanceof NewsRequestError) throw error;
    throw new NewsRequestError('La conexión con las noticias se interrumpió.', 'NEWS_STREAM_INTERRUPTED');
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
