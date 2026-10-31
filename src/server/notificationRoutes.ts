import crypto from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import type { UserAccount } from '../types/index.js';
import { getSessionUser } from './auth.js';
import { query } from './database.js';
import { RequestError } from './requestError.js';
import { backgroundNotification, endpointHash, validateSubscription, subscribeDevice, disconnectDevice, getNotificationState, markNotificationsRead, getReminderCalendar, saveReminderCalendar, validateCalendar, enqueueReminders, sendPendingPush, enqueueTest, notificationLimit, runDailyNotifications } from './notifications.js';

const deviceFrom = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value) ? value : '';
const protectedRoute = (handler: (req: Request, res: Response, user: UserAccount) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve().then(async () => {
    const user = await getSessionUser(req);
    if (!user) throw new RequestError('SESSION_REQUIRED', 'Iniciá sesión para configurar tus alertas.', 401);
    const expected = req.body?.expectedUserId || req.query.expectedUserId;
    if (expected && expected !== user.id) throw new RequestError('SESSION_CHANGED', 'La sesión cambió. Volvé a cargar FAROS.', 409);
    return handler(req, res, user);
  }).catch(next);
};

export function registerNotificationRoutes(app: Express): void {
  app.get('/api/notifications', protectedRoute(async (req, res, user) => {
    await enqueueReminders(user);
    backgroundNotification(sendPendingPush(user.id));
    return res.json(await getNotificationState(user, deviceFrom(req.query.device)));
  }));
  app.post('/api/notifications/read', protectedRoute(async (_req, res, user) => {
    await markNotificationsRead(user.id);
    return res.json({ success: true });
  }));
  app.post('/api/notifications/subscription', protectedRoute(async (req, res, user) => {
    if (req.body?.consent !== true) throw new RequestError('NOTIFICATION_CONSENT_REQUIRED', 'Confirmá que deseás recibir alertas.', 400);
    const subscription = validateSubscription(req.body.subscription);
    await notificationLimit(`subscribe:${user.id}`);
    const preferences = await subscribeDevice(user.id, subscription);
    const device = endpointHash(subscription.endpoint);
    await enqueueTest(user.id, device);
    const testSent = await sendPendingPush(user.id, device);
    const active = await query('SELECT 1 FROM faros_push_subscriptions WHERE user_id = $1 AND endpoint_hash = $2', [user.id, device]);
    if (!active.rowCount) throw new RequestError('PUSH_SUBSCRIPTION_EXPIRED', 'La suscripción venció. Volvé a activar las alertas.', 503);
    return res.json({ success: true, preferences, subscribed: true, testSent });
  }));
  app.delete('/api/notifications/subscription', protectedRoute(async (req, res, user) => {
    const device = deviceFrom(req.body?.device);
    const disableAll = req.body?.disableAll === true;
    if (!device && !disableAll) throw new RequestError('NOTIFICATION_INPUT_INVALID', 'El dispositivo no es válido.', 400);
    const preferences = await disconnectDevice(user.id, device, disableAll);
    return res.json({ success: true, preferences });
  }));
  app.post('/api/notifications/test', protectedRoute(async (req, res, user) => {
    const device = deviceFrom(req.body?.device);
    if (!device) throw new RequestError('NOTIFICATION_INPUT_INVALID', 'Primero activá este dispositivo.', 400);
    await notificationLimit(`test:${user.id}`, 1);
    await enqueueTest(user.id, device);
    const testSent = await sendPendingPush(user.id, device);
    return res.json({ success: true, testSent });
  }));
  app.get('/api/notifications/reminders', protectedRoute(async (_req, res, user) => res.json({ events: await getReminderCalendar(user.id) })));
  app.put('/api/notifications/reminders', protectedRoute(async (req, res, user) => {
    const events = validateCalendar(req.body?.events);
    await notificationLimit(`calendar:${user.id}`, 30);
    await saveReminderCalendar(user.id, events);
    backgroundNotification(enqueueReminders(user).then(() => sendPendingPush(user.id)));
    return res.json({ success: true, events });
  }));
  app.get('/api/notifications/dispatch', (req, res, next) => {
    // Optional private scheduler authentication. Without a configured secret,
    // the server-clock job is still idempotent and rate-bounded in PostgreSQL;
    // callers cannot choose dates, recipients, payloads or create extra slots.
    const secret = process.env.CRON_SECRET;
    if (secret) {
      const actual = Buffer.from(req.get('authorization') || '');
      const expected = Buffer.from(`Bearer ${secret}`);
      if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) { res.status(401).json({ error: 'No autorizado.' }); return; }
    }
    runDailyNotifications().then(() => res.json({ ok: true })).catch(next);
  });
}
