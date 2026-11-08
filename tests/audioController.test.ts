import test, { type TestContext } from 'node:test';
import assert from 'node:assert/strict';
import { GlobalAudioController } from '../src/utils/audioController';
import { DEFAULT_AUDIO_VOICE, splitSpeechText } from '../src/utils/speechText';
import type { AudioTrack } from '../src/types/index';

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};
const flush = async () => { for (let i = 0; i < 24; ++i) await Promise.resolve(); };
const track = (text: string, id = 'summary'): AudioTrack => ({ id, title: text, script: text, durationText: '', totalSeconds: 0 });
const audioUrl = (text: string) => `data:audio/mpeg;base64,${Buffer.from(text).toString('base64')}`;
const isPrime = (src: string) => src.startsWith('data:audio/wav');

class FakeAudio {
  static instances: FakeAudio[] = [];
  static durations = new Map<string, number>();
  src = '';
  preload = '';
  muted = false;
  currentTime = 0;
  duration = NaN;
  playbackRate = 1;
  paused = true;
  played: string[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  onwaiting: (() => void) | null = null;
  onstalled: (() => void) | null = null;
  playResult: ((src: string) => Promise<void>) | null = null;
  constructor() { FakeAudio.instances.push(this); }
  getAttribute(name: string) { return name === 'src' ? this.src || null : null; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  pause() { this.paused = true; }
  play() {
    this.played.push(this.src);
    this.paused = false;
    return this.playResult?.(this.src) || Promise.resolve();
  }
  load() {
    this.currentTime = 0;
    this.duration = NaN;
    const source = this.src;
    const duration = FakeAudio.durations.get(source);
    if (duration) queueMicrotask(() => {
      if (this.src !== source) return;
      this.duration = duration;
      this.onloadedmetadata?.();
    });
  }
  metadata(duration: number) { this.duration = duration; this.onloadedmetadata?.(); }
  finish() { this.currentTime = this.duration; this.onended?.(); }
}

function response(text: string, duration: number | null = 10, voice = DEFAULT_AUDIO_VOICE) {
  if (duration !== null) FakeAudio.durations.set(audioUrl(text), duration);
  return new Response(JSON.stringify({ success: true, audioBase64: Buffer.from(text).toString('base64'), mimeType: 'audio/mpeg', engine: 'test', voice }), { status: 200 });
}

function setup(t: TestContext, fetcher: typeof fetch) {
  const previousAudio = (globalThis as any).Audio;
  const previousFetch = globalThis.fetch;
  FakeAudio.instances = [];
  FakeAudio.durations.clear();
  (globalThis as any).Audio = FakeAudio;
  globalThis.fetch = fetcher;
  const controller = new GlobalAudioController();
  t.after(() => {
    controller.stopAll('test-cleanup');
    globalThis.fetch = previousFetch;
    if (previousAudio === undefined) delete (globalThis as any).Audio;
    else (globalThis as any).Audio = previousAudio;
  });
  return controller;
}

test('same track ID with different text discards the older synthesis, even if fetch ignores abort', async t => {
  const old = deferred<Response>();
  const requests: Array<{ text: string; signal: AbortSignal }> = [];
  const controller = setup(t, async (_, options) => {
    const { text, voice } = JSON.parse(options!.body as string);
    assert.equal(voice, DEFAULT_AUDIO_VOICE);
    requests.push({ text, signal: options!.signal! });
    return text === 'Texto anterior.' ? old.promise : response(text);
  });
  const earlier = controller.playTrack(track('Texto anterior.'));
  await controller.playTrack(track('Texto actualizado.'));
  await flush();
  old.resolve(response('Texto anterior.'));
  await earlier;
  await flush();
  assert.equal(requests[0].signal.aborted, true);
  assert.equal(controller.getState().currentTrack?.script, 'Texto actualizado.');
  assert.equal(FakeAudio.instances[0].src, audioUrl('Texto actualizado.'));
  assert.equal(FakeAudio.instances[0].played.includes(audioUrl('Texto anterior.')), false);
  assert.equal(controller.getState().isPlaying, true);
});

test('pause during synthesis requires an explicit resume, and closing never revives playback', async t => {
  const pending = deferred<Response>();
  const controller = setup(t, async () => pending.promise);
  const playing = controller.playTrack(track('Resumen que todavía se prepara.'));
  controller.pause();
  pending.resolve(response('Resumen que todavía se prepara.'));
  await playing;
  await flush();
  assert.equal(controller.getState().isPlaying, false);
  assert.equal(controller.getState().isLoading, false);
  assert.equal(FakeAudio.instances[0].played.filter(src => !isPrime(src)).length, 0);
  controller.resume();
  await flush();
  assert.equal(controller.getState().isPlaying, true);
  const oldEnded = FakeAudio.instances[0].onended;
  const oldMetadata = FakeAudio.instances[0].onloadedmetadata;
  controller.stopAll();
  oldEnded?.();
  oldMetadata?.();
  await flush();
  assert.equal(controller.getState().currentTrack, null);
  assert.equal(controller.getState().isPlaying, false);
  assert.equal(FakeAudio.instances[0].src, '');
});

test('stop aborts a response whose JSON body is still pending', async t => {
  const json = deferred<unknown>();
  let signal: AbortSignal | null = null;
  const controller = setup(t, async (_, options) => {
    signal = options!.signal!;
    return { ok: true, json: () => json.promise } as Response;
  });
  const playing = controller.playTrack(track('Texto cancelado.'));
  await flush();
  controller.stopAll();
  assert.equal(signal!.aborted, true);
  json.resolve({ success: true, audioBase64: 'YQ==', voice: DEFAULT_AUDIO_VOICE });
  await playing;
  assert.equal(controller.getState().currentTrack, null);
  assert.equal(controller.getState().error, null);
  assert.equal(FakeAudio.instances[0].played.filter(src => !isPrime(src)).length, 0);
});

test('an old play promise and callbacks cannot change the replacement track', async t => {
  const controller = setup(t, async (_, options) => response(JSON.parse(options!.body as string).text));
  const previous = deferred<void>();
  const first = controller.playTrack(track('Primer audio.', 'one'));
  FakeAudio.instances[0].playResult = src => src === audioUrl('Primer audio.') ? previous.promise : Promise.resolve();
  await first;
  const oldEnded = FakeAudio.instances[0].onended;
  const oldMetadata = FakeAudio.instances[0].onloadedmetadata;
  await controller.playTrack(track('Segundo audio.', 'two'));
  await flush();
  previous.resolve();
  oldEnded?.();
  oldMetadata?.();
  await flush();
  assert.equal(controller.getState().currentTrack?.id, 'two');
  assert.equal(controller.getState().isPlaying, true);
  assert.equal(FakeAudio.instances[0].src, audioUrl('Segundo audio.'));
});

test('synthesis has a finite timeout, clears loading and can be retried', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let fail = true;
  let signal!: AbortSignal;
  const controller = setup(t, async (_, options) => {
    signal = options!.signal!;
    if (fail) return new Promise<Response>(() => {});
    return response(JSON.parse(options!.body as string).text);
  });
  const pending = controller.playTrack(track('Texto para reintentar.'));
  await flush();
  t.mock.timers.tick(16_000);
  await pending;
  assert.equal(signal.aborted, true);
  assert.equal(controller.getState().isLoading, false);
  assert.match(controller.getState().error!, /tardó demasiado/);
  fail = false;
  controller.retry();
  await flush();
  assert.equal(controller.getState().isPlaying, true);
  assert.equal(controller.getState().error, null);
});

test('play rejection is visible and retry reuses the audio element and cached content', async t => {
  let fetches = 0;
  const controller = setup(t, async (_, options) => { ++fetches; return response(JSON.parse(options!.body as string).text); });
  const first = controller.playTrack(track('Audio con permiso del navegador.'));
  FakeAudio.instances[0].playResult = src => isPrime(src)
    ? Promise.resolve()
    : Promise.reject(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }));
  await first;
  await flush();
  assert.equal(controller.getState().isLoading, false);
  assert.match(controller.getState().error!, /navegador bloqueó/);
  FakeAudio.instances[0].playResult = null;
  controller.retry();
  await flush();
  assert.equal(fetches, 1);
  assert.equal(FakeAudio.instances.length, 2, 'only the active element and metadata probe exist');
  assert.equal(FakeAudio.instances[1].played.length, 0);
  assert.equal(controller.getState().isPlaying, true);
});

test('a never-resolving play and repeated stalled events cannot leave an infinite spinner', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const controller = setup(t, async (_, options) => response(JSON.parse(options!.body as string).text));
  const first = controller.playTrack(track('Audio que no inicia.'));
  FakeAudio.instances[0].playResult = src => isPrime(src) ? Promise.resolve() : new Promise(() => {});
  await first;
  await flush();
  t.mock.timers.tick(8_000);
  FakeAudio.instances[0].onstalled?.();
  t.mock.timers.tick(4_000);
  await flush();
  assert.equal(controller.getState().isLoading, false);
  assert.equal(controller.getState().isPlaying, false);
  assert.match(controller.getState().error!, /reproductor no pudo/);
});

test('clips continue at zero without skipping words and seeking uses measured durations across clips', async t => {
  const text = Array.from({ length: 140 }, (_, i) => `palabra${i}`).join(' ') + '.';
  const chunks = splitSpeechText(text);
  assert.ok(chunks.length >= 3);
  const requests: string[] = [];
  const controller = setup(t, async (_, options) => {
    const { text } = JSON.parse(options!.body as string);
    requests.push(text);
    return response(text, [4.2, 7.3, 6.5][chunks.indexOf(text)] || 5);
  });
  await controller.playTrack(track(text));
  await flush();
  const active = FakeAudio.instances[0];
  assert.deepEqual(requests, chunks.slice(0, 2), 'first clip starts while exactly the next clip is prepared');
  assert.equal(active.src, audioUrl(chunks[0]));
  assert.equal(controller.getState().seekableDuration, 11.5);
  active.finish();
  await flush();
  assert.equal(active.src, audioUrl(chunks[1]));
  assert.equal(active.currentTime, 0, 'the next text begins at its first sample');
  assert.equal(controller.getState().currentSeconds, 4.2);
  controller.pause();
  controller.seek(2);
  await flush();
  assert.equal(active.src, audioUrl(chunks[0]));
  assert.equal(active.currentTime, 2);
  assert.equal(controller.getState().isPlaying, false);
  controller.forward(6);
  await flush();
  assert.equal(active.src, audioUrl(chunks[1]));
  assert.ok(Math.abs(active.currentTime - 3.8) < 0.0001);
  assert.equal(controller.getState().currentSeconds, 8);
  controller.setSpeed(1.5);
  controller.resume();
  await flush();
  assert.equal(active.playbackRate, 1.5);
  assert.equal(active.currentTime, 3.8);
  assert.equal(FakeAudio.instances[1].played.length, 0);
  assert.equal(requests.some(value => value === text), false, 'no background full-file synthesis is assumed');
});

test('unknown duration disables seek instead of advancing imaginary media time', async t => {
  const text = Array.from({ length: 100 }, (_, i) => `dato${i}`).join(' ');
  const chunks = splitSpeechText(text);
  const next = deferred<Response>();
  const controller = setup(t, async (_, options) => {
    const part = JSON.parse(options!.body as string).text;
    return part === chunks[0] ? response(part, null) : next.promise;
  });
  await controller.playTrack(track(text));
  controller.seek(90);
  assert.equal(controller.getState().currentSeconds, 0);
  assert.equal(controller.getState().canSeek, false);
  assert.match(controller.getState().notice!, /preparando/);
  FakeAudio.instances[0].metadata(3.25);
  controller.seek(90);
  assert.equal(controller.getState().currentSeconds, 3.25);
  assert.equal(FakeAudio.instances[0].currentTime, 3.25);
  assert.match(controller.getState().notice!, /parte del audio/);
});

test('public prefetch warms only the first clip, serially, and deduplicates exact text', async t => {
  const requests: Array<{ text: string; priority?: string; signal: AbortSignal }> = [];
  const first = deferred<Response>();
  const second = deferred<Response>();
  const controller = setup(t, async (url, options) => {
    assert.equal(url, '/api/audio/synthesize');
    const { text } = JSON.parse(options!.body as string);
    requests.push({ text, priority: (options as any).priority, signal: options!.signal! });
    return requests.length === 1 ? first.promise : second.promise;
  });
  const longText = 'Primer resumen. ' + 'Información financiera verificada para la cartera. '.repeat(30);
  controller.prefetchScripts([{ id: 'one', text: longText }, { id: 'duplicate', text: longText }, { text: 'Otro resumen.' }]);
  controller.prefetchScripts([{ text: longText }]);
  assert.equal(requests.length, 1);
  assert.equal(requests[0].text, splitSpeechText(longText)[0]);
  assert.equal(requests[0].priority, 'low');
  first.resolve(response(requests[0].text));
  await flush();
  assert.equal(requests.length, 2);
  assert.equal(requests[1].text, 'Otro resumen.');
  controller.stopAll();
  assert.equal(requests[1].signal.aborted, true);
  second.resolve(response('Otro resumen.'));
  await flush();
  assert.equal(FakeAudio.instances.length, 0, 'warming never starts audio');
});

test('clicking during an identical warmup shares its request and cancellation cannot revive the player', async t => {
  const pending = deferred<Response>();
  let fetches = 0;
  const controller = setup(t, async () => { ++fetches; return pending.promise; });
  controller.prefetchScripts([{ text: 'Resumen preparado con anticipación.' }]);
  const playing = controller.playTrack(track('Resumen preparado con anticipación.'));
  assert.equal(fetches, 1);
  controller.stopAll();
  pending.resolve(response('Resumen preparado con anticipación.'));
  await playing;
  await flush();
  assert.equal(controller.getState().currentTrack, null);
  assert.equal(FakeAudio.instances[0].played.filter(src => !isPrime(src)).length, 0);
});

test('a bounded content cache reuses the same text across IDs and evicts old clips', async t => {
  let fetches = 0;
  const controller = setup(t, async (_, options) => { ++fetches; return response(JSON.parse(options!.body as string).text); });
  await controller.playTrack(track('Mismo texto.', 'one'));
  await flush();
  await controller.playTrack(track('Mismo texto.', 'two'));
  await flush();
  assert.equal(fetches, 1);
  for (let i = 0; i < 49; ++i) { await controller.playTrack(track(`Nuevo contenido ${i}.`)); await flush(); }
  await controller.playTrack(track('Mismo texto.', 'three'));
  await flush();
  assert.equal(fetches, 51);
});

test('alternate voice is identified and does not permanently replace the requested Argentine voice', async t => {
  let fetches = 0;
  const controller = setup(t, async (_, options) => {
    ++fetches;
    return response(JSON.parse(options!.body as string).text, 10, 'es-AR-ElenaNeural');
  });
  await controller.playTrack(track('Audio con alternativa argentina.'));
  await flush();
  assert.equal(controller.getState().voice, 'es-AR-ElenaNeural');
  await controller.playTrack(track('Audio con alternativa argentina.'));
  await flush();
  assert.equal(fetches, 2, 'the preferred voice is attempted again on a later playback');
});

test('a summary keeps its first actual voice for every following clip and a new track can choose again', async t => {
  const requests: Array<{ voice: string; allowVoiceFallback: boolean }> = [];
  const controller = setup(t, async (_, options) => {
    const body = JSON.parse(options!.body as string); requests.push(body);
    return response(body.text, 10, requests.length === 1 ? 'es-AR-ElenaNeural' : body.voice);
  });
  const text = Array.from({ length: 36 }, (_, i) => `Oración ${i} de una síntesis argentina que conserva su narrador.`).join(' ');
  const parts = splitSpeechText(text);
  assert.ok(parts.length >= 3);
  await controller.playTrack(track(text)); await flush();
  for (let i = 0; i < parts.length - 1; i++) {
    assert.equal(controller.getState().voice, 'es-AR-ElenaNeural');
    FakeAudio.instances[0].finish(); await flush();
  }
  assert.equal(controller.getState().voice, 'es-AR-ElenaNeural');
  assert.equal(requests[0].voice, DEFAULT_AUDIO_VOICE);
  assert.equal(requests[0].allowVoiceFallback, true);
  assert.ok(requests.slice(1).every(body => body.voice === 'es-AR-ElenaNeural' && body.allowVoiceFallback === false));
  await controller.playTrack(track('Otra noticia nueva.', 'another')); await flush();
  assert.equal(requests.at(-1)!.voice, DEFAULT_AUDIO_VOICE);
  assert.equal(requests.at(-1)!.allowVoiceFallback, true);
});

test('a later response with a different voice is rejected and retry retains the original narrator', async t => {
  const requests: Array<{ voice: string; allowVoiceFallback: boolean }> = [];
  const controller = setup(t, async (_, options) => {
    const body = JSON.parse(options!.body as string); requests.push(body);
    return response(body.text, 10, requests.length === 1 ? DEFAULT_AUDIO_VOICE : 'es-AR-ElenaNeural');
  });
  const text = 'Una primera oración de este resumen es suficientemente extensa para completar el fragmento inicial de la lectura. '.repeat(10);
  await controller.playTrack(track(text)); await flush();
  FakeAudio.instances[0].finish(); await flush();
  assert.match(controller.getState().error || '', /mantener la voz/);
  assert.equal(controller.getState().voice, DEFAULT_AUDIO_VOICE);
  assert.equal(controller.getState().isPlaying, false);
  controller.retry(); await flush();
  assert.equal(controller.getState().voice, DEFAULT_AUDIO_VOICE);
  assert.ok(requests.slice(1).every(body => body.voice === DEFAULT_AUDIO_VOICE && body.allowVoiceFallback === false));
});
