import type { AudioTrack } from '../types/index';
import { AUDIO_CACHE_VERSION, AUDIO_VOICES, DEFAULT_AUDIO_VOICE, splitSpeechText, type ArgentineVoice } from './speechText';

export interface AudioControllerState {
  isPlaying: boolean;
  isLoading: boolean;
  currentTrack: AudioTrack | null;
  currentSeconds: number;
  totalDuration: number;
  remainingSeconds: number;
  speed: 1 | 1.25 | 1.5;
  error: string | null;
  notice: string | null;
  engine: string | null;
  voice: string | null;
  isStreaming?: boolean;
  /** Measured prefix; later positions are prepared on demand when seeking. */
  seekableDuration?: number;
  canSeek?: boolean;
  isDurationEstimated?: boolean;
  isSeeking?: boolean;
  pendingSeekSeconds?: number | null;
}

export interface EstimatedDuration { seconds: number; formatted: string; words: number; }

export function calculateEstimatedDuration(text: string, speed: number = 1): EstimatedDuration {
  if (!text) return { seconds: 0, formatted: '0:00', words: 0 };
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const seconds = Math.max(1, Math.round(Math.max(1, Math.round(words / 145 * 60)) / (speed || 1)));
  return { seconds, formatted: formatTime(seconds), words };
}

export function formatTime(seconds: number): string {
  const whole = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  return `${Math.floor(whole / 60)}:${(whole % 60).toString().padStart(2, '0')}`;
}

type Listener = (state: AudioControllerState) => void;
type Clip = { url: string; voice: string; engine: string; notice?: string; duration?: number; size: number };
type Segment = { text: string; clip?: Clip; duration?: number };
type Request = { controller: AbortController; consumers: Set<symbol>; promise: Promise<Clip>; settled: boolean };
const FETCH_TIMEOUT_MS = 16_000;
const PLAY_TIMEOUT_MS = 12_000;
const SEEK_TIMEOUT_MS = 45_000;
const CACHE_ENTRIES = 48;
const CACHE_BYTES = 8 * 1024 * 1024;
const SILENT_WAV = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
const abortError = () => Object.assign(new Error('Audio cancelado'), { name: 'AbortError' });
const validDuration = (duration: number) => Number.isFinite(duration) && duration > 0;

/** One active media element; complete, short clips are chained in their original text order. */
export class GlobalAudioController {
  private audioElement: HTMLAudioElement | null = null;
  private metadataElement: HTMLAudioElement | null = null;
  private listeners = new Set<Listener>();
  private cache = new Map<string, Clip>();
  private cacheBytes = 0;
  private requests = new Map<string, Request>();
  private sessionController: AbortController | null = null;
  private generation = 0;
  private sourceVersion = 0;
  private playAttempt = 0;
  private metadataVersion = 0;
  private playTimer: ReturnType<typeof setTimeout> | null = null;
  private metadataTimer: ReturnType<typeof setTimeout> | null = null;
  private mountTimer: ReturnType<typeof setTimeout> | null = null;
  private seekTimer: ReturnType<typeof setTimeout> | null = null;
  private metadataQueue: Promise<void> = Promise.resolve();
  private cancelMetadata: (() => void) | null = null;
  private seekController: AbortController | null = null;
  private seekVersion = 0;
  private wantsPlayback = false;
  private segments: Segment[] = [];
  private segmentIndex = 0;
  private loadedIndex = -1;
  private mountedReady = false;
  private estimatedDuration = 0;
  private playbackVoice: ArgentineVoice | null = null;
  private warmQueue: Array<{ text: string; key: string }> = [];
  private warmKeys = new Set<string>();
  private warmController: AbortController | null = null;
  private warmGeneration = 0;

  private state: AudioControllerState = {
    isPlaying: false, isLoading: false, currentTrack: null,
    currentSeconds: 0, totalDuration: 0, remainingSeconds: 0,
    speed: 1, error: null, notice: null, engine: null, voice: null,
    isStreaming: false, seekableDuration: 0, canSeek: false, isDurationEstimated: false,
    isSeeking: false, pendingSeekSeconds: null,
  };

  constructor() {
    if (typeof window === 'undefined') return;
    this.initAudioElements();
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.stopAll('background'); });
    window.addEventListener('beforeunload', () => this.stopAll('beforeunload'));
    window.addEventListener('pagehide', () => this.stopAll('pagehide'));
    window.addEventListener('keydown', event => { if (event.key === 'Escape') this.stopAll('escape'); });
  }

  private initAudioElements(): void {
    if (typeof Audio === 'undefined') throw new Error('Este dispositivo no permite reproducir audio.');
    if (!this.audioElement) { this.audioElement = new Audio(); this.audioElement.preload = 'auto'; }
    if (!this.metadataElement) { this.metadataElement = new Audio(); this.metadataElement.preload = 'metadata'; }
  }

  public getState(): AudioControllerState { return { ...this.state }; }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => { this.listeners.delete(listener); };
  }

  private emit(): void {
    const state = this.getState();
    for (const listener of this.listeners) {
      try { listener(state); } catch (error) { console.error('Error in audio controller listener:', error); }
    }
  }

  private clearPlayTimer(): void {
    if (this.playTimer !== null) clearTimeout(this.playTimer);
    this.playTimer = null;
  }

  private releaseMedia(audio: HTMLAudioElement | null): void {
    if (!audio) return;
    audio.onended = audio.onerror = audio.ontimeupdate = audio.onloadedmetadata = null;
    audio.onplaying = audio.onwaiting = audio.onstalled = audio.ondurationchange = null;
    try {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
    } catch { /* Already detached. */ }
  }

  private resetPlayback(): void {
    // IDs are not cancellation tokens: the same summary ID may contain new text.
    ++this.generation;
    ++this.sourceVersion;
    ++this.playAttempt;
    ++this.seekVersion;
    this.seekController?.abort();
    this.seekController = null;
    this.cancelMetadata?.();
    this.cancelMetadata = null;
    this.metadataQueue = Promise.resolve();
    ++this.metadataVersion;
    this.wantsPlayback = false;
    this.sessionController?.abort();
    this.sessionController = null;
    this.clearPlayTimer();
    if (this.mountTimer !== null) clearTimeout(this.mountTimer);
    this.mountTimer = null;
    if (this.seekTimer !== null) clearTimeout(this.seekTimer);
    this.seekTimer = null;
    if (this.metadataTimer !== null) clearTimeout(this.metadataTimer);
    this.metadataTimer = null;
    this.releaseMedia(this.audioElement);
    this.releaseMedia(this.metadataElement);
    this.segments = [];
    this.segmentIndex = 0;
    this.loadedIndex = -1;
    this.mountedReady = false;
    this.estimatedDuration = 0;
    this.playbackVoice = null;
    this.state = {
      ...this.state, isPlaying: false, isLoading: false, currentTrack: null,
      currentSeconds: 0, totalDuration: 0, remainingSeconds: 0,
      error: null, notice: null, engine: null, voice: null, isStreaming: false,
      seekableDuration: 0, canSeek: false, isDurationEstimated: false,
      isSeeking: false, pendingSeekSeconds: null,
    };
  }

  public stopAll(_reason: string = 'manual'): void {
    this.resetPlayback();
    ++this.warmGeneration;
    this.warmController?.abort();
    this.warmController = null;
    this.warmQueue = [];
    this.warmKeys.clear();
    this.emit();
  }

  public clearError(): void { this.state.error = null; this.state.notice = null; this.emit(); }

  private cacheKey(text: string, voice: string = DEFAULT_AUDIO_VOICE): string {
    return `${AUDIO_CACHE_VERSION}\u0000${voice}\u0000${text}`;
  }

  private cached(text: string, voice: string = DEFAULT_AUDIO_VOICE): Clip | undefined {
    const key = this.cacheKey(text, voice);
    const clip = this.cache.get(key);
    if (clip) { this.cache.delete(key); this.cache.set(key, clip); }
    return clip;
  }

  private storeClip(text: string, clip: Clip): void {
    if (clip.size > CACHE_BYTES) return;
    // A temporary alternate voice must not overwrite the preferred Argentine voice.
    const key = this.cacheKey(text, clip.voice);
    const previous = this.cache.get(key);
    if (previous) this.cacheBytes -= previous.size;
    this.cache.delete(key);
    this.cache.set(key, clip);
    this.cacheBytes += clip.size;
    while (this.cache.size > CACHE_ENTRIES || this.cacheBytes > CACHE_BYTES) {
      const oldest = this.cache.entries().next().value;
      if (!oldest) break;
      this.cache.delete(oldest[0]);
      this.cacheBytes -= oldest[1].size;
    }
    // Keep segment references within the same bounds as the shared clip cache.
    for (const segment of this.segments) {
      if (segment.clip && !this.cache.has(this.cacheKey(segment.text, segment.clip.voice))) segment.clip = undefined;
    }
  }

  private async synthesize(text: string, controller: AbortController, lowPriority: boolean, voice: ArgentineVoice, allowVoiceFallback: boolean): Promise<Clip> {
    let timer: ReturnType<typeof setTimeout>;
    let removeAbort = () => {};
    const deadline = new Promise<never>((_, reject) => {
      const onAbort = () => reject(abortError());
      controller.signal.addEventListener('abort', onAbort, { once: true });
      removeAbort = () => controller.signal.removeEventListener('abort', onAbort);
      timer = setTimeout(() => {
        reject(new Error('La preparación del audio tardó demasiado. Volvé a intentar.'));
        controller.abort();
      }, FETCH_TIMEOUT_MS);
    });
    const download = async (): Promise<Clip> => {
      const response = await fetch('/api/audio/synthesize', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text, voice, allowVoiceFallback }), signal: controller.signal,
        ...(lowPriority ? { priority: 'low' } : {}),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'El audio no está disponible en este momento.');
      if (controller.signal.aborted) throw abortError();
      if (!AUDIO_VOICES.includes(data.voice) || !allowVoiceFallback && data.voice !== voice) {
        throw new Error('No se pudo mantener la voz de este audio. Tocá Reintentar.');
      }
      const mimeType = data.mimeType || 'audio/mpeg';
      if (typeof data.audioBase64 !== 'string' || !data.audioBase64.length || !/^audio\/[a-z0-9.+-]+$/i.test(mimeType)) {
        throw new Error('El servidor no devolvió un audio completo. Volvé a intentar.');
      }
      return {
        url: `data:${mimeType};base64,${data.audioBase64}`,
        voice: data.voice, engine: data.engine || 'Voz neuronal argentina',
        notice: typeof data.notice === 'string' ? data.notice : undefined, size: data.audioBase64.length * 2,
      };
    };
    try { return await Promise.race([download(), deadline]); }
    finally { clearTimeout(timer!); removeAbort(); }
  }

  /** Shared requests have independent subscribers; cancelling one cannot revive its player. */
  private requestClip(text: string, signal: AbortSignal, lowPriority = false, voice: ArgentineVoice = DEFAULT_AUDIO_VOICE, allowVoiceFallback = true): Promise<Clip> {
    if (signal.aborted) return Promise.reject(abortError());
    const cached = this.cached(text, voice);
    if (cached) return Promise.resolve(cached);
    const key = `${this.cacheKey(text, voice)}\u0000${allowVoiceFallback ? 'initial' : 'fixed'}`;
    let request = this.requests.get(key);
    if (!request || request.controller.signal.aborted) {
      const created: Request = { controller: new AbortController(), consumers: new Set(), settled: false, promise: null! };
      created.promise = this.synthesize(text, created.controller, lowPriority, voice, allowVoiceFallback).then(clip => {
        if (created.controller.signal.aborted) throw abortError();
        this.storeClip(text, clip);
        return clip;
      }).finally(() => {
        created.settled = true;
        if (this.requests.get(key) === created) this.requests.delete(key);
      });
      this.requests.set(key, created);
      request = created;
    }
    const current = request;
    const consumer = Symbol();
    current.consumers.add(consumer);
    return new Promise((resolve, reject) => {
      const release = () => {
        signal.removeEventListener('abort', onAbort);
        current.consumers.delete(consumer);
        if (!current.settled && current.consumers.size === 0) current.controller.abort();
      };
      const onAbort = () => { release(); reject(abortError()); };
      signal.addEventListener('abort', onAbort, { once: true });
      current.promise.then(clip => { release(); if (!signal.aborted) resolve(clip); }, error => { release(); reject(error); });
    });
  }

  /** Warm only the first clip of each script, one low-priority request at a time. */
  public prefetchScripts(items: Array<{ id?: string; text: string }>): void {
    for (const item of items || []) {
      const text = splitSpeechText(item.text || '')[0];
      if (!text) continue;
      const key = this.cacheKey(text);
      if (this.cache.has(key) || this.warmKeys.has(key)) continue;
      if (this.warmQueue.length >= 12) break;
      this.warmKeys.add(key);
      this.warmQueue.push({ text, key });
    }
    if (this.warmController || !this.warmQueue.length) return;
    const controller = new AbortController();
    const generation = this.warmGeneration;
    this.warmController = controller;
    void (async () => {
      while (generation === this.warmGeneration && !controller.signal.aborted && this.warmQueue.length) {
        const item = this.warmQueue.shift()!;
        try { await this.requestClip(item.text, controller.signal, true); } catch { /* Playback can retry explicitly. */ }
        if (generation === this.warmGeneration) this.warmKeys.delete(item.key);
      }
      if (generation === this.warmGeneration) this.warmController = null;
    })();
  }

  public async playTrack(track: AudioTrack, requestedSpeed?: 1 | 1.25 | 1.5, retainedVoice: ArgentineVoice | null = null): Promise<void> {
    this.resetPlayback();
    this.playbackVoice = retainedVoice;
    const generation = this.generation;
    const text = track.script || track.title;
    this.segments = splitSpeechText(text).map(part => ({ text: part }));
    this.estimatedDuration = calculateEstimatedDuration(text).seconds;
    this.sessionController = new AbortController();
    this.wantsPlayback = true;
    this.state = {
      ...this.state, currentTrack: track, isLoading: true, speed: requestedSpeed || this.state.speed,
      totalDuration: this.estimatedDuration, remainingSeconds: this.estimatedDuration,
      isDurationEstimated: true,
    };
    this.emit();
    try {
      if (!this.segments.length) throw new Error('No hay texto disponible para este audio.');
      this.initAudioElements();
      if (!this.cached(this.segments[0].text, this.playbackVoice || DEFAULT_AUDIO_VOICE)) {
        // Unlock this SAME element in the click gesture. Its promise never resumes a later track.
        // Silent samples, with the element unmuted, also unlock later speech on iOS.
        this.audioElement!.muted = false;
        this.audioElement!.src = SILENT_WAV;
        try { void this.audioElement!.play().catch(() => {}); } catch { /* Real playback reports rejection below. */ }
      }
      await this.startSegment(0);
    } catch (error) { if (this.isCurrent(generation) && this.wantsPlayback) this.fail(error); }
  }

  public retry(): void {
    const track = this.state.currentTrack;
    if (track) void this.playTrack(track, this.state.speed, this.playbackVoice);
  }

  private isCurrent(generation: number): boolean {
    return generation === this.generation && this.state.currentTrack !== null;
  }

  private offsetFor(index: number): number | null {
    let total = 0;
    for (let previous = 0; previous < index; ++previous) {
      const duration = this.segments[previous]?.duration;
      if (!duration || !validDuration(duration)) return null;
      total += duration;
    }
    return total;
  }

  private updateTimeline(): void {
    let known = 0;
    let count = 0;
    for (const segment of this.segments) {
      if (!segment.duration || !validDuration(segment.duration)) break;
      known += segment.duration;
      ++count;
    }
    const complete = count === this.segments.length && count > 0;
    this.state.seekableDuration = known;
    this.state.canSeek = this.segments.length > 0 && this.playbackVoice !== null && !this.state.error;
    this.state.isDurationEstimated = !complete;
    this.state.totalDuration = complete ? known : Math.max(known, this.state.currentSeconds, this.estimatedDuration);
    this.state.remainingSeconds = Math.max(0, this.state.totalDuration - this.state.currentSeconds);
  }

  private async prepareClip(index: number, signal: AbortSignal, lowPriority = false): Promise<Clip> {
    const generation = this.generation;
    // The first response chooses the narrator, including any permitted initial fallback.
    if (index > 0 && !this.playbackVoice) await this.prepareClip(0, signal, lowPriority);
    if (signal.aborted || !this.isCurrent(generation)) throw abortError();
    const segment = this.segments[index];
    const voice = this.playbackVoice || DEFAULT_AUDIO_VOICE;
    const clip = this.cached(segment.text, voice)
      || await this.requestClip(segment.text, signal, lowPriority, voice, !this.playbackVoice);
    if (signal.aborted || !this.isCurrent(generation)) throw abortError();
    this.playbackVoice ||= clip.voice as ArgentineVoice;
    if (clip.voice !== this.playbackVoice) throw new Error('No se pudo mantener la voz de este audio. Tocá Reintentar.');
    // An oversized clip may play, but must not become an unbounded prepared reference.
    segment.clip = this.cache.has(this.cacheKey(segment.text, clip.voice)) ? clip : undefined;
    segment.duration = clip.duration || segment.duration;
    return clip;
  }

  private async startSegment(index: number): Promise<void> {
    const generation = this.generation;
    const attempt = ++this.playAttempt;
    const segment = this.segments[index];
    if (!segment || !this.sessionController) return;
    this.state.isLoading = true;
    this.state.isPlaying = false;
    this.emit();
    try {
      const clip = await this.prepareClip(index, this.sessionController.signal);
      if (!this.isCurrent(generation)) return;
      if (attempt !== this.playAttempt || !this.wantsPlayback || this.state.isSeeking) return;
      this.mountSegment(index, clip, 0);
    } catch (error) {
      if (this.isCurrent(generation) && attempt === this.playAttempt && this.wantsPlayback) this.fail(error);
    }
  }

  private prepareFollowing(index: number): void {
    const generation = this.generation;
    const segment = this.segments[index + 1];
    if (!segment || !this.sessionController) return;
    void (async () => {
      try {
        const signal = this.sessionController!.signal;
        const clip = await this.prepareClip(index + 1, signal, true);
        if (!this.isCurrent(generation)) return;
        await this.measureClip(index + 1, clip, generation, signal);
      } catch { /* If necessary, the next foreground request retries with a visible error. */ }
    })();
  }

  private measureClip(index: number, clip: Clip, generation: number, signal: AbortSignal): Promise<void> {
    // A single serial probe cannot replace another clip's source before its metadata arrives.
    const measured = this.metadataQueue.catch(() => {}).then(() => {
      if (signal.aborted || !this.isCurrent(generation)) throw abortError();
      if (clip.duration && validDuration(clip.duration)) {
        this.segments[index].duration = clip.duration;
        this.updateTimeline();
        this.emit();
        return;
      }
      return new Promise<void>((resolve, reject) => {
        const audio = this.metadataElement!;
        const version = ++this.metadataVersion;
        this.releaseMedia(audio);
        const finish = (error?: Error) => {
          if (version !== this.metadataVersion) return;
          signal.removeEventListener('abort', onAbort);
          if (this.metadataTimer !== null) clearTimeout(this.metadataTimer);
          this.metadataTimer = null;
          this.cancelMetadata = null;
          this.releaseMedia(audio);
          if (error) reject(error); else resolve();
        };
        const onAbort = () => finish(abortError());
        this.cancelMetadata = onAbort;
        signal.addEventListener('abort', onAbort, { once: true });
        audio.onloadedmetadata = audio.ondurationchange = () => {
          if (!this.isCurrent(generation) || version !== this.metadataVersion || !validDuration(audio.duration)) return;
          clip.duration = this.segments[index].duration = audio.duration;
          this.updateTimeline();
          this.emit();
          finish();
        };
        audio.onerror = () => finish(new Error('No se pudo comprobar la duración del audio. Volvé a intentar.'));
        this.metadataTimer = setTimeout(() => finish(new Error('No se pudo comprobar la duración del audio. Volvé a intentar.')), 5_000);
        audio.src = clip.url;
        audio.load();
      });
    });
    this.metadataQueue = measured.catch(() => {});
    return measured;
  }

  private finishSeek(version: number, atEnd: boolean): void {
    if (version !== this.seekVersion) return;
    this.seekController?.abort();
    this.seekController = null;
    if (this.seekTimer !== null) clearTimeout(this.seekTimer);
    this.seekTimer = null;
    this.state.isSeeking = false;
    this.state.pendingSeekSeconds = null;
    if (atEnd) this.wantsPlayback = false;
    this.state.isLoading = this.wantsPlayback;
    this.state.isPlaying = false;
  }

  private mountSegment(index: number, clip: Clip, offset: number, seek?: { version: number; atEnd: boolean }): void {
    const audio = this.audioElement!;
    const generation = this.generation;
    const version = ++this.sourceVersion;
    this.clearPlayTimer();
    if (this.mountTimer !== null) clearTimeout(this.mountTimer);
    this.mountTimer = null;
    this.releaseMedia(audio);
    this.segmentIndex = index;
    this.loadedIndex = index;
    this.mountedReady = false;
    let hasMetadata = false;
    const valid = () => this.isCurrent(generation) && version === this.sourceVersion
      && (!seek || hasMetadata || seek.version === this.seekVersion)
      && (!audio.currentSrc || audio.currentSrc === clip.url);
    const applyMetadata = () => {
      if (!valid()) return;
      if (validDuration(audio.duration)) {
        clip.duration = audio.duration;
        this.segments[index].duration = audio.duration;
        if (!hasMetadata) {
          // Setting currentTime before HAVE_METADATA can fail or be reset by load(), notably on iOS.
          const local = Math.min(offset, audio.duration);
          try { if (local > 0) audio.currentTime = local; }
          catch (error) { this.fail(error); return; }
          hasMetadata = true;
          this.mountedReady = true;
          if (this.mountTimer !== null) clearTimeout(this.mountTimer);
          this.mountTimer = null;
          if (seek && seek.version === this.seekVersion) {
            this.state.currentSeconds = (this.offsetFor(index) || 0) + local;
            this.finishSeek(seek.version, seek.atEnd);
            if (this.wantsPlayback) this.playMounted(generation, version);
          }
        }
        this.updateTimeline();
        this.emit();
      }
    };
    audio.onloadedmetadata = audio.ondurationchange = applyMetadata;
    audio.ontimeupdate = () => {
      if (!valid() || this.state.isSeeking || !hasMetadata) return;
      const start = this.offsetFor(index);
      if (start === null) return;
      this.state.currentSeconds = start + (Number.isFinite(audio.currentTime) ? audio.currentTime : 0);
      this.updateTimeline();
      this.emit();
    };
    audio.onplaying = () => {
      if (!valid()) return;
      if (!this.wantsPlayback || this.state.isSeeking) { audio.pause(); return; }
      this.clearPlayTimer();
      this.state.isPlaying = true;
      this.state.isLoading = false;
      this.emit();
    };
    audio.onwaiting = audio.onstalled = () => {
      if (!valid() || !this.wantsPlayback || this.state.isSeeking) return;
      this.state.isLoading = true;
      this.watchPlayback(generation, version);
      this.emit();
    };
    audio.onerror = () => {
      if (!valid() || this.state.isSeeking && !seek) return;
      const key = this.cacheKey(this.segments[index].text, clip.voice);
      if (this.cache.delete(key)) this.cacheBytes -= clip.size;
      this.segments[index].clip = undefined;
      this.fail(new Error('No se pudo decodificar el audio. Volvé a intentar.'));
    };
    audio.onended = () => {
      if (!valid() || this.state.isSeeking
        || !this.wantsPlayback && !this.state.isDurationEstimated && this.state.currentSeconds >= this.state.totalDuration) return;
      // A queued ended event can survive a seek on the same mounted source.
      // Only advance if the element is still at that source's actual endpoint.
      if (validDuration(audio.duration) && audio.currentTime < audio.duration - 0.05) return;
      this.clearPlayTimer();
      const duration = validDuration(audio.duration) ? audio.duration : audio.currentTime;
      if (!validDuration(duration)) { this.fail(new Error('No se pudo comprobar la duración del audio.')); return; }
      this.segments[index].duration = clip.duration = duration;
      this.state.currentSeconds = (this.offsetFor(index) || 0) + duration;
      this.state.isPlaying = false;
      this.loadedIndex = -1;
      if (index + 1 >= this.segments.length) { this.stopAll('completed'); return; }
      this.segmentIndex = index + 1;
      this.updateTimeline();
      this.emit();
      if (this.wantsPlayback) void this.startSegment(index + 1);
    };
    audio.muted = false;
    audio.src = clip.url;
    audio.playbackRate = this.state.speed;
    if (!seek) this.state.currentSeconds = this.offsetFor(index) || 0;
    this.state.engine = clip.engine;
    this.state.voice = clip.voice;
    this.state.notice = clip.notice || null;
    this.state.error = null;
    this.state.isPlaying = false;
    this.state.isLoading = this.wantsPlayback;
    this.updateTimeline();
    if (seek) this.mountTimer = setTimeout(() => {
      if (valid() && this.state.isSeeking && seek.version === this.seekVersion) {
        this.fail(new Error('No se pudo comprobar la duración del audio. Volvé a intentar.'));
      }
    }, 5_000);
    audio.load();
    if (!this.isCurrent(generation) || version !== this.sourceVersion) return;
    this.emit();
    if (this.wantsPlayback && !seek) this.playMounted(generation, version);
    this.prepareFollowing(index);
  }

  private watchPlayback(generation: number, version: number): void {
    // Repeated waiting/stalled events cannot keep extending the same deadline.
    if (this.playTimer !== null) return;
    this.playTimer = setTimeout(() => {
      if (this.isCurrent(generation) && this.sourceVersion === version && this.wantsPlayback) {
        this.fail(new Error('El reproductor no pudo iniciar o continuar el audio. Volvé a intentar.'));
      }
    }, PLAY_TIMEOUT_MS);
  }

  private playMounted(generation: number, version: number): void {
    const audio = this.audioElement!;
    const attempt = ++this.playAttempt;
    this.watchPlayback(generation, version);
    this.state.isLoading = true;
    this.state.error = null;
    this.emit();
    try {
      void audio.play().then(() => {
        if (!this.isCurrent(generation) || version !== this.sourceVersion || attempt !== this.playAttempt) return;
        if (!this.wantsPlayback) { audio.pause(); return; }
        this.clearPlayTimer();
        this.state.isLoading = false;
        this.state.isPlaying = true;
        this.emit();
      }).catch(error => {
        if (this.isCurrent(generation) && version === this.sourceVersion && attempt === this.playAttempt && this.wantsPlayback) this.fail(error);
      });
    } catch (error) { this.fail(error); }
  }

  private fail(error: unknown): void {
    this.wantsPlayback = false;
    ++this.playAttempt;
    ++this.sourceVersion;
    ++this.seekVersion;
    this.seekController?.abort();
    this.seekController = null;
    this.clearPlayTimer();
    if (this.mountTimer !== null) clearTimeout(this.mountTimer);
    this.mountTimer = null;
    if (this.seekTimer !== null) clearTimeout(this.seekTimer);
    this.seekTimer = null;
    this.sessionController?.abort();
    this.cancelMetadata?.();
    ++this.metadataVersion;
    if (this.metadataTimer !== null) clearTimeout(this.metadataTimer);
    this.metadataTimer = null;
    this.releaseMedia(this.metadataElement);
    this.releaseMedia(this.audioElement);
    this.loadedIndex = -1;
    const failure = error as Error;
    this.state.isLoading = false;
    this.state.isPlaying = false;
    this.state.isSeeking = false;
    this.state.pendingSeekSeconds = null;
    this.state.canSeek = false;
    this.state.error = failure?.name === 'NotAllowedError'
      ? 'El navegador bloqueó el inicio del audio. Tocá Reintentar para habilitarlo.'
      : failure?.message || 'No se pudo reproducir el audio. Volvé a intentar.';
    this.state.notice = 'Podés leer el resumen en texto o reintentar el audio.';
    this.emit();
  }

  public togglePlay(): void {
    if (!this.state.currentTrack) return;
    if (this.wantsPlayback || this.state.isPlaying || this.state.isLoading) this.pause();
    else this.resume();
  }

  public pause(): void {
    this.wantsPlayback = false;
    ++this.playAttempt;
    this.clearPlayTimer();
    try { this.audioElement?.pause(); } catch { /* Already detached. */ }
    this.state.isPlaying = false;
    this.state.isLoading = false;
    this.emit();
  }

  public resume(): void {
    if (!this.state.currentTrack) return;
    if (this.state.error) { this.retry(); return; }
    this.wantsPlayback = true;
    this.state.error = null;
    if (this.state.isSeeking) { this.state.isLoading = true; this.emit(); return; }
    if (!this.state.isDurationEstimated && this.state.currentSeconds >= this.state.totalDuration) {
      this.seek(0);
      return;
    }
    if (this.loadedIndex === this.segmentIndex && this.audioElement?.getAttribute('src')) {
      this.playMounted(this.generation, this.sourceVersion);
    } else {
      // A paused pending synthesis never starts itself; this explicit gesture starts it.
      void this.startSegment(this.segmentIndex);
    }
  }

  public seek(targetSeconds: number): void {
    if (!this.state.currentTrack || this.state.error || !Number.isFinite(targetSeconds)) return;
    const generation = this.generation;
    const version = ++this.seekVersion;
    this.seekController?.abort();
    const controller = new AbortController();
    this.seekController = controller;
    ++this.playAttempt;
    this.clearPlayTimer();
    if (this.mountTimer !== null) clearTimeout(this.mountTimer);
    this.mountTimer = null;
    if (this.seekTimer !== null) clearTimeout(this.seekTimer);
    this.seekTimer = setTimeout(() => {
      if (this.isCurrent(generation) && version === this.seekVersion && this.state.isSeeking) {
        this.fail(new Error('La preparación del salto tardó demasiado. Volvé a intentar.'));
      }
    }, SEEK_TIMEOUT_MS);
    try { this.audioElement?.pause(); } catch { /* Nothing mounted yet. */ }
    this.state.isSeeking = true;
    this.state.pendingSeekSeconds = Math.max(0, targetSeconds);
    this.state.isPlaying = false;
    this.state.isLoading = this.wantsPlayback;
    this.state.notice = null;
    this.emit();
    void this.resolveSeek(Math.max(0, targetSeconds), generation, version, controller.signal);
  }

  private async resolveSeek(target: number, generation: number, version: number, signal: AbortSignal): Promise<void> {
    const current = () => this.isCurrent(generation) && version === this.seekVersion && !signal.aborted;
    try {
      let start = 0;
      for (let index = 0; index < this.segments.length; ++index) {
        if (!current()) return;
        const segment = this.segments[index];
        let clip: Clip | undefined;
        if (!segment.duration || !validDuration(segment.duration)) {
          clip = await this.prepareClip(index, signal);
          await this.measureClip(index, clip, generation, signal);
        }
        if (!current()) return;
        const duration = segment.duration!;
        const last = index === this.segments.length - 1;
        // An exact boundary belongs to the following clip, which begins at sample zero.
        if (!last && target >= start + duration) { start += duration; continue; }
        clip ||= await this.prepareClip(index, signal);
        if (!current()) return;
        const local = Math.max(0, Math.min(duration, target - start));
        const atEnd = last && local >= duration;
        const audio = this.audioElement!;
        if (this.loadedIndex === index && this.mountedReady && validDuration(audio.duration)) {
          audio.currentTime = Math.min(local, audio.duration);
          this.state.currentSeconds = start + Math.min(local, audio.duration);
          this.finishSeek(version, atEnd);
          this.updateTimeline();
          this.emit();
          if (this.wantsPlayback) this.playMounted(generation, this.sourceVersion);
        } else {
          this.mountSegment(index, clip, local, { version, atEnd });
        }
        return;
      }
    } catch (error) {
      if (!current()) return;
      this.fail(error);
    }
  }

  public rewind(seconds: number = 10): void { this.seek((this.state.pendingSeekSeconds ?? this.state.currentSeconds) - seconds); }
  public forward(seconds: number = 10): void { this.seek((this.state.pendingSeekSeconds ?? this.state.currentSeconds) + seconds); }

  public setSpeed(speed: 1 | 1.25 | 1.5): void {
    this.state.speed = speed;
    if (this.audioElement) this.audioElement.playbackRate = speed;
    this.emit();
  }
}

export const audioController = new GlobalAudioController();
