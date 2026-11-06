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
async function store(userId: string, news: NewsItem[], saved: boolean): Promise<LibraryEntry[]> {
  return transaction(async client => {
    // Serialize bookmarks and remove expired snapshots before matching aliases.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('news_library:' || $1))", [userId]);
    await client.query("DELETE FROM faros_news_library WHERE user_id=$1 AND (saved_at IS NULL OR saved_at <= NOW() - INTERVAL '24 hours')", [userId]);
    const result: LibraryEntry[] = [];
    for (const item of news) {
      const urls = publicationUrls(item);
      const previous = await client.query('SELECT * FROM faros_news_library WHERE user_id=$1 AND source_urls && $2::text[] AND published_day=$3::date ORDER BY saved_at DESC NULLS LAST, first_seen_at LIMIT 1', [userId, urls, publicationDay(item)]);
      const old = previous.rows[0];
      if (saved === false) {
        await client.query('DELETE FROM faros_news_library WHERE user_id=$1 AND source_urls && $2::text[] AND published_day=$3::date', [userId, urls, publicationDay(item)]);
        result.push({ id: old?.id || randomUUID(), news: old?.news || item, urls, day: publicationDay(item), savedAt: null, seenAt: new Date().toISOString() });
        continue;
      }
      const id = old?.id || randomUUID();
      const savedAt = old?.saved_at || new Date();
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
    const offset = Number(req.query.offset || 0);
    if (!Number.isSafeInteger(offset) || offset < 0 || offset > 1000000) throw new RequestError('INVALID_PAGE', 'La página no es válida.', 400);
    await query("DELETE FROM faros_news_library WHERE user_id=$1 AND (saved_at IS NULL OR saved_at <= NOW() - INTERVAL '24 hours')", [user.id]);
    const [items, saved] = await Promise.all([
      query("SELECT *,published_day::text AS day FROM faros_news_library WHERE user_id=$1 AND saved_at > NOW() - INTERVAL '24 hours' ORDER BY saved_at DESC,id LIMIT 51 OFFSET $2", [user.id, offset]),
      query("SELECT id,source_urls,saved_at,published_day::text AS day FROM faros_news_library WHERE user_id=$1 AND saved_at > NOW() - INTERVAL '24 hours' ORDER BY saved_at DESC,id", [user.id])
    ]);
    return res.json({ items: items.rows.slice(0, 50).map(entry), saved: saved.rows.map(row => ({ id: row.id, day: row.day, urls: row.source_urls, savedAt: row.saved_at.toISOString() })), days: [], next: items.rowCount! > 50 ? offset + 50 : null });
  }));
  app.put('/api/news/library/bookmark', protectedRoute(async (req, res, user) => {
    if (!validLibraryNews(req.body.news) || typeof req.body.saved !== 'boolean') throw new RequestError('INVALID_NEWS', 'La noticia no es válida.', 400);
    const [item] = await store(user.id, [req.body.news], req.body.saved);
    const saved = await query('SELECT id,source_urls,published_day::text AS day,saved_at FROM faros_news_library WHERE user_id=$1 AND saved_at > NOW() - INTERVAL \'24 hours\' ORDER BY saved_at DESC,id', [user.id]);
    return res.json({ item, saved: saved.rows.map(row => ({ id: row.id, day: row.day, urls: row.source_urls, savedAt: row.saved_at.toISOString() })) });
  }));
}
