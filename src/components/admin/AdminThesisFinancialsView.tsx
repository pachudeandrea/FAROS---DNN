import React, { useState } from 'react';
import { 
  Calculator, 
  DollarSign, 
  TrendingUp, 
  Target, 
  HelpCircle, 
  Sliders, 
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

interface AdminThesisFinancialsProps {
  data: any;
  isDark: boolean;
}

export const AdminThesisFinancialsView: React.FC<AdminThesisFinancialsProps> = ({ data, isDark }) => {
  const model = data?.thesisModel || {
    marketPlanPrice: 11500,
    partnerPlanPrice: 16500,
    breakevenTargetUsers: 1000,
    scaleTargetUsers: 10000,
    defaultMonthlyFixedCostsArs: 11900000,
    costBreakdown: {
      hostingCloudVercel: 1500000,
      geminiGoogleApis: 4200000,
      ttsInfrastructure: 1200000,
      engineeringMaintenance: 5000000
    },
    scenarios: {
      pesimista: { retailUsers: 450, partnerUsers: 25, totalUsers: 475, mrrArs: 5587500 },
      realista: { retailUsers: 920, partnerUsers: 80, totalUsers: 1000, mrrArs: 11900000 },
      optimista: { retailUsers: 9200, partnerUsers: 800, totalUsers: 10000, mrrArs: 119000000 }
    }
  };

  const realCurrent = data?.realCurrentState || {
    retailUsersCount: 0,
    partnerUsersCount: 0,
    totalPayingUsers: 0,
    realMrrArs: 0,
    breakevenCoveragePct: 0
  };

  // Interactive Editable Costs for Breakeven Calculator
  const [fixedCosts, setFixedCosts] = useState({
    hosting: model.costBreakdown?.hostingCloudVercel || 1500000,
    gemini: model.costBreakdown?.geminiGoogleApis || 4200000,
    tts: model.costBreakdown?.ttsInfrastructure || 1200000,
    engineering: model.costBreakdown?.engineeringMaintenance || 5000000
  });

  const [marketPrice, setMarketPrice] = useState(model.marketPlanPrice || 11500);
  const [partnerPrice, setPartnerPrice] = useState(model.partnerPlanPrice || 16500);
  const [retailMixPct, setRetailMixPct] = useState(92);

  // Dynamic calculations
  const totalMonthlyCosts = fixedCosts.hosting + fixedCosts.gemini + fixedCosts.tts + fixedCosts.engineering;
  const partnerMixPct = 100 - retailMixPct;
  const weightedAvgRevenuePerUser = (marketPrice * (retailMixPct / 100)) + (partnerPrice * (partnerMixPct / 100));
  const calculatedBreakevenUsers = Math.ceil(totalMonthlyCosts / (weightedAvgRevenuePerUser || 1));

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('es-AR', {
      style: 'currency',
      currency: 'ARS',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const cardBg = isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200/90 text-slate-900';
  const subText = isDark ? 'text-slate-400' : 'text-slate-500';

  return (
    <div className="space-y-6">
      {/* Top Banner: Real MRR vs Breakeven Target */}
      <div className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 text-white rounded-3xl p-6 sm:p-7 shadow-lg border border-emerald-800/60 relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-52 h-52 rounded-full bg-emerald-500/10 blur-3xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6 pb-6 border-b border-emerald-800/60">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300 bg-emerald-900/80 px-2 py-0.5 rounded-md border border-emerald-700/60 flex items-center gap-1.5">
                <DollarSign className="w-3.5 h-3.5" />
                Modelo Financiero de Tesis
              </span>
              <span className="text-xs text-emerald-200">
                · Plan Market vs. Partner
              </span>
            </div>
            <h3 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1">
              Ingresos Mensuales Recurrentes (MRR)
            </h3>
            <p className="text-xs sm:text-sm text-emerald-200/90 max-w-2xl mt-1">
              Evaluación económica con precios fijados: Retail a $11.500/mes y Brokers a $16.500/mes.
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className="text-3xl sm:text-4xl font-mono font-black text-white block">
              {formatCurrency(realCurrent.realMrrArs)}
            </span>
            <span className="text-xs font-semibold text-emerald-300">
              MRR actual de usuarios asignados a planes pagos
            </span>
          </div>
        </div>

        {/* 3 Quick Highlight Metrics */}
        <div className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-4 pt-5 text-xs">
          <div className="p-3.5 rounded-2xl bg-emerald-900/40 border border-emerald-700/50">
            <span className="text-emerald-300 block font-bold">Clientes Market (Retail)</span>
            <span className="text-xl font-mono font-black text-white mt-0.5 block">
              {realCurrent.retailUsersCount} activos
            </span>
            <span className="text-emerald-200/80 text-[11px]">
              {formatCurrency(realCurrent.retailUsersCount * marketPrice)} / mes
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-900/40 border border-emerald-700/50">
            <span className="text-blue-300 block font-bold">Clientes Partner (Brokers)</span>
            <span className="text-xl font-mono font-black text-white mt-0.5 block">
              {realCurrent.partnerUsersCount} activos
            </span>
            <span className="text-emerald-200/80 text-[11px]">
              {formatCurrency(realCurrent.partnerUsersCount * partnerPrice)} / mes
            </span>
          </div>

          <div className="p-3.5 rounded-2xl bg-emerald-900/40 border border-emerald-700/50">
            <span className="text-amber-300 block font-bold">Cobertura de Costos Fijos</span>
            <span className="text-xl font-mono font-black text-white mt-0.5 block">
              {realCurrent.breakevenCoveragePct}%
            </span>
            <span className="text-emerald-200/80 text-[11px]">
              Meta Breakeven: {formatCurrency(totalMonthlyCosts)}
            </span>
          </div>
        </div>
      </div>

      {/* 3 Scenarios Comparison Table (Tesis Business Plan) */}
      <div className={`p-6 sm:p-7 rounded-3xl border shadow-xs space-y-4 ${cardBg}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h4 className="font-extrabold text-base tracking-tight flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-emerald-600" />
              Comparativa de Escenarios de la Tesis
            </h4>
            <p className={`text-xs ${subText}`}>
              Proyección de demanda, mix de clientes y facturación mensual estimada.
            </p>
          </div>
          <span className="text-xs font-mono font-bold text-slate-500">
            Mix Base: 92% Retail / 8% Brokers
          </span>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Pesimista */}
          <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-amber-600 dark:text-amber-400">
                Escenario Pesimista
              </span>
              <span className="font-mono text-slate-500">475 usuarios</span>
            </div>
            <div>
              <span className="text-2xl font-black font-mono block text-slate-900 dark:text-white">
                {formatCurrency(model.scenarios?.pesimista?.mrrArs || 5587500)}
              </span>
              <span className={subText}>MRR Mensual</span>
            </div>
            <div className="space-y-1 pt-1 border-t border-slate-200/80 dark:border-slate-700 text-[11px]">
              <div className="flex justify-between">
                <span>Retail (450 u.):</span>
                <span className="font-mono font-bold">{formatCurrency(450 * marketPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>Partner (25 u.):</span>
                <span className="font-mono font-bold">{formatCurrency(25 * partnerPrice)}</span>
              </div>
            </div>
          </div>

          {/* Realista / Breakeven */}
          <div className="p-5 rounded-3xl bg-emerald-50/70 dark:bg-emerald-950/40 border-2 border-emerald-600 space-y-3 text-xs relative shadow-xs">
            <span className="absolute -top-3 right-4 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full">
              Breakeven Meta
            </span>
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-emerald-900 dark:text-emerald-300">
                Escenario Realista (Hito 1)
              </span>
              <span className="font-mono font-bold text-emerald-800 dark:text-emerald-400">1.000 usuarios</span>
            </div>
            <div>
              <span className="text-2xl font-black font-mono block text-emerald-950 dark:text-white">
                {formatCurrency(model.scenarios?.realista?.mrrArs || 11900000)}
              </span>
              <span className="text-emerald-700 dark:text-emerald-300 font-bold">MRR de Equilibrio Operativo</span>
            </div>
            <div className="space-y-1 pt-1 border-t border-emerald-200 dark:border-emerald-800 text-[11px]">
              <div className="flex justify-between">
                <span>Retail (920 u.):</span>
                <span className="font-mono font-bold">{formatCurrency(920 * marketPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>Partner (80 u.):</span>
                <span className="font-mono font-bold">{formatCurrency(80 * partnerPrice)}</span>
              </div>
            </div>
          </div>

          {/* Optimista / Escala */}
          <div className="p-5 rounded-3xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700 space-y-3 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black uppercase text-blue-600 dark:text-blue-400">
                Escenario Optimista (Escala)
              </span>
              <span className="font-mono text-slate-500">10.000 usuarios</span>
            </div>
            <div>
              <span className="text-2xl font-black font-mono block text-slate-900 dark:text-white">
                {formatCurrency(model.scenarios?.optimista?.mrrArs || 119000000)}
              </span>
              <span className={subText}>MRR Mensual</span>
            </div>
            <div className="space-y-1 pt-1 border-t border-slate-200/80 dark:border-slate-700 text-[11px]">
              <div className="flex justify-between">
                <span>Retail (9.200 u.):</span>
                <span className="font-mono font-bold">{formatCurrency(9200 * marketPrice)}</span>
              </div>
              <div className="flex justify-between">
                <span>Partner (800 u.):</span>
                <span className="font-mono font-bold">{formatCurrency(800 * partnerPrice)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Breakeven Calculator */}
      <div className={`p-6 sm:p-7 rounded-3xl border shadow-xs space-y-6 ${cardBg}`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100 dark:border-slate-800">
          <div>
            <h4 className="font-extrabold text-base tracking-tight flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-600" />
              Calculadora Interactiva de Breakeven y Costos Fijos
            </h4>
            <p className={`text-xs ${subText}`}>
              Modificá los costos operativos mensuales para recalcular en tiempo real la cantidad de usuarios requerida para breakeven.
            </p>
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-xs">
          {/* Hosting */}
          <div className="space-y-1.5">
            <label className="font-bold flex items-center justify-between">
              <span>Hosting Cloud & Vercel</span>
              <span className="font-mono text-slate-400">ARS</span>
            </label>
            <input
              type="number"
              value={fixedCosts.hosting}
              onChange={(e) => setFixedCosts({ ...fixedCosts, hosting: Number(e.target.value) || 0 })}
              className={`w-full px-3 py-2 rounded-xl border font-mono font-bold focus:outline-none ${
                isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          {/* Gemini AI APIs */}
          <div className="space-y-1.5">
            <label className="font-bold flex items-center justify-between">
              <span>APIs Gemini & Grounding</span>
              <span className="font-mono text-slate-400">ARS</span>
            </label>
            <input
              type="number"
              value={fixedCosts.gemini}
              onChange={(e) => setFixedCosts({ ...fixedCosts, gemini: Number(e.target.value) || 0 })}
              className={`w-full px-3 py-2 rounded-xl border font-mono font-bold focus:outline-none ${
                isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          {/* TTS Infrastructure */}
          <div className="space-y-1.5">
            <label className="font-bold flex items-center justify-between">
              <span>Infraestructura TTS Audio</span>
              <span className="font-mono text-slate-400">ARS</span>
            </label>
            <input
              type="number"
              value={fixedCosts.tts}
              onChange={(e) => setFixedCosts({ ...fixedCosts, tts: Number(e.target.value) || 0 })}
              className={`w-full px-3 py-2 rounded-xl border font-mono font-bold focus:outline-none ${
                isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          {/* Engineering & Maintenance */}
          <div className="space-y-1.5">
            <label className="font-bold flex items-center justify-between">
              <span>Desarrollo & Soporte</span>
              <span className="font-mono text-slate-400">ARS</span>
            </label>
            <input
              type="number"
              value={fixedCosts.engineering}
              onChange={(e) => setFixedCosts({ ...fixedCosts, engineering: Number(e.target.value) || 0 })}
              className={`w-full px-3 py-2 rounded-xl border font-mono font-bold focus:outline-none ${
                isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>
        </div>

        {/* Pricing & Mix Adjusters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 text-xs">
          <div className="space-y-1.5">
            <label className="font-bold">Precio Plan Market (Retail)</label>
            <input
              type="number"
              value={marketPrice}
              onChange={(e) => setMarketPrice(Number(e.target.value) || 0)}
              className={`w-full px-3 py-2 rounded-xl border font-mono font-bold focus:outline-none ${
                isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-bold">Precio Plan Partner (Brokers)</label>
            <input
              type="number"
              value={partnerPrice}
              onChange={(e) => setPartnerPrice(Number(e.target.value) || 0)}
              className={`w-full px-3 py-2 rounded-xl border font-mono font-bold focus:outline-none ${
                isDark ? 'bg-slate-800 border-slate-700 text-white' : 'bg-slate-50 border-slate-300 text-slate-900'
              }`}
            />
          </div>

          <div className="space-y-1.5">
            <label className="font-bold flex justify-between">
              <span>Mix Retail (%)</span>
              <span className="font-mono text-emerald-600">{retailMixPct}% / {partnerMixPct}%</span>
            </label>
            <input
              type="range"
              min="50"
              max="98"
              value={retailMixPct}
              onChange={(e) => setRetailMixPct(Number(e.target.value))}
              className="w-full accent-emerald-600 cursor-pointer"
            />
          </div>
        </div>

        {/* Breakeven Result Box */}
        <div className="p-5 rounded-3xl bg-gradient-to-r from-emerald-950 via-slate-900 to-emerald-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4 shadow-md">
          <div className="space-y-1">
            <span className="text-xs uppercase tracking-wider font-extrabold text-emerald-300">
              Punto de Equilibrio Calculado
            </span>
            <h5 className="text-xl sm:text-2xl font-black">
              Necesitás <span className="font-mono text-emerald-400">{calculatedBreakevenUsers.toLocaleString('es-AR')}</span> usuarios pagos
            </h5>
            <p className="text-xs text-emerald-200/80">
              Para cubrir {formatCurrency(totalMonthlyCosts)} mensuales con un ingreso medio por usuario de {formatCurrency(Math.round(weightedAvgRevenuePerUser))}/mes.
            </p>
          </div>

          <div className="text-right shrink-0">
            <span className="text-xs font-semibold text-emerald-300 block">Facturación Meta</span>
            <span className="text-2xl font-mono font-black text-white">
              {formatCurrency(totalMonthlyCosts)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
