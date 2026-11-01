import React from 'react';
import { X, ExternalLink } from 'lucide-react';
import type { NewsItem } from '../types';
import { distinctMediaSources } from '../utils/sourceGrounding';
import { useModalFocus } from '../hooks/useModalFocus';
export function VerifiedCoverage({ news }: { news: NewsItem }) {
  const sources = distinctMediaSources(news.sources || []);
  return <section aria-label="Comparación de medios" className="space-y-4">
    <h3 className="text-lg font-bold text-ink-900">{sources.length > 1 ? `El mismo hecho en ${sources.length} medios` : sources.length === 1 ? 'Una fuente verificada' : 'Sin fuentes verificadas disponibles'}</h3>
    <p className="text-base text-muted">{sources.length > 1 ? 'Compará los titulares originales. Abrí las publicaciones para conocer sus detalles.' : sources.length === 1 ? 'Por ahora encontramos una publicación verificada sobre este hecho.' : 'No hay publicaciones verificadas para comparar.'}</p>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">{sources.map(source => <article key={source.sourceUrl} className="min-w-0 p-4 rounded-xl bg-ink-50 flex flex-col gap-3">
      <div><h4 className="font-bold text-brand-950">{source.mediaName}</h4><p className="text-sm text-muted">{source.publishedTime || (source.publishedDateIso && Number.isFinite(Date.parse(source.publishedDateIso)) ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', dateStyle: 'short', timeStyle: 'short' }).format(new Date(source.publishedDateIso)) + ' (Buenos Aires)' : 'Fecha de publicación no disponible')}</p></div>
      <p className="text-base text-ink-900 leading-relaxed flex-1">“{source.originalHeadline}”</p>
      <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center justify-center gap-2 rounded-xl bg-paper px-3 py-2 font-semibold text-sm text-brand-900" aria-label={`Ver noticia en ${source.mediaName}`}>Ver noticia <ExternalLink className="w-4 h-4" /></a>
    </article>)}</div>
  </section>;
}
export function MediaComparisonModal({ news, onClose, onReadImpact }: { news: NewsItem; onClose: () => void; onReadImpact: () => void }) {
  const ref = useModalFocus(onClose);
  return <div className="fixed inset-0 z-50 bg-ink-950/60 p-3 sm:p-6 flex items-center justify-center" onClick={onClose}>
    <div ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="comparison-title" className="bg-paper rounded-2xl w-full max-w-4xl max-h-[calc(100dvh-1.5rem)] flex flex-col overflow-hidden" onClick={event => event.stopPropagation()}>
      <header className="p-4 border-b border-ink-200 flex items-center justify-between gap-3"><h2 id="comparison-title" className="text-lg font-bold text-brand-950">Comparación de medios</h2><button aria-label="Cerrar comparación" onClick={onClose} className="p-2 rounded-xl text-muted"><X className="w-5 h-5" /></button></header>
      <div className="p-4 sm:p-6 overflow-y-auto space-y-5"><p className="text-xl font-bold text-ink-900">{news.headline}</p><VerifiedCoverage news={news} /></div>
      <footer className="p-3 border-t border-ink-200 flex flex-wrap gap-2 justify-end"><button className="px-4 py-2 rounded-xl text-brand-900 font-semibold" onClick={onReadImpact}>Ver impacto en cartera</button><button className="px-4 py-2 rounded-xl bg-brand-950 text-paper font-semibold" onClick={onClose}>Cerrar comparación</button></footer>
    </div>
  </div>;
}
