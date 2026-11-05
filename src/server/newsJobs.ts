import type { NewsItem } from '../types/index.js';
export interface NewsProgress { news: NewsItem[]; checkedAt: string }

/** Share work only while it is running. Completed results use the existing cache. */
export class NewsJobs<T> {
  private jobs = new Map<string, { promise: Promise<T>; subscribe: (listener: (progress: NewsProgress) => void) => () => void }>();
  getOrCreate(key: string, work: (publish: (news: NewsItem[]) => void) => Promise<T>) {
    const existing = this.jobs.get(key);
    if (existing) return existing;
    const listeners = new Set<(progress: NewsProgress) => void>();
    let latest: NewsProgress | undefined;
    const job = {
      promise: Promise.resolve().then(() => work(news => {
        if (!news.length) return;
        latest = { news, checkedAt: new Date().toISOString() };
        for (const listener of listeners) { try { listener(latest); } catch { listeners.delete(listener); } }
      })).finally(() => { if (this.jobs.get(key) === job) this.jobs.delete(key); listeners.clear(); }),
      subscribe(listener: (progress: NewsProgress) => void) {
        listeners.add(listener);
        if (latest) { try { listener(latest); } catch { listeners.delete(listener); } }
        return () => { listeners.delete(listener); };
      }
    };
    this.jobs.set(key, job);
    return job;
  }
}
