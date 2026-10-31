import React from 'react';
import { Newspaper, Calendar, Settings } from 'lucide-react';

interface BottomNavProps {
  currentTab: 'feed' | 'calendar' | 'settings';
  onSelectTab: (tab: 'feed' | 'calendar' | 'settings') => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  currentTab,
  onSelectTab,
}) => {
  return (
    <nav aria-label="Navegación principal" className="lg:hidden fixed bottom-[calc(0.75rem+env(safe-area-inset-bottom))] left-3 right-3 z-40 bg-white/95 backdrop-blur-lg border border-slate-200/90 py-1.5 px-1.5 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
      <div className="grid grid-cols-3 min-w-0 max-w-md mx-auto">
        <button
          onClick={() => onSelectTab('feed')}
          className={`flex min-w-0 items-center justify-center gap-1.5 py-2.5 px-1 sm:px-4 rounded-full text-xs transition-all ${
            currentTab === 'feed'
              ? 'bg-emerald-950 text-white font-extrabold shadow-sm'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <Newspaper className="w-4 h-4 shrink-0" />
          <span className="min-w-0 truncate text-[11px] sm:text-xs">Noticias</span>
        </button>

        <button
          onClick={() => onSelectTab('calendar')}
          className={`flex min-w-0 items-center justify-center gap-1.5 py-2.5 px-1 sm:px-4 rounded-full text-xs transition-all ${
            currentTab === 'calendar'
              ? 'bg-emerald-950 text-white font-extrabold shadow-sm'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <Calendar className="w-4 h-4 shrink-0" />
          <span className="min-w-0 truncate text-[11px] sm:text-xs">Calendario</span>
        </button>

        <button
          onClick={() => onSelectTab('settings')}
          className={`flex min-w-0 items-center justify-center gap-1.5 py-2.5 px-1 sm:px-4 rounded-full text-xs transition-all ${
            currentTab === 'settings'
              ? 'bg-emerald-950 text-white font-extrabold shadow-sm'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <Settings className="w-4 h-4 shrink-0" />
          <span className="min-w-0 truncate text-[11px] sm:text-xs">Mi cartera</span>
        </button>
      </div>
    </nav>
  );
};
