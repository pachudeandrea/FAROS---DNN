import { useCallback, useEffect, useRef, useState } from 'react';
import type { NewsItem } from '../types/index.js';
import { apiRequest } from '../utils/apiClient';
import { isActiveSaved, libraryStorageKey, mergeLibrary, publicationDay, publicationUrls, samePublication, validLibraryNews, type LibraryEntry, type LibraryPage, type SavedReference } from '../utils/newsLibrary';

interface State { owner: string; entries: LibraryEntry[]; saved: SavedReference[]; page: LibraryEntry[]; next: number | null; loading: boolean; ready: boolean; error: string | null; busy: string[] }
const empty = (owner = ''): State => ({ owner, entries: [], saved: [], page: [], next: null, loading: false, ready: owner === 'usr_demo', error: null, busy: [] });
const localEntry = (news: NewsItem, savedAt: string | null = null): LibraryEntry => ({ id: `local:${publicationDay(news)}:${publicationUrls(news)[0]}`, news, urls: publicationUrls(news), day: publicationDay(news), savedAt, seenAt: new Date().toISOString() });
export function useNewsLibrary(userId: string | undefined, view: 'latest' | 'saved') {
  const owner = userId || ''; const remote = !!owner && owner !== 'usr_demo';
  const [state, setState] = useState<State>(() => empty());
  const current = useRef(state); current.current = state;
  const ownerRef = useRef(owner); ownerRef.current = owner;
  const generation = useRef(0);
  const mutation = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const update = useCallback((change: (previous: State) => State) => {
    if (ownerRef.current !== owner) return;
    const previous = current.current.owner === owner ? current.current : empty(owner);
    const next = change(previous);
    if (remote && next.entries.length > 200) next.entries = next.entries.slice(-200);
    try { if (next.entries !== previous.entries || next.saved !== previous.saved) localStorage.setItem(libraryStorageKey(owner), JSON.stringify({ entries: next.entries, saved: next.saved })); }
    catch { next.error = next.error || 'No se pudo conservar la copia de noticias en este dispositivo.'; }
    current.current = next; setState(next);
  }, [owner, remote]);
  useEffect(() => {
    saveQueue.current = Promise.resolve();
    let initial = empty(owner);
    if (owner) try {
      const stored = JSON.parse(localStorage.getItem(libraryStorageKey(owner)) || 'null');
      if (Array.isArray(stored?.entries)) initial.entries = stored.entries.filter((entry: LibraryEntry) => validLibraryNews(entry.news) && isActiveSaved(entry.savedAt));
      if (Array.isArray(stored?.saved)) initial.saved = stored.saved.filter((entry: SavedReference) => typeof entry.id === 'string' && Array.isArray(entry.urls) && isActiveSaved(entry.savedAt));
    } catch {}
    current.current = initial; setState(initial);
  }, [owner]);
  const load = useCallback(async (offset = 0) => {
    if (!remote) return;
    const requestGeneration = generation.current;
    const requestMutation = mutation.current;
    update(previous => ({ ...previous, loading: true, error: null }));
    try {
      const params = new URLSearchParams({ expectedUserId: owner, view: 'saved', offset: String(offset) });
      const data = await apiRequest<LibraryPage>(`/api/news/library?${params}`);
      if (!Array.isArray(data.items) || !Array.isArray(data.saved)) throw new Error('No se pudieron cargar tus guardadas.');
      if (ownerRef.current !== owner || generation.current !== requestGeneration) return;
      update(previous => ({ ...previous, entries: requestMutation === mutation.current ? mergeLibrary(previous.entries, data.items) : previous.entries, saved: requestMutation === mutation.current ? data.saved : previous.saved, page: requestMutation === mutation.current ? offset ? mergeLibrary(previous.page, data.items) : data.items : previous.page, next: requestMutation === mutation.current ? data.next : previous.next, loading: false, ready: true }));
    } catch (error) { if (generation.current === requestGeneration) update(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'No se pudieron cargar tus guardadas.' })); }
  }, [owner, remote, view, update]);
  useEffect(() => { generation.current++; if (owner) void load(); }, [owner, view, load]);
  const isSaved = useCallback((news: NewsItem) => {
    const data = current.current.owner === owner ? current.current : empty(owner);
    return data.saved.some(reference => isActiveSaved(reference.savedAt) && reference.day === publicationDay(news) && reference.urls.some(url => publicationUrls(news).includes(url)));
  }, [owner]);
  const performToggle = useCallback(async (news: NewsItem) => {
    if (!owner || ownerRef.current !== owner || !validLibraryNews(news)) return;
    const urls = publicationUrls(news); const key = urls[0];
    const saved = !isSaved(news);
    mutation.current++;
    update(previous => ({ ...previous, error: null }));
    try {
      let item: LibraryEntry;
      let confirmedSaved: SavedReference[] | undefined;
      if (remote) {
        const data = await apiRequest<{ item: LibraryEntry; saved: SavedReference[] }>('/api/news/library/bookmark', { method: 'PUT', body: JSON.stringify({ expectedUserId: owner, news, saved }) });
        if (!data.item?.news || !Array.isArray(data.saved)) throw new Error('No se pudo confirmar el cambio en guardadas.');
        item = data.item; confirmedSaved = data.saved;
      } else {
        const old = current.current.entries.find(entry => entry.day === publicationDay(news) && samePublication(entry.news, news));
        item = { ...(old || localEntry(news)), savedAt: saved ? (old && isActiveSaved(old.savedAt) ? old.savedAt : new Date().toISOString()) : null };
        // In demo mode, do not report success when browser storage cannot retain it.
        const references = current.current.saved.filter(reference => reference.id !== item.id);
        if (item.savedAt) references.push({ id: item.id, day: item.day, urls: item.urls, savedAt: item.savedAt });
        localStorage.setItem(libraryStorageKey(owner), JSON.stringify({ entries: mergeLibrary(current.current.entries, [item]), saved: references }));
      }
      if (ownerRef.current !== owner) return;
      mutation.current++;
      update(previous => {
        const references = previous.saved.filter(reference => reference.id !== item.id && !(reference.day === item.day && reference.urls.some(url => urls.includes(url))));
        if (item.savedAt) references.push({ id: item.id, day: item.day, urls: item.urls, savedAt: item.savedAt });
        return { ...previous, saved: confirmedSaved || references, ready: confirmedSaved ? true : previous.ready, entries: mergeLibrary(previous.entries, [item]), page: saved ? mergeLibrary(previous.page, [item]) : previous.page.filter(entry => entry.id !== item.id && !(entry.day === item.day && samePublication(entry.news, item.news))) };
      });
    } catch (error) { update(previous => ({ ...previous, error: error instanceof Error ? error.message : 'No se pudo guardar la noticia.' })); }
    finally { update(previous => ({ ...previous, busy: previous.busy.filter(value => value !== key) })); }
  }, [owner, remote, isSaved, update, view]);
  const toggle = useCallback((news: NewsItem) => {
    const key = publicationUrls(news)[0];
    if (!key || current.current.busy.includes(key)) return Promise.resolve();
    update(previous => ({ ...previous, busy: [...previous.busy, key] }));
    const operation = saveQueue.current.then(() => performToggle(news));
    saveQueue.current = operation.catch(() => {});
    return operation;
  }, [performToggle, update]);
  const visible = state.owner === owner ? state : empty(owner);
  useEffect(() => {
    const expire = () => update(previous => {
      const saved = previous.saved.filter(reference => isActiveSaved(reference.savedAt));
      const entries = previous.entries.filter(entry => isActiveSaved(entry.savedAt));
      const page = previous.page.filter(entry => isActiveSaved(entry.savedAt));
      return { ...previous, saved, entries, page };
    });
    // Exact nearest expiry, plus focus/visibility recovery after suspended tabs.
    const expiries = visible.saved.map(reference => Date.parse(reference.savedAt) + 86400000);
    const timer = setTimeout(expire, Math.max(0, Math.min(...expiries, Date.now() + 60000) - Date.now()));
    window.addEventListener('focus', expire);
    document.addEventListener('visibilitychange', expire);
    return () => { clearTimeout(timer); window.removeEventListener('focus', expire); document.removeEventListener('visibilitychange', expire); };
  }, [visible.saved, update]);
  const activeSaved = visible.saved.filter(reference => isActiveSaved(reference.savedAt));
  const items = mergeLibrary(visible.entries, visible.page).filter(entry => isActiveSaved(entry.savedAt) && activeSaved.some(reference => reference.id === entry.id));
  return { ...visible, items, savedCount: activeSaved.length, isSaved, toggle, reload: () => load(), loadMore: () => load(visible.next || 0) };
}
