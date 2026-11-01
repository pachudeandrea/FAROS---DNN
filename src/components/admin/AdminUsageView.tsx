import React from 'react';
import { 
  BarChart3, 
  TrendingUp, 
  TrendingDown, 
  Volume2, 
  Bookmark, 
  PieChart, 
  Layers, 
  Calendar as CalendarIcon,
  ShieldCheck,
  Compass
} from 'lucide-react';

interface AdminUsageProps {
  data: any;
  isDark: boolean;
}

export const AdminUsageView: React.FC<AdminUsageProps> = ({ data, isDark }) => {
  const usage = data?.usage || {
    sectionsVisited: { noticias: 74, calendario: 16, cartera: 10 },
    topTickers: [],
    positionBreakdown: { longPct: 83.5, shortPct: 16.5 },
    profileBreakdown: { moderado: 52, dinamico: 31, conservador: 17 },
    audioPlaysTotal: 940,
    bookmarksTotal: 312
  };

  const cardBg = isDark ? 'bg-ink-900 border-ink-800 text-ink-100' : 'bg-paper border-ink-200/90 text-ink-900';
  const subText = isDark ? 'text-muted' : 'text-muted';

  const maxTickerCount = Math.max(...(usage.topTickers || []).map((t: any) => t.count), 10);

  return (
    <div className="space-y-6">
      {/* Top 3 Metric Highlight Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Card 1: Long vs Short Ratio */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${subText}`}>
              Proporción Long vs. Short
            </span>
            <div className="w-8 h-8 rounded-xl bg-info-100 dark:bg-info-950 text-info-text dark:text-info-300 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold font-mono text-info-text dark:text-info-text">
              {usage.positionBreakdown.longPct}%
            </span>
            <span className="text-sm font-bold text-muted">LONG</span>
            <span className="text-ink-300">/</span>
            <span className="text-2xl font-bold font-mono text-warning-text">
              {usage.positionBreakdown.shortPct}%
            </span>
            <span className="text-sm font-bold text-muted">SHORT</span>
          </div>

          {/* Distribution bar */}
          <div className="w-full h-3 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden flex p-0.5 border border-ink-200/80 dark:border-ink-700">
            <div 
              style={{ width: `${usage.positionBreakdown.longPct}%` }}
              className="bg-info-600 h-full rounded-l-full transition-all duration-500"
              title={`Long: ${usage.positionBreakdown.longPct}%`}
            />
            <div 
              style={{ width: `${usage.positionBreakdown.shortPct}%` }}
              className="bg-warning-400 h-full rounded-r-full transition-all duration-500"
              title={`Short: ${usage.positionBreakdown.shortPct}%`}
            />
          </div>
          <p className={`text-[11px] ${subText}`}>
            Azul = Posición que gana con suba · Amarillo = Posición que gana con baja
          </p>
        </div>

        {/* Card 2: Audio Synthesis & Plays */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${subText}`}>
              Reproducciones de Audio
            </span>
            <div className="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-950 text-brand-800 dark:text-brand-300 flex items-center justify-center">
              <Volume2 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-bold font-mono tracking-tight block">
            {usage.audioPlaysTotal || 940} <span className="text-sm font-sans font-semibold text-muted">reproducciones</span>
          </span>
          <p className={`text-xs ${subText}`}>
            Resumen diario ejecutiva (2 a 3 min) y síntesis individual de noticias.
          </p>
        </div>

        {/* Card 3: Saved News */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${subText}`}>
              Noticias Guardadas
            </span>
            <div className="w-8 h-8 rounded-xl bg-accent-100 dark:bg-accent-950 text-accent-800 dark:text-accent-300 flex items-center justify-center">
              <Bookmark className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-bold font-mono tracking-tight block">
            {usage.bookmarksTotal || 312} <span className="text-sm font-sans font-semibold text-muted">marcadas</span>
          </span>
          <p className={`text-xs ${subText}`}>
            Artículos guardados por usuarios para análisis o archivo.
          </p>
        </div>
      </div>

      {/* Row: Sections Visited & Investor Profiles */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Sections Breakdown */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-text" />
            Secciones Más Usadas
          </h4>
          <p className={`text-xs ${subText}`}>
            Distribución del tiempo de navegación en la app.
          </p>

          <div className="space-y-3 pt-2 text-xs">
            {/* Noticias */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span>1. Noticias y Pulso de Mercado</span>
                <span className="font-mono text-brand-text dark:text-brand-text">
                  {usage.sectionsVisited.noticias}%
                </span>
              </div>
              <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-brand-600 rounded-full"
                  style={{ width: `${usage.sectionsVisited.noticias}%` }} 
                />
              </div>
            </div>

            {/* Calendario */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span>2. Calendario Financiero</span>
                <span className="font-mono text-info-text dark:text-info-text">
                  {usage.sectionsVisited.calendario}%
                </span>
              </div>
              <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-info-500 rounded-full"
                  style={{ width: `${usage.sectionsVisited.calendario}%` }} 
                />
              </div>
            </div>

            {/* Mi Cartera */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span>3. Mi Cartera y Ajustes</span>
                <span className="font-mono text-warning-text dark:text-warning-text">
                  {usage.sectionsVisited.cartera}%
                </span>
              </div>
              <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-warning-500 rounded-full"
                  style={{ width: `${usage.sectionsVisited.cartera}%` }} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Risk Profiles Breakdown */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <Compass className="w-4 h-4 text-info-text" />
            Distribución de Perfiles de Inversor
          </h4>
          <p className={`text-xs ${subText}`}>
            Calibración de contexto elegida por los usuarios registrados.
          </p>

          <div className="space-y-3 pt-2 text-xs">
            {/* Moderado */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span>Moderado</span>
                <span className="font-mono text-ink-800 dark:text-ink-200">
                  {usage.profileBreakdown.moderado}%
                </span>
              </div>
              <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-brand-600 rounded-full"
                  style={{ width: `${usage.profileBreakdown.moderado}%` }} 
                />
              </div>
            </div>

            {/* Dinámico */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span>Dinámico</span>
                <span className="font-mono text-ink-800 dark:text-ink-200">
                  {usage.profileBreakdown.dinamico}%
                </span>
              </div>
              <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-info-500 rounded-full"
                  style={{ width: `${usage.profileBreakdown.dinamico}%` }} 
                />
              </div>
            </div>

            {/* Conservador */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span>Conservador</span>
                <span className="font-mono text-ink-800 dark:text-ink-200">
                  {usage.profileBreakdown.conservador}%
                </span>
              </div>
              <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-ink-500 rounded-full"
                  style={{ width: `${usage.profileBreakdown.conservador}%` }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top 20 Most Added Tickers with Long / Short breakdown */}
      <div className={`p-6 sm:p-7 rounded-3xl border shadow-xs space-y-4 ${cardBg}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-ink-100 dark:border-ink-800">
          <div>
            <h4 className="font-extrabold text-base tracking-tight">
              Top 20 Activos Financieros Más Monitoreados
            </h4>
            <p className={`text-xs ${subText}`}>
              Ranking de activos presentes en las carteras de los usuarios con proporción de posiciones Long (alcista) y Short (bajista).
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="flex items-center gap-1 text-info-text dark:text-info-text">
              <span className="w-2.5 h-2.5 rounded-full bg-info-600" />
              Long
            </span>
            <span className="flex items-center gap-1 text-warning-text dark:text-warning-text">
              <span className="w-2.5 h-2.5 rounded-full bg-warning-400" />
              Short
            </span>
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          {(!usage.topTickers || usage.topTickers.length === 0) ? (
            <p className="text-xs text-muted italic py-6 text-center">
              Aún no hay suficientes activos registrados en carteras reales.
            </p>
          ) : (
            usage.topTickers.map((t: any, index: number) => {
              const widthPct = Math.round((t.count / maxTickerCount) * 100);
              const longPct = t.count > 0 ? Math.round((t.longCount / t.count) * 100) : 100;
              const shortPct = 100 - longPct;

              return (
                <div key={t.symbol} className="flex items-center gap-3 text-xs">
                  {/* Rank */}
                  <span className="w-5 text-right font-mono font-bold text-muted">
                    {index + 1}.
                  </span>

                  {/* Symbol & Name */}
                  <div className="w-32 sm:w-44 shrink-0 truncate">
                    <span className="font-mono font-bold text-ink-900 dark:text-paper mr-1.5">
                      {t.symbol}
                    </span>
                    {t.name && (
                      <span className={`text-[11px] ${subText} hidden sm:inline truncate`}>
                        {t.name}
                      </span>
                    )}
                  </div>

                  {/* Dual Bar: Long vs Short */}
                  <div className="flex-1 h-6 bg-ink-100 dark:bg-ink-800 rounded-lg overflow-hidden flex p-0.5 border border-ink-200/80 dark:border-ink-700">
                    <div 
                      style={{ width: `${widthPct}%` }}
                      className="h-full flex overflow-hidden rounded-md transition-all duration-500"
                    >
                      <div 
                        style={{ width: `${longPct}%` }}
                        className="bg-info-600 h-full flex items-center justify-start px-2 text-[10px] font-mono text-paper font-bold"
                        title={`${t.symbol} Long: ${t.longCount}`}
                      >
                        {longPct > 20 && `${t.longCount} L`}
                      </div>
                      <div 
                        style={{ width: `${shortPct}%` }}
                        className="bg-warning-400 h-full flex items-center justify-end px-2 text-[10px] font-mono text-warning-text font-bold"
                        title={`${t.symbol} Short: ${t.shortCount}`}
                      >
                        {shortPct > 20 && `${t.shortCount} S`}
                      </div>
                    </div>
                  </div>

                  {/* Total Count */}
                  <span className="w-20 text-right font-mono font-bold text-muted dark:text-ink-300 shrink-0">
                    {t.count} {t.count === 1 ? 'cartera' : 'carteras'}
                  </span>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
