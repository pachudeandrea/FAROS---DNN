export class ApiError extends Error {
  constructor(message: string, public code: string, public status = 0) {
    super(message);
  }
}

/** Keep routing, protocol, database, validation and transport failures distinct. */
export async function apiRequest<T = any>(url: string, init: RequestInit = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25000);
  try {
    const headers = new Headers(init.headers);
    headers.set('Accept', 'application/json');
    if (init.body) headers.set('Content-Type', 'application/json');
    try {
      const token = localStorage.getItem('faros_session_token');
      if (token && !token.startsWith('loc_')) headers.set('Authorization', `Bearer ${token}`);
    } catch { /* Cookies still work when browser storage is unavailable. */ }
    const response = await fetch(url, { ...init, headers, credentials: 'include', signal: controller.signal });
    if (response.status === 404) throw new ApiError('El servicio solicitado no existe (404). Revisá el despliegue de la API de FAROS.', 'API_NOT_FOUND', 404);
    if (!(response.headers.get('content-type') || '').includes('application/json')) {
      throw new ApiError(`El servidor respondió ${response.status} sin JSON. Revisá las rutas y la función API en Vercel.`, 'API_NON_JSON', response.status);
    }
    let data: any;
    try { data = await response.json(); } catch {
      if (controller.signal.aborted) throw new ApiError('El servidor demoró demasiado en responder. Intentá nuevamente.', 'TIMEOUT');
      throw new ApiError('La API devolvió una respuesta JSON inválida.', 'API_INVALID_JSON', response.status);
    }
    if (!data || typeof data !== 'object') throw new ApiError('La respuesta de la API no es válida.', 'API_INVALID_JSON', response.status);
    if (!response.ok) {
      const message = typeof data.error === 'string' && !/[<>]/.test(data.error) ? data.error : `La operación falló en el servidor (${response.status}).`;
      throw new ApiError(message, data.code || (response.status === 400 ? 'VALIDATION_ERROR' : 'API_ERROR'), response.status);
    }
    return data as T;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    if (controller.signal.aborted) throw new ApiError('El servidor demoró demasiado en responder. Intentá nuevamente.', 'TIMEOUT');
    if (error instanceof TypeError) throw new ApiError('No se pudo enviar la solicitud a FAROS. La conexión fue interrumpida o bloqueada.', 'NETWORK_ERROR');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}
