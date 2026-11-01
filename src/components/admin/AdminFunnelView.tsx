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

  const cardBg = isDark ? 'bg-ink-900 border-ink-800 text-ink-100' : 'bg-paper border-ink-200/90 text-ink-900';
  const subText = isDark ? 'text-muted' : 'text-muted';

  const stages = [
    {
      id: 'cuenta_creada',
      title: '1. Cuenta Creada',
      count: funnel.totalAccounts,
      pctOfTotal: 100,
      pctOfPrevious: 100,
      color: 'bg-brand-800',
      description: 'Usuarios que completaron el registro y validaron credenciales.'
    },
    {
      id: 'adoption',
      title: '2. Adoption (Uso Activo)',
      count: funnel.adoption,
      pctOfTotal: Math.round((funnel.adoption / funnel.totalAccounts) * 100),
      pctOfPrevious: Math.round((funnel.adoption / funnel.totalAccounts) * 100),
      color: 'bg-brand-700',
      description: 'Consultaron al menos un pulso de noticias o navegaron el calendario.'
    },
    {
      id: 'interes',
      title: '3. Interés Demostrado',
      count: funnel.interes,
      pctOfTotal: Math.round((funnel.interes / funnel.totalAccounts) * 100),
      pctOfPrevious: Math.round((funnel.interes / (funnel.adoption || 1)) * 100),
      color: 'bg-brand-600',
      description: 'Agregaron activos con posición Long/Short, escucharon audio o guardaron noticias.'
    },
    {
      id: 'venta',
      title: '4. Venta (Conversión)',
      count: funnel.venta,
      pctOfTotal: Math.round((funnel.venta / funnel.totalAccounts) * 100),
      pctOfPrevious: Math.round((funnel.venta / (funnel.interes || 1)) * 100),
      color: 'bg-info-600',
      description: 'Usuarios que optaron por plan pago (Market o Partner) al culminar su trial.'
    },
    {
      id: 'farming',
      title: '5. Farming (Retención & LTV)',
      count: funnel.farming,
      pctOfTotal: Math.round((funnel.farming / funnel.totalAccounts) * 100),
      pctOfPrevious: Math.round((funnel.farming / (funnel.venta || 1)) * 100),
      color: 'bg-accent-600',
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
            <div className="w-8 h-8 rounded-xl bg-brand-100 dark:bg-brand-950 text-brand-800 dark:text-brand-300 flex items-center justify-center">
              <Clock className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-bold font-mono tracking-tight block">
            {funnel.timeToFirstValueMin} <span className="text-sm font-sans font-semibold text-muted">minutos</span>
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
            <div className="w-8 h-8 rounded-xl bg-warning-100 dark:bg-warning-950 text-warning-text dark:text-warning-300 flex items-center justify-center">
              <AlertCircle className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-bold font-mono tracking-tight block">
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
            <div className="w-8 h-8 rounded-xl bg-info-100 dark:bg-info-950 text-info-text dark:text-info-300 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <span className="text-3xl font-bold font-mono tracking-tight block">
            {Math.round((funnel.farming / (funnel.totalAccounts || 1)) * 100)}%
          </span>
          <p className={`text-xs ${subText}`}>
            De cuenta creada inicial a cliente retenido en farming.
          </p>
        </div>
      </div>

      {/* 5-Step Visual Funnel */}
      <div className={`p-6 sm:p-7 rounded-3xl border shadow-xs space-y-6 ${cardBg}`}>
        <div className="flex items-center justify-between pb-3 border-b border-ink-100 dark:border-ink-800">
          <div>
            <h4 className="font-extrabold text-base tracking-tight">
              Embudo de Adopción y Monetización
            </h4>
            <p className={`text-xs ${subText}`}>
              Flujo de 5 etapas: Cuenta Creada → Adoption → Interés → Venta → Farming.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-muted">
            Total {funnel.totalAccounts} cuentas
          </span>
        </div>

        {/* Step by step Funnel visualization */}
        <div className="space-y-4">
          {stages.map((stage, idx) => (
            <div key={stage.id} className="space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-ink-900 dark:text-paper">
                    {stage.title}
                  </span>
                  <span className={`text-[11px] ${subText} hidden sm:inline`}>
                    · {stage.description}
                  </span>
                </div>
                <div className="flex items-center gap-3 font-mono font-bold">
                  <span>{stage.count} usuarios</span>
                  <span className="text-brand-text dark:text-brand-text">
                    {stage.pctOfTotal}% del total
                  </span>
                  {idx > 0 && (
                    <span className="text-info-text dark:text-info-text text-[11px]">
                      ({stage.pctOfPrevious}% conv. paso ant.)
                    </span>
                  )}
                </div>
              </div>

              {/* Funnel Progress Bar with dynamic width */}
              <div className="w-full h-7 bg-ink-100 dark:bg-ink-800 rounded-xl overflow-hidden p-0.5 border border-ink-200/80 dark:border-ink-700 relative">
                <div 
                  className={`h-full ${stage.color} rounded-lg transition-all duration-700 flex items-center justify-end px-3 shadow-xs`}
                  style={{ width: `${Math.max(stage.pctOfTotal, 8)}%` }}
                >
                  <span className="text-paper text-[11px] font-mono font-bold">
                    {stage.count}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Rules explanation banner */}
        <div className="p-4 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700 text-xs space-y-2">
          <div className="flex items-center gap-2 font-bold text-ink-800 dark:text-ink-200">
            <HelpCircle className="w-4 h-4 text-brand-text" />
            <span>Reglas de Clasificación Automática de Etapas:</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-muted dark:text-muted">
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
              isDark ? 'bg-ink-800/80 border-ink-800 text-muted' : 'bg-ink-50 border-ink-200 text-muted'
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
            <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
              {cohorts.map((c: any) => (
                <tr key={c.cohortWeek} className="hover:bg-ink-50/50 dark:hover:bg-ink-800/30">
                  <td className="py-3 px-3 font-sans font-bold">{c.cohortWeek}</td>
                  <td className="py-3 px-3 font-bold">{c.newUsers}</td>
                  <td className="py-3 px-3 text-center">
                    <span className="px-2 py-1 rounded bg-brand-100 dark:bg-brand-950/70 text-brand-900 dark:text-brand-300 font-bold">
                      {c.w1}%
                    </span>
                  </td>
                  <td className="py-3 px-3 text-center">
                    {c.w2 !== null ? (
                      <span className="px-2 py-1 rounded bg-brand-100/80 dark:bg-brand-950/50 text-brand-900 dark:text-brand-300 font-bold">
                        {c.w2}%
                      </span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {c.w3 !== null ? (
                      <span className="px-2 py-1 rounded bg-info-100/80 dark:bg-info-950/50 text-info-text dark:text-info-300 font-bold">
                        {c.w3}%
                      </span>
                    ) : (
                      <span className="text-muted">-</span>
                    )}
                  </td>
                  <td className="py-3 px-3 text-center">
                    {c.w4 !== null ? (
                      <span className="px-2 py-1 rounded bg-accent-100/80 dark:bg-accent-950/50 text-accent-900 dark:text-accent-300 font-bold">
                        {c.w4}%
                      </span>
                    ) : (
                      <span className="text-muted">-</span>
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
