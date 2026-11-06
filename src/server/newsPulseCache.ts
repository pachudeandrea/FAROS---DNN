import { createHash } from 'node:crypto';
import { Pool } from 'pg';
import { databaseConfig } from './database.js';
import { NEWS_CACHE_VERSION } from '../utils/newsCache.js';
import { validLibraryNews } from '../utils/newsLibrary.js';
import type { NewsItem } from '../types/index.js';

export interface PulseSnapshot { news: NewsItem[]; timestamp: number; hourKey: string }
const MAX_AGE_MS = 2 * 60 * 60 * 1000;
let cachePool: Pool | undefined;
let retryAfter = 0;

// Portfolio IDs and account identifiers do not affect the generated news. The
// full selection, profile, positions, custom metadata and format version do.
export const pulseSelectionKey = (scope: string) => createHash('sha256').update(`${NEWS_CACHE_VERSION}:${scope}`).digest('hex');

export function usablePulseSnapshot(value: PulseSnapshot, now = Date.now()): PulseSnapshot | null {
  if (!Number.isFinite(value.timestamp) || value.timestamp > now || now - value.timestamp > MAX_AGE_MS || !Array.isArray(value.news)) return null;
  if (!value.news.every(validLibraryNews)) return null;
  const news = value.news.map(item => ({ ...item, sources: item.sources.filter(source => {
    const at = source.publishedTimestamp ?? Date.parse(source.publishedDateIso || '');
    return Number.isFinite(at) && at >= now - 48 * 3600000 && at <= now + 5 * 60000;
  }) })).filter(item => item.sources.length).map(item => ({ ...item, coverageCount: item.sources.length }));
  // Do not turn a snapshot whose publications aged out into a completed empty query.
  if (value.news.length && !news.length) return null;
  return { ...value, news };
}

function pool(forWrite = false): Pool | null {
  if (!forWrite && Date.now() < retryAfter) return null;
  if (cachePool) return cachePool;
  const url = (process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL || process.env.POSTGRES_URL_NON_POOLING || '').trim();
  if (!url) return null;
  try {
    // Cache availability must not hold up the independent source pipeline. A
    // separate one-connection pool bounds both checkout/connect and SQL waits.
    cachePool = new Pool({ ...databaseConfig(url), max: 1, connectionTimeoutMillis: 200, statement_timeout: 200, query_timeout: 200, idleTimeoutMillis: 10000 });
    cachePool.on('error', () => { retryAfter = Date.now() + 30000; });
    return cachePool;
  } catch { retryAfter = Date.now() + 30000; return null; }
}

export async function readPulseSnapshot(scope: string): Promise<PulseSnapshot | null> {
  const client = pool(); if (!client) return null;
  try {
    const result = await client.query(`SELECT hour_key,news,checked_at FROM faros_news_pulse_cache
      WHERE selection_key=$1 AND checked_at >= NOW()-INTERVAL '2 hours' AND checked_at <= NOW()
      ORDER BY checked_at DESC LIMIT 1`, [pulseSelectionKey(scope)]);
    const row = result.rows[0];
    return row ? usablePulseSnapshot({ hourKey: row.hour_key, news: row.news, timestamp: row.checked_at.getTime() }) : null;
  } catch { retryAfter = Date.now() + 30000; return null; }
}

export async function writePulseSnapshot(scope: string, snapshot: PulseSnapshot): Promise<void> {
  // A read may time out while a serverless database wakes. Retry the write at
  // collection completion so that one cold read cannot prevent seeding it.
  const client = pool(true); if (!client || !usablePulseSnapshot(snapshot)) return;
  try {
    await client.query(`INSERT INTO faros_news_pulse_cache(selection_key,hour_key,news,checked_at)
      VALUES($1,$2,$3::jsonb,$4) ON CONFLICT(selection_key,hour_key) DO UPDATE
      SET news=EXCLUDED.news,checked_at=EXCLUDED.checked_at
      WHERE faros_news_pulse_cache.checked_at <= EXCLUDED.checked_at`, [pulseSelectionKey(scope), snapshot.hourKey, JSON.stringify(snapshot.news), new Date(snapshot.timestamp)]);
    retryAfter = 0;
    // This cache has no account history and retains at most two hours of results.
    void client.query("DELETE FROM faros_news_pulse_cache WHERE checked_at < NOW()-INTERVAL '2 hours'").catch(() => {});
  } catch { retryAfter = Date.now() + 30000; }
}
