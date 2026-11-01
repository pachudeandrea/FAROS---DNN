import React, { useState } from 'react';
import { Portfolio, Asset } from '../types';
import { 
  ArrowRight, 
  TrendingUp, 
  CheckCircle2, 
  ShieldCheck, 
  Volume2, 
  Sparkles,
  ChevronDown,
  X,
  Bell
} from 'lucide-react';

interface RocketHeroProps {
  portfolio: Portfolio;
  assetsMap: Record<string, Asset>;
  onExploreFeed: () => void;
  onOpenSettings: () => void;
}

export const RocketHero: React.FC<RocketHeroProps> = ({
  portfolio,
  assetsMap,
  onExploreFeed,
  onOpenSettings,
}) => {
  const [isDismissed, setIsDismissed] = useState(false);

  if (isDismissed) {
    return (
      <div className="mb-4 flex items-center justify-between bg-brand-50/80 border border-brand-200/80 px-4 py-2.5 rounded-2xl text-xs">
        <div className="flex items-center gap-2 text-brand-950 font-medium">
          <Sparkles className="w-4 h-4 text-brand-text" />
          <span>Modo compacto activo. Estilo fintech inspirado en Rocket Money.</span>
        </div>
        <button
          onClick={() => setIsDismissed(false)}
          className="text-brand-900 font-bold hover:underline"
        >
          Mostrar presentación
        </button>
      </div>
    );
  }

  return (
    <section className="relative overflow-hidden bg-paper rounded-3xl border border-ink-200/80 shadow-sm p-6 sm:p-10 lg:p-12 mb-8">
      {/* Background soft ambient gradient */}
      <div className="absolute top-0 right-0 -mr-20 -mt-20 w-96 h-96 rounded-full bg-brand-50/60 blur-3xl pointer-events-none" />
      <div className="absolute bottom-0 left-0 -ml-20 -mb-20 w-80 h-80 rounded-full bg-ink-50 blur-2xl pointer-events-none" />

      {/* Dismiss button */}
      <button
        onClick={() => setIsDismissed(true)}
        className="absolute top-4 right-4 p-1.5 text-muted hover:text-muted hover:bg-ink-100 rounded-xl transition-colors"
        title="Ocultar presentación"
        aria-label="Ocultar"
      >
        <X className="w-4 h-4" />
      </button>

      <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-12 items-center">
        {/* Left Column: Rocket Money-style Hero Copy */}
        <div className="lg:col-span-7 space-y-6">
          {/* Accent colored bar like Rocket Money's signature red bar, in FAROS deep emerald */}
          <div className="w-14 h-1.5 bg-brand-800 rounded-full" />

          {/* Large punchy headline */}
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-bold text-ink-900 tracking-tight leading-[1.15] text-balance">
            La plataforma de mercado que trabaja para tu cartera
          </h1>

          {/* Subtitle */}
          <p className="text-base sm:text-lg text-muted leading-relaxed font-normal max-w-xl">
            Informarse sobre finanzas no debería ser tedioso. FAROS recorre todos los medios relevantes, identifica las noticias que impactan en tus activos y te entrega un único resumen claro con el impacto cualitativo en cada uno de tus activos.
          </p>

          {/* Trust points */}
          <div className="flex flex-wrap items-center gap-y-2 gap-x-5 text-xs text-muted font-medium pt-1">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-brand-text" />
              <span>Personalizado por activos</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-brand-text" />
              <span>Filtro de rumores y ruido</span>
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-brand-text" />
              <span>Fuentes oficiales de mercado</span>
            </span>
          </div>

          {/* CTA Group */}
          <div className="pt-2 flex flex-wrap items-center gap-3">
            <button
              onClick={onExploreFeed}
              className="inline-flex items-center gap-2 px-6 py-3.5 bg-brand-950 text-paper font-extrabold text-sm rounded-2xl hover:bg-brand-900 active:scale-95 transition-all shadow-md group cursor-pointer"
            >
              <span>Ver mi feed en vivo</span>
              <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>

            <button
              onClick={onOpenSettings}
              className="inline-flex items-center gap-2 px-5 py-3.5 bg-ink-100 hover:bg-ink-200/80 text-ink-800 font-bold text-sm rounded-2xl transition-colors cursor-pointer"
            >
              <span>Personalizar mis activos</span>
            </button>
          </div>
        </div>

        {/* Right Column: Realistic Angled Phone Mockup (Rocket Money signature style) */}
        <div className="lg:col-span-5 flex justify-center lg:justify-end">
          <div className="relative w-full max-w-[310px] sm:max-w-[330px] transform lg:rotate-3 lg:hover:rotate-0 transition-transform duration-500 ease-out">
            {/* Phone Shadow */}
            <div className="absolute inset-0 bg-brand-950/20 rounded-device blur-2xl transform translate-y-6 scale-95" />

            {/* Phone Outer Bezel */}
            <div className="relative bg-ink-900 p-3 rounded-device shadow-2xl border-4 border-ink-800">
              {/* Dynamic Island / Notch */}
              <div className="absolute top-6 left-1/2 transform -translate-x-1/2 w-24 h-4 bg-ink-900 rounded-full z-20 flex items-center justify-center">
                <div className="w-2.5 h-2.5 rounded-full bg-ink-950 mr-2" />
                <div className="w-2 h-2 rounded-full bg-brand-900/60" />
              </div>

              {/* Phone Screen Container */}
              <div className="bg-ink-50 rounded-device-screen overflow-hidden pt-8 pb-4 px-3 space-y-3 text-ink-900 select-none">
                {/* Phone In-App Header with deep emerald gradient like Rocket Money's purple header */}
                <div className="bg-gradient-to-br from-brand-950 via-brand-900 to-ink-900 text-paper p-4 rounded-2xl shadow-inner space-y-2">
                  <div className="flex items-center justify-between text-[10px] text-brand-300 font-bold">
                    <span className="flex items-center gap-1 uppercase tracking-wider">
                      <Sparkles className="w-3 h-3 text-brand-text" />
                      FAROS Mobile
                    </span>
                    <span className="font-mono text-ink-300">12:22</span>
                  </div>

                  <div>
                    <span className="text-[10px] text-brand-200 block">Impacto en cartera</span>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xl font-bold tracking-tight text-paper">
                        Favorable
                      </span>
                      <span className="text-[10px] font-bold bg-brand-800/80 text-brand-200 px-2 py-0.5 rounded-full">
                        Cualitativo
                      </span>
                    </div>
                  </div>

                  {/* Micro Sparkline */}
                  <div className="h-6 w-full pt-1">
                    <svg className="w-full h-full overflow-visible" viewBox="0 0 100 24">
                      <path
                        d="M0,18 Q20,16 35,12 T70,8 T100,3"
                        fill="none"
                        stroke="var(--brand-accent)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                      />
                      <circle cx="100" cy="3" r="3" fill="var(--brand-paper)" />
                    </svg>
                  </div>
                </div>

                {/* In-App Ticker List (Rocket Money "Accounts" style) */}
                <div className="bg-paper p-3 rounded-2xl border border-ink-200/90 shadow-2xs space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-bold text-muted uppercase tracking-wider">
                    <span>Activos en cartera</span>
                    <span className="text-brand-900 font-mono">14 de Oct</span>
                  </div>

                  <div className="space-y-1.5 text-xs">
                    <div className="flex items-center justify-between py-1 border-b border-ink-100">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-brand-100 text-brand-900 font-mono font-bold text-[10px] flex items-center justify-center">
                          AL
                        </span>
                        <span className="font-bold text-ink-800">AL30</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-brand-800 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full inline-block">
                          Favorable
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1 border-b border-ink-100">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-ink-100 text-ink-900 font-mono font-bold text-[10px] flex items-center justify-center">
                          YP
                        </span>
                        <span className="font-bold text-ink-800">YPFD</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-brand-800 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full inline-block">
                          Favorable
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between py-1">
                      <div className="flex items-center gap-1.5">
                        <span className="w-5 h-5 rounded-md bg-info-100 text-info-text font-mono font-bold text-[10px] flex items-center justify-center">
                          AP
                        </span>
                        <span className="font-bold text-ink-800">AAPL</span>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-bold text-brand-800 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-full inline-block">
                          Favorable
                        </span>
                      </div>
                    </div>
                  </div>
                </div>


                {/* In-App Live News Notification Card */}
                <div className="bg-paper p-2.5 rounded-2xl border border-ink-200 shadow-2xs flex items-start gap-2 text-xs">
                  <div className="p-1 rounded-lg bg-brand-50 text-brand-800 mt-0.5">
                    <TrendingUp className="w-3.5 h-3.5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[10px] font-bold text-brand-950 uppercase block">
                      Compras BCRA impulsan deuda
                    </span>
                    <p className="text-[10px] text-muted line-clamp-1 mt-0.5">
                      Resumen consolidado de 4 medios financieros.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
