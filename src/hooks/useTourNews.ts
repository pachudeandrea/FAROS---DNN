import { useCallback, useEffect, useMemo, useState } from 'react';
import type { NewsItem } from '../types/index.js';
import { argentinaNewsDay, argentinaNewsHour, mergeDailyNews, nextNewsHourDelay } from '../utils/dailyNews.js';
import { normalizeNewsError, readNewsResponse } from '../utils/newsResponse.js';
import { selectTourNews } from '../utils/tourNews.js';

export type TourNewsStatus = 'loading' | 'ready' | 'empty' | 'error';
interface TourCollection { day: string; news: NewsItem[]; status: TourNewsStatus; error?: string }

/** A public sample independent of the account's holdings, filters and cache. */
export function useTourNews(active: boolean, feed: NewsItem[]) {
  const [hour, setHour] = useState(() => argentinaNewsHour());
  const [attempt, setAttempt] = useState(0);
  const [collection, setCollection] = useState<TourCollection>(() => ({ day: argentinaNewsDay(), news: [], status: 'loading' }));
  const day = hour.slice(0, 10);

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
    if (!active || day !== argentinaNewsDay()) return;
    const controller = new AbortController();
    let disposed = false;
    let timedOut = false;
    const requestDay = day;
    let accumulated: NewsItem[] = [];
    const current = () => !disposed && requestDay === argentinaNewsDay();
    setCollection(previous => ({ day, news: previous.day === day ? previous.news : [], status: 'loading' }));
    const timeout = setTimeout(() => { timedOut = true; controller.abort(); }, 65000);
    const accept = (news: NewsItem[], complete = false) => {
      if (!current()) return;
      accumulated = mergeDailyNews(accumulated, news, requestDay);
      setCollection(previous => {
        const items = mergeDailyNews(previous.day === requestDay ? previous.news : [], accumulated, requestDay);
        return { day: requestDay, news: items, status: selectTourNews(items, requestDay) ? 'ready' : complete ? 'empty' : 'loading' };
      });
    };
    void (async () => {
      try {
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
    })();
    return () => { disposed = true; clearTimeout(timeout); controller.abort(); };
  }, [active, day, hour, attempt]);

  const sample = useMemo(() => selectTourNews([
    ...(collection.day === day ? collection.news : []), ...feed,
  ], day), [collection, day, feed]);
  const retry = useCallback(() => { setHour(argentinaNewsHour()); setAttempt(value => value + 1); }, []);
  return {
    day,
    sample: active && day === argentinaNewsDay() ? sample : undefined,
    status: sample ? 'ready' as const : collection.day === day ? collection.status : 'loading' as const,
    error: collection.day === day ? collection.error : undefined,
    retry,
  };
}
