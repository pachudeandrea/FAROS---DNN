import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NewsItem } from '../types/index.js';
import { argentinaNewsDay, argentinaNewsHour, mergeDailyNews, nextNewsHourDelay } from '../utils/dailyNews.js';
import { normalizeNewsError, readNewsResponse } from '../utils/newsResponse.js';
import { selectTourNews } from '../utils/tourNews.js';

export type TourNewsStatus = 'loading' | 'ready' | 'empty' | 'error';
interface TourCollection { day: string; news: NewsItem[]; status: TourNewsStatus; error?: string }
const FEED_GRACE_MS = 1200;
const SAMPLE_TIMEOUT_MS = 12000;

/** A public sample independent of the account's holdings, filters and cache. */
export function useTourNews(active: boolean, feed: NewsItem[]) {
  const [hour, setHour] = useState(() => argentinaNewsHour());
  const [attempt, setAttempt] = useState(0);
  const [collection, setCollection] = useState<TourCollection>(() => ({ day: argentinaNewsDay(), news: [], status: 'loading' }));
  const day = hour.slice(0, 10);
  const feedSample = useMemo(() => selectTourNews(feed, day), [feed, day]);
  const collectedSample = useMemo(() => collection.day === day ? selectTourNews(collection.news, day) : undefined, [collection, day]);
  const sample = collectedSample || feedSample;
  const hasSample = !!sample;

  // Refresh hourly, including precisely at Argentina midnight. A background tab
  // also checks the date as soon as it becomes visible or regains focus.
  useEffect(() => {
    if (!active) return;
    let timer: ReturnType<typeof setTimeout>;
    const synchronize = () => {
      clearTimeout(timer);
      setHour(argentinaNewsHour());
      timer = setTimeout(synchronize, nextNewsHourDelay());
    };
    synchronize();
    window.addEventListener('focus', synchronize);
    document.addEventListener('visibilitychange', synchronize);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('focus', synchronize);
      document.removeEventListener('visibilitychange', synchronize);
    };
  }, [active]);

  useEffect(() => {
    // A verified article already on screen (or collected earlier in this guide)
    // is enough. Do not start another full pulse or wait for its completion.
    if (!active || day !== argentinaNewsDay() || hasSample) return;
    const controller = new AbortController();
    let disposed = false;
    let timedOut = false;
    const requestDay = day;
    let accumulated: NewsItem[] = [];
    const current = () => !disposed && requestDay === argentinaNewsDay();
    setCollection(previous => ({ day, news: previous.day === day ? previous.news : [], status: 'loading' }));
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const accept = (news: NewsItem[], complete = false) => {
      if (!current()) return;
      accumulated = mergeDailyNews(accumulated, news, requestDay);
      setCollection(previous => {
        const items = mergeDailyNews(previous.day === requestDay ? previous.news : [], accumulated, requestDay);
        return { day: requestDay, news: items, status: selectTourNews(items, requestDay) ? 'ready' : complete ? 'empty' : 'loading' };
      });
    };
    // Give the regular feed a short head start. New accounts are often loading
    // the same general pulse, and a progress frame can already supply the guide.
    const start = setTimeout(() => { void (async () => {
      try {
        timeout = setTimeout(() => { timedOut = true; controller.abort(); }, SAMPLE_TIMEOUT_MS);
        const response = await fetch('/api/news/pulse', {
          method: 'POST', credentials: 'same-origin', signal: controller.signal,
          headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
          body: JSON.stringify({ portfolioId: 'tour-general', tickers: [], profile: 'moderado' }),
        });
        const data = await readNewsResponse(response, progress => accept(progress.news));
        accept(data.news, true);
      } catch (error) {
        if (!current()) return;
        const message = normalizeNewsError(error, timedOut).message;
        setCollection(previous => ({ ...previous, status: selectTourNews(previous.news, requestDay) ? 'ready' : 'error', error: message }));
      } finally { clearTimeout(timeout); }
    })(); }, FEED_GRACE_MS);
    return () => { disposed = true; clearTimeout(start); clearTimeout(timeout); controller.abort(); };
  }, [active, day, hour, attempt, hasSample]);
  const retry = useCallback(() => { setHour(argentinaNewsHour()); setAttempt(value => value + 1); }, []);
  return {
    day,
    sample: active && day === argentinaNewsDay() ? sample : undefined,
    status: sample ? 'ready' as const : collection.day === day ? collection.status : 'loading' as const,
    error: collection.day === day ? collection.error : undefined,
    retry,
  };
}
