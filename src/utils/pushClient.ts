export type PushSupport = 'ready' | 'install-ios' | 'unsupported';

export function getPushSupport(): PushSupport {
  if (typeof window === 'undefined') return 'unsupported';
  const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  if (ios && !standalone) return 'install-ios';
  return window.isSecureContext && typeof Notification !== 'undefined' && 'serviceWorker' in navigator && typeof PushManager !== 'undefined' ? 'ready' : 'unsupported';
}
export function notificationPermission(): NotificationPermission {
  return typeof Notification === 'undefined' ? 'default' : Notification.permission;
}
let worker: Promise<ServiceWorkerRegistration> | null = null;
export function pushWorker(): Promise<ServiceWorkerRegistration> {
  if (!worker) worker = (async () => {
    await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([navigator.serviceWorker.ready, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('No se pudo preparar el servicio de alertas. Volvé a intentar.')), 10000); })]);
    } finally { clearTimeout(timer); }
  })().catch(error => { worker = null; throw error; });
  return worker;
}
export async function bindPushAccount(userId: string | null, registration?: ServiceWorkerRegistration): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  const active = (registration || await navigator.serviceWorker.getRegistration('/'))?.active;
  if (!active) return;
  await new Promise<void>((resolve, reject) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => { channel.port1.close(); reject(new Error('No se pudo asociar este dispositivo. Volvé a intentar.')); }, 5000);
    channel.port1.onmessage = () => { clearTimeout(timer); channel.port1.close(); resolve(); };
    active.postMessage({ type: 'FAROS_ACCOUNT', userId }, [channel.port2]);
  });
}
export async function deviceHash(subscription: PushSubscription | null): Promise<string> {
  if (!subscription) return '';
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(subscription.endpoint));
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}
export function applicationKey(value: string): Uint8Array<ArrayBuffer> {
  const decoded = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(decoded, char => char.charCodeAt(0));
}
