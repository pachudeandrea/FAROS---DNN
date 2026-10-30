import React from 'react';
import { LighthouseLogo } from './LighthouseLogo';
import { Bell, ArrowRight, Sparkles, Shield } from 'lucide-react';

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
    <header className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        {/* Zone 1: Brand Wordmark with sleek Lighthouse Logo */}
        <div 
          onClick={() => onSelectTab('feed')}
          className="flex items-center gap-3 cursor-pointer select-none shrink-0 group"
        >
          <div className="transition-transform group-hover:scale-105">
            <LighthouseLogo size="md" />
          </div>
          <div className="flex flex-col">
            <div className="flex items-center gap-1.5">
              <span className="text-xl font-black tracking-tight text-emerald-950 font-sans">
                FAROS
              </span>
              <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-900 tracking-wider">
                PRO
              </span>
            </div>
            <span className="text-[10px] font-semibold text-slate-600 hidden sm:block -mt-1">
              Filtro de Ruido Financiero
            </span>
          </div>
        </div>

        {/* Zone 2: Rocket Money Segmented Pill Navigation on Desktop */}
        <nav className="hidden md:flex items-center p-1 bg-slate-100/90 rounded-full border border-slate-200/80">
          <button
            onClick={() => onSelectTab('feed')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'feed'
                ? 'bg-emerald-950 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            Noticias
          </button>

          <button
            onClick={() => onSelectTab('calendar')}
            className={`relative px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer inline-flex items-center gap-1.5 ${
              currentTab === 'calendar'
                ? 'bg-emerald-950 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            <span>Calendario</span>
            {pendingRemindersCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-amber-500 text-white text-[9px] font-black">
                {pendingRemindersCount}
              </span>
            )}
          </button>

          <button
            onClick={() => onSelectTab('settings')}
            className={`px-4 py-1.5 rounded-full text-xs font-bold transition-all cursor-pointer ${
              currentTab === 'settings'
                ? 'bg-emerald-950 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
            }`}
          >
            Mi cartera
          </button>
        </nav>

        {/* Zone 3: Rocket Money-style Account/Portfolio Pill + Notifications */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* Admin panel launcher if admin */}
          {isAdmin && onOpenAdmin && (
            <button
              onClick={onOpenAdmin}
              title="Ir al Panel Administrador de FAROS"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-black text-amber-950 bg-amber-100/90 hover:bg-amber-200/90 rounded-full border border-amber-300 transition-all cursor-pointer shadow-2xs"
            >
              <Shield className="w-3.5 h-3.5 text-amber-700" />
              <span>Admin</span>
            </button>
          )}

          {/* Tour button */}
          {onStartTour && (
            <button
              onClick={onStartTour}
              title="Iniciar tutorial interactivo de FAROS"
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-bold text-emerald-950 bg-emerald-50 hover:bg-emerald-100 rounded-full border border-emerald-200/90 transition-all cursor-pointer shadow-2xs"
            >
              <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
              <span className="hidden xs:inline sm:inline">Tutorial</span>
            </button>
          )}

          {/* Notifications bell */}
          <button
            data-tour="header-notifications"
            onClick={onOpenNotifications}
            title="Alertas de cartera"
            className="relative p-2.5 text-slate-600 hover:text-emerald-950 hover:bg-slate-100 rounded-full transition-colors cursor-pointer border border-transparent hover:border-slate-200"
            aria-label="Ver notificaciones de cartera"
          >
            <Bell className="w-4 h-4" />
            {unreadNotificationsCount > 0 && (
              <span className="absolute top-1.5 right-1.5 flex items-center justify-center w-4 h-4 text-[9px] font-bold text-white bg-emerald-800 rounded-full ring-2 ring-white">
                {unreadNotificationsCount}
              </span>
            )}
          </button>

          {/* Rocket Money-style Account Selector / Portfolio Chip */}
          <button
            onClick={() => onSelectTab('settings')}
            className="flex items-center gap-2 pl-3 pr-2.5 py-1.5 text-xs font-bold rounded-full bg-slate-100 hover:bg-emerald-50 text-slate-800 hover:text-emerald-950 border border-slate-200/90 hover:border-emerald-300 transition-all cursor-pointer group shadow-2xs"
            title="Cambiar o configurar cartera activa"
          >
            <div className="w-2 h-2 rounded-full bg-emerald-600 ring-4 ring-emerald-100 group-hover:bg-emerald-700" />
            <span className="max-w-[130px] sm:max-w-[170px] truncate font-medium">
              {portfolioName}
            </span>
            <div className="w-5 h-5 rounded-full bg-emerald-950 text-emerald-200 flex items-center justify-center ml-0.5 group-hover:translate-x-0.5 transition-transform">
              <ArrowRight className="w-3 h-3" />
            </div>
          </button>
        </div>
      </div>
    </header>
  );
};
