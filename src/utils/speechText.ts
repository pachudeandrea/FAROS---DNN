export const DEFAULT_AUDIO_VOICE = 'es-AR-TomasNeural';
export const AUDIO_VOICES = ['es-AR-TomasNeural', 'es-AR-ElenaNeural'] as const;
export type ArgentineVoice = typeof AUDIO_VOICES[number];
export const AUDIO_CACHE_VERSION = 'argentina-v2';

/** Preserve all words and sentence order. The first small segment starts sooner. */
export function splitSpeechText(text: string): string[] {
  const clean = text.replace(/\s+/g, ' ').trim();
  if (!clean) return [];
  const sentences = typeof Intl.Segmenter === 'function'
    ? [...new Intl.Segmenter('es-AR', { granularity: 'sentence' }).segment(clean)].map(item => item.segment.trim())
    : clean.split(/(?<=[.!?])\s+(?=[A-ZÁÉÍÓÚÑ¿¡])/u);
  const chunks: string[] = [];
  let current = '';
  for (const sentence of sentences) {
    for (const word of sentence.split(/\s+/)) {
      const limit = chunks.length ? 650 : 260;
      if (current && current.length + word.length + 1 > limit) { chunks.push(current); current = ''; }
      current += (current ? ' ' : '') + word;
    }
    // Finish the opening at a sentence boundary instead of making the user wait for the whole summary.
    if (!chunks.length && current.length >= 90) { chunks.push(current); current = ''; }
  }
  if (current) chunks.push(current);
  return chunks;
}
