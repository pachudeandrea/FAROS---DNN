import { test, type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { launchOAuth } from '../src/utils/oauthPopup';

function browser(t: TestContext, blocked = false) {
  const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
  const previousFetch = globalThis.fetch;
  const listeners = new Set<(event: MessageEvent) => void>();
  const events: string[] = [];
  const controller = new AbortController();
  let deliver!: (response: Response) => void;
  const response = new Promise<Response>(resolve => { deliver = resolve; });
  const popup = { closed: false, location: { href: 'about:blank' }, document: { title: '', body: { textContent: '' } }, close() { this.closed = true; } };
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    screen: { width: 1200, height: 900 }, location: { origin: 'https://faros-dnn.vercel.app' },
    open() { events.push('open'); return blocked ? null : popup; },
    addEventListener(_type: string, listener: (event: MessageEvent) => void) { listeners.add(listener); },
    removeEventListener(_type: string, listener: (event: MessageEvent) => void) { listeners.delete(listener); }
  } });
  globalThis.fetch = async () => { events.push('request'); return response; };
  t.after(() => {
    controller.abort();
    globalThis.fetch = previousFetch;
    if (previousWindow) Object.defineProperty(globalThis, 'window', previousWindow);
    else Reflect.deleteProperty(globalThis, 'window');
  });
  return {
    popup, events, listeners, controller,
    reply(data: object) { deliver(new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } })); },
    message(data: object, origin = 'https://faros-dnn.vercel.app', source: unknown = popup) {
      for (const listener of listeners) listener({ origin, source, data } as MessageEvent);
    }
  };
}

test('OAuth abre la ventana durante el clic, antes de esperar la API (Safari)', async t => {
  const b = browser(t);
  const pending = launchOAuth('google', b.controller.signal);
  assert.deepEqual(b.events, ['open', 'request']);
  assert.equal(b.popup.location.href, 'about:blank');
  b.reply({ configured: true, url: 'https://accounts.google.com/o/oauth2/v2/auth?state=test' });
  await setImmediate();
  assert.match(b.popup.location.href, /^https:\/\/accounts.google.com/);
  b.message({ success: true, type: 'OAUTH_AUTH_NEW_USER', provider: 'google', tempUser: { email: 'oauth@example.test', name: 'Prueba', provider: 'google', signupTicket: 'verified-ticket' } });
  const result = await pending;
  assert.equal(result.type, 'onboarding');
  assert.equal(b.popup.closed, true);
  assert.equal(b.listeners.size, 0);
});

test('OAuth sin credenciales informa configuración pendiente y cierra la ventana', async t => {
  const b = browser(t);
  const pending = launchOAuth('microsoft', b.controller.signal);
  b.reply({ configured: false, instructions: 'Faltan credenciales de Microsoft.' });
  assert.deepEqual(await pending, { type: 'not_configured', instructions: 'Faltan credenciales de Microsoft.' });
  assert.equal(b.popup.closed, true);
  assert.equal(b.listeners.size, 0);
});

test('OAuth rechaza mensajes de otro origen, ventana o proveedor', async t => {
  const b = browser(t);
  const pending = launchOAuth('microsoft', b.controller.signal);
  b.reply({ configured: true, url: 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize' });
  await setImmediate();
  let completed = false;
  void pending.then(() => { completed = true; });
  const valid = { success: true, type: 'OAUTH_AUTH_SUCCESS', provider: 'microsoft', user: { id: 'usr-test' }, token: 'session-test' };
  b.message(valid, 'https://other.example');
  b.message(valid, undefined, {});
  b.message({ ...valid, provider: 'google' });
  await setImmediate();
  assert.equal(completed, false);
  b.message(valid);
  assert.equal((await pending).type, 'authenticated');
  assert.equal(b.listeners.size, 0);
});

test('cerrar el formulario cancela OAuth sin redirigir después una respuesta tardía', async t => {
  const b = browser(t);
  const pending = launchOAuth('google', b.controller.signal);
  b.controller.abort();
  await assert.rejects(pending, { name: 'AbortError' });
  b.reply({ configured: true, url: 'https://accounts.google.com/o/oauth2/v2/auth' });
  await setImmediate();
  assert.equal(b.popup.closed, true);
  assert.equal(b.popup.location.href, 'about:blank');
  assert.equal(b.listeners.size, 0);
});

test('una ventana bloqueada no inicia una autorización incompleta', async t => {
  const b = browser(t, true);
  await assert.rejects(launchOAuth('google', b.controller.signal), /bloqueó/);
  assert.deepEqual(b.events, ['open']);
});

test('OAuth rechaza una dirección de autorización ajena al proveedor', async t => {
  const b = browser(t);
  const pending = launchOAuth('google', b.controller.signal);
  b.reply({ configured: true, url: 'https://unexpected.example/authorize' });
  await assert.rejects(pending, /dirección de autorización/);
  assert.equal(b.popup.closed, true);
});
