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
  private time = 0;
  duration = NaN;
  autoMetadata = true;
  prematureSeeks: number[] = [];
  playbackRate = 1;
  paused = true;
  played: string[] = [];
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  ontimeupdate: (() => void) | null = null;
  onloadedmetadata: (() => void) | null = null;
  ondurationchange: (() => void) | null = null;
  onplaying: (() => void) | null = null;
  onwaiting: (() => void) | null = null;
  onstalled: (() => void) | null = null;
  playResult: ((src: string) => Promise<void>) | null = null;
  constructor() { FakeAudio.instances.push(this); }
  get currentTime() { return this.time; }
  set currentTime(value: number) {
    if (value > 0 && !Number.isFinite(this.duration)) {
      this.prematureSeeks.push(value);
      throw new Error('Cannot seek before metadata');
    }
    this.time = value;
  }
  getAttribute(name: string) { return name === 'src' ? this.src || null : null; }
  removeAttribute(name: string) { if (name === 'src') this.src = ''; }
  pause() { this.paused = true; }
  play() {
    this.played.push(this.src);
    this.paused = false;
    return this.playResult?.(this.src) || Promise.resolve();
  }
  load() {
    this.time = 0;
    this.duration = NaN;
    const source = this.src;
    const duration = FakeAudio.durations.get(source);
    if (duration && this.autoMetadata) queueMicrotask(() => {
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

test('seeking beyond the measured prefix prepares real clips and applies the offset only after mounted metadata', async t => {
  const text = Array.from({ length: 260 }, (_, i) => `dato${i}`).join(' ');
  const chunks = splitSpeechText(text);
  assert.ok(chunks.length >= 4);
  const later = deferred<Response>();
  const requests: Array<{ text: string; voice: string; allowVoiceFallback: boolean }> = [];
  const controller = setup(t, async (_, options) => {
    const body = JSON.parse(options!.body as string);
    requests.push(body);
    return body.text === chunks[2] ? later.promise : response(body.text, [3.25, 4.75, 5.5][chunks.indexOf(body.text)] || 6, 'es-AR-ElenaNeural');
  });
  await controller.playTrack(track(text));
  await flush();
  const active = FakeAudio.instances[0];
  active.currentTime = 1.25;
  active.ontimeupdate?.();
  active.autoMetadata = false;
  controller.seek(10);
  await flush();
  assert.equal(controller.getState().pendingSeekSeconds, 10);
  assert.equal(controller.getState().isSeeking, true);
  assert.equal(controller.getState().currentSeconds, 1.25, 'estimated time never masquerades as a completed seek');
  assert.equal(active.paused, true);
  later.resolve(response(chunks[2], 5.5, 'es-AR-ElenaNeural'));
  await flush();
  assert.equal(active.src, audioUrl(chunks[2]));
  assert.equal(active.currentTime, 0, 'no write is attempted while metadata is missing');
  assert.equal(controller.getState().currentSeconds, 1.25);
  assert.equal(controller.getState().isSeeking, true);
  active.metadata(5.5);
  await flush();
  assert.equal(active.currentTime, 2);
  assert.equal(controller.getState().currentSeconds, 10);
  assert.equal(controller.getState().isSeeking, false);
  assert.equal(controller.getState().pendingSeekSeconds, null);
  assert.equal(controller.getState().isPlaying, true);
  assert.equal(controller.getState().error, null);
  assert.deepEqual(active.prematureSeeks, []);
  assert.equal(controller.getState().voice, 'es-AR-ElenaNeural');
  assert.ok(requests.slice(1).every(body => body.voice === 'es-AR-ElenaNeural' && body.allowVoiceFallback === false));
});

test('rapid forward clicks accumulate intent and an obsolete response cannot override the latest seek', async t => {
  const text = Array.from({ length: 280 }, (_, i) => `informe${i}`).join(' ');
  const chunks = splitSpeechText(text);
  const later = deferred<Response>();
  let obsoleteSignal!: AbortSignal;
  const requested: string[] = [];
  const controller = setup(t, async (_, options) => {
    const { text } = JSON.parse(options!.body as string);
    requested.push(text);
    if (text === chunks[2]) { obsoleteSignal = options!.signal!; return later.promise; }
    return response(text, 4);
  });
  await controller.playTrack(track(text)); await flush();
  controller.forward(); await flush();
  assert.equal(controller.getState().pendingSeekSeconds, 10);
  controller.forward();
  assert.equal(controller.getState().pendingSeekSeconds, 20);
  controller.seek(1); await flush();
  assert.equal(obsoleteSignal.aborted, true);
  assert.equal(controller.getState().currentSeconds, 1);
  assert.equal(controller.getState().isSeeking, false);
  later.resolve(response(chunks[2], 4)); await flush();
  assert.equal(FakeAudio.instances[0].src, audioUrl(chunks[0]));
  assert.equal(controller.getState().currentSeconds, 1);
  assert.equal(controller.getState().isPlaying, true);
  assert.deepEqual([...new Set(requested)], chunks.slice(0, 3), 'obsolete seeks do not keep synthesizing later clips');
});

test('a long seek has a total preparation deadline even when each individual response finishes in time', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const text = Array.from({ length: 600 }, (_, i) => `cotizacion${i}`).join(' ');
  const chunks = splitSpeechText(text);
  assert.ok(chunks.length >= 6);
  const pending = new Map<string, ReturnType<typeof deferred<Response>>>();
  const signals = new Map<string, AbortSignal>();
  const controller = setup(t, async (_, options) => {
    const { text } = JSON.parse(options!.body as string);
    if (chunks.indexOf(text) < 2) return response(text, 4);
    const request = deferred<Response>();
    pending.set(text, request);
    signals.set(text, options!.signal!);
    return request.promise;
  });
  await controller.playTrack(track(text)); await flush();
  controller.seek(10_000); await flush();
  for (let index = 2; index < 5; ++index) {
    assert.ok(pending.has(chunks[index]));
    t.mock.timers.tick(14_000);
    pending.get(chunks[index])!.resolve(response(chunks[index], 4));
    await flush();
  }
  assert.equal(controller.getState().isSeeking, true);
  t.mock.timers.tick(3_000); await flush();
  assert.match(controller.getState().error!, /preparación del salto tardó demasiado/);
  assert.equal(controller.getState().isSeeking, false);
  assert.equal(controller.getState().isLoading, false);
  assert.equal(controller.getState().pendingSeekSeconds, null);
  assert.equal(controller.getState().currentSeconds, 0);
  assert.equal(signals.get(chunks[5])!.aborted, true);
  controller.retry(); await flush();
  assert.equal(controller.getState().error, null);
  assert.equal(controller.getState().isPlaying, true);
});

test('missing metadata during a paused seek has a finite error and never starts the unmeasured clip', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const text = Array.from({ length: 280 }, (_, i) => `cotizacion${i}`).join(' ');
  const chunks = splitSpeechText(text);
  const controller = setup(t, async (_, options) => {
    const { text } = JSON.parse(options!.body as string);
    return response(text, text === chunks[2] ? null : 4);
  });
  await controller.playTrack(track(text)); await flush();
  controller.seek(10); controller.pause(); await flush();
  t.mock.timers.tick(5_000); await flush();
  assert.match(controller.getState().error!, /comprobar la duración/);
  assert.equal(controller.getState().isSeeking, false);
  assert.equal(controller.getState().isLoading, false);
  assert.equal(controller.getState().isPlaying, false);
  assert.equal(FakeAudio.instances[0].played.includes(audioUrl(chunks[2])), false);
});

test('pause during future preparation keeps the resolved seek paused and closing cancels all late work', async t => {
  const text = Array.from({ length: 280 }, (_, i) => `mercado${i}`).join(' ');
  const chunks = splitSpeechText(text);
  const third = deferred<Response>();
  const fourth = deferred<Response>();
  let fourthSignal!: AbortSignal;
  const controller = setup(t, async (_, options) => {
    const { text } = JSON.parse(options!.body as string);
    if (text === chunks[2]) return third.promise;
    if (text === chunks[3]) { fourthSignal = options!.signal!; return fourth.promise; }
    return response(text, 4);
  });
  await controller.playTrack(track(text)); await flush();
  const active = FakeAudio.instances[0];
  controller.seek(10); await flush();
  controller.pause();
  third.resolve(response(chunks[2], 4)); await flush();
  assert.equal(controller.getState().currentSeconds, 10);
  assert.equal(controller.getState().isSeeking, false);
  assert.equal(controller.getState().isPlaying, false);
  assert.equal(active.paused, true);
  assert.equal(active.played.includes(audioUrl(chunks[2])), false, 'seeking while paused never starts the future clip');
  controller.seek(15); await flush();
  const oldMetadata = active.onloadedmetadata;
  controller.stopAll();
  assert.equal(fourthSignal.aborted, true);
  fourth.resolve(response(chunks[3], 4)); oldMetadata?.(); await flush();
  assert.equal(controller.getState().currentTrack, null);
  assert.equal(controller.getState().isSeeking, false);
  assert.equal(controller.getState().pendingSeekSeconds, null);
  assert.equal(active.src, '');
  assert.equal(active.paused, true);
});

test('a replacement track cancels a pending seek even when its old synthesis ignores cancellation', async t => {
  const text = Array.from({ length: 280 }, (_, i) => `variacion${i}`).join(' ');
  const chunks = splitSpeechText(text);
  const later = deferred<Response>();
  let oldSignal!: AbortSignal;
  const controller = setup(t, async (_, options) => {
    const { text } = JSON.parse(options!.body as string);
    if (text === chunks[2]) { oldSignal = options!.signal!; return later.promise; }
    return response(text, 4);
  });
  await controller.playTrack(track(text)); await flush();
  controller.seek(10); await flush();
  assert.equal(controller.getState().isSeeking, true);
  await controller.playTrack(track('Resumen actualizado de otra cartera.', 'replacement')); await flush();
  assert.equal(oldSignal.aborted, true);
  later.resolve(response(chunks[2], 4)); await flush();
  assert.equal(controller.getState().currentTrack?.id, 'replacement');
  assert.equal(controller.getState().isSeeking, false);
  assert.equal(controller.getState().pendingSeekSeconds, null);
  assert.equal(controller.getState().currentSeconds, 0);
  assert.equal(controller.getState().isPlaying, true);
  assert.equal(FakeAudio.instances[0].src, audioUrl('Resumen actualizado de otra cartera.'));
});

test('exact clip boundaries start the next clip at zero and the final endpoint remains safely paused', async t => {
  const text = Array.from({ length: 140 }, (_, i) => `activo${i}`).join(' ');
  const chunks = splitSpeechText(text);
  const controller = setup(t, async (_, options) => response(JSON.parse(options!.body as string).text, 4));
  await controller.playTrack(track(text)); await flush();
  const active = FakeAudio.instances[0];
  controller.seek(4); await flush();
  assert.equal(active.src, audioUrl(chunks[1]));
  assert.equal(active.currentTime, 0);
  assert.equal(controller.getState().currentSeconds, 4);
  controller.seek(1_000); await flush();
  const total = chunks.length * 4;
  assert.equal(controller.getState().totalDuration, total);
  assert.equal(controller.getState().currentSeconds, total);
  assert.equal(controller.getState().isPlaying, false);
  assert.equal(controller.getState().currentTrack?.script, text);
  active.finish(); await flush();
  assert.equal(controller.getState().currentTrack?.script, text, 'an ended event queued by the seek does not close the drawer');
  controller.resume(); await flush();
  assert.equal(active.src, audioUrl(chunks[0]));
  assert.equal(active.currentTime, 0);
  assert.equal(controller.getState().isPlaying, true);
  controller.seek(total - 1); await flush();
  controller.seek(total); await flush();
  active.finish(); await flush();
  assert.equal(controller.getState().currentTrack?.script, text, 'the already mounted final clip also keeps a stable endpoint');
  assert.equal(controller.getState().currentSeconds, total);
  assert.equal(controller.getState().error, null);
});

test('an ended event queued before seeking back cannot stop the resumed mounted clip', async t => {
  const controller = setup(t, async (_, options) => response(JSON.parse(options!.body as string).text, 4));
  await controller.playTrack(track('Una noticia breve.')); await flush();
  const active = FakeAudio.instances[0];
  const queuedEnded = active.onended;
  controller.seek(4); await flush();
  assert.equal(controller.getState().isPlaying, false);
  controller.resume(); await flush();
  assert.equal(active.currentTime, 0);
  assert.equal(controller.getState().isPlaying, true);
  queuedEnded?.(); await flush();
  assert.equal(controller.getState().currentTrack?.script, 'Una noticia breve.');
  assert.equal(controller.getState().currentSeconds, 0);
  assert.equal(controller.getState().isPlaying, true);
  assert.equal(controller.getState().error, null);
  active.finish(); await flush();
  assert.equal(controller.getState().currentTrack, null, 'a subsequent real ending still completes playback');
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
