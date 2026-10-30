import type { UserAccount } from '../types/index.js';
import { apiRequest } from './apiClient.js';

export type OAuthProvider = 'google' | 'microsoft';
export interface OAuthTempUser {
  email: string;
  name: string;
  provider: OAuthProvider;
  picture?: string;
  signupTicket: string;
}

type OAuthResult =
  | { type: 'not_configured'; instructions: string }
  | { type: 'authenticated'; user: UserAccount; token?: string }
  | { type: 'onboarding'; tempUser: OAuthTempUser };

const abortError = () => new DOMException('Inicio de sesión cancelado.', 'AbortError');

/** Open synchronously in the click handler, before awaiting the API. Safari
 * otherwise treats window.open() as an unsolicited popup and can block it. */
export function launchOAuth(provider: OAuthProvider, signal?: AbortSignal): Promise<OAuthResult> {
  if (signal?.aborted) return Promise.reject(abortError());
  const label = provider === 'google' ? 'Google' : 'Microsoft';
  const popup = window.open('about:blank', 'faros_oauth_popup',
    `width=600,height=700,left=${Math.max(0, (window.screen.width - 600) / 2)},top=${Math.max(0, (window.screen.height - 700) / 2)}`);
  if (!popup) return Promise.reject(new Error('El navegador bloqueó la ventana de acceso. Habilitá las ventanas emergentes para continuar.'));

  try {
    popup.document.title = 'FAROS';
    if (popup.document.body) popup.document.body.textContent = `Conectando con ${label}…`;
  } catch { /* A reused window may still be on the provider's origin. */ }

  return new Promise((resolve, reject) => {
    let finished = false;
    const cleanup = () => {
      window.removeEventListener('message', onMessage);
      signal?.removeEventListener('abort', onAbort);
      clearInterval(closedTimer);
      clearTimeout(expiryTimer);
      try { popup.close(); } catch {}
    };
    const fail = (error: unknown) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };
    const succeed = (result: OAuthResult) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };
    const onAbort = () => fail(abortError());
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin || event.source !== popup || event.data?.provider !== provider) return;
      const data = event.data;
      if (data.type === 'OAUTH_AUTH_ERROR') {
        fail(new Error(typeof data.error === 'string' ? data.error : `No se pudo iniciar sesión con ${label}.`));
      } else if (data.type === 'OAUTH_AUTH_SUCCESS') {
        if (!data.user?.id || !data.success) return fail(new Error('El proveedor no confirmó la sesión de FAROS.'));
        succeed({ type: 'authenticated', user: data.user, token: data.token });
      } else if (data.type === 'OAUTH_AUTH_NEW_USER') {
        if (!data.success || !data.tempUser?.signupTicket || data.tempUser.provider !== provider) return fail(new Error('La verificación externa no es válida. Volvé a intentar.'));
        succeed({ type: 'onboarding', tempUser: data.tempUser });
      }
    };
    const closedTimer = setInterval(() => {
      if (popup.closed) fail(new Error('Se cerró la ventana de acceso. Podés volver a intentar.'));
    }, 500);
    const expiryTimer = setTimeout(() => fail(new Error('La autorización venció. Volvé a iniciar sesión con el proveedor.')), 10 * 60 * 1000);
    window.addEventListener('message', onMessage);
    signal?.addEventListener('abort', onAbort, { once: true });

    void apiRequest(`/api/auth/${provider}/url`).then(data => {
      if (finished) return;
      if (popup.closed) return fail(new Error('Se cerró la ventana de acceso. Podés volver a intentar.'));
      if (!data.configured) return succeed({ type: 'not_configured', instructions: data.instructions || `Falta configurar las credenciales de ${label}.` });
      const url = new URL(data.url);
      const expectedHost = provider === 'google' ? 'accounts.google.com' : 'login.microsoftonline.com';
      if (url.protocol !== 'https:' || url.hostname !== expectedHost) throw new Error('La dirección de autorización del proveedor no es válida.');
      popup.location.href = url.toString();
    }).catch(fail);
  });
}
