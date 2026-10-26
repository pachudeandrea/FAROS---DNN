import React from 'react';
import { NewsItem, Asset, RelevanceType, AssetPosition, getEffectiveImpactForPortfolio } from '../types';
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

interface NewsCardProps {
  news: NewsItem;
  assetsMap: Record<string, Asset>;
  onSelect: (news: NewsItem) => void;
  onPlayAudio: (news: NewsItem) => void;
  onToggleSave: (newsId: string) => void;
  isSaved?: boolean;
  assetPositions?: Record<string, AssetPosition>;
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
  onPlayAudio,
  onToggleSave,
  isSaved = false,
  assetPositions,
}) => {
  const primaryAssetSymbol = news.affectedAssetIds[0] || 'MK';

  // Calculate effective impact based on portfolio positions (e.g. Short position inverts impact)
  const effectiveImpact = getEffectiveImpactForPortfolio(news.impact, news.affectedAssetIds, assetPositions);

  const isFavorable = effectiveImpact === 'favorable' || effectiveImpact === 'positivo';
  const isAlert = effectiveImpact === 'alerta' || effectiveImpact === 'negativo';

  const getImpactBadge = () => {
    if (isFavorable) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-emerald-950 bg-emerald-100/80 border border-emerald-300 px-3 py-1.5 rounded-full shadow-2xs">
          <TrendingUp className="w-3.5 h-3.5 text-emerald-700 stroke-[2.5]" />
          <span>Favorable</span>
        </span>
      );
    }
    if (isAlert) {
      return (
        <span className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-950 bg-rose-100/80 border border-rose-300 px-3 py-1.5 rounded-full shadow-2xs">
          <TrendingDown className="w-3.5 h-3.5 text-rose-700 stroke-[2.5]" />
          <span>Alerta</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800 bg-slate-100 border border-slate-300 px-3 py-1.5 rounded-full shadow-2xs">
        <Minus className="w-3.5 h-3.5 text-slate-500 stroke-[2.5]" />
        <span>Neutral</span>
      </span>
    );
  };

  const impactBorderClass = isFavorable
    ? 'hover:border-emerald-500 border-l-[5px] border-l-emerald-600'
    : isAlert
    ? 'hover:border-rose-500 border-l-[5px] border-l-rose-600'
    : 'hover:border-slate-400 border-l-[5px] border-l-slate-400';

  return (
    <article 
      onClick={() => onSelect(news)}
      className={`group bg-white rounded-3xl border border-slate-200/90 ${impactBorderClass} hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)] transition-all duration-200 p-6 sm:p-7 flex flex-col justify-between cursor-pointer space-y-4`}
    >
      <div className="space-y-3.5">
        {/* Top Header: Rocket Money-style Ticker Avatar + Category Tag + Time + Bookmark */}
        <div className="flex items-center justify-between text-xs sm:text-sm">
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Ticker Initial Avatar */}
            <div className="w-8 h-8 rounded-xl bg-emerald-950 text-white font-mono font-bold text-xs flex items-center justify-center shadow-xs">
              {primaryAssetSymbol.slice(0, 2)}
            </div>

            <span className="font-extrabold text-emerald-950 uppercase tracking-wider text-[11px] bg-emerald-50 border border-emerald-200/80 px-2.5 py-1 rounded-full">
              {getRelevanceLabel(news.relevanceType)}
            </span>
            <span aria-hidden="true" className="text-slate-300 font-bold">·</span>
            <span className="font-medium text-slate-600">{news.publishedAgo}</span>
          </div>

          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleSave(news.id);
            }}
            title={isSaved ? "Quitar de guardadas" : "Guardar noticia"}
            className={`p-2 rounded-full hover:bg-slate-100 transition-colors ${
              isSaved ? "text-emerald-900 bg-emerald-100/70" : "text-slate-400 hover:text-slate-700"
            }`}
            aria-label="Guardar noticia"
          >
            <Bookmark className="w-4 h-4 fill-current" />
          </button>
        </div>

        {/* Headline: High legibility bold fintech styling */}
        <h3 className="text-lg sm:text-xl font-extrabold text-slate-900 group-hover:text-emerald-950 transition-colors leading-snug tracking-tight">
          {news.headline}
        </h3>

        {/* Brief Summary (2-3 lines): clear readable high-contrast text */}
        <p className="text-sm sm:text-base text-slate-700 leading-relaxed font-normal">
          {news.briefSummary}
        </p>

        {/* Affected Portfolio Assets Chips + Position Badge + Effect Badge */}
        <div className="pt-2 flex flex-wrap items-center justify-between gap-3">
          {/* Affected Assets Chips with optional Long/Short position badges */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-700 mr-1">
              Activos:
            </span>
            {news.affectedAssetIds.map((assetId) => {
              const asset = assetsMap[assetId];
              const pos = assetPositions?.[assetId];
              return (
                <span
                  key={assetId}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ${
                    pos === 'long' 
                      ? 'bg-blue-50/80 border-blue-300 text-blue-950'
                      : pos === 'short'
                      ? 'bg-amber-50/90 border-amber-300 text-amber-950'
                      : 'bg-slate-100/90 border-slate-200 text-slate-900'
                  }`}
                >
                  <span>{asset?.symbol || assetId}</span>
                  {pos === 'long' && (
                    <span className="px-1.5 py-0.2 rounded bg-blue-600 text-white text-[9px] font-black uppercase tracking-wider">
                      LONG
                    </span>
                  )}
                  {pos === 'short' && (
                    <span className="px-1.5 py-0.2 rounded bg-amber-400 text-amber-950 border border-amber-500/60 text-[9px] font-black uppercase tracking-wider">
                      SHORT
                    </span>
                  )}
                </span>
              );
            })}
          </div>

          {/* Indicator of effect */}
          <div>
            {getImpactBadge()}
          </div>
        </div>

        {/* Sources Chips: Rocket Money verified badge style */}
        {(() => {
          const validSources = (news.sources || []).filter(s => s && s.sourceUrl);
          const count = validSources.length;
          if (count === 0) return null;

          return (
            <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
              <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5 mr-1">
                <Layers className="w-4 h-4 text-emerald-800" />
                Resumen unificado de {count} medios:
              </span>
              {validSources.slice(0, 3).map((src, i) => (
                <span 
                  key={i}
                  className="text-xs font-medium text-slate-800 bg-slate-50 border border-slate-200/90 px-2 py-0.5 rounded-md"
                >
                  {src.mediaName}
                </span>
              ))}
              {count > 3 && (
                <span className="text-xs font-bold text-slate-600">
                  +{count - 3} más
                </span>
              )}
            </div>
          );
        })()}
      </div>

      {/* Footer Actions */}
      <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs sm:text-sm">
        <button
          onClick={(e) => {
            e.stopPropagation();
            onPlayAudio(news);
          }}
          className="inline-flex items-center gap-1.5 font-bold text-slate-700 hover:text-emerald-950 py-1.5 px-3 rounded-full hover:bg-slate-100 transition-colors"
        >
          <Volume2 className="w-4 h-4 text-emerald-800" />
          <span>
            Escuchar síntesis ({calculateEstimatedDuration(news.audioScript || news.briefSummary, 1.0).formatted} min)
          </span>
        </button>

        <span className="inline-flex items-center gap-1.5 font-extrabold text-emerald-950 group-hover:translate-x-1 transition-transform">
          <span>Ver impacto en cartera</span>
          <ArrowRight className="w-4 h-4" />
        </span>
      </div>
    </article>
  );
};
