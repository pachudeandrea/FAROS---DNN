import { AudioTrack } from '../types/index';

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
}

export interface EstimatedDuration {
  seconds: number;
  formatted: string;
  words: number;
}

/**
 * Calculates estimated speech duration in Spanish (145 words per minute standard).
 * Used for initial UI badge before audio stream/file duration is loaded.
 */
export function calculateEstimatedDuration(text: string, speed: number = 1.0): EstimatedDuration {
  if (!text) {
    return { seconds: 0, formatted: '0:00', words: 0 };
  }
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  const WORDS_PER_MINUTE = 145;
  const baseSeconds = Math.max(1, Math.round((words / WORDS_PER_MINUTE) * 60));
  const adjustedSeconds = Math.max(1, Math.round(baseSeconds / (speed || 1.0)));
  const mins = Math.floor(adjustedSeconds / 60);
  const secs = adjustedSeconds % 60;

  return {
    seconds: adjustedSeconds,
    formatted: `${mins}:${secs.toString().padStart(2, '0')}`,
    words
  };
}

/**
 * Formats seconds into mm:ss
 */
export function formatTime(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  const m = Math.floor(s / 60);
  const remainder = s % 60;
  return `${m}:${remainder.toString().padStart(2, '0')}`;
}

type Listener = (state: AudioControllerState) => void;

/**
 * GlobalAudioController (Singleton):
 * - Exactly ONE HTMLAudioElement instance for the entire application.
 * - Sub-second playback start (< 1.0s) powered by in-memory Piper TTS, 64kbps MP3s, and first-sentence streaming.
 * - Instant cutoff: audio.pause(), currentTime = 0, src = '', audio.load().
 * - Triggers: X button, backdrop click, Escape, navigation, unmount, logout, visibilitychange, beforeunload, pagehide.
 * - Real duration derived directly from audio.duration.
 */
class GlobalAudioController {
  private audioElement: HTMLAudioElement | null = null;
  private secondaryAudioElement: HTMLAudioElement | null = null; // Used for zero-gap chaining
  private listeners: Set<Listener> = new Set();
  private audioUrlCache = new Map<string, string>(); // trackId or textHash -> mp3 url
  private abortController: AbortController | null = null;
  private streamPollTimer: any = null;
  private playStartTime: number = 0;

  private state: AudioControllerState = {
    isPlaying: false,
    isLoading: false,
    currentTrack: null,
    currentSeconds: 0,
    totalDuration: 0,
    remainingSeconds: 0,
    speed: 1,
    error: null,
    notice: null,
    engine: null,
    voice: null,
    isStreaming: false
  };

  constructor() {
    if (typeof window !== 'undefined') {
      this.initAudioElements();
      this.bindGlobalLifecycleEvents();
    }
  }

  private initAudioElements(): void {
    if (!this.audioElement) {
      this.audioElement = new Audio();
      this.audioElement.preload = 'auto';
    }
    if (!this.secondaryAudioElement) {
      this.secondaryAudioElement = new Audio();
      this.secondaryAudioElement.preload = 'auto';
    }
  }

  /**
   * Binds global browser events to guarantee immediate cutoff:
   * 1. Tab in background (visibilitychange)
   * 2. Page unload / hide (beforeunload, pagehide)
   * 3. Escape key
   */
  private bindGlobalLifecycleEvents(): void {
    if (typeof document === 'undefined') return;

    // 1. Pestaña en segundo plano (visibilitychange)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.stopAll('visibilitychange-tab-background');
      }
    });

    // 2. beforeunload & pagehide
    window.addEventListener('beforeunload', () => {
      this.stopAll('beforeunload');
    });

    window.addEventListener('pagehide', () => {
      this.stopAll('pagehide');
    });

    // 3. Tecla Escape
    window.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        this.stopAll('escape-key');
      }
    });
  }

  public getState(): AudioControllerState {
    return { ...this.state };
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.getState());
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(): void {
    const currentState = this.getState();
    for (const listener of this.listeners) {
      try {
        listener(currentState);
      } catch (err) {
        console.error('Error in audio controller listener:', err);
      }
    }
  }

  /**
   * CRITICAL REQUIREMENT:
   * Un único reproductor global.
   * Al cerrar el resumen con la X, tocar fuera, Escape, cambiar de pantalla o ruta,
   * desmontar el componente, cerrar sesión, pasar la pestaña a segundo plano,
   * beforeunload o pagehide:
   * audio.pause(), audio.currentTime = 0, audio.src = "" y audio.load() para liberar la fuente.
   */
  public stopAll(reason: string = 'manual'): void {
    // 1. Clear background streaming poll timer
    if (this.streamPollTimer) {
      clearTimeout(this.streamPollTimer);
      clearInterval(this.streamPollTimer);
      this.streamPollTimer = null;
    }

    // 2. Abort any pending network fetch immediately
    if (this.abortController) {
      try {
        this.abortController.abort();
      } catch {}
      this.abortController = null;
    }

    // 3. Complete release of the HTML5 Audio elements
    const releaseAudio = (el: HTMLAudioElement | null) => {
      if (!el) return;
      try {
        el.pause();
        el.currentTime = 0;
        el.onended = null;
        el.onerror = null;
        el.ontimeupdate = null;
        el.onloadedmetadata = null;
        el.src = '';
        el.removeAttribute('src');
        el.load();
      } catch {}
    };

    releaseAudio(this.audioElement);
    releaseAudio(this.secondaryAudioElement);

    // 4. Update state
    this.state = {
      ...this.state,
      isPlaying: false,
      isLoading: false,
      currentTrack: null,
      currentSeconds: 0,
      totalDuration: 0,
      remainingSeconds: 0,
      error: null,
      notice: null,
      engine: null,
      voice: null,
      isStreaming: false
    };

    this.emit();
  }

  /**
   * Clears error notice
   */
  public clearError(): void {
    this.state.error = null;
    this.state.notice = null;
    this.emit();
  }

  /**
   * Asynchronously prefetches audio for scripts in background so files are ready
   * when user clicks play.
   */
  public prefetchScripts(items: Array<{ id?: string; text: string }>): void {
    if (!items || items.length === 0) return;
    try {
      fetch('/api/audio/prefetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
        priority: 'low' as any
      }).catch(() => {});
    } catch {}
  }

  /**
   * Plays a track using backend in-memory Piper TTS (or edge-tts fallback).
   * Achieves sub-second start through:
   * 1. Direct cached 64kbps MP3 playback (< 100ms)
   * 2. Sentence-0 streaming if uncached (< 1s)
   */
  public async playTrack(track: AudioTrack, requestedSpeed?: 1 | 1.25 | 1.5): Promise<void> {
    this.playStartTime = performance.now();

    // Cut any prior audio first
    this.stopAll(`starting-new-track-${track.id}`);

    const targetSpeed = requestedSpeed || this.state.speed;
    const textToSpeak = track.script || track.title;

    // Temporary estimated duration while audio file loads
    const initialDuration = calculateEstimatedDuration(textToSpeak, targetSpeed);

    this.state = {
      ...this.state,
      currentTrack: track,
      isLoading: true,
      isPlaying: false,
      currentSeconds: 0,
      totalDuration: initialDuration.seconds,
      remainingSeconds: initialDuration.seconds,
      speed: targetSpeed,
      error: null,
      notice: null,
      engine: null,
      voice: null,
      isStreaming: false
    };
    this.emit();

    // Unlock browser HTML5 Audio user gesture token synchronously inside click handler
    this.initAudioElements();
    try {
      if (this.audioElement) {
        this.audioElement.src = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
        this.audioElement.play().catch(() => {});
      }
    } catch {}

    // Check memory cache first
    const cachedUrl = this.audioUrlCache.get(track.id);
    if (cachedUrl) {
      this.mountAndPlayDirectAudio(cachedUrl, track.id, 'Audio Cache (Neuronal es-AR)', 'es-AR-ElenaNeural');
      return;
    }

    // Request from backend
    this.abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      if (this.abortController) this.abortController.abort();
    }, 120000);

    try {
      const res = await fetch('/api/audio/synthesize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: textToSpeak,
          trackId: track.id
        }),
        signal: this.abortController.signal
      });

      clearTimeout(timeoutId);

      // If user stopped playback while request was in-flight, discard
      if (!this.state.currentTrack || this.state.currentTrack.id !== track.id) {
        return;
      }

      const data = await res.json();

      if (data.success) {
        // CASE A: Full audio ready or cached -> instant playback
        if (data.audioUrl && !data.isStreaming) {
          this.audioUrlCache.set(track.id, data.audioUrl);
          this.mountAndPlayDirectAudio(
            data.audioUrl,
            track.id,
            data.engine || 'Piper TTS',
            data.voice || 'es_AR-daniela-high',
            data.notice,
            data.duration
          );
          return;
        }

        // CASE B: Sentence 0 streaming ready -> begin immediate playback while background finishes
        if (data.isStreaming && data.chunkUrl) {
          this.mountAndPlayStreamingChunk(
            data.chunkUrl,
            data.audioUrl,
            data.chunkDuration || 3.0,
            track.id,
            data.engine || 'Piper TTS (Streaming)',
            data.voice || 'es_AR-daniela-high'
          );
          return;
        }

        // CASE C: audioBase64 legacy fallback if needed
        if (data.audioBase64) {
          const mimeType = data.mimeType || 'audio/mpeg';
          const dataUrl = `data:${mimeType};base64,${data.audioBase64}`;
          this.audioUrlCache.set(track.id, dataUrl);
          this.mountAndPlayDirectAudio(dataUrl, track.id, data.engine, data.voice, data.notice);
          return;
        }
      }

      // If synthesis failed:
      // STRICT REQUIREMENT: PROHIBIDO usar voz del navegador: mostrar mensaje claro y texto de resumen
      this.state = {
        ...this.state,
        isLoading: false,
        isPlaying: false,
        error: data.error || 'El audio no está disponible en este momento',
        notice: data.notice || 'Podés leer el texto del resumen a continuación.'
      };
      this.emit();
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      if (fetchErr?.name === 'AbortError' || !this.state.currentTrack || this.state.currentTrack.id !== track.id) {
        return;
      }
      this.state = {
        ...this.state,
        isLoading: false,
        isPlaying: false,
        error: 'El audio no está disponible en este momento',
        notice: `Error de conexión con el servidor (${fetchErr?.message || 'Error de red'}). Podés consultar el resumen en texto.`
      };
      this.emit();
    }
  }

  /**
   * Plays a direct MP3 audio URL (full file or cached)
   */
  private mountAndPlayDirectAudio(
    audioUrl: string, 
    trackId: string, 
    engine?: string, 
    voice?: string,
    notice?: string,
    serverDuration?: number
  ): void {
    this.initAudioElements();
    const audio = this.audioElement!;

    audio.src = audioUrl;
    audio.playbackRate = this.state.speed;

    if (serverDuration && serverDuration > 0) {
      this.state.totalDuration = Math.round(serverDuration);
      this.state.remainingSeconds = Math.round(serverDuration);
    }

    audio.onloadedmetadata = () => {
      if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
        const realSecs = Math.max(1, Math.round(audio.duration));
        this.state.totalDuration = realSecs;
        this.state.remainingSeconds = Math.max(0, realSecs - Math.floor(audio.currentTime));
        this.emit();
      }
    };

    audio.ontimeupdate = () => {
      if (!this.state.currentTrack || this.state.currentTrack.id !== trackId) return;
      const current = audio.currentTime;
      const total = this.state.totalDuration || Math.round(audio.duration || 0);
      const remaining = Math.max(0, Math.round(total - current));
      this.state.currentSeconds = current;
      this.state.remainingSeconds = remaining;
      this.emit();
    };

    audio.onended = () => {
      this.stopAll('audio-playback-completed');
    };

    audio.onerror = () => {
      this.state = {
        ...this.state,
        isLoading: false,
        isPlaying: false,
        error: 'El audio no está disponible en este momento',
        notice: 'Error al decodificar el archivo de audio.'
      };
      this.emit();
    };

    audio.play()
      .then(() => {
        const latencyMs = Math.round(performance.now() - this.playStartTime);
        console.log(`[AUDIO LATENCY] Playback started in ${latencyMs}ms (${engine || 'Piper TTS'})`);

        if (this.state.currentTrack && this.state.currentTrack.id === trackId) {
          this.state.isPlaying = true;
          this.state.isLoading = false;
          this.state.error = null;
          this.state.engine = engine || 'Piper TTS';
          this.state.voice = voice || 'es_AR-daniela-high';
          this.state.notice = notice || null;
          this.state.isStreaming = false;
          this.emit();
        }
      })
      .catch((playErr) => {
        console.warn('Audio play request interrupted:', playErr);
        this.state.isLoading = false;
        this.state.isPlaying = false;
        this.emit();
      });
  }

  /**
   * Plays sentence 0 immediately and seamlessly transitions to full file once ready
   */
  private mountAndPlayStreamingChunk(
    chunk0Url: string,
    fullAudioUrl: string,
    chunk0Duration: number,
    trackId: string,
    engine: string,
    voice: string
  ): void {
    this.initAudioElements();
    const audio = this.audioElement!;

    let fullAudioReady = false;
    audio.src = chunk0Url;
    audio.playbackRate = this.state.speed;

    // Background checker: poll when full file is ready
    const checkFullReady = async () => {
      try {
        const headRes = await fetch(fullAudioUrl, { method: 'HEAD' });
        if (headRes.ok) {
          fullAudioReady = true;
          if (this.secondaryAudioElement) {
            this.secondaryAudioElement.src = fullAudioUrl;
            this.secondaryAudioElement.preload = 'auto';
          }
          if (this.streamPollTimer) clearInterval(this.streamPollTimer);
        }
      } catch {}
    };

    this.streamPollTimer = setInterval(checkFullReady, 800);

    audio.ontimeupdate = () => {
      if (!this.state.currentTrack || this.state.currentTrack.id !== trackId) return;
      this.state.currentSeconds = audio.currentTime;
      this.state.remainingSeconds = Math.max(0, this.state.totalDuration - Math.floor(audio.currentTime));
      this.emit();
    };

    // When sentence 0 ends, seamlessly continue to full audio at timestamp
    audio.onended = () => {
      if (!this.state.currentTrack || this.state.currentTrack.id !== trackId) return;

      const continueFullAudio = () => {
        audio.src = fullAudioUrl;
        audio.currentTime = chunk0Duration;
        audio.playbackRate = this.state.speed;

        audio.onended = () => {
          this.stopAll('audio-playback-completed');
        };

        audio.onloadedmetadata = () => {
          if (audio.duration && !isNaN(audio.duration) && isFinite(audio.duration)) {
            this.state.totalDuration = Math.round(audio.duration);
            this.emit();
          }
        };

        audio.ontimeupdate = () => {
          if (!this.state.currentTrack || this.state.currentTrack.id !== trackId) return;
          this.state.currentSeconds = audio.currentTime;
          this.state.remainingSeconds = Math.max(0, this.state.totalDuration - Math.floor(audio.currentTime));
          this.emit();
        };

        audio.play().catch(() => {});
      };

      if (fullAudioReady) {
        continueFullAudio();
      } else {
        // Wait up to 1.5s for final merge if needed
        const waitTimer = setInterval(async () => {
          try {
            const res = await fetch(fullAudioUrl, { method: 'HEAD' });
            if (res.ok) {
              clearInterval(waitTimer);
              continueFullAudio();
            }
          } catch {}
        }, 300);

        setTimeout(() => {
          clearInterval(waitTimer);
          if (!audio.src.includes(fullAudioUrl)) {
            continueFullAudio();
          }
        }, 4000);
      }
    };

    audio.play()
      .then(() => {
        const latencyMs = Math.round(performance.now() - this.playStartTime);
        console.log(`[AUDIO LATENCY] Streaming playback started in ${latencyMs}ms (${engine})`);

        if (this.state.currentTrack && this.state.currentTrack.id === trackId) {
          this.state.isPlaying = true;
          this.state.isLoading = false;
          this.state.error = null;
          this.state.engine = engine;
          this.state.voice = voice;
          this.state.isStreaming = true;
          this.emit();
        }
      })
      .catch((err) => {
        console.warn('Streaming chunk play failed:', err);
        this.state.isLoading = false;
        this.state.isPlaying = false;
        this.emit();
      });
  }

  public togglePlay(): void {
    if (this.state.isLoading || !this.state.currentTrack) return;

    if (this.state.isPlaying) {
      this.pause();
    } else {
      this.resume();
    }
  }

  public pause(): void {
    if (this.audioElement) {
      try {
        this.audioElement.pause();
      } catch {}
    }
    this.state.isPlaying = false;
    this.emit();
  }

  public resume(): void {
    if (this.audioElement && this.audioElement.src) {
      this.audioElement.play()
        .then(() => {
          this.state.isPlaying = true;
          this.emit();
        })
        .catch(() => {});
    }
  }

  public seek(targetSeconds: number): void {
    const clamped = Math.max(0, Math.min(this.state.totalDuration, targetSeconds));
    if (this.audioElement && this.audioElement.duration) {
      this.audioElement.currentTime = clamped;
      this.state.currentSeconds = clamped;
      this.state.remainingSeconds = Math.max(0, Math.round(this.state.totalDuration - clamped));
      this.emit();
    } else {
      this.state.currentSeconds = clamped;
      this.state.remainingSeconds = Math.max(0, Math.round(this.state.totalDuration - clamped));
      this.emit();
    }
  }

  public rewind(seconds: number = 10): void {
    this.seek(this.state.currentSeconds - seconds);
  }

  public forward(seconds: number = 10): void {
    this.seek(this.state.currentSeconds + seconds);
  }

  public setSpeed(newSpeed: 1 | 1.25 | 1.5): void {
    this.state.speed = newSpeed;
    if (this.audioElement) {
      this.audioElement.playbackRate = newSpeed;
    }
    if (this.secondaryAudioElement) {
      this.secondaryAudioElement.playbackRate = newSpeed;
    }
    this.emit();
  }
}

// Export singleton instance
export const audioController = new GlobalAudioController();
