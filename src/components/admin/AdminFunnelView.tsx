import React from 'react';
import { 
  Filter, 
  ArrowDown, 
  CheckCircle2, 
  Clock, 
  Users, 
  TrendingUp, 
  HelpCircle, 
  FileText,
  AlertCircle
} from 'lucide-react';

interface AdminFunnelProps {
  data: any;
  isDark: boolean;
}

export const AdminFunnelView: React.FC<AdminFunnelProps> = ({ data, isDark }) => {
  const funnel = data?.funnel || {
    totalAccounts: 245,
    adoption: 182,
    interes: 114,
    venta: 68,
    farming: 54,
    timeToFirstValueMin: 3.2,
    draftAbandonmentRate: 14.2
  };

  const cohorts = data?.cohorts || [];

  const cardBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200/90 text-slate-900';
  const subText = isDark ? 'text-slate-400' : 'text-slate-500';

  const stages = [
    {
      id: 'cuenta_creada',
      title: '1. Cuenta Creada',
      count: funnel.totalAccounts,
      pctOfTotal: 100,
      pctOfPrevious: 100,
      color: 'bg-emerald-800',
      description: 'Usuarios que completaron el registro y validaron credenciales.'
    },
    {
      id: 'adoption',
      title: '2. Adoption (Uso Activo)',
      count: funnel.adoption,
      pctOfTotal: Math.round((funnel.adoption / funnel.totalAccounts) * 100),
      pctOfPrevious: Math.round((funnel.adoption / funnel.totalAccounts) * 100),
      color: 'bg-emerald-700',
      description: 'Consultaron al menos un pulso de noticias o navegaron el calendario.'
    },
    {
      id: 'interes',
      title: '3. Interés Demostrado',
      count: funnel.interes,
      pctOfTotal: Math.round((funnel.interes / funnel.totalAccounts) * 100),
      pctOfPrevious: Math.round((funnel.interes / (funnel.adoption || 1)) * 100),
      color: 'bg-emerald-600',
      description: 'Agregaron activos con posición Long/Short, escucharon audio o guardaron noticias.'
    },
    {
      id: 'venta',
      title: '4. Venta (Conversión)',
      count: funnel.venta,
      pctOfTotal: Math.round((funnel.venta / funnel.totalAccounts) * 100),
      pctOfPrevious: Math.round((funnel.venta / (funnel.interes || 1)) * 100),
      color: 'bg-blue-600',
      description: 'Usuarios que optaron por plan pago (Market o Partner) al culminar su trial.'
    },
    {
      id: 'farming',
      title: '5. Farming (Retención & LTV)',
      count: funnel.farming,
      pctOfTotal: Math.round((funnel.farming / funnel.totalAccounts) * 100),
      pctOfPrevious: Math.round((funnel.farming / (funnel.venta || 1)) * 100),
      color: 'bg-indigo-600',
      description: 'Suscriptores recurrentes activos con más de 60 días en la plataforma.'
    }
  ];

  return (
    <div className="space-y-6">
      {/* Onboarding Highlights Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Onboarding Time to First Value */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-2 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${subText}`}>
              Tiempo al Primer Valor (TTV)
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight block">
            {funnel.timeToFirstValueMin} <span className="text-sm font-sans font-semibold text-slate-500">minutos</span>
          </span>
          <p className={`text-xs ${subText}`}>
            Desde que el usuario inicia el registro hasta que ve su primer pulso de noticias.
          </p>
        </div>

        {/* Draft Abandonment Rate */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-2 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${subText}`}>
              Abandono de Borrador
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-300 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight block">
            {funnel.draftAbandonmentRate}%
          </span>
          <p className={`text-xs ${subText}`}>
            Usuarios que guardan borrador en paso 1 o 2 sin completar la confirmación final.
          </p>
        </div>

        {/* Global Conversion */}
        <div className={`p-5 rounded-3xl border shadow-xs space-y-2 ${cardBg}`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-bold uppercase tracking-wider ${subText}`}>
              Conversión Total a Suscriptor
            </span>
            <div className="w-8 h-8 rounded-xl bg-blue-100 dark:bg-blue-950 text-blue-800 dark:text-blue-300 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-black font-mono tracking-tight block">
            {Math.round((funnel.farming / (funnel.totalAccounts || 1)) * 100)}%
          </span>
          <p className={`text-xs ${subText}`}>
            De cuenta creada inicial a cliente retenido en farming.
          </p>
        </div>
      </div>

      {/* 5-Step Visual Funnel */}
      <div className={`p-6 sm:p-7 rounded-3xl border shadow-xs space-y-6 ${cardBg}`}>
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h4 className="font-extrabold text-base tracking-tight">
              Embudo de Adopción y Monetización
            </h4>
            <p className={`text-xs ${subText}`}>
              Flujo de 5 etapas: Cuenta Creada → Adoption → Interés → Venta → Farming.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-500">
            Total {funnel.totalAccounts} cuentas
          </span>
        </div>

        {/* Step by step Funnel visualization */}
        <div className="space-y-4">
          {stages.map((stage, idx) => (
            <div key={stage.id} className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900 dark:text-white">
                    {stage.title}
                  </span>
                  <span className={`text-[11px] ${subText} hidden sm:inline`}>
                    · {stage.description}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono font-bold">
                  <span>{stage.count} usuarios</span>
                  <span className="text-emerald-700 dark:text-emerald-400">
                    {stage.pctOfTotal}% del total
                  </span>
                  {idx > 0 && (
                    <span className="text-blue-700 dark:text-blue-400 text-[11px]">
                      ({stage.pctOfPrevious}% conv. paso ant.)
                    </span>
                  )}
                </div>
              </div>

              {/* Funnel Progress Bar with dynamic width */}
              <div className="w-full h-7 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden p-0.5 border border-slate-200/80 dark:border-slate-700 relative">
                <div 
                  className={`h-full ${stage.color} rounded-lg transition-all duration-700 flex items-center justify-end px-3 shadow-xs`}
                  style={{ width: `${Math.max(stage.pctOfTotal, 8)}%` }}
                >
                  <span className="text-white text-[11px] font-mono font-bold">
                    {stage.count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Rules explanation banner */}
        <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-slate-800 dark:text-slate-200">
            <HelpCircle className="w-4 h-4 text-emerald-700" />
            <span>Reglas de Clasificación Automática de Etapas:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-slate-600 dark:text-slate-400">
            <li><strong>Cuenta Creada:</strong> Registro completado con éxito con correo confirmado o federado.</li>
            <li><strong>Adoption:</strong> El usuario abrió y consumió al menos 1 pulso de noticias o interactuó con el calendario.</li>
            <li><strong>Interés:</strong> El usuario incorporó tickers reales en Mi Cartera con posiciones Long/Short o guardó noticias.</li>
            <li><strong>Venta:</strong> El usuario cuenta con plan asignado pago (Market $11.500 o Partner $16.500).</li>
            <li><strong>Farming:</strong> El suscriptor mantiene actividad constante por más de 60 días.</li>
          </ul>
        </div>
      </div>

      {/* Retention Matrix by Weekly Cohorts */}
      <div className={`p-6 sm:p-7 rounded-3xl border shadow-xs space-y-4 ${cardBg}`}>
        <div>
          <h4 className="font-extrabold text-base tracking-tight">
            Retención Semanal por Cohortes
          </h4>
          <p className={`text-xs ${subText}`}>
            Porcentaje de usuarios que regresan y realizan al menos una acción en las semanas posteriores al alta.
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead className={`border-b text-[11px] font-bold ${
              isDark ? 'bg-slate-800/80 border-slate-800 text-slate-400' : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              <tr>
                <th className="py-3 px-3">Cohorte</th>
                <th className="py-3 px-3">Nuevos Usuarios</th>
                <th className="py-3 px-3 text-center">Semana 1</th>
                <th className="py-3 px-3 text-center">Semana 2</th>
                <th className="py-3 px-3 text-center">Semana 3</th>
                <th className="py-3 px-3 text-center">Semana 4</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {cohorts.map((c: any) => (
                <tr key={c.cohortWeek} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30">
                  <td className="py-3 px-3 font-sans font-bold">{c.cohortWeek}</td>
                  <td className="py-3 px-3 font-bold">{c.newUsers}</td>
                  <td className="py-3 px-3 text-center">
                    <span className="px-2 py-1 rounded bg-emerald-100 dark:bg-emerald-950/70 text-emerald-900 dark:text-emerald-300 font-bold">
                      {c.w1}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    {c.w2 !== null ? (
                      <span className="px-2 py-1 rounded bg-emerald-100/80 dark:bg-emerald-950/50 text-emerald-900 dark:text-emerald-300 font-bold">
                        {c.w2}%
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {c.w3 !== null ? (
                      <span className="px-2 py-1 rounded bg-blue-100/80 dark:bg-blue-950/50 text-blue-900 dark:text-blue-300 font-bold">
                        {c.w3}%
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {c.w4 !== null ? (
                      <span className="px-2 py-1 rounded bg-indigo-100/80 dark:bg-indigo-950/50 text-indigo-900 dark:text-indigo-300 font-bold">
                        {c.w4}%
                      </span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
