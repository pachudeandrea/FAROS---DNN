import React from 'react';
import { Portfolio, NewsItem, Asset, getEffectiveImpactForPortfolio } from '../types';
import { Volume2, RefreshCw, ChevronDown, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { NewsQueryState } from '../utils/newsQuery';
import { describeNewsQuery } from '../utils/newsQuery';

interface FeedSummaryHeroProps {
  portfolio: Portfolio; newsList: NewsItem[]; assetsMap: Record<string, Asset>;
  onPlayAudioBrief: () => void; onFilterByAsset?: (symbol: string) => void;
  activeImpactFilter?: string; onToggleImpactFilter?: (impact: 'favorable' | 'alerta' | 'neutral') => void;
  isLoadingNews?: boolean; onRefreshNews?: () => void; dailySummaryDurationText?: string;
  isPlayingDailySummary?: boolean; query: NewsQueryState;
}
export const FeedSummaryHero: React.FC<FeedSummaryHeroProps> = ({ portfolio, newsList, assetsMap, onPlayAudioBrief,
  onFilterByAsset, activeImpactFilter = 'todos', onToggleImpactFilter, isLoadingNews, onRefreshNews,
  dailySummaryDurationText, isPlayingDailySummary, query }) => {
  const items = portfolio.assetIds.length ? newsList.filter(n => n.affectedAssetIds.some(id => portfolio.assetIds.includes(id))) : newsList;
  const counts = { favorable: 0, alerta: 0, neutral: 0 };
  const assets: Record<string, number> = {};
  items.forEach(n => {
    const impact = getEffectiveImpactForPortfolio(n.impact, n.affectedAssetIds, portfolio.assetPositions);
    counts[impact === 'positivo' ? 'favorable' : impact === 'negativo' ? 'alerta' : impact === 'neutro' ? 'neutral' : impact]++;
    n.affectedAssetIds.filter(id => !portfolio.assetIds.length || portfolio.assetIds.includes(id)).forEach(id => assets[id] = (assets[id] || 0) + 1);
  });
  const sources = [...new Set(items.flatMap(n => n.sources.map(s => s.mediaName)))];
  return <section data-tour="feed-hero-pulso" aria-label="Resumen de tu cartera" aria-busy={isLoadingNews} className="min-w-0 rounded-2xl bg-white border border-slate-200 p-4 sm:p-5 space-y-3">
    <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] gap-4 lg:gap-6 items-center">
    <div className="min-w-0 space-y-3">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-emerald-800">Tu pulso financiero</p>
        <h2 className="text-xl sm:text-2xl font-bold text-slate-900 break-words">{portfolio.name}</h2>
        <p role="status" className={`text-sm mt-1 ${query.status === 'error' ? 'text-rose-800' : 'text-slate-600'}`}>{describeNewsQuery(query, newsList.length)}</p>
      </div>

    </div>
    <p className="text-base text-slate-800"><strong>{items.length}</strong> novedades · <strong>{counts.alerta}</strong> con impacto de alerta</p>
    <div className="flex flex-wrap items-center gap-2">
      <button data-tour="feed-refresh-btn" aria-label="Actualizar pulso" title="Actualizar pulso" onClick={onRefreshNews} disabled={isLoadingNews} className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 text-slate-800 font-semibold text-sm disabled:opacity-60">
        <RefreshCw className={`w-4 h-4 ${isLoadingNews ? 'animate-spin' : ''}`} /><span className="hidden sm:inline">{isLoadingNews ? 'Buscando…' : 'Actualizar pulso'}</span>
      </button>

      <button data-tour="feed-audio-brief" onClick={onPlayAudioBrief} disabled={!items.length} className="inline-flex items-center justify-center gap-2 bg-emerald-950 text-white rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50" aria-label={isPlayingDailySummary ? 'Pausar o detener resumen del día' : 'Escuchar resumen del día'}>
        <Volume2 className="w-4 h-4" />{isPlayingDailySummary ? 'Pausar resumen' : 'Escuchar resumen'}{dailySummaryDurationText && <span className="hidden sm:inline text-emerald-200">{dailySummaryDurationText}</span>}
      </button>
    </div>
    {!portfolio.assetIds.length && <p className="text-sm text-slate-600">Panorama general. Agregá activos desde Mi cartera para personalizarlo.</p>}
    </div>
    <div role="group" aria-label="Filtrar noticias por impacto" className="grid grid-cols-3 gap-2 sm:gap-3">
      {([
        { impact: 'favorable', label: 'Favorables', icon: TrendingUp, colors: 'bg-emerald-50 text-emerald-900 border-emerald-200', selected: 'bg-emerald-900 text-white border-emerald-900' },
        { impact: 'alerta', label: 'Alertas', icon: TrendingDown, colors: 'bg-rose-50 text-rose-900 border-rose-200', selected: 'bg-rose-800 text-white border-rose-800' },
        { impact: 'neutral', label: 'Neutrales', icon: Minus, colors: 'bg-slate-50 text-slate-700 border-slate-200', selected: 'bg-slate-700 text-white border-slate-700' },
      ] as const).map(({ impact, label, icon: Icon, colors, selected }) => {
        const active = activeImpactFilter === impact || activeImpactFilter === ({ favorable: 'positivo', alerta: 'negativo', neutral: 'neutro' } as const)[impact];
        return <button key={impact} type="button" aria-pressed={active} aria-label={`${label}: ${counts[impact]} noticias`} onClick={() => onToggleImpactFilter?.(impact)} className={`min-w-0 rounded-2xl border px-2 sm:px-4 py-2 sm:py-3 lg:py-6 flex flex-col items-center gap-1.5 transition-colors ${active ? selected : colors} hover:brightness-95`}>
          <Icon aria-hidden="true" className="hidden sm:block w-5 h-5" />
          <span className="text-2xl sm:text-3xl font-bold tabular-nums leading-none">{counts[impact]}</span>
          <span className="text-xs sm:text-sm font-semibold">{label}</span>
        </button>;
      })}
    </div>
    </div>
    <details className="border-t border-slate-100 pt-1">
      <summary className="flex items-center justify-between py-2 text-sm font-semibold text-emerald-900 cursor-pointer">Balance y activos mencionados<ChevronDown className="w-4 h-4" /></summary>
      <div className="space-y-3 pt-2">

        <p className="text-sm text-slate-600">El impacto refleja las noticias disponibles y tus posiciones LONG/SHORT. Una consulta vacía no permite concluir que no haya riesgos.</p>
        <div className="flex flex-wrap gap-2">{Object.entries(assets).sort((a,b) => b[1]-a[1]).slice(0,5).map(([id, count]) => <button key={id} onClick={() => onFilterByAsset?.(id)} className="rounded-xl px-3 py-2 bg-slate-50 text-sm text-slate-800" title={assetsMap[id]?.name}>{id} · {count}</button>)}</div>
        {sources.length > 0 && <p className="text-sm text-slate-600">Publicaciones incluidas: {sources.join(', ')}.</p>}
      </div>
    </details>
  </section>;
};
