import React from 'react';
import { BrandLogo } from './BrandLogo';
import { ArrowRight, Wallet, Newspaper, Layers, Volume2, Bell, Calendar, Lock, Compass } from 'lucide-react';

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
    <div className="min-h-screen bg-brand-950 text-paper flex flex-col justify-between relative overflow-hidden select-none">
      {/* Background ambient glow */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-full max-w-5xl h-96 bg-radial from-brand-900/30 via-brand-950/10 to-transparent pointer-events-none blur-3xl" />
      <div className="absolute -bottom-24 right-0 w-96 h-96 bg-radial from-brand-800/15 via-transparent to-transparent pointer-events-none blur-2xl" />

      {/* Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 flex items-center justify-between border-b border-brand-900/30">
        <div className="flex items-center gap-2.5">
          <BrandLogo size="lg" tone="dark" variant="full" />
          <div>
            <span className="sr-only">Faros</span>
            <span className="text-[10px] uppercase font-bold tracking-widest text-brand-text/90 block mt-0.5">
              Inteligencia Financiera
            </span>
          </div>
        </div>

        <button
          onClick={onOpenLogin}
          className="text-xs sm:text-sm font-semibold text-brand-300 hover:text-paper px-4 py-2 rounded-xl hover:bg-brand-900/40 border border-brand-800/40 transition-all cursor-pointer"
        >
          Iniciar sesión
        </button>
      </header>

      {/* Hero Body */}
      <main className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-10 sm:py-16 flex flex-col items-center text-center my-auto">
        <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold text-paper tracking-tight leading-[1.1] max-w-4xl">
          No inviertas a ciegas,{' '}
          <span className="block bg-gradient-to-r from-brand-400 via-brand-300 to-brand-200 bg-clip-text text-transparent">
            invertí con Faros.
          </span>
        </h1>
        <p className="mt-5 text-base md:text-lg text-ink-300 max-w-2xl font-normal leading-relaxed">
          Faros conecta las noticias financieras con tu cartera. Entendé su impacto,
          compará medios y seguí lo importante con audio, calendario y alertas.
        </p>

        {/* Main CTA Actions */}
        <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row items-center gap-3.5 w-full max-w-md">
          <button
            onClick={onOpenSignUp}
            className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-brand-500 hover:bg-brand-400 text-ink-950 font-bold text-sm sm:text-base shadow-lg shadow-brand-900/40 flex items-center justify-center gap-2 transition-all transform hover:scale-[1.02] cursor-pointer"
          >
            <span>Crear cuenta</span>
            <ArrowRight className="w-4 h-4 stroke-[2.5]" />
          </button>

          <button
            onClick={onOpenLogin}
            className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-paper/10 hover:bg-paper/15 text-paper font-semibold text-sm sm:text-base border border-paper/15 flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            Iniciar sesión
          </button>
        </div>

        <section aria-labelledby="how-faros-works" className="mt-14 sm:mt-16 w-full text-left">
          <div className="text-center mb-6 sm:mb-8">
            <h2 id="how-faros-works" className="text-2xl sm:text-3xl font-bold text-paper">Cómo funciona Faros</h2>
            <p className="mt-2 text-base text-ink-300">De tu cartera a las noticias que te importan, en tres pasos.</p>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
            <li className="min-w-0 p-5 rounded-2xl bg-paper/5 border border-paper/10 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-brand-300">01 · Tu cartera</span>
                <Wallet aria-hidden="true" className="w-6 h-6 text-brand-400" />
              </div>
              <h3 className="text-lg font-bold text-paper">Elegí tus activos</h3>
              <p className="mt-2 text-base text-ink-300 leading-relaxed">Agregá bonos, acciones o CEDEARs e indicá tus posiciones LONG o SHORT.</p>
              <div aria-hidden="true" className="mt-5 rounded-xl bg-brand-950 p-3 space-y-2">
                <p className="text-xs text-brand-300">Ejemplo de cartera</p>
                {[['AL30', 'LONG'], ['YPFD', 'LONG'], ['NVDA', 'SHORT']].map(([symbol, position]) => <div key={symbol} className="flex items-center justify-between gap-2 text-sm">
                  <span className="font-bold text-paper">{symbol}</span><span className="text-brand-300 font-mono">{position}</span>
                </div>)}
              </div>
            </li>
            <li className="min-w-0 p-5 rounded-2xl bg-paper/5 border border-paper/10 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-brand-300">02 · Tus noticias</span>
                <Newspaper aria-hidden="true" className="w-6 h-6 text-brand-400" />
              </div>
              <h3 className="text-lg font-bold text-paper">Entendé qué cambia</h3>
              <p className="mt-2 text-base text-ink-300 leading-relaxed">Recibí noticias relacionadas con tus activos, entendé su impacto y compará las publicaciones de distintos medios.</p>
              <div aria-hidden="true" className="mt-5 rounded-xl bg-brand-950 p-3 space-y-3">
                <div className="flex flex-wrap gap-1.5 text-xs font-semibold">
                  <span className="px-2 py-1 rounded-lg bg-brand-100 text-brand-950">Favorable</span>
                  <span className="px-2 py-1 rounded-lg bg-danger-100 text-danger-900">Alerta</span>
                  <span className="px-2 py-1 rounded-lg bg-ink-100 text-ink-900">Neutral</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-brand-300"><Layers className="w-4 h-4" />Un mismo hecho, distintos medios</div>
                <div className="grid grid-cols-2 gap-2 text-xs text-ink-300"><span className="border border-paper/20 rounded-lg p-2">Publicación 1</span><span className="border border-paper/20 rounded-lg p-2">Publicación 2</span></div>
              </div>
            </li>
            <li className="min-w-0 p-5 rounded-2xl bg-paper/5 border border-paper/10 flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <span className="text-sm font-bold text-brand-300">03 · Tu seguimiento</span>
                <Bell aria-hidden="true" className="w-6 h-6 text-brand-400" />
              </div>
              <h3 className="text-lg font-bold text-paper">Seguí lo importante</h3>
              <p className="mt-2 text-base text-ink-300 leading-relaxed">Escuchá el resumen, guardá noticias y organizá tus recordatorios. Activá las alertas si querés recibir avisos.</p>
              <div aria-hidden="true" className="mt-5 rounded-xl bg-brand-950 p-3 space-y-3 text-sm text-brand-300">
                <div className="flex items-center gap-2"><Volume2 className="w-4 h-4" />Resumen de audio</div>
                <div className="flex items-center gap-2"><Calendar className="w-4 h-4" />Calendario y recordatorios</div>
                <div className="flex items-center gap-2"><Bell className="w-4 h-4" />Alertas opcionales</div>
              </div>
            </li>
          </ol>
          <p className="mt-5 text-sm text-ink-300 text-center">Información para entender tu cartera, sin recomendaciones de compra o venta.</p>
        </section>

        {/* Optional Explore Demo Link */}
        {onExploreDemo && (
          <div className="mt-8">
            <button
              onClick={onExploreDemo}
              className="text-xs text-brand-text/80 hover:text-brand-300 underline underline-offset-4 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <Compass className="w-3.5 h-3.5" />
              <span>Explorar FAROS con cartera de prueba</span>
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 py-6 border-t border-brand-900/30 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-muted">
        <p>© 2026 FAROS · Plataforma informativa para inversores en Argentina</p>
        <div className="flex items-center gap-4 text-[11px]">
          <span className="text-muted">Zona horaria: America/Argentina/Buenos_Aires</span>
          <span className="text-brand-text/80 flex items-center gap-1">
            <Lock className="w-3 h-3" /> Privacidad garantizada
          </span>
        </div>
      </footer>
    </div>
  );
};
