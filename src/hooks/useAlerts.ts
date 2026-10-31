import { useCallback, useEffect, useRef, useState } from 'react';
import type { NotificationAlert, UserAccount, UserPreferences } from '../types';
import { apiRequest } from '../utils/apiClient';
import { applicationKey, bindPushAccount, deviceHash, getPushSupport, notificationPermission, pushWorker } from '../utils/pushClient';

export function useAlerts(user: UserAccount | null, onPreferences: (preferences: UserPreferences) => void) {
  const userId = user && user.id !== 'usr_demo' ? user.id : null;
  const activeUser = useRef(userId); activeUser.current = userId;
  const onPreferencesRef = useRef(onPreferences); onPreferencesRef.current = onPreferences;
  const [owner, setOwner] = useState<string | null>(null);
  const [notifications, setNotifications] = useState<NotificationAlert[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [subscribed, setSubscribed] = useState(false);
  const [publicKey, setPublicKey] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [permission, setPermission] = useState(notificationPermission);
  const support = getPushSupport();

  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => setMessage(null), 10000);
    return () => clearTimeout(timer);
  }, [message]);

  const dismiss = useCallback(() => {
    setDismissed(true);
    if (userId) try { localStorage.setItem(`faros_alert_prompt:${userId}`, 'dismissed'); } catch {}
  }, [userId]);

  const localSubscription = useCallback(async () => {
    if (getPushSupport() !== 'ready') return null;
    return (await pushWorker()).pushManager.getSubscription();
  }, []);

  const refresh = useCallback(async () => {
    if (!userId) return;
    try {
      let subscription: PushSubscription | null = null;
      try { subscription = await localSubscription(); } catch { /* Inbox remains available without Web Push. */ }
      const device = await deviceHash(subscription);
      const data = await apiRequest(`/api/notifications?expectedUserId=${encodeURIComponent(userId)}&device=${device}`);
      if (activeUser.current !== userId || data.userId !== userId) return;
      const currentPermission = notificationPermission();
      const current = Boolean(data.enabled && data.subscribed && subscription && currentPermission === 'granted');
      setOwner(userId); setNotifications(data.notifications || []); setEnabled(data.enabled === true); setSubscribed(current);
      setPublicKey(typeof data.publicKey === 'string' ? data.publicKey : ''); setPermission(currentPermission); setLoaded(true);
      if (getPushSupport() === 'ready') await bindPushAccount(current ? userId : null);
    } catch (failure) {
      if (activeUser.current !== userId) return;
      setOwner(userId); setLoaded(true); setError(failure instanceof Error ? failure.message : 'No se pudieron cargar las alertas.');
    }
  }, [userId, localSubscription]);

  useEffect(() => {
    setOwner(userId); setNotifications([]); setEnabled(false); setSubscribed(false); setPublicKey(''); setLoaded(false); setMessage(null); setError(null);
    let cancelled = false;
    try { setDismissed(userId ? localStorage.getItem(`faros_alert_prompt:${userId}`) === 'dismissed' : true); } catch { setDismissed(false); }
    void (async () => {
      try { await bindPushAccount(null); } catch {}
      if (!cancelled && userId) await refresh();
    })();
    if (!userId) return () => { cancelled = true; };
    const timer = setInterval(() => { if (!document.hidden) void refresh(); }, 60000);
    const visible = () => { if (!document.hidden) void refresh(); };
    const pushed = (event: MessageEvent) => { if (event.data?.type === 'FAROS_NOTIFICATION') void refresh(); };
    document.addEventListener('visibilitychange', visible);
    navigator.serviceWorker?.addEventListener('message', pushed);
    return () => { cancelled = true; clearInterval(timer); document.removeEventListener('visibilitychange', visible); navigator.serviceWorker?.removeEventListener('message', pushed); };
  }, [userId, refresh]);

  const activate = async () => {
    if (!userId || busy || !publicKey || support !== 'ready') return;
    // Invoke the native prompt directly from the button's user gesture.
    setBusy(true); setError(null); setMessage(null);
    let subscription: PushSubscription | null = null;
    try {
      const granted = await Notification.requestPermission(); setPermission(granted);
      if (granted !== 'granted') throw new Error('Para recibir alertas, permití las notificaciones de FAROS en este dispositivo.');
      const registration = await pushWorker();
      await bindPushAccount(userId, registration);
      subscription = await registration.pushManager.getSubscription();
      const key = applicationKey(publicKey);
      if (subscription?.options.applicationServerKey && [...new Uint8Array(subscription.options.applicationServerKey)].join() !== [...key].join()) { await subscription.unsubscribe(); subscription = null; }
      if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key.buffer });
      const data = await apiRequest('/api/notifications/subscription', { method: 'POST', body: JSON.stringify({ expectedUserId: userId, consent: true, subscription: subscription.toJSON() }) });
      if (!data.success) throw new Error('No se pudo activar este dispositivo.');
      if (activeUser.current !== userId) { await bindPushAccount(null); return; }
      onPreferencesRef.current(data.preferences); setEnabled(true); setSubscribed(true); dismiss();
      setMessage(data.testSent ? 'Alertas activadas en este dispositivo.' : 'Alertas activadas. No se pudo confirmar el aviso de prueba; podés reenviarlo.');
      await refresh();
    } catch (failure) {
      try { await subscription?.unsubscribe(); } catch {}
      try { await bindPushAccount(null); } catch {}
      if (activeUser.current === userId) setError(failure instanceof Error ? failure.message : 'No se pudieron activar las alertas.');
    } finally { setBusy(false); }
  };

  const disable = async () => {
    if (!userId || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      let subscription: PushSubscription | null = null;
      try { subscription = await localSubscription(); } catch { /* The server can disable alerts even if the browser service is unavailable. */ }
      const data = await apiRequest('/api/notifications/subscription', { method: 'DELETE', body: JSON.stringify({ expectedUserId: userId, device: await deviceHash(subscription), disableAll: true }) });
      try { await subscription?.unsubscribe(); } catch {}
      try { await bindPushAccount(null); } catch {}
      if (activeUser.current !== userId) return;
      onPreferencesRef.current(data.preferences); setEnabled(false); setSubscribed(false); dismiss(); setMessage('Alertas desactivadas.');
    } catch (failure) { if (activeUser.current === userId) setError(failure instanceof Error ? failure.message : 'No se pudieron desactivar las alertas.'); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    let subscription: PushSubscription | null = null;
    try {
      subscription = await localSubscription();
      if (userId && subscription) await apiRequest('/api/notifications/subscription', { method: 'DELETE', body: JSON.stringify({ expectedUserId: userId, device: await deviceHash(subscription) }) });
    } finally {
      try { await subscription?.unsubscribe(); } catch {}
      try { await bindPushAccount(null); } catch {}
    }
  };

  const test = async () => {
    if (!userId || busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const data = await apiRequest('/api/notifications/test', { method: 'POST', body: JSON.stringify({ expectedUserId: userId, device: await deviceHash(await localSubscription()) }) });
      if (!data.testSent) throw new Error('No se pudo confirmar el envío de prueba. Volvé a intentar en un minuto.');
      setMessage('El aviso de prueba fue aceptado para este dispositivo.'); await refresh();
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo enviar el aviso de prueba.'); }
    finally { setBusy(false); }
  };
  const markRead = async () => {
    if (!userId) return;
    try {
      await apiRequest('/api/notifications/read', { method: 'POST', body: JSON.stringify({ expectedUserId: userId }) });
      if (activeUser.current === userId) setNotifications(list => list.map(item => ({ ...item, read: true })));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudieron marcar las alertas.'); }
  };
  return { notifications: owner === userId ? notifications : [], enabled: owner === userId && enabled, active: owner === userId && subscribed, support, permission, loaded, busy, error, message, prepared: Boolean(publicKey && loaded), showPrompt: Boolean(userId && loaded && !dismissed && !subscribed), activate, disable, disconnect, test, refresh, dismiss, markRead };
}
export type AlertsController = ReturnType<typeof useAlerts>;
