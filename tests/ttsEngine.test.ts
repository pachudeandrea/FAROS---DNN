import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setImmediate as nextTurn } from 'node:timers/promises';
import { computeScriptHash, createSpeechService, type SpeechTransport } from '../src/server/ttsEngine';
import { AUDIO_CACHE_VERSION, DEFAULT_AUDIO_VOICE } from '../src/utils/speechText';
import crypto from 'node:crypto';

// Synthetic bytes exercise request/cache behavior only; they are not playable audio or live content.
const fixtureAudio = (marker = 1) => {
  const bytes = Buffer.alloc(512, marker);
  bytes.write('ID3');
  return bytes;
};
const deferredAudio = () => {
  let resolve!: (value: Buffer) => void;
  const promise = new Promise<Buffer>(done => { resolve = done; });
  return { promise, resolve };
};

test('TTS completes the foreground request with audio bytes and actual voice metadata', async () => {
  const bytes = fixtureAudio();
  const calls: Array<{ text: string; voice: string }> = [];
  const service = createSpeechService(async (text, voice) => {
    calls.push({ text, voice });
    return bytes;
  });

  const result = await service.synthesize('  Texto sintético de prueba.  ');
  assert.equal(result.success, true);
  assert.equal(result.mimeType, 'audio/mpeg');
  assert.equal(result.voice, 'es-AR-TomasNeural');
  assert.equal(result.cached, false);
  assert.deepEqual(Buffer.from(result.audioBase64!, 'base64'), bytes);
  assert.deepEqual(calls, [{ text: 'Texto sintético de prueba.', voice: 'es-AR-TomasNeural' }]);
  assert.equal('audioUrl' in result, false, 'No second request depends on an instance-local file');
  assert.equal('url' in result, false);
  assert.equal('status' in result, false, 'Success contains completed audio, not a pending background job');
});

test('TTS hashes distinguish text and voice, trim input, and include the cache version', () => {
  const text = 'Texto sintético para el hash.';
  const tomas = computeScriptHash(text, 'es-AR-TomasNeural');
  const elena = computeScriptHash(text, 'es-AR-ElenaNeural');
  assert.equal(computeScriptHash(`  ${text}  `), tomas);
  assert.notEqual(tomas, elena);
  assert.notEqual(tomas, computeScriptHash(`${text} Otro texto.`));
  assert.equal(tomas, crypto.createHash('sha256').update(`${AUDIO_CACHE_VERSION}:${DEFAULT_AUDIO_VOICE}:${text}`).digest('hex'));
});

test('TTS cached audio makes no transport request and keeps each requested voice separate', async () => {
  const calls: string[] = [];
  const service = createSpeechService(async (_text, voice) => {
    calls.push(voice);
    return fixtureAudio(voice === 'es-AR-TomasNeural' ? 1 : 2);
  });
  const first = await service.synthesize('Prueba de caché.');
  const hit = await service.synthesize('  Prueba de caché.  ');
  assert.equal(hit.cached, true);
  assert.equal(hit.audioBase64, first.audioBase64);
  assert.equal(calls.length, 1);

  const otherVoice = await service.synthesize('Prueba de caché.', undefined, 'es-AR-ElenaNeural');
  assert.equal(otherVoice.cached, false);
  assert.notEqual(otherVoice.audioBase64, first.audioBase64);
  assert.notEqual(otherVoice.hash, first.hash);
  assert.deepEqual(calls, ['es-AR-TomasNeural', 'es-AR-ElenaNeural']);
});

test('TTS shares one transport job for concurrent consumers of the same text and voice', async () => {
  const pending = deferredAudio();
  let calls = 0;
  const service = createSpeechService(() => { calls++; return pending.promise; });
  const first = service.synthesize('Prueba compartida.');
  const second = service.synthesize('Prueba compartida.');
  assert.equal(calls, 1);
  pending.resolve(fixtureAudio());
  const results = await Promise.all([first, second]);
  assert.equal(results[0].success, true);
  assert.deepEqual(results[0], results[1]);
  assert.equal((await service.synthesize('Prueba compartida.')).cached, true);
  assert.equal(calls, 1);
});

test('cancelling one TTS consumer does not cancel or poison the other consumer or its cache', async () => {
  const pending = deferredAudio();
  const signals: AbortSignal[] = [];
  const service = createSpeechService((_text, _voice, signal) => {
    signals.push(signal);
    return pending.promise;
  });
  const firstController = new AbortController();
  const first = service.synthesize('Prueba de cancelación compartida.', firstController.signal);
  const second = service.synthesize('Prueba de cancelación compartida.');
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  firstController.abort();
  await cancelled;
  assert.equal(signals[0].aborted, false);
  pending.resolve(fixtureAudio());
  assert.equal((await second).success, true);
  assert.equal((await service.synthesize('Prueba de cancelación compartida.')).cached, true);
  assert.equal(signals.length, 1);
});

test('cancelling every TTS consumer aborts transport and a later attempt can start cleanly', async () => {
  const pending = deferredAudio();
  const signals: AbortSignal[] = [];
  const service = createSpeechService((_text, _voice, signal) => {
    signals.push(signal);
    return signals.length === 1 ? pending.promise : Promise.resolve(fixtureAudio());
  });
  const controller = new AbortController();
  const first = service.synthesize('Prueba cancelada.', controller.signal);
  const cancelled = assert.rejects(first, { name: 'AbortError' });
  controller.abort();
  await cancelled;
  assert.equal(signals[0].aborted, true);
  await nextTurn();
  const retried = await service.synthesize('Prueba cancelada.');
  assert.equal(retried.success, true);
  assert.equal(retried.cached, false);
  assert.equal(signals.length, 2);
});

test('TTS absolute timeout ends a transport that ignores cancellation', { timeout: 1500 }, async () => {
  let observedSignal: AbortSignal | undefined;
  const service = createSpeechService((_text, _voice, signal) => {
    observedSignal = signal;
    return new Promise<Buffer>(() => {});
  }, { timeoutMs: 30 });
  const start = performance.now();
  const result = await service.synthesize('Prueba de espera acotada.');
  assert.equal(result.success, false);
  assert.equal(result.fallbackTextOnly, true);
  assert.match(result.error!, /Reintentar/);
  assert.equal(observedSignal?.aborted, true);
  assert.ok(performance.now() - start < 1000, 'An uncooperative transport must not leave the player waiting indefinitely');
});

test('failed TTS requests are not cached and the next attempt can recover', async () => {
  let unavailable = true;
  let calls = 0;
  const service = createSpeechService(async () => {
    calls++;
    if (unavailable) throw new Error('Synthetic transport outage');
    return fixtureAudio();
  });
  const failed = await service.synthesize('Prueba de recuperación.');
  assert.equal(failed.success, false);
  assert.equal(failed.audioBase64, undefined);
  assert.equal(calls, 2, 'Both available Argentine voices were attempted');
  unavailable = false;
  const recovered = await service.synthesize('Prueba de recuperación.');
  assert.equal(recovered.success, true);
  assert.equal(recovered.cached, false);
  assert.equal(calls, 3);
  assert.equal((await service.synthesize('Prueba de recuperación.')).cached, true);
  assert.equal(calls, 3);
});

test('TTS fallback reports Elena only when Elena actually supplied the audio', async () => {
  const voices: string[] = [];
  const service = createSpeechService(async (_text, voice) => {
    voices.push(voice);
    if (voice === 'es-AR-TomasNeural') throw new Error('Synthetic primary failure');
    return fixtureAudio(2);
  });
  const result = await service.synthesize('Prueba de voz alternativa.');
  assert.equal(result.success, true);
  assert.equal(result.voice, 'es-AR-ElenaNeural');
  assert.match(result.notice!, /argentina Elena/);
  assert.deepEqual(voices, ['es-AR-TomasNeural', 'es-AR-ElenaNeural']);
  const cached = await service.synthesize('Prueba de voz alternativa.');
  assert.equal(cached.cached, true);
  assert.equal(cached.voice, 'es-AR-ElenaNeural');
  assert.equal(cached.notice, result.notice);
  assert.equal(voices.length, 2);
});

test('TTS honors Elena as an explicit first choice and can fall back to Tomás', async () => {
  const voices: string[] = [];
  const service = createSpeechService(async (_text, voice) => {
    voices.push(voice);
    if (voice === 'es-AR-ElenaNeural') throw new Error('Synthetic alternate failure');
    return fixtureAudio();
  });
  const result = await service.synthesize('Prueba de elección explícita.', undefined, 'es-AR-ElenaNeural');
  assert.equal(result.success, true);
  assert.equal(result.voice, 'es-AR-TomasNeural');
  assert.match(result.notice!, /argentina Tomás/);
  assert.deepEqual(voices, ['es-AR-ElenaNeural', 'es-AR-TomasNeural']);
});

test('invalid TTS text, unavailable voices, and already-cancelled requests do not call transport', async () => {
  let calls = 0;
  const service = createSpeechService(async () => { calls++; return fixtureAudio(); });
  for (const text of ['', '   ', 'a'.repeat(12001)]) {
    const result = await service.synthesize(text);
    assert.equal(result.success, false);
    assert.match(result.error!, /texto/);
  }
  const wrongVoice = await service.synthesize('Prueba válida.', undefined, 'es-MX-DaliaNeural');
  assert.equal(wrongVoice.success, false);
  assert.match(wrongVoice.error!, /voz/);
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(service.synthesize('Prueba cancelada de antemano.', controller.signal), { name: 'AbortError' });
  assert.equal(calls, 0);
});

test('TTS evicts least recently used audio when the byte budget is reached', async () => {
  const calls: string[] = [];
  const transport: SpeechTransport = async text => { calls.push(text); return fixtureAudio(); };
  const service = createSpeechService(transport, { maxBytes: 1400 });
  await service.synthesize('Prueba A.');
  await service.synthesize('Prueba B.');
  assert.equal((await service.synthesize('Prueba A.')).cached, true);
  await service.synthesize('Prueba C.');
  assert.equal((await service.synthesize('Prueba A.')).cached, true, 'Reading A refreshes its LRU position');
  assert.equal((await service.synthesize('Prueba B.')).cached, false, 'B was the oldest retained entry');
  assert.deepEqual(calls, ['Prueba A.', 'Prueba B.', 'Prueba C.', 'Prueba B.']);
});

test('TTS concurrency capacity rejects only extra jobs and frees capacity after completion', async () => {
  const pending = deferredAudio();
  const calls: string[] = [];
  const service = createSpeechService(text => {
    calls.push(text);
    return text === 'Prueba ocupada.' ? pending.promise : Promise.resolve(fixtureAudio());
  }, { maxJobs: 1 });
  const active = service.synthesize('Prueba ocupada.');
  const rejected = await service.synthesize('Prueba adicional.');
  assert.equal(rejected.success, false);
  assert.match(rejected.error!, /varios audios/);
  assert.deepEqual(calls, ['Prueba ocupada.']);
  pending.resolve(fixtureAudio());
  assert.equal((await active).success, true);
  assert.equal((await service.synthesize('Prueba adicional.')).success, true);
  assert.deepEqual(calls, ['Prueba ocupada.', 'Prueba adicional.']);
});
