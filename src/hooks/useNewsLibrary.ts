import { useCallback, useEffect, useRef, useState } from 'react';
import type { NewsItem } from '../types/index.js';
import { apiRequest } from '../utils/apiClient';
import { libraryStorageKey, mergeLibrary, publicationDay, publicationUrls, samePublication, validLibraryNews, type LibraryEntry, type LibraryPage, type SavedReference } from '../utils/newsLibrary';

interface State { owner: string; entries: LibraryEntry[]; saved: SavedReference[]; days: string[]; page: LibraryEntry[]; pageKey: string; next: number | null; loading: boolean; ready: boolean; error: string | null; busy: string[] }
const empty = (owner = ''): State => ({ owner, entries: [], saved: [], days: [], page: [], pageKey: '', next: null, loading: false, ready: owner === 'usr_demo', error: null, busy: [] });
const localEntry = (news: NewsItem, savedAt: string | null = null): LibraryEntry => ({ id: `local:${publicationDay(news)}:${publicationUrls(news)[0]}`, news, urls: publicationUrls(news), day: publicationDay(news), savedAt, seenAt: new Date().toISOString() });
export function useNewsLibrary(userId: string | undefined, view: 'latest' | 'saved' | 'history', day: string) {
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
      if (Array.isArray(stored?.entries)) initial.entries = stored.entries.filter((entry: LibraryEntry) => validLibraryNews(entry.news));
      if (Array.isArray(stored?.saved)) initial.saved = stored.saved.filter((entry: SavedReference) => typeof entry.id === 'string' && Array.isArray(entry.urls));
      initial.days = [...new Set(initial.entries.map(entry => entry.day))].sort().reverse();
    } catch {}
    current.current = initial; setState(initial);
  }, [owner]);
  const load = useCallback(async (offset = 0) => {
    if (!remote) return;
    const requestGeneration = generation.current;
    const requestMutation = mutation.current;
    update(previous => ({ ...previous, loading: true, error: null }));
    try {
      const params = new URLSearchParams({ expectedUserId: owner, view: view === 'history' ? 'history' : 'saved', offset: String(offset) });
      if (day && view !== 'latest') params.set('day', day);
      const data = await apiRequest<LibraryPage>(`/api/news/library?${params}`);
      if (!Array.isArray(data.items) || !Array.isArray(data.saved) || !Array.isArray(data.days)) throw new Error('El archivo de noticias no respondió correctamente.');
      if (ownerRef.current !== owner || generation.current !== requestGeneration) return;
      update(previous => ({ ...previous, entries: requestMutation === mutation.current ? mergeLibrary(previous.entries, data.items) : previous.entries, saved: requestMutation === mutation.current ? data.saved : previous.saved, days: [...new Set([...previous.days, ...data.days])].sort().reverse(), page: requestMutation === mutation.current ? offset ? mergeLibrary(previous.page, data.items) : data.items : previous.page, pageKey: requestMutation === mutation.current ? `${view === 'history' ? 'history' : 'saved'}:${view === 'latest' ? '' : day}` : previous.pageKey, next: requestMutation === mutation.current ? data.next : previous.next, loading: false, ready: true }));
    } catch (error) { if (generation.current === requestGeneration) update(previous => ({ ...previous, loading: false, error: error instanceof Error ? error.message : 'No se pudo cargar el archivo de noticias.' })); }
  }, [owner, remote, view, day, update]);
  useEffect(() => { generation.current++; if (owner) void load(); }, [owner, view, day, load]);
  const remember = useCallback((news: NewsItem[]) => {
    if (!owner || !news.length) return;
    const valid = news.filter(validLibraryNews);
    update(previous => {
      const incoming = valid.map(item => previous.entries.find(entry => entry.savedAt && previous.saved.some(reference => reference.id === entry.id) && entry.day === publicationDay(item) && samePublication(entry.news, item)) || localEntry(item));
      const entries = mergeLibrary(previous.entries, incoming);
      return { ...previous, entries, days: [...new Set([...previous.days, ...entries.map(entry => entry.day)])].sort().reverse() };
    });
    if (remote) for (let offset = 0; offset < valid.length; offset += 20) {
      void apiRequest<{ items: LibraryEntry[] }>('/api/news/library/history', { method: 'POST', body: JSON.stringify({ expectedUserId: owner, news: valid.slice(offset, offset + 20) }) })
        .then(data => { if (Array.isArray(data.items)) update(previous => ({ ...previous, entries: mergeLibrary(previous.entries, data.items.filter(item => item.savedAt || !previous.saved.some(reference => reference.id === item.id))), saved: previous.saved.map(reference => { const updated = data.items.find(item => item.id === reference.id); return updated?.savedAt ? { id: updated.id, day: updated.day, savedAt: updated.savedAt, urls: updated.urls } : reference; }) })); })
        .catch(() => update(previous => ({ ...previous, error: 'Las noticias están en este dispositivo, pero no se pudo sincronizar el historial con tu cuenta.' })));
    }
  }, [owner, remote, update]);
  useEffect(() => {
    if (!remote || current.current.owner !== owner) return;
    const pending = current.current.entries.filter(entry => entry.id.startsWith('local:'));
    if (pending.length) remember(pending.map(entry => entry.news));
  }, [owner, remote, remember]);
  const isSaved = useCallback((news: NewsItem) => {
    const data = current.current.owner === owner ? current.current : empty(owner);
    return data.saved.some(reference => reference.day === publicationDay(news) && reference.urls.some(url => publicationUrls(news).includes(url)));
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
        item = { ...(old || localEntry(news)), savedAt: saved ? new Date().toISOString() : null };
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
        return { ...previous, saved: confirmedSaved || references, ready: confirmedSaved ? true : previous.ready, entries: mergeLibrary(previous.entries, [item]), page: previous.pageKey.startsWith('saved:') ? saved ? mergeLibrary(previous.page, [item]) : previous.page.filter(entry => entry.id !== item.id && !(entry.day === item.day && samePublication(entry.news, item.news))) : previous.page };
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
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
  const cached = visible.entries.filter(entry => view === 'saved' ? visible.saved.some(saved => saved.id === entry.id || saved.day === entry.day && saved.urls.some(url => publicationUrls(entry.news).includes(url))) : entry.day < today).filter(entry => !day || entry.day === day);
  const retry = async () => {
    if (remote) try {
      const entries = current.current.owner === owner ? current.current.entries : [];
      for (let offset = 0; offset < entries.length; offset += 20) await apiRequest('/api/news/library/history', { method: 'POST', body: JSON.stringify({ expectedUserId: owner, news: entries.slice(offset, offset + 20).map(entry => entry.news) }) });
    } catch { update(previous => ({ ...previous, error: 'No se pudo sincronizar tu archivo. Las copias locales siguen disponibles.' })); return; }
    await load();
  };
  return { ...visible, items: (remote && !visible.error && !visible.loading && visible.pageKey === `${view === 'history' ? 'history' : 'saved'}:${view === 'latest' ? '' : day}` ? mergeLibrary(visible.page, cached.filter(entry => entry.id.startsWith('local:'))) : cached).filter(entry => view === 'saved' ? visible.saved.some(saved => saved.id === entry.id || saved.day === entry.day && saved.urls.some(url => (entry.urls || publicationUrls(entry.news)).includes(url))) : entry.day < today).filter(entry => !day || entry.day === day), savedCount: visible.saved.length, isSaved, toggle, remember, reload: retry, loadMore: () => load(visible.next || 0), today };
}
