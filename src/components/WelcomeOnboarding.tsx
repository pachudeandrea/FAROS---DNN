import React from 'react';
import { BrandLogo } from './BrandLogo';
import { useModalFocus } from '../hooks/useModalFocus';

interface WelcomeOnboardingProps {
  onStartTour: () => void;
  onExplore: () => void;
}

export function WelcomeOnboarding({ onStartTour, onExplore }: WelcomeOnboardingProps) {
  const modalRef = useModalFocus(onExplore);

  return (
    <div className="min-h-dvh bg-ink-950/80 flex items-center justify-center p-3 sm:p-6">
      <div
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="welcome-onboarding-title"
        aria-describedby="welcome-onboarding-description"
        className="bg-paper rounded-3xl max-w-lg w-full max-h-[calc(100dvh-1.5rem)] overflow-y-auto p-6 sm:p-8 shadow-2xl border border-ink-100 text-center space-y-6"
      >
        <div className="w-16 h-16 rounded-3xl bg-brand-950 text-paper flex items-center justify-center mx-auto shadow-md">
          <BrandLogo size="lg" tone="dark" />
        </div>
        <div className="space-y-2">
          <h2 id="welcome-onboarding-title" className="text-2xl font-bold text-ink-900 tracking-tight">¡Bienvenido a FAROS!</h2>
          <p id="welcome-onboarding-description" className="text-sm text-muted leading-relaxed">
            Te vamos a mostrar cómo funciona la plataforma. No necesitás configurar todo ahora: podés agregar tus inversiones y personalizar tus preferencias cuando quieras.
          </p>
        </div>
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
          <button type="button" onClick={onStartTour} className="w-full sm:w-auto px-6 py-3.5 bg-brand-950 hover:bg-brand-900 text-paper font-extrabold rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer text-sm">
            Comenzar recorrido
          </button>
          <button type="button" onClick={onExplore} className="w-full sm:w-auto px-6 py-3.5 bg-ink-100 hover:bg-ink-200 text-muted font-bold rounded-2xl transition-all cursor-pointer text-sm">
            Explorar por mi cuenta
          </button>
        </div>
      </div>
    </div>
  );
}
