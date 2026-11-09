import React from 'react';
import { NewsItem, Asset, RelevanceType, AssetPosition, Portfolio } from '../types';
import { generatePortfolioNewsScript } from '../utils/dailySummaryGenerator';
import { getPortfolioAffectedAssetIds, getPortfolioNewsImpact } from '../utils/portfolioNews';
import { 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Volume2, 
  ArrowRight, 
  Bookmark, 
  Layers
} from 'lucide-react';
import { calculateEstimatedDuration } from '../utils/audioController';
import { distinctMediaSources } from '../utils/sourceGrounding';

interface NewsCardProps {
  news: NewsItem;
  assetsMap: Record<string, Asset>;
  onCompare: (news: NewsItem) => void;
  onSelect: (news: NewsItem) => void;
  onPlayAudio: (news: NewsItem) => void;
  onToggleSave: (news: NewsItem) => void;
  archived?: boolean;
  savePending?: boolean;
  isSaved?: boolean;
  portfolioAssetIds: string[];
  assetPositions?: Record<string, AssetPosition>;
  portfolio: Portfolio;
}

export const getRelevanceLabel = (type: RelevanceType): string => {
  switch (type) {
    case 'impacto_precio':
      return 'Impacto en precio';
    case 'valoracion_mercado':
      return 'Valoración de mercado';
    case 'ruido':
      return 'Ruido de mercado';
    case 'contexto_macro':
      return 'Contexto macroeconómico';
  }
};

export const NewsCard: React.FC<NewsCardProps> = ({
  news,
  assetsMap,
  onSelect,
  onCompare,
  onPlayAudio,
  onToggleSave,
  isSaved = false,
  archived = false,
  savePending = false,
  portfolioAssetIds,
  assetPositions,
  portfolio,
}) => {
  const matchingAssetIds = getPortfolioAffectedAssetIds(news, portfolioAssetIds);
  const primaryAssetSymbol = assetsMap[matchingAssetIds[0]]?.symbol || matchingAssetIds[0] || 'MK';
  const audioDuration = React.useMemo(() => calculateEstimatedDuration(generatePortfolioNewsScript(portfolio, news), 1.0).formatted, [portfolio, news]);

  // Calculate effective impact based on portfolio positions (e.g. Short position inverts impact)
  const effectiveImpact = getPortfolioNewsImpact(news, { assetIds: portfolioAssetIds, assetPositions });

  const isFavorable = effectiveImpact === 'favorable' || effectiveImpact === 'positivo';
  const isAlert = effectiveImpact === 'alerta' || effectiveImpact === 'negativo';

  const getImpactBadge = () => {
    if (isFavorable) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-brand-950 bg-brand-100/80 border border-brand-300 px-3 py-1.5 rounded-full shadow-2xs">
          <TrendingUp className="w-3.5 h-3.5 text-brand-text stroke-[2.5]" />
          <span>Favorable</span>
        </span>
      );
    }
    if (isAlert) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-danger-950 bg-danger-100/80 border border-danger-300 px-3 py-1.5 rounded-full shadow-2xs">
          <TrendingDown className="w-3.5 h-3.5 text-danger-700 stroke-[2.5]" />
          <span>Alerta</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-800 bg-ink-100 border border-ink-300 px-3 py-1.5 rounded-full shadow-2xs">
        <Minus className="w-3.5 h-3.5 text-muted stroke-[2.5]" />
        <span>Neutral</span>
      </span>
    );
  };

  const impactBorderClass = isFavorable
    ? 'hover:border-brand-500 border-l-[5px] border-l-brand-600'
    : isAlert
    ? 'hover:border-danger-500 border-l-[5px] border-l-danger-600'
    : 'hover:border-ink-400 border-l-[5px] border-l-ink-400';

  return (
    <article 
      className={`group bg-paper rounded-3xl border border-ink-200/90 ${impactBorderClass}  transition-all duration-200 p-4 sm:p-6 flex flex-col justify-between space-y-4`}
    >
      <div className="space-y-3.5">
        {/* Top Header: Rocket Money-style Ticker Avatar + Category Tag + Time + Bookmark */}
        <div className="flex flex-wrap gap-2 items-center justify-between text-sm">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Ticker Initial Avatar */}
            <div className="w-8 h-8 rounded-xl bg-brand-950 text-paper font-mono font-bold text-xs flex items-center justify-center shadow-xs">
              {primaryAssetSymbol.slice(0, 2)}
            </div>

            <span className="font-extrabold text-brand-950 uppercase tracking-wider text-[11px] bg-brand-50 border border-brand-200/80 px-2.5 py-1 rounded-full">
              {getRelevanceLabel(news.relevanceType)}
            </span>
            <span aria-hidden="true" className="text-ink-300 font-bold">·</span>
            <span className="font-medium text-muted">{archived ? (() => { const source = news.sources[0]; const at = source?.publishedTimestamp ?? Date.parse(source?.publishedDateIso || ''); return Number.isFinite(at) ? new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: 'numeric', month: 'long', year: 'numeric' }).format(at) : 'Fecha no disponible'; })() : news.publishedAgo}</span>
          </div>

          <button
            data-tour="feed-card-bookmark"
            disabled={savePending}
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(news);
            }}
            title={isSaved ? "Quitar de guardadas" : "Guardar noticia"}
            className={`p-2 rounded-full hover:bg-ink-100 transition-colors ${
              isSaved ? "text-brand-900 bg-brand-100/70" : "text-muted hover:text-muted"
            }`}
            aria-label={savePending ? "Guardando noticia" : isSaved ? "Quitar de guardadas" : "Guardar noticia"}
            aria-pressed={isSaved}
          >
            <Bookmark className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Headline: High legibility bold fintech styling */}
        <h3 className="text-lg sm:text-xl font-extrabold text-ink-900 group-hover:text-brand-950 transition-colors leading-snug tracking-tight">
          <button className="text-left" onClick={() => onSelect(news)}>{news.headline}</button>
        </h3>

        {/* Brief Summary (2-3 lines): clear readable high-contrast text */}
        <p className="text-base text-muted leading-relaxed font-normal">
          {news.briefSummary}
        </p>
        {news.relevanceType === 'valoracion_mercado' && news.portfolioImpactAnalysis?.directExplanation && (
          <details className="text-sm text-muted leading-relaxed">
            <summary className="cursor-pointer font-semibold text-brand-950">Por qué se clasifica así</summary>
            <p className="pt-2">{news.portfolioImpactAnalysis.directExplanation}</p>
          </details>
        )}

        {/* Affected Portfolio Assets Chips + Position Badge + Effect Badge */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
          {/* Affected Assets Chips with optional Long/Short position badges */}
          {matchingAssetIds.length > 0 && <div role="region" aria-label="Activos de tu cartera afectados" className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-muted mr-1">
              Activos:
            </span>
            {matchingAssetIds.map((assetId) => {
              const asset = assetsMap[assetId];
              const pos = assetPositions?.[assetId] || 'long';
              return (
                <span
                  key={assetId}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ${
                    pos === 'long' 
                      ? 'bg-info-50/80 border-info-300 text-info-text'
                      : pos === 'short'
                      ? 'bg-warning-50/90 border-warning-300 text-warning-text'
                      : 'bg-ink-100/90 border-ink-200 text-ink-900'
                  }`}
                >
                  <span>{asset?.symbol || assetId}</span>
                  {pos === 'long' && (
                    <span className="px-1.5 py-0.2 rounded bg-info-600 text-paper text-[9px] font-bold uppercase tracking-wider">
                      LONG
                    </span>
                  )}
                  {pos === 'short' && (
                    <span className="px-1.5 py-0.2 rounded bg-warning-400 text-warning-text border border-warning-500/60 text-[9px] font-bold uppercase tracking-wider">
                      SHORT
                    </span>
                  )}
                </span>
              );
            })}
          </div>}

          {/* Indicator of effect */}
          <div>
            {getImpactBadge()}
          </div>
        </div>

        {/* Sources Chips: Rocket Money verified badge style */}
        {(() => {
          const validSources = distinctMediaSources(news.sources || []);
          const count = validSources.length;
          if (count === 0) return null;

          return (
            <div className="pt-3 border-t border-ink-100 flex flex-wrap items-center gap-2 text-xs">
              <button onClick={() => onCompare(news)} className="text-sm font-bold text-brand-950 bg-brand-50 rounded-xl px-3 py-2 flex items-center gap-2">
                <Layers className="w-4 h-4 text-brand-800" />
                {count > 1 ? `Comparar ${count} medios` : 'Ver única fuente verificada'}
              </button>
              {validSources.slice(0, 3).map((src, i) => (
                <span 
                  key={i}
                  className="text-xs font-medium text-ink-800 bg-ink-50 border border-ink-200/90 px-2 py-0.5 rounded-md"
                >
                  {src.mediaName}
                </span>
              ))}
              {count > 3 && (
                <span className="text-xs font-bold text-muted">
                  +{count - 3} más
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* Footer Actions */}
      <div className="pt-3 border-t border-ink-100 flex flex-wrap gap-2 items-center justify-between text-sm">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayAudio(news);
          }}
          className="inline-flex items-center gap-1.5 font-bold text-muted hover:text-brand-950 py-1.5 px-3 rounded-full hover:bg-ink-100 transition-colors"
        >
          <Volume2 className="w-4 h-4 text-brand-800" />
          <span>
            Escuchar síntesis ({audioDuration} min)
          </span>
        </button>

        <button onClick={() => onSelect(news)} data-tour="feed-card-detail" className="inline-flex items-center gap-1.5 font-extrabold text-brand-950 group-hover:translate-x-1 transition-transform">
          <span>Ver impacto</span>
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    </article>
  );
};
