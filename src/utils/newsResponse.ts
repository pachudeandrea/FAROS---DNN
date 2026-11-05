import type { NewsItem } from '../types/index.js';
export interface NewsResponse { news: NewsItem[]; checkedAt?: string | null; cached?: boolean; type?: string; error?: string }

/** JSON compatibility plus incremental frames; partial data is never a completed snapshot. */
export async function readNewsResponse(response: Response, onProgress: (data: NewsResponse) => void): Promise<NewsResponse> {
  if (!response.ok) throw new Error('No se pudo completar la consulta.');
  if (!response.headers.get('content-type')?.includes('application/x-ndjson')) {
    const data = await response.json();
    if (!Array.isArray(data.news)) throw new Error('Noticias inválidas.');
    return data;
  }
  const reader = response.body?.getReader();
  if (!reader) throw new Error('Respuesta incompleta.');
  const decoder = new TextDecoder();
  let buffer = ''; let complete: NewsResponse | undefined;
  const frame = (line: string) => {
    if (!line.trim()) return;
    const data = JSON.parse(line) as NewsResponse;
    if (data.type === 'error') throw new Error(data.error || 'La actualización falló.');
    if (!Array.isArray(data.news)) throw new Error('Noticias inválidas.');
    if (data.type === 'progress') onProgress(data);
    else if (data.type === 'complete') complete = data;
    else throw new Error('Respuesta inválida.');
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
    if (!complete) throw new Error('La actualización quedó incompleta.');
    return complete;
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}
