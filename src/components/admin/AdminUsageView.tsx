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

  const cardBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200/90 text-slate-900';
  const subText = isDark ? 'text-slate-400' : 'text-slate-500';

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
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-black font-mono text-blue-600 dark:text-blue-400">
              {usage.positionBreakdown.longPct}%
            </span>
            <span className="text-sm font-bold text-slate-400">LONG</span>
            <span className="text-slate-300">/</span>
            <span className="text-2xl font-black font-mono text-amber-500">
              {usage.positionBreakdown.shortPct}%
            </span>
            <span className="text-sm font-bold text-slate-400">SHORT</span>
          </div>

          {/* Distribution bar */}
          <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex p-0.5 border border-slate-200/80 dark:border-slate-700">
            <div 
              style={{ width: `${usage.positionBreakdown.longPct}%` }}
              className="bg-blue-600 h-full rounded-l-full transition-all duration-500" 
              title={`Long: ${usage.positionBreakdown.longPct}%`}
            />
            <div 
              style={{ width: `${usage.positionBreakdown.shortPct}%` }}
              className="bg-amber-400 h-full rounded-r-full transition-all duration-500" 
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
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center">
              <Volume2 className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight block">
            {usage.audioPlaysTotal || 940} <span className="text-sm font-sans font-semibold text-slate-500">reproducciones</span>
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
            <div className="w-8 h-8 rounded-xl bg-purple-100 dark:bg-purple-950 text-purple-800 dark:text-purple-300 flex items-center justify-center">
              <Bookmark className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight block">
            {usage.bookmarksTotal || 312} <span className="text-sm font-sans font-semibold text-slate-500">marcadas</span>
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
            <Layers className="w-4 h-4 text-emerald-700" />
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
                <span className="font-mono text-emerald-700 dark:text-emerald-400">
                  {usage.sectionsVisited.noticias}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-600 rounded-full" 
                  style={{ width: `${usage.sectionsVisited.noticias}%` }} 
                />
              </div>
            </div>

            {/* Calendario */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span>2. Calendario Financiero</span>
                <span className="font-mono text-blue-600 dark:text-blue-400">
                  {usage.sectionsVisited.calendario}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full" 
                  style={{ width: `${usage.sectionsVisited.calendario}%` }} 
                />
              </div>
            </div>

            {/* Mi Cartera */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span>3. Mi Cartera y Ajustes</span>
                <span className="font-mono text-amber-600 dark:text-amber-400">
                  {usage.sectionsVisited.cartera}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-amber-500 rounded-full" 
                  style={{ width: `${usage.sectionsVisited.cartera}%` }} 
                />
              </div>
            </div>
          </div>
        </div>

        {/* Risk Profiles Breakdown */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <Compass className="w-4 h-4 text-blue-600" />
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
                <span className="font-mono text-slate-800 dark:text-slate-200">
                  {usage.profileBreakdown.moderado}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-emerald-600 rounded-full" 
                  style={{ width: `${usage.profileBreakdown.moderado}%` }} 
                />
              </div>
            </div>

            {/* Dinámico */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span>Dinámico</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">
                  {usage.profileBreakdown.dinamico}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-blue-500 rounded-full" 
                  style={{ width: `${usage.profileBreakdown.dinamico}%` }} 
                />
              </div>
            </div>

            {/* Conservador */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span>Conservador</span>
                <span className="font-mono text-slate-800 dark:text-slate-200">
                  {usage.profileBreakdown.conservador}%
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-slate-500 rounded-full" 
                  style={{ width: `${usage.profileBreakdown.conservador}%` }} 
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Top 20 Most Added Tickers with Long / Short breakdown */}
      <div className={`p-6 sm:p-7 rounded-3xl border shadow-xs space-y-4 ${cardBg}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h4 className="font-extrabold text-base tracking-tight">
              Top 20 Activos Financieros Más Monitoreados
            </h4>
            <p className={`text-xs ${subText}`}>
              Ranking de activos presentes en las carteras de los usuarios con proporción de posiciones Long (alcista) y Short (bajista).
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs font-bold">
            <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              Long
            </span>
            <span className="flex items-center gap-1 text-amber-600 dark:text-amber-400">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
              Short
            </span>
          </div>
        </div>

        <div className="space-y-2.5 pt-2">
          {(!usage.topTickers || usage.topTickers.length === 0) ? (
            <p className="text-xs text-slate-500 italic py-6 text-center">
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
                  <span className="w-5 text-right font-mono font-bold text-slate-400">
                    {index + 1}.
                  </span>

                  {/* Symbol & Name */}
                  <div className="w-32 sm:w-44 shrink-0 truncate">
                    <span className="font-mono font-bold text-slate-900 dark:text-white mr-1.5">
                      {t.symbol}
                    </span>
                    {t.name && (
                      <span className={`text-[11px] ${subText} hidden sm:inline truncate`}>
                        {t.name}
                      </span>
                    )}
                  </div>

                  {/* Dual Bar: Long vs Short */}
                  <div className="flex-1 h-6 bg-slate-100 dark:bg-slate-800 rounded-lg overflow-hidden flex p-0.5 border border-slate-200/80 dark:border-slate-700">
                    <div 
                      style={{ width: `${widthPct}%` }}
                      className="h-full flex overflow-hidden rounded-md transition-all duration-500"
                    >
                      <div 
                        style={{ width: `${longPct}%` }}
                        className="bg-blue-600 h-full flex items-center justify-start px-2 text-[10px] font-mono text-white font-bold"
                        title={`${t.symbol} Long: ${t.longCount}`}
                      >
                        {longPct > 20 && `${t.longCount} L`}
                      </div>
                      <div 
                        style={{ width: `${shortPct}%` }}
                        className="bg-amber-400 h-full flex items-center justify-end px-2 text-[10px] font-mono text-amber-950 font-bold"
                        title={`${t.symbol} Short: ${t.shortCount}`}
                      >
                        {shortPct > 20 && `${t.shortCount} S`}
                      </div>
                    </div>
                  </div>

                  {/* Total Count */}
                  <span className="w-20 text-right font-mono font-bold text-slate-700 dark:text-slate-300 shrink-0">
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
