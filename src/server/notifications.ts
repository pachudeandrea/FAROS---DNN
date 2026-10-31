import crypto from 'node:crypto';
import webPush from 'web-push';
import { waitUntil } from '@vercel/functions';
import type { CustomCalendarEvent, NewsItem, NotificationAlert, UserPreferences } from '../types/index.js';
import type { StoredUser } from './auth.js';
import { query, transaction } from './database.js';
import { RequestError } from './requestError.js';
import { DEFAULT_PREFERENCES } from '../data/mockData.js';
import { checkReminders } from '../utils/calendarReminders.js';
import { getNowAR } from '../utils/dateAR.js';
import { getLiveVerifiedArgentineNews } from '../utils/liveFinancialNews.js';

export const endpointHash = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const canReceive = (user: StoredUser) => user.preferences?.notificationsEnabled === true;
const badInput = (message: string) => new RequestError('NOTIFICATION_INPUT_INVALID', message, 400);
const relativeTime = (created: number) => {
  const minutes = Math.max(0, Math.floor((Date.now() - created) / 60000));
  return minutes < 1 ? 'Ahora' : minutes < 60 ? `Hace ${minutes} min` : minutes < 1440 ? `Hace ${Math.floor(minutes / 60)} h` : `Hace ${Math.floor(minutes / 1440)} días`;
};

export function backgroundNotification(task: Promise<unknown>): void {
  const guarded = task.catch(() => console.warn('[NOTIFICATIONS] No se pudo completar una actualización de alertas.'));
  if (process.env.VERCEL === '1') {
    try { waitUntil(guarded); } catch { /* Native local tests keep the process alive. */ }
  }
}

export function validateSubscription(value: any): webPush.PushSubscription {
  if (!value || typeof value.endpoint !== 'string' || value.endpoint.length > 4096) throw badInput('La suscripción de este dispositivo no es válida.');
  let url: URL;
  try { url = new URL(value.endpoint); } catch { throw badInput('La dirección del servicio de notificaciones no es válida.'); }
  const host = url.hostname.toLowerCase();
  const known = host === 'fcm.googleapis.com' || host === 'updates.push.services.mozilla.com' || host.endsWith('.push.services.mozilla.com') || host === 'web.push.apple.com' || host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com');
  if (url.protocol !== 'https:' || url.username || url.password || (url.port && url.port !== '443') || !known) throw badInput('Este servicio de notificaciones no está admitido.');
  const p256dh = value.keys?.p256dh; const auth = value.keys?.auth;
  if (typeof p256dh !== 'string' || typeof auth !== 'string' || !/^[A-Za-z0-9_-]{80,100}={0,2}$/.test(p256dh) || !/^[A-Za-z0-9_-]{20,26}={0,2}$/.test(auth)) throw badInput('Las claves de la suscripción no son válidas.');
  const publicKey = Buffer.from(p256dh, 'base64url');
  if (publicKey.length !== 65 || publicKey[0] !== 4 || Buffer.from(auth, 'base64url').length !== 16) throw badInput('Las claves de la suscripción no son válidas.');
  return { endpoint: url.href, keys: { p256dh, auth } };
}

export async function getPushKeys() {
  const current = await query('SELECT public_key, private_key FROM faros_push_credentials WHERE id = 1');
  if (current.rowCount) return current.rows[0];
  const generated = webPush.generateVAPIDKeys();
  await query('INSERT INTO faros_push_credentials (id, public_key, private_key) VALUES (1, $1, $2) ON CONFLICT (id) DO NOTHING', [generated.publicKey, generated.privateKey]);
  return (await query('SELECT public_key, private_key FROM faros_push_credentials WHERE id = 1')).rows[0];
}

export async function notificationLimit(key: string, maximum = 3): Promise<void> {
  const now = Date.now();
  const result = await query(`INSERT INTO faros_notification_limits (bucket_hash, attempts, window_started_at) VALUES ($1, 1, $2)
    ON CONFLICT (bucket_hash) DO UPDATE SET attempts = CASE WHEN faros_notification_limits.window_started_at <= $3 THEN 1 ELSE LEAST(faros_notification_limits.attempts + 1, $4) END,
    window_started_at = CASE WHEN faros_notification_limits.window_started_at <= $3 THEN $2 ELSE faros_notification_limits.window_started_at END RETURNING attempts`, [endpointHash(key), now, now - 60000, maximum + 1]);
  if (result.rows[0].attempts > maximum) throw new RequestError('NOTIFICATION_RATE_LIMITED', 'Esperá un minuto antes de volver a intentar.', 429);
}

export async function subscribeDevice(userId: string, subscription: webPush.PushSubscription): Promise<UserPreferences> {
  return transaction(async client => {
    const user = await client.query('SELECT data FROM faros_users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user.rowCount) throw new RequestError('SESSION_REQUIRED', 'Volvé a iniciar sesión.', 401);
    const preferences = { ...DEFAULT_PREFERENCES, ...user.rows[0].data.preferences, notificationsEnabled: true };
    await client.query('UPDATE faros_users SET data = data || $2::jsonb, updated_at = NOW() WHERE id = $1', [userId, JSON.stringify({ preferences, notificationsOptIn: true })]);
    await client.query(`INSERT INTO faros_push_subscriptions (endpoint_hash, user_id, subscription, updated_at) VALUES ($1, $2, $3, $4)
      ON CONFLICT (endpoint_hash) DO UPDATE SET user_id = EXCLUDED.user_id, subscription = EXCLUDED.subscription, updated_at = EXCLUDED.updated_at`, [endpointHash(subscription.endpoint), userId, JSON.stringify(subscription), Date.now()]);
    await client.query('DELETE FROM faros_push_subscriptions WHERE endpoint_hash IN (SELECT endpoint_hash FROM faros_push_subscriptions WHERE user_id = $1 ORDER BY updated_at DESC, endpoint_hash OFFSET 5)', [userId]);
    return preferences;
  });
}

export async function disconnectDevice(userId: string, device: string, disableAll: boolean): Promise<UserPreferences> {
  return transaction(async client => {
    const found = await client.query('SELECT data FROM faros_users WHERE id = $1 FOR UPDATE', [userId]);
    if (!found.rowCount) throw new RequestError('SESSION_REQUIRED', 'Volvé a iniciar sesión.', 401);
    if (device) await client.query('DELETE FROM faros_push_subscriptions WHERE user_id = $1 AND endpoint_hash = $2', [userId, device]);
    const preferences = { ...DEFAULT_PREFERENCES, ...found.rows[0].data.preferences };
    if (disableAll) {
      preferences.notificationsEnabled = false;
      await client.query('UPDATE faros_users SET data = data || $2::jsonb, updated_at = NOW() WHERE id = $1', [userId, JSON.stringify({ preferences, notificationsOptIn: false })]);
      await client.query('UPDATE faros_push_outbox o SET delivered_at = $2 FROM faros_notifications n WHERE o.notification_id = n.id AND n.user_id = $1 AND o.delivered_at IS NULL', [userId, Date.now()]);
    }
    return preferences;
  });
}

export async function getNotificationState(user: StoredUser, device = '') {
  const rows = await query('SELECT id, payload, created_at, read_at FROM faros_notifications WHERE user_id = $1 ORDER BY created_at DESC, id DESC LIMIT 50', [user.id]);
  const subscription = await query('SELECT 1 FROM faros_push_subscriptions WHERE user_id = $1 AND endpoint_hash = $2', [user.id, device]);
  const notifications: NotificationAlert[] = rows.rows.map(row => ({ ...row.payload, id: row.id, timeAgo: relativeTime(Number(row.created_at)), read: row.read_at !== null }));
  const keys = await getPushKeys();
  return { userId: user.id, notifications, enabled: canReceive(user), subscribed: Boolean(subscription.rowCount), publicKey: keys.public_key };
}

export async function markNotificationsRead(userId: string): Promise<void> {
  await query('UPDATE faros_notifications SET read_at = $2 WHERE user_id = $1 AND read_at IS NULL', [userId, Date.now()]);
}

type Alert = Omit<NotificationAlert, 'id' | 'timeAgo' | 'read'>;
async function enqueue(userId: string, eventKey: string, kind: 'news' | 'reminder' | 'test', payload: Alert, onlyDevice = '') {
  return transaction(async client => {
    const created = await client.query(`INSERT INTO faros_notifications (id, user_id, event_key, kind, payload, created_at)
      SELECT $1, id, $3, $4, $5::jsonb, $6 FROM faros_users u WHERE id = $2
        AND u.data->'preferences'->>'notificationsEnabled' = 'true'
        AND EXISTS (SELECT 1 FROM faros_push_subscriptions s WHERE s.user_id = u.id)
      ON CONFLICT (user_id, event_key) DO NOTHING RETURNING id`, [crypto.randomUUID(), userId, eventKey, kind, JSON.stringify(payload), Date.now()]);
    if (!created.rowCount) return false;
    await client.query(`INSERT INTO faros_push_outbox (notification_id, endpoint_hash)
      SELECT $1, endpoint_hash FROM faros_push_subscriptions WHERE user_id = $2 AND ($3 = '' OR endpoint_hash = $3)
      ON CONFLICT DO NOTHING`, [created.rows[0].id, userId, onlyDevice]);
    return true;
  });
}

export async function enqueueTest(userId: string, device: string): Promise<void> {
  const own = await query('SELECT 1 FROM faros_push_subscriptions WHERE user_id = $1 AND endpoint_hash = $2', [userId, device]);
  if (!own.rowCount) throw badInput('Primero activá las alertas en este dispositivo.');
  await enqueue(userId, `test:${crypto.randomUUID()}`, 'test', { title: 'Prueba de alertas de FAROS', impact: 'neutral', affectedHoldings: 'FAROS', reason: 'Aviso de prueba para comprobar las notificaciones en este dispositivo.' }, device);
}

function articleKey(item: NewsItem): string | null {
  if (item.factCheck?.status !== 'confirmado' || !item.sources?.length || !item.headline) return null;
  try {
    const url = new URL(item.sources[0].sourceUrl);
    if (!['https:', 'http:'].includes(url.protocol)) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid|gclid)/i.test(key)) url.searchParams.delete(key);
    return endpointHash(url.href);
  } catch { return null; }
}

export async function storeVerifiedArticles(news: NewsItem[]): Promise<void> {
  for (const item of news.slice(0, 30)) {
    const key = articleKey(item);
    if (!key) continue;
    await query('INSERT INTO faros_notification_articles (article_key, data, reviewed_at) VALUES ($1, $2, $3) ON CONFLICT (article_key) DO UPDATE SET data = EXCLUDED.data, reviewed_at = EXCLUDED.reviewed_at', [key, JSON.stringify(item), Date.now()]);
  }
}

export async function enqueueNews(user: StoredUser, news: NewsItem[]): Promise<void> {
  if (!canReceive(user)) return;
  const holdings = user.portfolio?.assetIds || [];
  for (const item of news.slice(0, 30)) {
    const key = articleKey(item);
    const affected = item.affectedAssetIds?.filter(id => holdings.includes(id)) || [];
    if (!key || !affected.length || !user.preferences?.enabledRelevanceTypes.includes(item.relevanceType)) continue;
    if (user.preferences.alertOnHighImpactOnly && (item.relevanceType !== 'impacto_precio' || item.impact === 'neutral')) continue;
    await enqueue(user.id, `news:${key}`, 'news', { title: item.headline.slice(0, 500), newsId: item.id, impact: item.impact, affectedHoldings: affected.join(' · '), reason: item.briefSummary.slice(0, 1500), mediaName: item.sources[0].mediaName, sourceUrl: item.sources[0].sourceUrl, publishedTime: item.sources[0].publishedTime });
  }
}

export async function publishNews(user: StoredUser, news: NewsItem[]): Promise<void> {
  await storeVerifiedArticles(news);
  await enqueueNews(user, news);
  await sendPendingPush(user.id);
}

export function validateCalendar(value: unknown): CustomCalendarEvent[] {
  if (!Array.isArray(value) || value.length > 100) throw badInput('Podés guardar hasta 100 recordatorios.');
  const ids = new Set<string>();
  return value.map(event => {
    if (!event || typeof event.id !== 'string' || !event.id || event.id.length > 128 || ids.has(event.id)) throw badInput('Hay un recordatorio duplicado o inválido.');
    ids.add(event.id);
    if (typeof event.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(event.date) || !Number.isFinite(Date.parse(event.date)) || new Date(event.date).toISOString().slice(0, 10) !== event.date) throw badInput('La fecha del recordatorio no es válida.');
    if (typeof event.assetSymbol !== 'string' || !event.assetSymbol.trim() || event.assetSymbol.length > 32 || !['comprar', 'vender', 'cobro', 'otro'].includes(event.action)) throw badInput('Revisá el activo y la acción del recordatorio.');
    if (event.note !== undefined && (typeof event.note !== 'string' || event.note.length > 500)) throw badInput('La nota admite hasta 500 caracteres.');
    if (!Array.isArray(event.reminders) || event.reminders.some((r: string) => !['same_day', '1_day_before', '3_days_before', '1_week_before'].includes(r))) throw badInput('La anticipación del recordatorio no es válida.');
    if (event.time !== undefined && event.time !== '' && (typeof event.time !== 'string' || !/^(?:[01][0-9]|2[0-3]):[0-5][0-9]$/.test(event.time))) throw badInput('La hora del recordatorio no es válida.');
    return { id: event.id, date: event.date, time: event.time || undefined, remindedTimes: Array.isArray(event.remindedTimes) ? event.remindedTimes.filter((id: unknown) => typeof id === 'string' && id.length < 256).slice(0, 100) : undefined, assetSymbol: event.assetSymbol.trim().toUpperCase(), action: event.action, note: event.note || '', reminders: [...new Set(event.reminders)] as CustomCalendarEvent['reminders'], createdAt: typeof event.createdAt === 'number' && Number.isFinite(event.createdAt) ? event.createdAt : Date.now() };
  });
}

export async function getReminderCalendar(userId: string): Promise<CustomCalendarEvent[]> {
  return (await query('SELECT events FROM faros_notification_calendars WHERE user_id = $1', [userId])).rows[0]?.events || [];
}

export async function saveReminderCalendar(userId: string, events: CustomCalendarEvent[]): Promise<void> {
  await transaction(async client => {
    const user = await client.query('SELECT id FROM faros_users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user.rowCount) throw new RequestError('SESSION_REQUIRED', 'Volvé a iniciar sesión.', 401);
    await client.query('INSERT INTO faros_notification_calendars (user_id, events, updated_at) VALUES ($1, $2, $3) ON CONFLICT (user_id) DO UPDATE SET events = EXCLUDED.events, updated_at = EXCLUDED.updated_at', [userId, JSON.stringify(events), Date.now()]);
    await client.query(`UPDATE faros_push_outbox o SET delivered_at = $3 FROM faros_notifications n
      WHERE n.id = o.notification_id AND n.user_id = $1 AND n.kind = 'reminder' AND o.delivered_at IS NULL
        AND NOT ((n.payload->>'calendarEventId') = ANY($2::text[]))`, [userId, events.map(event => event.id), Date.now()]);
  });
}

export async function enqueueReminders(user: StoredUser, at = new Date()): Promise<void> {
  if (!canReceive(user)) return;
  // The scheduler always uses actual time, never the UI's simulated date offset.
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(at);
  const realNow = { ...getNowAR(), isoDate: parts };
  const events = await getReminderCalendar(user.id);
  for (const reminder of checkReminders(events, realNow)) {
    await enqueue(user.id, `reminder:${endpointHash(reminder.id)}`, 'reminder', { title: reminder.title, calendarEventId: reminder.eventId, impact: reminder.isUrgent ? 'alerta' : 'neutral', affectedHoldings: reminder.assetSymbol, reason: reminder.message, publishedTime: reminder.eventDate });
  }
}

export async function sendPendingPush(userId: string, onlyDevice = ''): Promise<boolean> {
  const found = await query('SELECT data FROM faros_users WHERE id = $1', [userId]);
  if (!found.rowCount || !canReceive(found.rows[0].data)) return false;
  const devices = await query('SELECT endpoint_hash, subscription FROM faros_push_subscriptions WHERE user_id = $1 AND ($2 = \'\' OR endpoint_hash = $2)', [userId, onlyDevice]);
  if (!devices.rowCount) return false;
  const keys = await getPushKeys();
  let sent = false;
  await Promise.all(devices.rows.map(async device => {
    const now = Date.now();
    const claimed = await query(`UPDATE faros_push_outbox SET lease_until = $2, attempts = attempts + 1
      WHERE (notification_id, endpoint_hash) IN (
        SELECT o.notification_id, o.endpoint_hash FROM faros_push_outbox o JOIN faros_notifications n ON n.id = o.notification_id
        WHERE o.endpoint_hash = $1 AND n.user_id = $3 AND o.delivered_at IS NULL AND o.lease_until < $4 AND o.attempts < 3
          AND n.created_at > $5 ORDER BY n.created_at DESC LIMIT 30 FOR UPDATE OF o SKIP LOCKED)
      RETURNING notification_id`, [device.endpoint_hash, now + 30000, userId, now, now - 24 * 3600000]);
    if (!claimed.rowCount) return;
    const ids = claimed.rows.map(row => row.notification_id);
    const alerts = await query('SELECT id, kind, payload FROM faros_notifications WHERE user_id = $1 AND id = ANY($2::text[]) ORDER BY created_at DESC, id DESC', [userId, ids]);
    const first = alerts.rows[0];
    const title = alerts.rowCount === 1 ? first.payload.title : `${alerts.rowCount} alertas de FAROS`;
    const body = alerts.rowCount === 1 && first.kind === 'test' ? first.payload.reason : alerts.rowCount === 1 ? `${first.payload.affectedHoldings} · ${first.payload.title}` : first.payload.title;
    const url = alerts.rows.every(row => row.kind === 'reminder') ? '/?tab=calendar' : '/?alerts=1';
    try {
      await webPush.sendNotification(device.subscription, JSON.stringify({ id: first.id, userId, title, body: body.slice(0, 240), url, tag: `faros-${first.id}` }), {
        vapidDetails: { subject: 'https://faros-dnn.vercel.app', publicKey: keys.public_key, privateKey: keys.private_key }, TTL: 86400, urgency: 'normal', timeout: 4000
      });
      await query('UPDATE faros_push_outbox SET delivered_at = $3, lease_until = 0 WHERE endpoint_hash = $1 AND notification_id = ANY($2::text[])', [device.endpoint_hash, ids, Date.now()]);
      sent = true;
    } catch (error) {
      const status = Number((error as { statusCode?: number })?.statusCode) || 0;
      console.warn(`[NOTIFICATIONS] push_status=${status || 'transport_error'}`);
      if (status === 404 || status === 410) await query('DELETE FROM faros_push_subscriptions WHERE user_id = $1 AND endpoint_hash = $2', [userId, device.endpoint_hash]);
      else await query('UPDATE faros_push_outbox SET lease_until = 0 WHERE endpoint_hash = $1 AND notification_id = ANY($2::text[])', [device.endpoint_hash, ids]);
    }
  }));
  return sent;
}

export function notificationJobSlot(at: Date): string | null {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(at);
  const part = (type: string) => parts.find(value => value.type === type)!.value;
  const hour = Number(part('hour'));
  return hour < 9 ? null : `${part('year')}-${part('month')}-${part('day')}:${hour < 17 ? 'morning' : 'evening'}`;
}

/** This endpoint can only request the already-due daily job. The date, content,
 * recipients and slots come from the server. Durable leases allow at most one
 * successful run per slot and bounded retries, even for unauthenticated calls. */
export async function runDailyNotifications(at = new Date(), loadFresh = getLiveVerifiedArgentineNews): Promise<void> {
  const slot = notificationJobSlot(at);
  if (!slot) return;
  const now = Date.now();
  const lease = await query(`INSERT INTO faros_notification_jobs (job_key, lease_until) VALUES ($1, $2)
    ON CONFLICT (job_key) DO UPDATE SET lease_until = EXCLUDED.lease_until, attempts = faros_notification_jobs.attempts + 1
    WHERE faros_notification_jobs.completed_at IS NULL AND faros_notification_jobs.lease_until < $3 AND faros_notification_jobs.attempts < 3 RETURNING job_key`, [slot, now + 60000, now]);
  if (!lease.rowCount) return;
  try {
    const accounts = await query("SELECT u.data FROM faros_users u WHERE u.data->'preferences'->>'notificationsEnabled' = 'true' AND EXISTS (SELECT 1 FROM faros_push_subscriptions s WHERE s.user_id = u.id)");
    if (accounts.rowCount) {
      const tickers = [...new Set(accounts.rows.flatMap(row => row.data.portfolio?.assetIds || []))].slice(0, 100) as string[];
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const fresh = await Promise.race([loadFresh(tickers).catch(() => []), new Promise<NewsItem[]>(resolve => { timer = setTimeout(() => resolve([]), 12000); })]);
        await storeVerifiedArticles(fresh);
      } finally { clearTimeout(timer); }
      const articles = (await query('SELECT data FROM faros_notification_articles WHERE reviewed_at > $1 ORDER BY reviewed_at DESC LIMIT 40', [now - 48 * 3600000])).rows.map(row => row.data as NewsItem);
      for (const row of accounts.rows) { await enqueueReminders(row.data, at); await enqueueNews(row.data, articles); }
      // Bounded parallel fanout; each account holds at most five devices.
      for (let index = 0; index < accounts.rows.length; index += 5) await Promise.all(accounts.rows.slice(index, index + 5).map(row => sendPendingPush(row.data.id)));
    }
    await query('UPDATE faros_notification_jobs SET completed_at = $2 WHERE job_key = $1', [slot, Date.now()]);
    await query('DELETE FROM faros_notification_articles WHERE reviewed_at < $1', [now - 48 * 3600000]);
    await query('DELETE FROM faros_notifications WHERE created_at < $1', [now - 30 * 86400000]);
    await query('DELETE FROM faros_notification_jobs WHERE lease_until < $1', [now - 7 * 86400000]);
  } catch {
    await query('UPDATE faros_notification_jobs SET lease_until = 0 WHERE job_key = $1', [slot]);
    console.warn('[NOTIFICATIONS] No se pudo completar el ciclo programado.');
  }
}
