import { randomUUID } from 'node:crypto';
import type { Express, Request, Response, NextFunction } from 'express';
import { getSessionUser } from './auth.js';
import { query, transaction } from './database.js';
import { RequestError } from './requestError.js';
import { publicationDay, publicationUrls, validLibraryNews, type LibraryEntry } from '../utils/newsLibrary.js';
import type { UserAccount, NewsItem } from '../types/index.js';
const protectedRoute = (handler: (req: Request, res: Response, user: UserAccount) => Promise<unknown>) => (req: Request, res: Response, next: NextFunction) => {
  Promise.resolve().then(async () => {
    const user = await getSessionUser(req);
    if (!user) throw new RequestError('SESSION_REQUIRED', 'Iniciá sesión para acceder a tus noticias.', 401);
    const expected = req.body?.expectedUserId || req.query.expectedUserId;
    if (expected && expected !== user.id) throw new RequestError('SESSION_CHANGED', 'La sesión cambió. Volvé a cargar FAROS.', 409);
    return handler(req, res, user);
  }).catch(next);
};
const entry = (row: any): LibraryEntry => ({ id: row.id, news: row.news, urls: row.source_urls, day: row.day, savedAt: row.saved_at?.toISOString() || null, seenAt: row.last_seen_at.toISOString() });
async function store(userId: string, news: NewsItem[], saved?: boolean): Promise<LibraryEntry[]> {
  return transaction(async client => {
    // Serialize this account's updates, including concurrent save/history requests.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('news_library:' || $1))", [userId]);
    const result: LibraryEntry[] = [];
    for (const item of news) {
      const urls = publicationUrls(item);
      const previous = await client.query('SELECT * FROM faros_news_library WHERE user_id=$1 AND source_urls && $2::text[] AND published_day=$3::date ORDER BY saved_at DESC NULLS LAST, first_seen_at LIMIT 1', [userId, urls, publicationDay(item)]);
      const old = previous.rows[0];
      if (saved === false) await client.query('UPDATE faros_news_library SET saved_at=NULL WHERE user_id=$1 AND source_urls && $2::text[] AND published_day=$3::date', [userId, urls, publicationDay(item)]);
      const id = old?.id || randomUUID();
      const savedAt = saved === true ? old?.saved_at || new Date() : saved === false ? null : old?.saved_at || null;
      // Saving is a snapshot. Later pulses may add aliases but do not rewrite it.
      const snapshot = old?.saved_at ? old.news : item;
      const day = old?.saved_at ? publicationDay(old.news, old.first_seen_at.toISOString()) : publicationDay(item);
      const written = await client.query(`INSERT INTO faros_news_library(id,user_id,news,source_urls,published_day,saved_at)
        VALUES($1,$2,$3::jsonb,$4::text[],$5::date,$6)
        ON CONFLICT(id) DO UPDATE SET news=EXCLUDED.news,source_urls=EXCLUDED.source_urls,published_day=EXCLUDED.published_day,saved_at=EXCLUDED.saved_at,last_seen_at=NOW()
        RETURNING *,published_day::text AS day`, [id, userId, JSON.stringify(snapshot), [...new Set([...(old?.source_urls || []), ...urls])], day, savedAt]);
      result.push(entry(written.rows[0]));
    }
    return result;
  });
}
export function registerNewsLibraryRoutes(app: Express) {
  app.get('/api/news/library', protectedRoute(async (req, res, user) => {
    const savedOnly = req.query.view === 'saved';
    const day = req.query.day;
    if (day !== undefined && (typeof day !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !Number.isFinite(Date.parse(day)) || new Date(day).toISOString().slice(0, 10) !== day)) throw new RequestError('INVALID_DAY', 'La fecha no es válida.', 400);
    const offset = Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new RequestError('INVALID_PAGE', 'La página no es válida.', 400);
    const [items, saved, days] = await Promise.all([
      query(`SELECT *,published_day::text AS day FROM faros_news_library WHERE user_id=$1 AND ($2::boolean=false OR saved_at IS NOT NULL) AND ($3::text IS NULL OR published_day=$3::date) AND ($5::text IS NULL OR published_day<$5::date) ORDER BY published_day DESC,first_seen_at DESC,id LIMIT 51 OFFSET $4`, [user.id, savedOnly, day || null, offset, savedOnly ? null : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())]),
      query('SELECT id,source_urls,saved_at,published_day::text AS day FROM faros_news_library WHERE user_id=$1 AND saved_at IS NOT NULL ORDER BY saved_at DESC,id', [user.id]),
      query('SELECT DISTINCT published_day::text AS day FROM faros_news_library WHERE user_id=$1 ORDER BY day DESC', [user.id])
    ]);
    return res.json({ items: items.rows.slice(0, 50).map(entry), saved: saved.rows.map(row => ({ id: row.id, day: row.day, urls: row.source_urls, savedAt: row.saved_at.toISOString() })), days: days.rows.map(row => row.day), next: items.rowCount! > 50 ? offset + 50 : null });
  }));
  app.post('/api/news/library/history', protectedRoute(async (req, res, user) => {
    const items = req.body.news;
    if (!Array.isArray(items) || items.length > 100 || !items.every(validLibraryNews)) throw new RequestError('INVALID_NEWS', 'Las noticias no son válidas.', 400);
    return res.json({ items: await store(user.id, items) });
  }));
  app.put('/api/news/library/bookmark', protectedRoute(async (req, res, user) => {
    if (!validLibraryNews(req.body.news) || typeof req.body.saved !== 'boolean') throw new RequestError('INVALID_NEWS', 'La noticia no es válida.', 400);
    const [item] = await store(user.id, [req.body.news], req.body.saved);
    const saved = await query('SELECT id,source_urls,published_day::text AS day,saved_at FROM faros_news_library WHERE user_id=$1 AND saved_at IS NOT NULL ORDER BY saved_at DESC,id', [user.id]);
    return res.json({ item, saved: saved.rows.map(row => ({ id: row.id, day: row.day, urls: row.source_urls, savedAt: row.saved_at.toISOString() })) });
  }));
}
