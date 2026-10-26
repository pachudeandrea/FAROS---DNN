import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { MsEdgeTTS, OUTPUT_FORMAT } from 'msedge-tts';

const ROOT_DIR = process.cwd();
const AUDIO_CACHE_DIR = path.resolve(ROOT_DIR, 'audio_cache');
const VOICE_ARGENTINA = 'es-AR-ElenaNeural';

// Ensure audio cache directory exists
if (!fs.existsSync(AUDIO_CACHE_DIR)) {
  fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
}

export interface SynthesisResult {
  success: boolean;
  audioUrl?: string;
  audioBase64?: string;
  mimeType?: string;
  engine?: string;
  voice?: string;
  cached?: boolean;
  duration?: number;
  isStreaming?: boolean;
  chunkUrl?: string;
  chunkDuration?: number;
  totalChunks?: number;
  hash?: string;
  error?: string;
  notice?: string;
  fallbackTextOnly?: boolean;
}

/**
 * Computes sha256 of text for disk cache keys
 */
export function computeScriptHash(text: string): string {
  return crypto.createHash('sha256').update(text.trim()).digest('hex');
}

/**
 * Splits text into sentences for streaming playback
 */
function splitSentences(text: string): string[] {
  const cleaned = text.trim();
  if (!cleaned) return [];
  const parts = cleaned.split(/(?<=[.?!])\s+/);
  return parts.map(p => p.trim()).filter(Boolean);
}

/**
 * Helper to synthesize given text to an MP3 file using MsEdgeTTS
 */
async function synthesizeTextToFile(text: string, outputPath: string): Promise<number> {
  const tts = new MsEdgeTTS();
  await tts.setMetadata(VOICE_ARGENTINA, OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3);

  return new Promise<number>((resolve, reject) => {
    try {
      const { audioStream } = tts.toStream(text);
      const chunks: Buffer[] = [];

      audioStream.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
      });

      audioStream.on('end', () => {
        try {
          const buffer = Buffer.concat(chunks);
          if (buffer.length < 200) {
            return reject(new Error('Audio generado de tamaño insuficiente'));
          }
          fs.writeFileSync(outputPath, buffer);
          resolve(buffer.length);
        } catch (writeErr) {
          reject(writeErr);
        }
      });

      audioStream.on('error', (err: any) => {
        reject(err);
      });
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Warm up TTS engine in-process without port collisions or daemon processes
 */
export async function ensurePiperDaemon(): Promise<boolean> {
  try {
    if (!fs.existsSync(AUDIO_CACHE_DIR)) {
      fs.mkdirSync(AUDIO_CACHE_DIR, { recursive: true });
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Asynchronously prefetches audio scripts into disk cache
 */
export async function prefetchAudioScripts(items: Array<{ text: string; hash?: string }>): Promise<void> {
  if (!items || items.length === 0) return;

  // Process sequentially in background to avoid bursting
  (async () => {
    for (const item of items) {
      const text = item.text?.trim();
      if (!text) continue;
      const hash = item.hash || computeScriptHash(text);
      const targetPath = path.join(AUDIO_CACHE_DIR, `${hash}.mp3`);

      if (!fs.existsSync(targetPath) || fs.statSync(targetPath).size < 500) {
        try {
          await synthesizeTextToFile(text, targetPath);
        } catch {
          // Ignore prefetch errors silently
        }
      }
    }
  })().catch(() => {});
}

/**
 * Synthesizes Argentine Spanish speech with sub-second objective:
 * 1. Immediate disk cache lookup (< 5ms)
 * 2. In-process Neuronal MsEdgeTTS (es-AR-ElenaNeural)
 * 3. First-sentence streaming chunk for sub-second playback start
 * 4. Zero port collisions or external Python dependencies
 */
export async function synthesizeArgentineSpeech(
  rawText: string,
  abortSignal?: AbortSignal
): Promise<SynthesisResult> {
  const cleanText = rawText.trim();
  if (!cleanText) {
    return {
      success: false,
      error: 'El texto es requerido para la síntesis de audio.'
    };
  }

  const hash = computeScriptHash(cleanText);
  const cachedMp3Path = path.join(AUDIO_CACHE_DIR, `${hash}.mp3`);

  // 1. Instant Disk Cache Check: return immediately in < 2ms!
  if (fs.existsSync(cachedMp3Path)) {
    try {
      const stats = fs.statSync(cachedMp3Path);
      if (stats.size > 500) {
        return {
          success: true,
          audioUrl: `/api/audio/file/${hash}.mp3`,
          hash,
          cached: true,
          mimeType: 'audio/mpeg',
          engine: 'Audio Cache (Neuronal es-AR)',
          voice: VOICE_ARGENTINA
        };
      }
    } catch {}
  }

  // 2. Synthesize using in-process Neuronal Edge-TTS
  try {
    const sentences = splitSentences(cleanText);

    // If multi-sentence, synthesize first sentence chunk for sub-second start
    if (sentences.length > 1) {
      const chunk0Path = path.join(AUDIO_CACHE_DIR, `${hash}_chunk_0.mp3`);
      
      // Synthesize chunk 0 first if not cached
      if (!fs.existsSync(chunk0Path) || fs.statSync(chunk0Path).size < 500) {
        try {
          await synthesizeTextToFile(sentences[0], chunk0Path);
        } catch {}
      }

      // Complete full text in background / foreground
      const fullPromise = synthesizeTextToFile(cleanText, cachedMp3Path);

      // If chunk 0 is ready, return streaming chunk immediately
      if (fs.existsSync(chunk0Path) && fs.statSync(chunk0Path).size > 500) {
        fullPromise.catch(() => {}); // let it complete in background
        return {
          success: true,
          hash,
          cached: false,
          isStreaming: true,
          chunkUrl: `/api/audio/file/${hash}_chunk_0.mp3`,
          chunkDuration: Math.max(2.5, sentences[0].split(/\s+/).length * 0.4),
          totalChunks: sentences.length,
          audioUrl: `/api/audio/file/${hash}.mp3`,
          mimeType: 'audio/mpeg',
          engine: 'Microsoft Edge Neuronal TTS (Streaming)',
          voice: VOICE_ARGENTINA
        };
      }

      // Otherwise wait for full synthesis
      await fullPromise;
    } else {
      await synthesizeTextToFile(cleanText, cachedMp3Path);
    }

    if (fs.existsSync(cachedMp3Path)) {
      return {
        success: true,
        hash,
        cached: false,
        audioUrl: `/api/audio/file/${hash}.mp3`,
        mimeType: 'audio/mpeg',
        engine: 'Microsoft Edge Neuronal TTS',
        voice: VOICE_ARGENTINA
      };
    }

    throw new Error('No se generó el archivo de audio.');
  } catch (err: any) {
    console.warn('[TTS] Synthesis warning, falling back to text:', err?.message || err);
    return {
      success: false,
      error: 'Audio no disponible en este momento.',
      notice: 'El motor neuronal está en proceso. Podés leer la síntesis a continuación.',
      fallbackTextOnly: true
    };
  }
}
