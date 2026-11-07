import { createHash } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { databaseConfig } from './database.js';
import { NEWS_CACHE_VERSION } from '../utils/newsCache.js';
import { validLibraryNews } from '../utils/newsLibrary.js';
import { argentinaNewsDay, dailyNewsItems, mergeDailyNews } from '../utils/dailyNews.js';
import type { NewsItem } from '../types/index.js';

export interface PulseSnapshot { news: NewsItem[]; timestamp: number; hourKey: string }
let cachePool: Pool | undefined;
let retryAfter = 0;

// Account/portfolio IDs do not change generated news. Selection, positions,
// profile, custom metadata and format version do.
export const pulseSelectionKey = (scope: string) => createHash('sha256').update(`${NEWS_CACHE_VERSION}:${scope}`).digest('hex');

export function usablePulseSnapshot(value: PulseSnapshot, now = Date.now()): PulseSnapshot | null {
  const day = argentinaNewsDay(now);
  if (!Number.isFinite(value.timestamp) || value.timestamp > now || argentinaNewsDay(value.timestamp) !== day || !value.hourKey.startsWith(`${day}_`) || !Array.isArray(value.news)) return null;
  if (!value.news.every(validLibraryNews)) return null;
  const news = dailyNewsItems(value.news, day);
  // A previous-day publication is not a successful empty query for this day.
  if (value.news.length && !news.length) return null;
  return { ...value, news };
}

function pool(forWrite = false): Pool | null {
  if (!forWrite && Date.now() < retryAfter) return null;
  if (cachePool) return cachePool;
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || '').trim();
  if (!url) return null;
  try {
    cachePool = new Pool({ ...databaseConfig(url), max: 1, connectionTimeoutMillis: 200, statement_timeout: 200, query_timeout: 200, idleTimeoutMillis: 10000 });
    cachePool.on('error', () => { retryAfter = Date.now() + 30000; });
    return cachePool;
  } catch { retryAfter = Date.now() + 30000; return null; }
}

function combineSnapshots(previous: PulseSnapshot | null, value: PulseSnapshot, now: number): PulseSnapshot {
  return { ...value, hourKey: previous && previous.hourKey > value.hourKey ? previous.hourKey : value.hourKey,
    timestamp: Math.max(previous?.timestamp || 0, value.timestamp), news: mergeDailyNews(previous?.news || [], value.news, argentinaNewsDay(now)) };
}

function combineRows(rows: any[], now = Date.now()): PulseSnapshot | null {
  let combined: PulseSnapshot | null = null;
  for (const row of rows) {
    const value = usablePulseSnapshot({ hourKey: row.hour_key, news: row.news, timestamp: row.checked_at.getTime() }, now);
    if (!value) continue;
    combined = combineSnapshots(combined, value, now);
  }
  return combined;
}

const dailyRowsSql = `SELECT hour_key,news,checked_at FROM faros_news_pulse_cache
  WHERE selection_key=$1 AND hour_key LIKE $2 AND checked_at <= $3
  ORDER BY checked_at ASC,hour_key ASC`;

export async function readPulseSnapshot(scope: string): Promise<PulseSnapshot | null> {
  const client = pool(); if (!client) return null;
  const now = Date.now(); const day = argentinaNewsDay(now);
  try {
    const result = await client.query(dailyRowsSql, [pulseSelectionKey(scope), `${day}_%`, new Date(now)]);
    return combineRows(result.rows, now);
  } catch { retryAfter = Date.now() + 30000; return null; }
}

/** Serialize daily aggregation, including concurrent completions on other
 * instances. Only complete collections reach this function. Existing hourly
 * rows form a disposable day cache, not account history. */
export async function writePulseSnapshot(scope: string, snapshot: PulseSnapshot): Promise<PulseSnapshot | null> {
  const database = pool(true);
  const value = usablePulseSnapshot(snapshot);
  if (!database || !value) return null;
  const key = pulseSelectionKey(scope); const day = argentinaNewsDay();
  let client: PoolClient | undefined;
  try {
    client = await database.connect();
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', [`pulse:${key}:${day}`]);
    const result = await client.query(dailyRowsSql, [key, `${day}_%`, new Date()]);
    const previous = combineRows(result.rows);
    const merged = { ...value, news: mergeDailyNews(previous?.news || [], value.news, day) };
    // Midnight can occur while the database is completing its bounded work.
    if (argentinaNewsDay() !== day) { await client.query('ROLLBACK'); return null; }
    await client.query(`INSERT INTO faros_news_pulse_cache(selection_key,hour_key,news,checked_at)
      VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(selection_key,hour_key) DO UPDATE
      SET news=EXCLUDED.news,checked_at=GREATEST(faros_news_pulse_cache.checked_at,EXCLUDED.checked_at)`, [key, value.hourKey, JSON.stringify(merged.news), new Date(value.timestamp)]);
    await client.query('COMMIT');
    retryAfter = 0;
    // Retire only completed caches from previous Argentina days.
    void database.query("DELETE FROM faros_news_pulse_cache WHERE checked_at < ($1::date + TIME '03:00') AT TIME ZONE 'UTC'", [day]).catch(() => {});
    return merged;
  } catch {
    if (client) await client.query('ROLLBACK').catch(() => {});
    retryAfter = Date.now() + 30000; return null;
  } finally { client?.release(); }
}
