import React from 'react';
import { 
  Users, 
  UserCheck, 
  Activity, 
  TrendingUp, 
  Bell, 
  Briefcase, 
  Radio, 
  Target,
  ArrowUpRight,
  Layers,
  Sparkles
} from 'lucide-react';

interface AdminOverviewProps {
  data: any;
  isDark: boolean;
}

export const AdminOverviewView: React.FC<AdminOverviewProps> = ({ data, isDark }) => {
  if (!data || !data.kpis) {
    return (
      <div className="p-8 text-center text-muted">
        Cargando indicadores de resumen...
      </div>
    );
  }

  const { kpis, registrationProviders, dailySeries = [] } = data;

  const cardBg = isDark ? 'bg-ink-900 border-ink-800 text-ink-100' : 'bg-paper border-ink-200/90 text-ink-900';
  const subText = isDark ? 'text-muted' : 'text-muted';

  // Calculate maximum values for the SVG chart
  const maxSignups = Math.max(...dailySeries.map((d: any) => d.signups), 10);
  const maxActive = Math.max(...dailySeries.map((d: any) => d.activeUsers), 40);

  return (
    <div className="space-y-6">
      {/* Top Banner: Breakeven & Target Progress (Tesis Goals) */}
      <div className="bg-gradient-to-br from-brand-950 via-brand-900 to-ink-950 text-paper rounded-3xl p-6 sm:p-7 shadow-lg border border-brand-800/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-52 h-52 rounded-full bg-brand-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-brand-800/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-300 bg-brand-900/80 px-2 py-0.5 rounded-md border border-brand-700/60 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Metas del Plan de Negocio
              </span>
              <span className="text-xs text-brand-200">
                · Tesis de Grado
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-bold text-paper tracking-tight mt-1">
              Progreso hacia Breakeven (1.000 usuarios)
            </h3>
            <p className="text-xs sm:text-sm text-brand-200/90 max-w-2xl mt-1">
              Punto de equilibrio proyectado con 1.000 suscriptores pagos (mix 92% Retail @ $11.500 / 8% Asesores @ $16.500). Target de escala: 10.000 usuarios.
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className="text-3xl sm:text-4xl font-mono font-bold text-paper block">
              {kpis.totalUsers} <span className="text-sm font-normal text-brand-300">/ 1.000</span>
            </span>
            <span className="text-xs font-semibold text-brand-300">
              {kpis.breakevenProgressPct}% del umbral operativo
            </span>
          </div>
        </div>

        {/* Progress Bars */}
        <div className="relative z-10 grid grid-cols-1 md:grid-cols-2 gap-5 pt-5">
          {/* Bar 1: Breakeven */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-brand-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-brand-400" />
                Hito 1: Breakeven Financiero (1.000 u.)
              </span>
              <span className="font-mono text-paper font-bold">{kpis.breakevenProgressPct}%</span>
            </div>
            <div className="w-full h-3 bg-brand-950/80 rounded-full overflow-hidden p-0.5 border border-brand-800">
              <div 
                className="h-full bg-gradient-to-r from-brand-500 to-brand-400 rounded-full transition-all duration-700 shadow-xs"
                style={{ width: `${Math.min(kpis.breakevenProgressPct, 100)}%` }}
              />
            </div>
          </div>

          {/* Bar 2: Target 10,000 */}
          <div className="space-y-2">
            <div className="flex justify-between text-xs font-semibold">
              <span className="text-brand-200 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-info-400" />
                Hito 2: Target de Escala (10.000 u.)
              </span>
              <span className="font-mono text-paper font-bold">{kpis.scaleProgressPct}%</span>
            </div>
            <div className="w-full h-3 bg-brand-950/80 rounded-full overflow-hidden p-0.5 border border-brand-800">
              <div 
                className="h-full bg-gradient-to-r from-info-500 to-accent-400 rounded-full transition-all duration-700 shadow-xs"
                style={{ width: `${Math.min(kpis.scaleProgressPct, 100)}%` }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Card 1: Total & Nuevos */}
        <div className={`p-5 rounded-3xl border shadow-xs ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${subText}`}>
              Usuarios Registrados
            </span>
            <div className="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-950 text-brand-800 dark:text-brand-300 flex items-center justify-center">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold font-mono tracking-tight block">
              {kpis.totalUsers}
            </span>
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <span className="inline-flex items-center gap-0.5 font-bold text-brand-text dark:text-brand-text bg-brand-50 dark:bg-brand-950/80 border border-brand-200 dark:border-brand-800 px-1.5 py-0.2 rounded-md">
                <ArrowUpRight className="w-3 h-3" />
                +{kpis.todaySignups} hoy
              </span>
              <span className={subText}>+{kpis.signups7d} en 7d</span>
            </div>
          </div>
        </div>

        {/* Card 2: DAU / WAU / MAU */}
        <div className={`p-5 rounded-3xl border shadow-xs ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${subText}`}>
              Actividad (DAU / MAU)
            </span>
            <div className="w-8 h-8 rounded-xl bg-info-100 dark:bg-info-950 text-info-text dark:text-info-300 flex items-center justify-center">
              <Activity className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold font-mono tracking-tight block">
              {kpis.dau} <span className="text-sm font-sans font-semibold text-muted">DAU</span>
            </span>
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <span className="font-bold text-info-text dark:text-info-text bg-info-50 dark:bg-info-950/80 border border-info-200 dark:border-info-800 px-1.5 py-0.2 rounded-md">
                {kpis.stickinessRatio}% Stickiness
              </span>
              <span className={subText}>{kpis.wau} WAU · {kpis.mau} MAU</span>
            </div>
          </div>
        </div>

        {/* Card 3: Activation (% con activos) */}
        <div className={`p-5 rounded-3xl border shadow-xs ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${subText}`}>
              Activación de Cartera
            </span>
            <div className="w-8 h-8 rounded-xl bg-warning-100 dark:bg-warning-950 text-warning-text dark:text-warning-300 flex items-center justify-center">
              <Briefcase className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold font-mono tracking-tight block">
              {kpis.usersWithAssetsPct}%
            </span>
            <p className={`text-xs mt-1.5 ${subText}`}>
              Usuarios que cargaron al menos 1 activo en Mi Cartera
            </p>
          </div>
        </div>

        {/* Card 4: Pulsos por día & Notificaciones */}
        <div className={`p-5 rounded-3xl border shadow-xs ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${subText}`}>
              Pulsos Consultados / Día
            </span>
            <div className="w-8 h-8 rounded-xl bg-accent-100 dark:bg-accent-950 text-accent-800 dark:text-accent-300 flex items-center justify-center">
              <Radio className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold font-mono tracking-tight block">
              ~{kpis.pulseRequestsPerDay}
            </span>
            <div className="flex items-center gap-2 mt-1.5 text-xs">
              <span className="font-bold text-accent-700 dark:text-accent-400 bg-accent-50 dark:bg-accent-950/80 border border-accent-200 dark:border-accent-800 px-1.5 py-0.2 rounded-md">
                {kpis.notificationsOptInPct}% Notificaciones
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* SVG Time Series Chart: Signups & Active Users Evolution */}
      <div className={`p-6 sm:p-7 rounded-3xl border shadow-xs space-y-4 ${cardBg}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-ink-100 dark:border-ink-800">
          <div>
            <h4 className="font-extrabold text-base tracking-tight">
              Evolución Diaria: Registros y Usuarios Activos
            </h4>
            <p className={`text-xs ${subText}`}>
              Tendencia de altas orgánicas y frecuencia de uso en los últimos {dailySeries.length} días.
            </p>
          </div>

          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md bg-brand-600" />
              <span>Nuevos Registros</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-md bg-info-500" />
              <span>Usuarios Activos (DAU)</span>
            </span>
          </div>
        </div>

        {/* Responsive SVG Chart */}
        <div className="w-full overflow-x-auto pt-2">
          <div className="min-w-[620px] h-60 flex flex-col justify-between">
            {/* Bars container */}
            <div className="h-48 flex items-end justify-between gap-2 px-2 border-b border-ink-200 dark:border-ink-800">
              {dailySeries.map((day: any, i: number) => {
                const signupHeight = Math.round((day.signups / maxSignups) * 100);
                const activeHeight = Math.round((day.activeUsers / maxActive) * 100);

                return (
                  <div key={day.date || i} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    {/* Tooltip on hover */}
                    <div className="absolute -top-14 hidden group-hover:flex flex-col items-center z-30 pointer-events-none animate-in fade-in">
                      <div className="bg-ink-900 text-paper text-[11px] font-mono px-2 py-1 rounded shadow-lg whitespace-nowrap">
                        <span className="font-bold">{day.date}</span>: {day.signups} altas · {day.activeUsers} activos
                      </div>
                      <div className="w-2 h-2 bg-ink-900 rotate-45 -mt-1" />
                    </div>

                    <div className="w-full flex items-end justify-center gap-1">
                      {/* Signups bar */}
                      <div 
                        style={{ height: `${Math.max(signupHeight, 4)}%` }}
                        className="w-2.5 sm:w-3.5 bg-brand-600 hover:bg-brand-500 rounded-t transition-all cursor-pointer"
                        title={`${day.date} - ${day.signups} registros`}
                      />
                      {/* Active users bar */}
                      <div 
                        style={{ height: `${Math.max(activeHeight, 6)}%` }}
                        className="w-2.5 sm:w-3.5 bg-info-500/80 hover:bg-info-400 rounded-t transition-all cursor-pointer"
                        title={`${day.date} - ${day.activeUsers} activos`}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            {/* X-axis labels */}
            <div className="flex justify-between px-2 text-[11px] font-mono text-muted pt-2">
              <span>{dailySeries[0]?.date || 'Inicio'}</span>
              <span>{dailySeries[Math.floor(dailySeries.length / 2)]?.date || 'Mitad'}</span>
              <span>{dailySeries[dailySeries.length - 1]?.date || 'Hoy'}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Breakdown Row: Registration Providers & Quick Metrics */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Registration Providers */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <Layers className="w-4 h-4 text-brand-text" />
            Método de Registro
          </h4>
          <p className={`text-xs ${subText}`}>
            Canal de autenticación elegido por los usuarios.
          </p>

          <div className="space-y-2.5 pt-1">
            {Object.entries(registrationProviders || {}).map(([prov, count]: any) => {
              const label = prov === 'google' ? 'Google OAuth' : prov === 'microsoft' ? 'Microsoft Entra' : 'Email y Contraseña';
              const total = Object.values(registrationProviders || {}).reduce((a: any, b: any) => a + b, 0) || 1;
              const pct = Math.round((count / (total as number)) * 100);

              return (
                <div key={prov} className="space-y-1 text-xs">
                  <div className="flex justify-between font-semibold">
                    <span>{label}</span>
                    <span className="font-mono text-muted">{count} ({pct}%)</span>
                  </div>
                  <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full ${
                        prov === 'google' ? 'bg-danger-500' : prov === 'microsoft' ? 'bg-info-500' : 'bg-brand-600'
                      }`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Retail vs Partner Ratio */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-info-text" />
            Mix de Clientes
          </h4>
          <p className={`text-xs ${subText}`}>
            Proyección del plan vs. realidad actual:
          </p>

          <div className="space-y-3 pt-2 text-xs">
            <div className="p-3 rounded-2xl bg-ink-50 dark:bg-ink-800/60 border border-ink-200/80 dark:border-ink-700 space-y-1">
              <div className="flex justify-between font-bold">
                <span>Plan Market (Retail)</span>
                <span className="text-brand-text dark:text-brand-text font-mono">$11.500/mes</span>
              </div>
              <p className={subText}>1 cartera monitoreada · Target 92% del mix</p>
            </div>

            <div className="p-3 rounded-2xl bg-ink-50 dark:bg-ink-800/60 border border-ink-200/80 dark:border-ink-700 space-y-1">
              <div className="flex justify-between font-bold">
                <span>Plan Partner (Brokers/Asesores)</span>
                <span className="text-info-text dark:text-info-text font-mono">$16.500/mes</span>
              </div>
              <p className={subText}>Carteras ilimitadas · Target 8% del mix</p>
            </div>
          </div>
        </div>

        {/* Free Trial Conversion Window */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-warning-text" />
            Trial de 1 Mes Gratuito
          </h4>
          <p className={`text-xs ${subText}`}>
            Ventana de adopción sin fricción de cobro inicial.
          </p>

          <div className="p-3.5 rounded-2xl bg-warning-50 dark:bg-warning-950/40 border border-warning-200 dark:border-warning-800 text-xs text-warning-text dark:text-warning-200 space-y-1.5">
            <p className="font-bold">Política del Modelo de Negocio:</p>
            <p className="leading-relaxed font-normal">
              Todos los usuarios nuevos inician con 30 días de prueba sin cargo. El administrador puede asignar y cambiar el plan desde la pestaña <strong>Usuarios</strong>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
