import React from 'react';
import { LighthouseLogo } from './LighthouseLogo';
import { 
  ArrowRight, 
  ShieldCheck, 
  TrendingUp, 
  Calendar, 
  Sparkles,
  Lock,
  Compass,
  CheckCircle2
} from 'lucide-react';

interface WelcomeScreenProps {
  onOpenSignUp: () => void;
  onOpenLogin: () => void;
  onExploreDemo?: () => void;
}

export const WelcomeScreen: React.FC<WelcomeScreenProps> = ({
  onOpenSignUp,
  onOpenLogin,
  onExploreDemo
}) => {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col justify-between relative overflow-hidden select-none">
      {/* Background ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-96 bg-radial from-emerald-900/30 via-emerald-950/10 to-transparent pointer-events-none blur-3xl" />
      <div className="absolute -bottom-24 right-0 w-96 h-96 bg-radial from-emerald-800/15 via-transparent to-transparent pointer-events-none blur-2xl" />

      {/* Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between border-b border-emerald-900/30">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-800 to-emerald-950 flex items-center justify-center border border-emerald-700/40 shadow-xs">
            <LighthouseLogo className="w-6 h-6 text-white" showContainer={false} />
          </div>
          <div>
            <span className="text-xl font-black tracking-tight text-white block leading-none">
              FAROS
            </span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-emerald-400/90 block mt-0.5">
              Inteligencia Financiera
            </span>
          </div>
        </div>

        <button
          onClick={onOpenLogin}
          className="text-xs sm:text-sm font-semibold text-emerald-300 hover:text-white px-4 py-2 rounded-xl hover:bg-emerald-900/40 border border-emerald-800/40 transition-all cursor-pointer"
        >
          Iniciar sesión
        </button>
      </header>

      {/* Hero Body */}
      <main className="relative z-10 w-full max-w-4xl mx-auto px-4 sm:px-6 py-10 sm:py-16 flex flex-col items-center text-center my-auto">
        {/* Status Pill */}
        <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-900/40 border border-emerald-700/50 text-emerald-300 text-xs font-semibold mb-6 animate-in fade-in duration-300">
          <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
          <span>Periodismo financiero consolidado en tiempo real</span>
        </div>

        {/* Main Title */}
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-black text-white tracking-tight leading-[1.1] max-w-3xl">
          Las noticias financieras que{' '}
          <span className="bg-gradient-to-r from-emerald-400 via-emerald-300 to-teal-200 bg-clip-text text-transparent">
            importan para tu cartera
          </span>
        </h1>

        {/* Subtitle */}
        <p className="mt-5 text-sm sm:text-base md:text-lg text-slate-300 max-w-2xl font-normal leading-relaxed">
          Monitoreo unificado de medios argentinos especializados, cruces de impacto patrimonial en bonos soberanos, acciones y CEDEARs, y calendario automático de vencimientos.
        </p>

        {/* Main CTA Actions */}
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center gap-3.5 w-full max-w-md">
          <button
            onClick={onOpenSignUp}
            className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm sm:text-base shadow-lg shadow-emerald-900/40 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] cursor-pointer"
          >
            <span>Crear cuenta</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>

          <button
            onClick={onOpenLogin}
            className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-white/10 hover:bg-white/15 text-white font-semibold text-sm sm:text-base border border-white/15 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            Iniciar sesión
          </button>
        </div>

        {/* Value Highlights Grid */}
        <div className="mt-14 sm:mt-16 grid grid-cols-1 sm:grid-cols-3 gap-4 w-full text-left">
          <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
            <div className="w-9 h-9 rounded-xl bg-emerald-900/60 text-emerald-400 flex items-center justify-center mb-3">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Múltiples Fuentes</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Cruce exhaustivo de Ámbito, El Cronista, Infobae, Bloomberg y regulaciones oficiales del BCRA.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
            <div className="w-9 h-9 rounded-xl bg-emerald-900/60 text-emerald-400 flex items-center justify-center mb-3">
              <TrendingUp className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Impacto en Cartera</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Análisis técnico sin recomendaciones de compra o venta: solo la relación directa entre el hecho y tus activos.
            </p>
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white/5 border border-white/10 backdrop-blur-xs">
            <div className="w-9 h-9 rounded-xl bg-emerald-900/60 text-emerald-400 flex items-center justify-center mb-3">
              <Calendar className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-white mb-1">Calendario de Cartera</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Fechas exactas de cobro de cupones (AL30, GD30), reportes de balances y publicación de IPC en hora argentina.
            </p>
          </div>
        </div>

        {/* Optional Explore Demo Link */}
        {onExploreDemo && (
          <div className="mt-8">
            <button
              onClick={onExploreDemo}
              className="text-xs text-emerald-400/80 hover:text-emerald-300 underline underline-offset-4 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Explorar FAROS con cartera de prueba</span>
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 border-t border-emerald-900/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
        <p>© 2026 FAROS · Plataforma informativa para inversores en Argentina</p>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="text-slate-500">Zona horaria: America/Argentina/Buenos_Aires</span>
          <span className="text-emerald-400/80 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Privacidad garantizada
          </span>
        </div>
      </footer>
    </div>
  );
};
