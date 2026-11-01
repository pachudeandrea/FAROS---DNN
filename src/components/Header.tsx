import React from 'react';
import { BrandLogo } from './BrandLogo';
import { Bell, ArrowRight, Sparkles, Shield, Wallet } from 'lucide-react';

interface HeaderProps {
  currentTab: 'feed' | 'calendar' | 'settings';
  onSelectTab: (tab: 'feed' | 'calendar' | 'settings') => void;
  unreadNotificationsCount: number;
  onOpenNotifications: () => void;
  portfolioName: string;
  pendingRemindersCount?: number;
  onStartTour?: () => void;
  isAdmin?: boolean;
  onOpenAdmin?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentTab,
  onSelectTab,
  unreadNotificationsCount,
  onOpenNotifications,
  portfolioName,
  pendingRemindersCount = 0,
  onStartTour,
  isAdmin = false,
  onOpenAdmin,
}) => {
  return (
    <header className="sticky top-0 z-30 bg-paper/95 backdrop-blur-md border-b border-ink-200/80 shadow-brand-soft">
      <div className="max-w-6xl mx-auto px-3 sm:px-6 h-16 min-w-0 flex items-center justify-between gap-2 lg:gap-4">
        {/* Zone 1: Brand Wordmark with sleek Lighthouse Logo */}
        <div 
          onClick={() => onSelectTab('feed')}
          role="button" tabIndex={0} aria-label="FAROS, ir a noticias"
          onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectTab('feed'); } }}
          className="flex items-center gap-2 sm:gap-3 cursor-pointer select-none shrink-0 group"
        >
          <div className="transition-transform group-hover:scale-105">
            <BrandLogo size="md" variant="full" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="sr-only">Faros</span>
              <span className="hidden sm:inline text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-brand-100 text-brand-900 tracking-wider">
                PRO
              </span>
            </div>
            <span className="text-[10px] font-semibold text-muted hidden sm:block -mt-1">
              Filtro de Ruido Financiero
            </span>
          </div>
        </div>

        {/* Zone 2: Rocket Money Segmented Pill Navigation on Desktop */}
        <nav aria-label="Navegación principal" className="hidden lg:flex shrink-0 items-center p-1 bg-ink-100/90 rounded-full border border-ink-200/80">
          <button
            onClick={() => onSelectTab('feed')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'feed'
                ? 'bg-brand-950 text-paper shadow-xs'
                : 'text-muted hover:text-ink-900 hover:bg-ink-200/60'
            }`}
          >
            Noticias
          </button>

          <button
            onClick={() => onSelectTab('calendar')}
            className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              currentTab === 'calendar'
                ? 'bg-brand-950 text-paper shadow-xs'
                : 'text-muted hover:text-ink-900 hover:bg-ink-200/60'
            }`}
          >
            <span>Calendario</span>
            {pendingRemindersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-warning-500 text-paper text-[9px] font-bold">
                {pendingRemindersCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectTab('settings')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'settings'
                ? 'bg-brand-950 text-paper shadow-xs'
                : 'text-muted hover:text-ink-900 hover:bg-ink-200/60'
            }`}
          >
            Mi cartera
          </button>
        </nav>

        {/* Zone 3: Rocket Money-style Account/Portfolio Pill + Notifications */}
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          {/* Admin panel launcher if admin */}
          {isAdmin && onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              title="Ir al Panel Administrador de FAROS"
              aria-label="Abrir panel administrador"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-warning-text bg-warning-100/90 hover:bg-warning-200/90 rounded-full border border-warning-300 transition-all cursor-pointer shadow-2xs"
            >
              <Shield className="w-3.5 h-3.5 text-warning-text" />
              <span className="hidden xl:inline">Admin</span>
            </button>
          )}

          {/* Tour button */}
          {onStartTour && (
            <button
              onClick={onStartTour}
              title="Iniciar tutorial interactivo de FAROS"
              className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-brand-950 bg-brand-50 hover:bg-brand-100 rounded-full border border-brand-200/90 transition-all cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-brand-text" />
              <span className="hidden xl:inline">Tutorial</span>
            </button>
          )}

          {/* Notifications bell */}
          <button
            data-tour="header-notifications"
            onClick={onOpenNotifications}
            title="Alertas de cartera"
            className="relative p-2.5 text-muted hover:text-brand-950 hover:bg-ink-100 rounded-full transition-colors cursor-pointer border border-transparent hover:border-ink-200"
            aria-label="Ver notificaciones de cartera"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold text-paper bg-brand-800 rounded-full ring-2 ring-paper">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* Rocket Money-style Account Selector / Portfolio Chip */}
          <button
            onClick={() => onSelectTab('settings')}
            className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 text-xs font-bold rounded-full bg-ink-100 hover:bg-brand-50 text-ink-800 hover:text-brand-950 border border-ink-200/90 hover:border-brand-300 transition-all cursor-pointer group shadow-2xs"
            title="Cambiar o configurar cartera activa"
            aria-label={`Configurar cartera: ${portfolioName}`}
          >
            <div className="hidden sm:block w-2 h-2 rounded-full bg-brand-600 ring-4 ring-brand-100 group-hover:bg-brand-700" />
            <span className="block max-w-[100px] sm:max-w-[150px] lg:max-w-[110px] xl:max-w-[170px] truncate font-medium">
              {portfolioName}
            </span>
            <div className="w-5 h-5 rounded-full bg-brand-950 text-brand-200 flex items-center justify-center ml-0.5 group-hover:translate-x-0.5 transition-transform">
              <Wallet className="w-3 h-3" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
