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
    <nav className="md:hidden fixed bottom-3 left-4 right-4 z-40 bg-white/95 backdrop-blur-lg border border-slate-200/90 py-1.5 px-3 rounded-full shadow-[0_8px_30px_rgb(0,0,0,0.12)]">
      <div className="flex items-center justify-around max-w-sm mx-auto">
        <button
          onClick={() => onSelectTab('feed')}
          className={`flex items-center gap-2 py-2 px-4 rounded-full text-xs transition-all ${
            currentTab === 'feed'
              ? 'bg-emerald-950 text-white font-extrabold shadow-sm'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <Newspaper className="w-4 h-4" />
          <span className="text-xs">Noticias</span>
        </button>

        <button
          onClick={() => onSelectTab('calendar')}
          className={`flex items-center gap-2 py-2 px-4 rounded-full text-xs transition-all ${
            currentTab === 'calendar'
              ? 'bg-emerald-950 text-white font-extrabold shadow-sm'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <Calendar className="w-4 h-4" />
          <span className="text-xs">Calendario</span>
        </button>

        <button
          onClick={() => onSelectTab('settings')}
          className={`flex items-center gap-2 py-2 px-4 rounded-full text-xs transition-all ${
            currentTab === 'settings'
              ? 'bg-emerald-950 text-white font-extrabold shadow-sm'
              : 'text-slate-500 hover:text-slate-900 font-semibold'
          }`}
        >
          <Settings className="w-4 h-4" />
          <span className="text-xs">Mi cartera</span>
        </button>
      </div>
    </nav>
  );
};
