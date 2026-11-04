import crypto from 'node:crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { AUDIO_CACHE_VERSION, AUDIO_VOICES, DEFAULT_AUDIO_VOICE, splitSpeechText, type ArgentineVoice } from '../utils/speechText.js';

export interface SynthesisResult {
  success: boolean;
  audioBase64?: string;
  mimeType?: string;
  engine?: string;
  voice?: string;
  cached?: boolean;
  hash?: string;
  error?: string;
  notice?: string;
  fallbackTextOnly?: boolean;
}
export type SpeechTransport = (text: string, voice: ArgentineVoice, signal: AbortSignal) => Promise<Buffer>;
const abortError = () => Object.assign(new Error('Audio cancelado'), { name: 'AbortError' });
function abortable<T>(promise: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise((resolve, reject) => {
    const cancel = () => reject(abortError());
    signal.addEventListener('abort', cancel, { once: true });
    if (signal.aborted) cancel();
    promise.then(resolve, reject).finally(() => signal.removeEventListener('abort', cancel));
  });
}
const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
export function computeScriptHash(text: string, voice: ArgentineVoice = DEFAULT_AUDIO_VOICE): string {
  return crypto.createHash('sha256').update(`${AUDIO_CACHE_VERSION}:${voice}:${text.trim()}`).digest('hex');
}

/** Each segment completes inside its HTTP request. No second file or persistent instance is required. */
export const edgeSpeechTransport: SpeechTransport = async (text, voice, signal) => {
  const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY;
  const agent = proxy ? new HttpsProxyAgent(proxy) : undefined;
  const tts = new MsEdgeTTS({ agent, connectionTimeoutMs: 4500, synthesisTimeoutMs: 5500 });
  let stream: ReturnType<MsEdgeTTS['toStream']>['audioStream'] | undefined;
  const cancel = () => { stream?.destroy(abortError()); tts.close(); };
  signal.addEventListener('abort', cancel, { once: true });
  try {
    if (signal.aborted) throw abortError();
    await tts.setMetadata(voice, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);
    if (signal.aborted) throw abortError();
    stream = tts.toStream(escapeXml(text), { rate: 1, pitch: '+0Hz' }).audioStream;
    const chunks: Buffer[] = [];
    let bytes = 0;
    for await (const chunk of stream) {
      if (signal.aborted) throw abortError();
      bytes += chunk.length;
      if (bytes > 2 * 1024 * 1024) throw new Error('AUDIO_TOO_LARGE');
      chunks.push(Buffer.from(chunk));
    }
    const audio = Buffer.concat(chunks);
    if (audio.length < 256) throw new Error('AUDIO_EMPTY');
    return audio;
  } finally {
    signal.removeEventListener('abort', cancel);
    tts.close();
    agent?.destroy();
  }
};

export function createSpeechService(transport: SpeechTransport = edgeSpeechTransport, options: { timeoutMs?: number; maxBytes?: number; maxJobs?: number } = {}) {
  const cache = new Map<string, { result: SynthesisResult; bytes: number; at: number }>();
  const jobs = new Map<string, { controller: AbortController; promise: Promise<SynthesisResult>; users: number }>();
  const timeoutMs = options.timeoutMs ?? 12500;
  const maxBytes = options.maxBytes ?? 8 * 1024 * 1024;
  let cacheBytes = 0;

  async function synthesize(rawText: string, signal?: AbortSignal, requestedVoice: string = DEFAULT_AUDIO_VOICE): Promise<SynthesisResult> {
    if (signal?.aborted) throw abortError();
    const text = rawText.trim();
    if (!text || text.length > 12000) return { success: false, error: 'El texto de audio debe tener entre 1 y 12000 caracteres.' };
    if (!AUDIO_VOICES.includes(requestedVoice as ArgentineVoice)) return { success: false, error: 'La voz solicitada no está disponible.' };
    const voice = requestedVoice as ArgentineVoice;
    const hash = computeScriptHash(text, voice);
    const hit = cache.get(hash);
    if (hit) {
      cache.delete(hash); cacheBytes -= hit.bytes;
      if (Date.now() - hit.at < 30 * 60000) { cache.set(hash, hit); cacheBytes += hit.bytes; return { ...hit.result, cached: true }; }
    }
    let job = jobs.get(hash);
    if (!job) {
      if (jobs.size >= (options.maxJobs ?? 6)) return { success: false, error: 'Hay varios audios preparándose. Volvé a intentar en unos segundos.' };
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), timeoutMs);
      const entry = { controller, users: 0, promise: null as unknown as Promise<SynthesisResult> };
      entry.promise = (async () => {
        let chosen = voice;
        let buffer: Buffer;
        // A short primary attempt leaves time for the other Argentine voice, without another account.
        try {
          const primary = AbortSignal.any([controller.signal, AbortSignal.timeout(Math.min(7500, timeoutMs))]);
          buffer = await abortable(transport(text, voice, primary), primary);
        } catch {
          if (controller.signal.aborted) throw abortError();
          chosen = voice === 'es-AR-TomasNeural' ? 'es-AR-ElenaNeural' : 'es-AR-TomasNeural';
          buffer = await abortable(transport(text, chosen, controller.signal), controller.signal);
        }
        if (controller.signal.aborted) throw abortError();
        if (buffer.length < 256) throw new Error('AUDIO_EMPTY');
        const result: SynthesisResult = { success: true, audioBase64: buffer.toString('base64'), mimeType: 'audio/mpeg', hash, cached: false, engine: 'Microsoft Neural', voice: chosen,
          ...(chosen !== voice ? { notice: `Se está usando la voz argentina ${chosen === 'es-AR-ElenaNeural' ? 'Elena' : 'Tomás'} porque la otra no respondió.` } : {}) };
        const bytes = buffer.length * 4 / 3;
        if (bytes <= maxBytes) {
          while (cacheBytes + bytes > maxBytes || cache.size >= 96) {
            const key = cache.keys().next().value;
            if (!key) break;
            cacheBytes -= cache.get(key)!.bytes; cache.delete(key);
          }
          cache.set(hash, { result, bytes, at: Date.now() }); cacheBytes += bytes;
        }
        return result;
      })().catch(() => ({ success: false, error: 'No se pudo preparar el audio. Tocá Reintentar.', fallbackTextOnly: true } as SynthesisResult)).finally(() => {
        clearTimeout(timeout);
        if (jobs.get(hash) === entry) jobs.delete(hash);
      });
      jobs.set(hash, entry); job = entry;
    }
    job.users++;
    const current = job;
    return new Promise<SynthesisResult>((resolve, reject) => {
      let settled = false;
      const finish = (value?: SynthesisResult, cancelled = false) => {
        if (settled) return;
        settled = true; signal?.removeEventListener('abort', cancel); current.users--;
        if (cancelled && current.users === 0) current.controller.abort();
        if (cancelled) reject(abortError()); else resolve(value!);
      };
      const cancel = () => finish(undefined, true);
      signal?.addEventListener('abort', cancel, { once: true });
      if (signal?.aborted) cancel();
      current.promise.then(value => finish(value));
    });
  }
  return { synthesize };
}

const speechService = createSpeechService();
export const synthesizeArgentineSpeech = speechService.synthesize;
export async function prefetchAudioScripts(items: Array<{ text: string }>, signal?: AbortSignal): Promise<void> {
  await Promise.all(items.slice(0, 2).map(item => {
    const first = splitSpeechText(item.text || '')[0];
    return first ? synthesizeArgentineSpeech(first, signal).catch(() => {}) : Promise.resolve();
  }));
}
