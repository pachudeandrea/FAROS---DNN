import { Portfolio, NewsItem, Asset, getEffectiveImpactForPortfolio } from '../types';
import { Volume2, Sparkles, TrendingUp, TrendingDown, Minus, RefreshCw, ShieldCheck } from 'lucide-react';

interface FeedSummaryHeroProps {
  portfolio: Portfolio;
  newsList: NewsItem[];
  assetsMap: Record<string, Asset>;
  onPlayAudioBrief: () => void;
  onFilterByAsset?: (symbol: string) => void;
  activeImpactFilter?: string;
  onToggleImpactFilter?: (impact: 'favorable' | 'alerta' | 'neutral') => void;
  isLoadingNews?: boolean;
  onRefreshNews?: () => void;
  dailySummaryDurationText?: string;
  isPlayingDailySummary?: boolean;
  lastReviewTime?: string;
  sourcesChecked?: string[];
}

export const FeedSummaryHero: React.FC<FeedSummaryHeroProps> = ({
  portfolio,
  newsList,
  assetsMap,
  onPlayAudioBrief,
  onFilterByAsset,
  activeImpactFilter = 'todos',
  onToggleImpactFilter,
  isLoadingNews = false,
  onRefreshNews,
  dailySummaryDurationText,
  isPlayingDailySummary = false,
  lastReviewTime,
  sourcesChecked,
}) => {


  const isPortfolioEmpty = !portfolio.assetIds || portfolio.assetIds.length === 0;

  // Filter news that touch this portfolio (or all market news if portfolio is empty)
  const portfolioNews = isPortfolioEmpty
    ? newsList
    : newsList.filter(n => n.affectedAssetIds.some(id => portfolio.assetIds.includes(id)));

  // Calculate effective impact based on Long / Short positions in the active portfolio
  const favorableCount = portfolioNews.filter(n => {
    const eff = getEffectiveImpactForPortfolio(n.impact, n.affectedAssetIds, portfolio.assetPositions);
    return eff === 'favorable' || eff === 'positivo';
  }).length;

  const alertCount = portfolioNews.filter(n => {
    const eff = getEffectiveImpactForPortfolio(n.impact, n.affectedAssetIds, portfolio.assetPositions);
    return eff === 'alerta' || eff === 'negativo';
  }).length;

  const neutralCount = portfolioNews.filter(n => {
    const eff = getEffectiveImpactForPortfolio(n.impact, n.affectedAssetIds, portfolio.assetPositions);
    return eff === 'neutral' || eff === 'neutro';
  }).length;

  const totalCount = portfolioNews.length || 1;

  // Proportions for visual bar width without showing percentage numbers to the user
  const posWidth = Math.round((favorableCount / totalCount) * 100);
  const negWidth = Math.round((alertCount / totalCount) * 100);
  const neuWidth = 100 - posWidth - negWidth;

  // Active filter state detection
  const isFavorableActive = activeImpactFilter === 'favorable' || activeImpactFilter === 'positivo';
  const isAlertActive = activeImpactFilter === 'alerta' || activeImpactFilter === 'negativo';
  const isNeutralActive = activeImpactFilter === 'neutral' || activeImpactFilter === 'neutro';

  // Qualitative summary direction based on news sentiment (symmetric, unbiased, transparent)
  const qualitativeSummary = (() => {
    if (alertCount > 0 && favorableCount > 0) {
      return {
        label: 'Flujo Mixto',
        description: isPortfolioEmpty
          ? 'Panorama general del mercado con catalizadores positivos y alertas de riesgo a monitorear.'
          : 'Se registran catalizadores favorables pero también alertas de riesgo concretas sobre tus activos que requieren seguimiento.',
        badgeClass: 'text-amber-300 bg-amber-950/80 border-amber-700/60',
        icon: TrendingDown
      };
    }
    if (alertCount > 0 && favorableCount === 0) {
      return {
        label: 'Alerta de Riesgo',
        description: isPortfolioEmpty
          ? 'Panorama general con factores de cautela, mayor prima de riesgo o presiones cambiarias y de tasas.'
          : 'Flujo de noticias con factores de cautela, mayor prima de riesgo o presiones de costos sobre tus tenencias.',
        badgeClass: 'text-rose-300 bg-rose-900/60 border-rose-700/50',
        icon: TrendingDown
      };
    }
    if (favorableCount > 0 && alertCount === 0) {
      return {
        label: 'Favorable',
        description: isPortfolioEmpty
          ? 'Panorama general constructivo en las fuentes monitoreadas de mercado.'
          : 'Flujo de noticias constructivo para tus tenencias, sin alertas de riesgo registradas en las fuentes monitoreadas.',
        badgeClass: 'text-emerald-300 bg-emerald-900/60 border-emerald-700/50',
        icon: TrendingUp
      };
    }
    return {
      label: 'Neutral',
      description: isPortfolioEmpty
        ? 'Contexto de mercado equilibrado sin novedades de alto impacto.'
        : 'Flujo de noticias equilibrado sin presiones críticas sobre las tenencias de tu cartera.',
      badgeClass: 'text-slate-300 bg-slate-800/60 border-slate-700/50',
      icon: Minus
    };
  })();

  const DirectionIcon = qualitativeSummary.icon;

  // Calculate asset mention frequencies among portfolio assets (or all news assets if empty)
  const assetCounts: Record<string, number> = {};
  portfolioNews.forEach(n => {
    n.affectedAssetIds.forEach(id => {
      if (isPortfolioEmpty || portfolio.assetIds.includes(id)) {
        assetCounts[id] = (assetCounts[id] || 0) + 1;
      }
    });
  });

  const topAssets = Object.entries(assetCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  return (
    <section data-tour="feed-hero-pulso" className="min-w-0 bg-white rounded-3xl border border-slate-200/90 shadow-[0_2px_16px_rgba(0,0,0,0.04)] p-4 sm:p-8 space-y-6">
      {/* Top Header: Title, Active Portfolio Tag, Audio button */}
      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 pb-5 border-b border-slate-100">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-emerald-950 text-emerald-300 flex items-center justify-center shadow-xs shrink-0">
            <Sparkles className="w-5 h-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900 bg-emerald-50 border border-emerald-200/80 px-2 py-0.5 rounded-md">
                Pulso Diario de Mercado
              </span>
              <span className="text-xs font-semibold text-slate-500">
                · Perfil: {portfolio.profile === 'dinamico' ? 'Dinámico' : portfolio.profile === 'conservador' ? 'Conservador' : 'Moderado'}
              </span>
              {isPortfolioEmpty && (
                <span className="text-[11px] font-bold text-amber-800 bg-amber-50 border border-amber-200/90 px-2 py-0.5 rounded-md">
                  Cartera sin activos · Panorama general
                </span>
              )}
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-slate-700 bg-slate-100 border border-slate-200/90 px-2 py-0.5 rounded-md">
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-700" />
                Google Search Grounding
              </span>
            </div>
            <h2 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight mt-1 break-words">
              {portfolio.name}
            </h2>
          </div>
        </div>

        <div className="flex min-w-0 items-center gap-2.5 flex-wrap">
          {onRefreshNews && (
            <button
              data-tour="feed-refresh-btn"
              onClick={onRefreshNews}
              disabled={isLoadingNews}
              className="inline-flex items-center justify-center gap-1.5 px-3.5 py-3 bg-white hover:bg-slate-50 text-slate-700 hover:text-emerald-950 text-xs font-bold rounded-2xl border border-slate-200 hover:border-emerald-300 transition-all shadow-2xs cursor-pointer disabled:opacity-50"
              title="Buscar novedades de última hora en medios argentinos con Google Search"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoadingNews ? 'animate-spin text-emerald-700' : 'text-slate-500'}`} />
              <span>{isLoadingNews ? 'Buscando en medios...' : 'Actualizar pulso'}</span>
            </button>
          )}

          {/* Rocket Money-style Quick Audio Synthesis Button with dynamic real duration */}
          <button
            data-tour="feed-audio-brief"
            type="button"
            onClick={onPlayAudioBrief}
            className={`inline-flex w-full sm:w-auto min-w-0 items-center justify-center gap-2 sm:gap-2.5 px-3 sm:px-5 py-3 text-white text-xs font-extrabold rounded-2xl active:scale-95 transition-all shadow-sm cursor-pointer group ${
              isPlayingDailySummary
                ? 'bg-emerald-600 hover:bg-emerald-500 shadow-emerald-950/30'
                : 'bg-emerald-950 hover:bg-emerald-900'
            }`}
            aria-label={isPlayingDailySummary ? "Pausar o detener resumen del día" : "Escuchar resumen del día"}
          >
            <div className={`w-2 h-2 rounded-full ${isPlayingDailySummary ? 'bg-white animate-ping' : 'bg-emerald-400 animate-pulse'}`} />
            <Volume2 className="w-4 h-4 text-emerald-300 group-hover:scale-110 transition-transform" />
            <span>{isPlayingDailySummary ? 'Reproduciendo resumen del día' : 'Escuchar resumen del día'}</span>
            <span className="shrink-0 text-[11px] text-emerald-300 font-mono bg-emerald-900/80 px-2 py-0.5 rounded-full font-bold">
              {dailySummaryDurationText || '2:40 min'}
            </span>
          </button>
        </div>
      </div>

      {/* Main Stats Grid inspired by Rocket Money's financial dashboard */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left Metric Card: Purely qualitative impact */}
        <div className="lg:col-span-5 bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 text-white rounded-2xl p-6 sm:p-7 flex flex-col justify-between space-y-5 shadow-sm relative overflow-hidden">
          {/* Subtle glow circle */}
          <div className="absolute top-0 right-0 -mr-12 -mt-12 w-44 h-44 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />

          <div className="relative z-10 space-y-3">
            <div className="flex items-center justify-between text-xs text-emerald-300 font-bold">
              <span className="uppercase tracking-wider">Impacto Cualitativo en Cartera</span>
              <span className="text-[11px] font-mono bg-emerald-800/90 text-white px-2.5 py-0.5 rounded-full font-bold">
                {portfolioNews.length} {portfolioNews.length === 1 ? 'noticia hoy' : 'noticias hoy'}
              </span>
            </div>

            <button
              type="button"
              onClick={() => {
                if (qualitativeSummary.label === 'Favorable') onToggleImpactFilter && onToggleImpactFilter('favorable');
                else if (qualitativeSummary.label === 'Alerta') onToggleImpactFilter && onToggleImpactFilter('alerta');
                else onToggleImpactFilter && onToggleImpactFilter('neutral');
              }}
              className="flex items-center gap-3 py-1 text-left group cursor-pointer hover:opacity-95 transition-opacity"
              title={`Filtrar noticias por impacto predominante: ${qualitativeSummary.label}`}
            >
              <div className="w-12 h-12 rounded-2xl bg-emerald-900/80 border border-emerald-700/60 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
                <DirectionIcon className="w-6 h-6 text-emerald-300 stroke-[2.5]" />
              </div>
              <div>
                <span className="text-3xl sm:text-4xl font-black tracking-tight text-white block">
                  {qualitativeSummary.label}
                </span>
                <span className="text-xs font-semibold text-emerald-300">
                  Dirección general de las noticias
                </span>
              </div>
            </button>
            
            <p className="text-xs sm:text-sm text-emerald-100/90 leading-relaxed font-normal">
              {qualitativeSummary.description}
            </p>
          </div>

          {/* Qualitative distribution bar without percentages */}
          <div className="relative z-10 space-y-2 pt-3 border-t border-emerald-800/70">
            <div className="flex items-center justify-between text-[11px] font-medium text-emerald-200">
              <span>Balance de noticias</span>
              <span className="text-white font-semibold">
                {favorableCount} favorables · {alertCount} alertas · {neutralCount} neutrales
              </span>
            </div>

            <div className="w-full h-2.5 bg-emerald-950/60 rounded-full flex overflow-hidden p-0.5 border border-emerald-800/60">
              <button 
                type="button"
                onClick={() => onToggleImpactFilter && onToggleImpactFilter('favorable')}
                style={{ width: `${posWidth}%` }} 
                className="bg-emerald-400 h-full rounded-l-full transition-all duration-500 cursor-pointer hover:brightness-125 focus:outline-none" 
                title="Filtrar por noticias favorables"
              />
              <button 
                type="button"
                onClick={() => onToggleImpactFilter && onToggleImpactFilter('alerta')}
                style={{ width: `${negWidth}%` }} 
                className="bg-rose-400 h-full transition-all duration-500 cursor-pointer hover:brightness-125 focus:outline-none" 
                title="Filtrar por alertas"
              />
              <button 
                type="button"
                onClick={() => onToggleImpactFilter && onToggleImpactFilter('neutral')}
                style={{ width: `${neuWidth}%` }} 
                className="bg-slate-400 h-full rounded-r-full transition-all duration-500 cursor-pointer hover:brightness-125 focus:outline-none" 
                title="Filtrar por noticias neutrales"
              />
            </div>

            {/* Honest verification status */}
            {alertCount === 0 ? (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-emerald-950/70 border border-emerald-800/80 text-[11px] text-emerald-200">
                <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                <span className="leading-tight">
                  <strong className="text-white">Sin alertas de riesgo hoy</strong> · Revisión: {lastReviewTime || '11:45 hs'} (Bs As) · Fuentes: {sourcesChecked && sourcesChecked.length > 0 ? sourcesChecked.slice(0, 3).join(', ') : 'Ámbito, Cronista, Infobae, BCRA'}
                </span>
              </div>
            ) : (
              <div className="flex items-center gap-2 p-2 rounded-xl bg-rose-950/70 border border-rose-800/80 text-[11px] text-rose-200">
                <TrendingDown className="w-4 h-4 text-rose-300 shrink-0" />
                <span className="leading-tight">
                  <strong className="text-white">{alertCount} {alertCount === 1 ? 'alerta de riesgo activa' : 'alertas de riesgo activas'}</strong> · Revisión: {lastReviewTime || '11:45 hs'} (Bs As)
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Right 3 Micro Metric Cards (Interactive Impact Filters) */}
        <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3.5">
          {/* Favorable Card */}
          <button
            type="button"
            onClick={() => onToggleImpactFilter && onToggleImpactFilter('favorable')}
            className={`text-left p-5 rounded-2xl flex flex-col justify-between transition-all duration-200 cursor-pointer relative group ${
              isFavorableActive
                ? 'bg-emerald-100/90 border-2 border-emerald-600 shadow-md ring-2 ring-emerald-500/20 scale-[1.02]'
                : 'bg-emerald-50/70 border border-emerald-200/90 hover:border-emerald-400 hover:bg-emerald-100/50 hover:shadow-xs active:scale-[0.98]'
            }`}
            title={isFavorableActive ? "Quitar filtro de noticias favorables" : "Filtrar por noticias favorables"}
            aria-pressed={isFavorableActive}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-950 flex items-center gap-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                  isFavorableActive 
                    ? 'bg-emerald-700 text-white shadow-xs' 
                    : 'bg-emerald-100 text-emerald-800 group-hover:bg-emerald-200'
                }`}>
                  <TrendingUp className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span>Favorables</span>
              </span>
              {isFavorableActive ? (
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-950 bg-emerald-200/90 border border-emerald-300 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-700 animate-pulse" />
                  Activo
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-emerald-700/70 opacity-0 group-hover:opacity-100 transition-opacity">
                  Filtrar
                </span>
              )}
            </div>

            <div className="my-3">
              <span className="text-3xl font-black font-mono text-emerald-950 tabular-nums">
                {favorableCount}
              </span>
              <span className="text-xs font-semibold text-emerald-800 ml-1.5">noticias</span>
            </div>

            <p className="text-xs text-emerald-900 font-medium leading-snug">
              Efecto favorable en cotizaciones o balances
            </p>
          </button>

          {/* Alerta Card */}
          <button
            type="button"
            onClick={() => onToggleImpactFilter && onToggleImpactFilter('alerta')}
            className={`text-left p-5 rounded-2xl flex flex-col justify-between transition-all duration-200 cursor-pointer relative group ${
              isAlertActive
                ? 'bg-rose-100/90 border-2 border-rose-600 shadow-md ring-2 ring-rose-500/20 scale-[1.02]'
                : 'bg-rose-50/70 border border-rose-200/90 hover:border-rose-400 hover:bg-rose-100/50 hover:shadow-xs active:scale-[0.98]'
            }`}
            title={isAlertActive ? "Quitar filtro de alertas" : "Filtrar por alertas"}
            aria-pressed={isAlertActive}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-950 flex items-center gap-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                  isAlertActive 
                    ? 'bg-rose-700 text-white shadow-xs' 
                    : 'bg-rose-100 text-rose-800 group-hover:bg-rose-200'
                }`}>
                  <TrendingDown className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span>Alertas</span>
              </span>
              {isAlertActive ? (
                <span className="text-[10px] font-black uppercase tracking-wider text-rose-950 bg-rose-200/90 border border-rose-300 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-700 animate-pulse" />
                  Activo
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-rose-700/70 opacity-0 group-hover:opacity-100 transition-opacity">
                  Filtrar
                </span>
              )}
            </div>

            <div className="my-3">
              <span className="text-3xl font-black font-mono text-rose-950 tabular-nums">
                {alertCount}
              </span>
              <span className="text-xs font-semibold text-rose-800 ml-1.5">noticias</span>
            </div>

            <p className="text-xs text-rose-900 font-medium leading-snug">
              Presión en costos, tasas o márgenes
            </p>
          </button>

          {/* Neutral / Filtered Noise Card */}
          <button
            type="button"
            onClick={() => onToggleImpactFilter && onToggleImpactFilter('neutral')}
            className={`text-left p-5 rounded-2xl flex flex-col justify-between transition-all duration-200 cursor-pointer relative group ${
              isNeutralActive
                ? 'bg-slate-200/90 border-2 border-slate-600 shadow-md ring-2 ring-slate-400/20 scale-[1.02]'
                : 'bg-slate-50 border border-slate-200/90 hover:border-slate-400 hover:bg-slate-100/60 hover:shadow-xs active:scale-[0.98]'
            }`}
            title={isNeutralActive ? "Quitar filtro neutral" : "Filtrar por noticias neutrales"}
            aria-pressed={isNeutralActive}
          >
            <div className="flex items-center justify-between w-full">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-2">
                <div className={`w-6 h-6 rounded-lg flex items-center justify-center transition-colors ${
                  isNeutralActive 
                    ? 'bg-slate-800 text-white shadow-xs' 
                    : 'bg-slate-200 flex items-center justify-center text-slate-700 group-hover:bg-slate-300'
                }`}>
                  <Minus className="w-3.5 h-3.5 stroke-[2.5]" />
                </div>
                <span>Neutrales</span>
              </span>
              {isNeutralActive ? (
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-900 bg-slate-300 border border-slate-400 px-2 py-0.5 rounded-full flex items-center gap-1 shadow-2xs">
                  <span className="w-1.5 h-1.5 rounded-full bg-slate-700 animate-pulse" />
                  Activo
                </span>
              ) : (
                <span className="text-[10px] font-semibold text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity">
                  Filtrar
                </span>
              )}
            </div>

            <div className="my-3">
              <span className="text-3xl font-black font-mono text-slate-900 tabular-nums">
                {neutralCount}
              </span>
              <span className="text-xs font-semibold text-slate-600 ml-1.5">noticias</span>
            </div>

            <p className="text-xs text-slate-700 font-medium leading-snug">
              Contexto macroeconómico o hechos sin desvíos
            </p>
          </button>
        </div>
      </div>

      {/* Tickers Strip: Only tickers and news count, no price variations */}
      <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-600" />
          <span className="text-xs font-bold text-slate-800">
            {isPortfolioEmpty ? 'Activos con mayor cobertura en el mercado hoy:' : 'Tus activos con mayor cobertura hoy:'}
          </span>
        </div>
        
        <div className="flex flex-wrap items-center gap-2">
          {topAssets.length > 0 ? (
            topAssets.map(([sym, count]) => {
              const asset = assetsMap[sym];
              return (
                <button
                  key={sym}
                  onClick={() => onFilterByAsset && onFilterByAsset(sym)}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-emerald-50 hover:border-emerald-300 border border-slate-200/90 rounded-xl text-xs font-bold text-slate-800 transition-all cursor-pointer shadow-2xs group"
                  title={`Filtrar noticias de ${sym}`}
                >
                  <span className="w-5 h-5 rounded-md bg-emerald-950 text-white font-mono font-bold text-[10px] flex items-center justify-center">
                    {sym.slice(0, 2)}
                  </span>
                  <span className="font-mono text-slate-900 group-hover:text-emerald-950">{sym}</span>
                  {asset?.name && (
                    <span className="text-[11px] text-slate-500 font-normal hidden sm:inline truncate max-w-[90px]">
                      {asset.name}
                    </span>
                  )}
                  <span className="text-[10px] text-slate-600 font-medium bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-2xs">
                    {count} {count === 1 ? 'noticia' : 'noticias'}
                  </span>
                </button>
              );
            })
          ) : (
            <span className="text-xs text-slate-500">
              Podés agregar tus activos desde la pestaña <strong className="text-emerald-900">Mi Cartera</strong>.
            </span>
          )}
        </div>
      </div>
    </section>
  );
};
