import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { CalendarEvent, CustomCalendarEvent, ReminderTiming } from '../types';
import { getNowAR, setSimulatedDayOffset, getSimulatedDayOffset, NowAR } from '../utils/dateAR';
import { buildCalendarCacheKey, getVerifiedCalendarEvents } from '../utils/calendarGrounding';
import { checkReminders, ReminderAlert, getDaysDiff } from '../utils/calendarReminders';
import { 
  ChevronLeft, 
  ChevronRight, 
  Calendar as CalendarIcon, 
  Clock, 
  X, 
  Info,
  DollarSign,
  TrendingUp,
  Landmark,
  ShieldCheck,
  RefreshCw,
  Plus,
  Bell,
  Trash2,
  Edit2,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles
} from 'lucide-react';

interface FinancialCalendarProps {
  portfolioId?: string;
  portfolioName?: string;
  userAssetSymbols: string[];
  onPendingRemindersChange?: (count: number) => void;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const FinancialCalendar: React.FC<FinancialCalendarProps> = ({ 
  portfolioId = 'default',
  portfolioName = 'Mi Cartera',
  userAssetSymbols,
  onPendingRemindersChange
}) => {
  // Current time in Argentina (Single source of truth)
  const [nowAR, setNowAR] = useState<NowAR>(() => getNowAR());

  // Visible month & year state (opens in current month of Argentina)
  const [currentYear, setCurrentYear] = useState<number>(() => getNowAR().year);
  const [currentMonth, setCurrentMonth] = useState<number>(() => getNowAR().month);

  // Loading & refresh state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdatedText, setLastUpdatedText] = useState<string>(() => getNowAR().headerUpdatedText);

  // Filter by category
  const [selectedCategory, setSelectedCategory] = useState<'todos' | CalendarEvent['category']>('todos');

  // Automatic calendar events from verified pipeline
  const [serverEvents, setServerEvents] = useState<CalendarEvent[]>([]);

  // User Custom Events (Stored in localStorage and persistent across sessions)
  const [customEvents, setCustomEvents] = useState<CustomCalendarEvent[]>(() => {
    try {
      const stored = localStorage.getItem('faros_custom_events');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // Active reminders triggered for today
  const [activeAlerts, setActiveAlerts] = useState<ReminderAlert[]>([]);
  const [dismissedReminderIds, setDismissedReminderIds] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem('faros_dismissed_reminders');
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
  });

  // Browser notification permission state
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>(() => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      return Notification.permission;
    }
    return 'default';
  });

  // Modal states
  const [selectedDayEvents, setSelectedDayEvents] = useState<{
    dateStr: string;
    events: CalendarEvent[];
  } | null>(null);

  // Custom Event Form Modal
  const [showEventModal, setShowEventModal] = useState<boolean>(false);
  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [formDate, setFormDate] = useState<string>(() => getNowAR().isoDate);
  const [formAsset, setFormAsset] = useState<string>(() => userAssetSymbols[0] || 'AL30');
  const [customAssetInput, setCustomAssetInput] = useState<string>('');
  const [formAction, setFormAction] = useState<CustomCalendarEvent['action']>('comprar');
  const [formNote, setFormNote] = useState<string>('');
  const [formReminders, setFormReminders] = useState<ReminderTiming[]>(['same_day', '1_day_before']);

  // Delete confirmation modal
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  // Simulated day offset state (for testing daily rollover)
  const [simulatedOffset, setSimulatedOffset] = useState<number>(() => getSimulatedDayOffset());

  // Save custom events to localStorage
  const saveCustomEvents = (events: CustomCalendarEvent[]) => {
    setCustomEvents(events);
    try {
      localStorage.setItem('faros_custom_events', JSON.stringify(events));
    } catch {}
  };

  // Revalidate date with getNowAR()
  const refreshDateState = useCallback(() => {
    const fresh = getNowAR();
    setNowAR(fresh);
    setLastUpdatedText(fresh.headerUpdatedText);
    return fresh;
  }, []);

  // Fetch calendar events from server pipeline
  const loadCalendarEvents = useCallback(async (forceRefresh = false) => {
    setIsLoading(true);
    const currentDate = refreshDateState();
    const mmStr = String(currentMonth + 1).padStart(2, '0');
    const isoMonth = `${currentYear}-${mmStr}`;
    const cacheKey = buildCalendarCacheKey(portfolioId, isoMonth, currentDate.isoDate);

    // Check localStorage cache if not forced
    if (!forceRefresh) {
      try {
        const cached = localStorage.getItem(`faros_cal_${cacheKey}`);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setServerEvents(parsed);
            setIsLoading(false);
            return;
          }
        }
      } catch {}
    }

    try {
      const res = await fetch('/api/calendar/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId,
          tickers: userAssetSymbols,
          forceRefresh
        })
      });

      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.events)) {
          setServerEvents(data.events);
          if (data.headerUpdatedText) {
            setLastUpdatedText(data.headerUpdatedText);
          }
          try {
            localStorage.setItem(`faros_cal_${cacheKey}`, JSON.stringify(data.events));
          } catch {}
        }
      } else {
        // Fallback to local verified generator
        const local = await getVerifiedCalendarEvents(userAssetSymbols);
        setServerEvents(local);
      }
    } catch {
      const local = await getVerifiedCalendarEvents(userAssetSymbols);
      setServerEvents(local);
    } finally {
      setIsLoading(false);
    }
  }, [portfolioId, userAssetSymbols, currentYear, currentMonth, refreshDateState]);

  // Daily cache purge (purges older days from localStorage, but preserves custom events)
  const purgeOldCalendarCache = useCallback((todayIso: string) => {
    try {
      const toRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('faros_cal_') && !key.includes(todayIso)) {
          toRemove.push(key);
        }
      }
      toRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
  }, []);

  // Automatic Midnight Timer & visibilitychange revalidation
  useEffect(() => {
    const current = refreshDateState();
    purgeOldCalendarCache(current.isoDate);

    // Timer to fire exactly at midnight in Argentina
    const timer = setTimeout(() => {
      console.log('[CALENDAR] Midnight reached in Argentina. Rollover triggered.');
      const nextDate = refreshDateState();
      purgeOldCalendarCache(nextDate.isoDate);
      loadCalendarEvents(true);
    }, current.msUntilNextMidnight);

    // Revalidate on visibilitychange (when tab becomes active)
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        const updated = refreshDateState();
        if (updated.isoDate !== current.isoDate) {
          purgeOldCalendarCache(updated.isoDate);
          loadCalendarEvents(true);
        }
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [refreshDateState, purgeOldCalendarCache, loadCalendarEvents]);

  // Load events when dependencies change
  useEffect(() => {
    loadCalendarEvents(false);
  }, [loadCalendarEvents]);

  // Convert custom events into CalendarEvent format for display
  const customCalendarEvents = useMemo<CalendarEvent[]>(() => {
    return customEvents.map(ce => {
      const isPast = ce.date < nowAR.isoDate;
      const actionLabel = ce.action === 'comprar' ? 'Orden de Compra' :
                          ce.action === 'vender' ? 'Orden de Venta' :
                          ce.action === 'cobro' ? 'Cobro Previsto' : 'Hito';

      return {
        id: ce.id,
        date: ce.date,
        time: ce.time || '09:00',
        title: `${actionLabel}: ${ce.assetSymbol}`,
        assetSymbol: ce.assetSymbol,
        category: 'balance' as const,
        description: ce.note || `Evento programado por el usuario para ${ce.assetSymbol}.`,
        source: 'Usuario (Evento Propio)',
        impactLevel: 'alto' as const,
        status: isPast ? 'realizado' : 'confirmada',
        isCustom: true,
        userAction: ce.action,
        note: ce.note,
        reminders: ce.reminders
      };
    });
  }, [customEvents, nowAR.isoDate]);

  // Combine automatic events and user custom events
  // Rule: ONLY user's portfolio tickers + Macro events + User custom events
  const combinedEvents = useMemo<CalendarEvent[]>(() => {
    const filteredServer = serverEvents.filter(e => {
      // 1. Macro events are always included
      if (e.isMacro || e.category === 'macro_bcra' || e.category === 'elecciones_politica') {
        return true;
      }
      // 2. Automatic events must belong strictly to user's portfolio tickers
      if (e.assetSymbol && userAssetSymbols.includes(e.assetSymbol)) {
        return true;
      }
      return false;
    });

    // Custom events are always included regardless of ticker
    const merged = [...filteredServer, ...customCalendarEvents];

    // Filter by category if selected
    if (selectedCategory !== 'todos') {
      return merged.filter(e => e.category === selectedCategory);
    }

    return merged;
  }, [serverEvents, customCalendarEvents, userAssetSymbols, selectedCategory]);

  // Check reminders and send alerts
  const runReminderCheck = useCallback(() => {
    const alerts = checkReminders(customEvents, nowAR, dismissedReminderIds);
    setActiveAlerts(alerts);
    if (onPendingRemindersChange) {
      onPendingRemindersChange(alerts.length);
    }

    // Trigger browser notification if permission granted
    if (alerts.length > 0 && typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
      alerts.forEach(a => {
        try {
          new Notification(a.title, {
            body: a.message,
            icon: '/favicon.ico'
          });
        } catch {}
      });
    }
  }, [customEvents, nowAR, dismissedReminderIds, onPendingRemindersChange]);

  // Run reminder check on mount and every minute
  useEffect(() => {
    runReminderCheck();
    const interval = setInterval(runReminderCheck, 60000);
    return () => clearInterval(interval);
  }, [runReminderCheck]);

  // Request browser notification permission
  const handleRequestNotificationPermission = async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      const perm = await Notification.requestPermission();
      setNotificationPermission(perm);
      if (perm === 'granted') {
        runReminderCheck();
      }
    }
  };

  // Dismiss a reminder alert
  const handleDismissAlert = (alertId: string) => {
    const next = [...dismissedReminderIds, alertId];
    setDismissedReminderIds(next);
    try {
      localStorage.setItem('faros_dismissed_reminders', JSON.stringify(next));
    } catch {}
    setActiveAlerts(prev => prev.filter(a => a.id !== alertId));
    if (onPendingRemindersChange) {
      onPendingRemindersChange(Math.max(0, activeAlerts.length - 1));
    }
  };

  // Dynamic Navigation Range: From current month up to at least +6 months
  const minYear = nowAR.year;
  const minMonth = nowAR.month; // Current month in Argentina

  // Max range is +6 months forward
  const maxNavDate = new Date(Date.UTC(minYear, minMonth + 6, 1));
  const maxYear = maxNavDate.getUTCFullYear();
  const maxMonth = maxNavDate.getUTCMonth();

  const canGoPrev = currentYear > minYear || (currentYear === minYear && currentMonth > minMonth - 1);
  const canGoNext = currentYear < maxYear || (currentYear === maxYear && currentMonth < maxMonth);

  const prevMonth = () => {
    if (!canGoPrev) return;
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(y => y - 1);
    } else {
      setCurrentMonth(m => m - 1);
    }
  };

  const nextMonth = () => {
    if (!canGoNext) return;
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(y => y + 1);
    } else {
      setCurrentMonth(m => m + 1);
    }
  };

  // Calendar Grid calculation for visible month
  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayIndex = new Date(currentYear, currentMonth, 1).getDay(); // 0 = Dom
  const mondayOffset = firstDayIndex === 0 ? 6 : firstDayIndex - 1;

  // Events filtered for the currently visible month
  const visibleMonthKey = `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}`;
  
  const visibleMonthEvents = useMemo(() => {
    return combinedEvents.filter(e => e.date.startsWith(visibleMonthKey));
  }, [combinedEvents, visibleMonthKey]);

  // Events mapped by day string (YYYY-MM-DD)
  const eventsByDate = useMemo(() => {
    const map: Record<string, CalendarEvent[]> = {};
    visibleMonthEvents.forEach(e => {
      if (!map[e.date]) map[e.date] = [];
      map[e.date].push(e);
    });
    return map;
  }, [visibleMonthEvents]);

  // Summary Metrics calculated according to the visible month
  const visibleSummary = useMemo(() => {
    let cobros = 0;
    let balances = 0;
    let macro = 0;

    visibleMonthEvents.forEach(e => {
      if (e.category === 'pago_cupon' || e.userAction === 'cobro') {
        cobros++;
      } else if (e.category === 'balance') {
        balances++;
      } else if (e.isMacro || e.category === 'macro_bcra' || e.category === 'elecciones_politica') {
        macro++;
      }
    });

    return { cobros, balances, macro };
  }, [visibleMonthEvents]);

  // Upcoming custom events list (for the "Mis recordatorios próximos" section)
  const upcomingCustomEvents = useMemo(() => {
    return customEvents
      .map(ce => {
        const diff = getDaysDiff(ce.date, nowAR.isoDate);
        return { ...ce, diff };
      })
      .filter(ce => ce.diff >= 0)
      .sort((a, b) => a.diff - b.diff)
      .slice(0, 5);
  }, [customEvents, nowAR.isoDate]);

  // Handle open add event modal for specific day
  const handleOpenAddEventModal = (dayDateStr?: string) => {
    setEditingEventId(null);
    setFormDate(dayDateStr || nowAR.isoDate);
    setFormAsset(userAssetSymbols[0] || 'AL30');
    setCustomAssetInput('');
    setFormAction('comprar');
    setFormNote('');
    setFormReminders(['same_day', '1_day_before']);
    setShowEventModal(true);
  };

  // Handle edit custom event
  const handleEditCustomEvent = (eventId: string) => {
    const target = customEvents.find(e => e.id === eventId);
    if (!target) return;
    setEditingEventId(target.id);
    setFormDate(target.date);
    if (userAssetSymbols.includes(target.assetSymbol)) {
      setFormAsset(target.assetSymbol);
      setCustomAssetInput('');
    } else {
      setFormAsset('otro');
      setCustomAssetInput(target.assetSymbol);
    }
    setFormAction(target.action);
    setFormNote(target.note || '');
    setFormReminders(target.reminders || ['same_day']);
    setShowEventModal(true);
  };

  // Handle save custom event
  const handleSaveCustomEvent = (e: React.FormEvent) => {
    e.preventDefault();
    const finalAsset = formAsset === 'otro' 
      ? (customAssetInput.trim().toUpperCase() || 'OTRO') 
      : formAsset;

    if (editingEventId) {
      // Edit existing
      const updated = customEvents.map(item => {
        if (item.id === editingEventId) {
          return {
            ...item,
            date: formDate,
            assetSymbol: finalAsset,
            action: formAction,
            note: formNote.trim(),
            reminders: formReminders
          };
        }
        return item;
      });
      saveCustomEvents(updated);
    } else {
      // Create new
      const newEvent: CustomCalendarEvent = {
        id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: formDate,
        assetSymbol: finalAsset,
        action: formAction,
        note: formNote.trim(),
        reminders: formReminders,
        createdAt: Date.now()
      };
      saveCustomEvents([...customEvents, newEvent]);
    }

    setShowEventModal(false);
    setEditingEventId(null);
    runReminderCheck();
  };

  // Handle delete custom event
  const handleDeleteCustomEvent = (eventId: string) => {
    const next = customEvents.filter(e => e.id !== eventId);
    saveCustomEvents(next);
    setDeletingEventId(null);
    if (selectedDayEvents) {
      setSelectedDayEvents(prev => prev ? {
        ...prev,
        events: prev.events.filter(e => e.id !== eventId)
      } : null);
    }
    runReminderCheck();
  };

  // Category badge & dot styling
  const getCategoryMeta = (cat: CalendarEvent['category'], isMacro?: boolean, isCustom?: boolean) => {
    if (isCustom) {
      return { 
        label: 'Mi Evento', 
        dotClass: 'bg-indigo-600', 
        textClass: 'text-indigo-950 bg-indigo-50 border border-indigo-200' 
      };
    }
    if (isMacro) {
      return { 
        label: 'Macro', 
        dotClass: 'bg-purple-600', 
        textClass: 'text-purple-950 bg-purple-50 border border-purple-200' 
      };
    }
    switch (cat) {
      case 'pago_cupon':
        return { 
          label: 'Pago de Renta / Bono', 
          dotClass: 'bg-emerald-600', 
          textClass: 'text-emerald-950 bg-emerald-50 border border-emerald-200' 
        };
      case 'balance':
        return { 
          label: 'Balance Corporativo', 
          dotClass: 'bg-blue-600', 
          textClass: 'text-blue-950 bg-blue-50 border border-blue-200' 
        };
      case 'macro_bcra':
        return { 
          label: 'Macro INDEC / BCRA', 
          dotClass: 'bg-amber-600', 
          textClass: 'text-amber-950 bg-amber-50 border border-amber-200' 
        };
      case 'elecciones_politica':
        return { 
          label: 'Política Monetaria', 
          dotClass: 'bg-purple-600', 
          textClass: 'text-purple-950 bg-purple-50 border border-purple-200' 
        };
    }
  };

  // Status badge styling
  const getStatusBadge = (status?: CalendarEvent['status']) => {
    if (status === 'realizado') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-slate-600 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3 text-slate-500" />
          <span>Realizado</span>
        </span>
      );
    }
    if (status === 'estimada') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-900 bg-amber-100/80 border border-amber-300 px-2 py-0.5 rounded-full">
          <Clock className="w-3 h-3 text-amber-700" />
          <span>Fecha estimada</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-950 bg-emerald-100/80 border border-emerald-300 px-2 py-0.5 rounded-full">
        <ShieldCheck className="w-3 h-3 text-emerald-700" />
        <span>Confirmada</span>
      </span>
    );
  };

  // Day selection on grid
  const handleSelectDay = (dayNum: number) => {
    const monthFormatted = String(currentMonth + 1).padStart(2, '0');
    const dayFormatted = String(dayNum).padStart(2, '0');
    const dateStr = `${currentYear}-${monthFormatted}-${dayFormatted}`;
    const dayEvts = eventsByDate[dateStr] || [];
    setSelectedDayEvents({
      dateStr,
      events: dayEvts
    });
  };

  return (
    <div className="space-y-8 max-w-5xl mx-auto">
      {/* Active Reminder Toast / Banner */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map(alert => (
            <div 
              key={alert.id}
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs shadow-sm transition-all animate-in slide-in-from-top ${
                alert.isUrgent 
                  ? 'bg-amber-50 border-amber-300 text-amber-950' 
                  : 'bg-emerald-50 border-emerald-300 text-emerald-950'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  alert.isUrgent ? 'bg-amber-200 text-amber-900' : 'bg-emerald-200 text-emerald-900'
                }`}>
                  <Bell className="w-4 h-4 animate-bounce" />
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-900 text-sm">
                    {alert.title}
                  </h4>
                  <p className="font-medium text-slate-700">
                    {alert.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDismissAlert(alert.id)}
                  className="px-3 py-1.5 bg-white border border-slate-300 hover:bg-slate-100 rounded-xl font-bold text-xs text-slate-700 cursor-pointer shadow-2xs"
                >
                  Entendido
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Calendar Header Card */}
      <div data-tour="calendar-header" className="bg-gradient-to-br from-emerald-950 via-emerald-900 to-slate-950 text-white rounded-3xl p-6 sm:p-7 shadow-[0_4px_20px_rgba(0,0,0,0.06)] relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-emerald-500/10 blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5 pb-5 border-b border-emerald-800/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-300 bg-emerald-900/80 px-2 py-0.5 rounded-md border border-emerald-700/60">
                Calendario de Cartera
              </span>
              <span className="text-xs text-emerald-200">
                · {portfolioName}
              </span>
              <span className="text-xs text-emerald-300/80">
                · {lastUpdatedText}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h2>
          </div>

          {/* Action buttons: Refresh & Add custom event */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <button
              data-tour="calendar-refresh-btn"
              onClick={() => loadCalendarEvents(true)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-emerald-900/60 hover:bg-emerald-900 text-emerald-100 border border-emerald-700/60 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Forzar actualización de eventos con Google Search y cronogramas oficiales"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-300' : 'text-emerald-300'}`} />
              <span>{isLoading ? 'Actualizando...' : 'Actualizar'}</span>
            </button>

            <button
              data-tour="calendar-add-event-btn"
              onClick={() => handleOpenAddEventModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white text-emerald-950 hover:bg-emerald-50 text-xs font-extrabold transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Agregar evento</span>
            </button>
          </div>
        </div>

        {/* 3 Quick Highlight Cards inside Calendar Hero (Recalculated by visible month) */}
        <div data-tour="calendar-summary-metrics" className="relative z-10 grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-5">
          <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 text-emerald-300 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-black font-mono text-white block">
                {visibleSummary.cobros} {visibleSummary.cobros === 1 ? 'Cobro' : 'Cobros'}
              </span>
              <span className="text-[11px] text-emerald-200 font-medium leading-tight block">
                Rentas y cupones de bonos
              </span>
            </div>
          </div>

          <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-blue-500/20 text-blue-300 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-black font-mono text-white block">
                {visibleSummary.balances} {visibleSummary.balances === 1 ? 'Balance' : 'Balances'}
              </span>
              <span className="text-[11px] text-emerald-200 font-medium leading-tight block">
                Estados contables en el mes
              </span>
            </div>
          </div>

          <div className="bg-emerald-900/40 border border-emerald-700/50 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-300 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-black font-mono text-white block">
                {visibleSummary.macro} IPC & Tasas
              </span>
              <span className="text-[11px] text-emerald-200 font-medium leading-tight block">
                Publicación oficial INDEC / BCRA
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Category Filter Pills */}
      <div data-tour="calendar-filters" className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 rounded-full overflow-x-auto text-xs border border-slate-200/80">
          {[
            { id: 'todos', label: 'Todos los tipos' },
            { id: 'pago_cupon', label: 'Pagos de Bonos & Renta' },
            { id: 'balance', label: 'Balances Corporativos' },
            { id: 'macro_bcra', label: 'Datos Macro & BCRA' },
            { id: 'elecciones_politica', label: 'Política Monetaria' },
          ].map(cat => (
            <button
              key={cat.id}
              onClick={() => setSelectedCategory(cat.id as any)}
              className={`px-4 py-1.5 rounded-full font-bold transition-all whitespace-nowrap cursor-pointer ${
                selectedCategory === cat.id
                  ? 'bg-emerald-950 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/60'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

        {/* Browser Notifications Request Button */}
        <button
          data-tour="calendar-browser-notifications"
          onClick={handleRequestNotificationPermission}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-colors cursor-pointer shadow-2xs ${
            notificationPermission === 'granted'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : 'border-slate-300 bg-white hover:bg-slate-50 text-slate-700'
          }`}
          title="Activar avisos de recordatorios en el navegador"
        >
          <Bell className="w-3.5 h-3.5 text-emerald-800" />
          <span>{notificationPermission === 'granted' ? 'Notificaciones activas' : 'Activar notificaciones'}</span>
        </button>
      </div>

      {/* Monthly Calendar Grid Card */}
      <div data-tour="calendar-grid" className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_2px_16px_rgba(0,0,0,0.04)] p-6 sm:p-7 space-y-5">
        {/* Month Navigation Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div>
            <h3 className="text-xl font-black text-slate-900 font-sans tracking-tight">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h3>
            <span className="text-xs text-slate-500">
              {visibleMonthEvents.length} {visibleMonthEvents.length === 1 ? 'evento registrado' : 'eventos registrados'} para tu cartera
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={prevMonth}
              disabled={!canGoPrev}
              className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-30 cursor-pointer"
              aria-label="Mes anterior"
              title={canGoPrev ? "Mes anterior" : "Límite de histórico"}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono font-bold text-slate-500 px-2">
              {currentMonth + 1}/{currentYear}
            </span>

            <button
              onClick={nextMonth}
              disabled={!canGoNext}
              className="p-2 rounded-xl border border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100 transition-colors disabled:opacity-30 cursor-pointer"
              aria-label="Mes siguiente"
              title={canGoNext ? "Mes siguiente" : "Límite de proyección (+6 meses)"}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-xs font-bold text-slate-500 uppercase tracking-wider py-1">
          <span>Lun</span>
          <span>Mar</span>
          <span>Mié</span>
          <span>Jue</span>
          <span>Vie</span>
          <span>Sáb</span>
          <span>Dom</span>
        </div>

        {/* Grid Cells */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {/* Empty prefix cells */}
          {Array.from({ length: mondayOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="min-h-[64px] sm:min-h-[82px] rounded-xl bg-slate-50/50" />
          ))}

          {/* Days */}
          {Array.from({ length: daysInMonth }).map((_, i) => {
            const dayNum = i + 1;
            const monthFormatted = String(currentMonth + 1).padStart(2, '0');
            const dayFormatted = String(dayNum).padStart(2, '0');
            const dateStr = `${currentYear}-${monthFormatted}-${dayFormatted}`;
            const dayEvents = eventsByDate[dateStr] || [];
            const isToday = dateStr === nowAR.isoDate;
            const hasCustom = dayEvents.some(e => e.isCustom);

            return (
              <button
                key={dayNum}
                onClick={() => handleSelectDay(dayNum)}
                className={`min-h-[64px] sm:min-h-[82px] p-1.5 sm:p-2 rounded-2xl border text-left flex flex-col justify-between transition-all duration-150 cursor-pointer ${
                  isToday 
                    ? 'border-emerald-700 bg-emerald-50/70 ring-2 ring-emerald-600/30 font-bold' 
                    : hasCustom
                      ? 'border-indigo-300 hover:border-indigo-600 bg-indigo-50/30 shadow-2xs'
                      : dayEvents.length > 0 
                        ? 'border-slate-300 hover:border-emerald-700 bg-white hover:bg-emerald-50/20 shadow-2xs' 
                        : 'border-slate-100 bg-white hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={`text-xs sm:text-sm font-mono ${isToday ? 'text-emerald-950 font-black' : 'text-slate-800 font-semibold'}`}>
                    {dayNum}
                  </span>
                  {isToday && (
                    <span className="text-[9px] uppercase font-black tracking-wider text-emerald-900 bg-emerald-200/90 px-1.5 py-0.2 rounded-md sm:inline hidden">
                      Hoy
                    </span>
                  )}
                </div>

                {/* Event Dots */}
                <div className="flex items-center gap-1 flex-wrap mt-1">
                  {dayEvents.map(evt => {
                    const meta = getCategoryMeta(evt.category, evt.isMacro, evt.isCustom);
                    return (
                      <span
                        key={evt.id}
                        className={`w-2 h-2 rounded-full ${meta.dotClass}`}
                        title={`${evt.title} (${evt.time})`}
                      />
                    );
                  })}
                </div>
              </button>
            );
          })}
        </div>

        {/* Empty state for the month if no events for portfolio */}
        {visibleMonthEvents.length === 0 && (
          <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200/80 space-y-1">
            <CalendarIcon className="w-8 h-8 text-slate-400 mx-auto" />
            <h4 className="font-extrabold text-slate-800 text-sm">
              Sin eventos este mes
            </h4>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              No hay pagos de cupones ni balances corporativos previstos para tus activos en {MONTH_NAMES[currentMonth]} {currentYear}.
            </p>
            <button
              onClick={() => handleOpenAddEventModal(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-100 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Programar un evento propio en este mes</span>
            </button>
          </div>
        )}

        {/* Color Legend */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" />
              <span>Pagos de bonos</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-600" />
              <span>Balances</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-purple-600" />
              <span>Macro INDEC & BCRA</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-600" />
              <span>Mis eventos</span>
            </span>
          </div>

          <span className="text-[11px] text-slate-400">
            Tocá cualquier día para inspeccionar o agregar un evento
          </span>
        </div>
      </div>

      {/* Section "Mis recordatorios próximos" */}
      <section data-tour="calendar-reminders-info" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-emerald-900" />
            <h3 className="text-base font-extrabold text-slate-900">
              Mis recordatorios y alertas programadas
            </h3>
          </div>
          <span className="text-xs text-slate-500">
            {upcomingCustomEvents.length} {upcomingCustomEvents.length === 1 ? 'evento programado' : 'eventos programados'}
          </span>
        </div>

        {upcomingCustomEvents.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {upcomingCustomEvents.map(ce => {
              const countdownLabel = ce.diff === 0 ? '¡HOY!' : ce.diff === 1 ? 'Mañana' : `En ${ce.diff} días`;
              return (
                <div 
                  key={ce.id}
                  className="p-4 rounded-2xl bg-white border border-indigo-200 hover:border-indigo-400 shadow-2xs space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-indigo-950 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-md">
                      {ce.assetSymbol}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      ce.diff <= 1 ? 'bg-amber-100 text-amber-900 border border-amber-300' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {countdownLabel}
                    </span>
                  </div>

                  <h4 className="font-extrabold text-slate-900 text-sm capitalize">
                    {ce.action}: {ce.assetSymbol}
                  </h4>

                  {ce.note && (
                    <p className="text-slate-600 text-xs italic line-clamp-2">
                      "{ce.note}"
                    </p>
                  )}

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span>{ce.date}</span>
                    <button
                      onClick={() => handleEditCustomEvent(ce.id)}
                      className="text-indigo-900 font-bold hover:underline cursor-pointer"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 bg-slate-50 border border-slate-200/90 rounded-2xl flex items-center justify-between text-xs text-slate-600">
            <span className="flex items-center gap-2">
              <Info className="w-4 h-4 text-emerald-800 shrink-0" />
              Podés agendar compras, ventas, cobros o vencimientos con recordatorios automáticos (en el día o 1 día antes).
            </span>
            <button
              onClick={() => handleOpenAddEventModal()}
              className="text-emerald-950 font-bold hover:underline shrink-0 ml-3 cursor-pointer"
            >
              + Agregar evento
            </button>
          </div>
        )}
      </section>

      {/* Próximos Eventos Destacados del Mes Visible */}
      <section data-tour="calendar-events-list" className="space-y-3">
        <h3 className="text-base font-extrabold text-slate-900">
          Próximos Eventos Destacados ({MONTH_NAMES[currentMonth]} {currentYear})
        </h3>
        {visibleMonthEvents.length === 0 ? (
          <p className="text-xs text-slate-500 italic">No hay eventos en este mes para tu cartera.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleMonthEvents.slice(0, 6).map(evt => {
              const meta = getCategoryMeta(evt.category, evt.isMacro, evt.isCustom);
              return (
                <div
                  key={evt.id}
                  onClick={() => {
                    setSelectedDayEvents({
                      dateStr: evt.date,
                      events: [evt]
                    });
                  }}
                  className={`bg-white rounded-2xl border p-4 hover:shadow-xs transition-all cursor-pointer space-y-2 ${
                    evt.isCustom 
                      ? 'border-indigo-300 hover:border-indigo-500 ring-1 ring-indigo-200/50' 
                      : 'border-slate-200/90 hover:border-emerald-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs flex-wrap gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${meta.textClass}`}>
                        {meta.label}
                      </span>
                      {getStatusBadge(evt.status)}
                    </div>
                    <span className="font-mono text-slate-500 text-xs">
                      {evt.date} · {evt.time}
                    </span>
                  </div>

                  <h4 className="text-sm font-extrabold text-slate-900 leading-snug">
                    {evt.title}
                  </h4>

                  <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                    {evt.description}
                  </p>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                    {evt.assetSymbol ? (
                      <span className="font-mono font-bold text-emerald-950 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-md text-[11px]">
                        {evt.assetSymbol}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-purple-900 bg-purple-50 px-2 py-0.5 rounded-md">
                        Macro
                      </span>
                    )}

                    {evt.sourceUrl && (
                      <a
                        href={evt.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-900 hover:text-emerald-950 hover:underline"
                        title={evt.source}
                      >
                        <span>Fuente</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Day Detail Bottom Sheet / Modal */}
      {selectedDayEvents && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedDayEvents(null)}
        >
          <div 
            className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl overflow-hidden max-h-[85vh] flex flex-col animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <div>
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  Eventos del Día
                </span>
                <h3 className="text-base font-extrabold text-slate-900 font-mono">
                  {selectedDayEvents.dateStr}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const date = selectedDayEvents.dateStr;
                    setSelectedDayEvents(null);
                    handleOpenAddEventModal(date);
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-emerald-950 text-white rounded-xl text-xs font-bold hover:bg-emerald-900 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear evento</span>
                </button>

                <button
                  onClick={() => setSelectedDayEvents(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Events List */}
            <div className="p-6 overflow-y-auto space-y-4">
              {selectedDayEvents.events.length === 0 ? (
                <div className="py-8 text-center text-xs text-slate-500 space-y-2">
                  <CalendarIcon className="w-7 h-7 text-slate-400 mx-auto" />
                  <p>No hay eventos registrados para esta fecha.</p>
                  <button
                    onClick={() => {
                      const date = selectedDayEvents.dateStr;
                      setSelectedDayEvents(null);
                      handleOpenAddEventModal(date);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-emerald-50 text-emerald-950 border border-emerald-200 rounded-xl text-xs font-bold hover:bg-emerald-100 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar un evento en este día</span>
                  </button>
                </div>
              ) : (
                selectedDayEvents.events.map(evt => {
                  const meta = getCategoryMeta(evt.category, evt.isMacro, evt.isCustom);
                  return (
                    <div 
                      key={evt.id}
                      className={`p-4 rounded-2xl border space-y-2 text-xs ${
                        evt.isCustom 
                          ? 'border-indigo-300 bg-indigo-50/40' 
                          : 'border-slate-200 bg-slate-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${meta.textClass}`}>
                            {meta.label}
                          </span>
                          {getStatusBadge(evt.status)}
                        </div>

                        <span className="font-mono text-slate-600 font-semibold">
                          {evt.time}
                        </span>
                      </div>

                      <h4 className="text-sm font-extrabold text-slate-900 leading-snug">
                        {evt.title}
                      </h4>

                      <p className="text-xs text-slate-600 leading-relaxed">
                        {evt.description}
                      </p>

                      <div className="pt-2 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                        {evt.assetSymbol && (
                          <span className="font-mono font-bold text-slate-800 bg-white px-2 py-0.5 rounded border border-slate-200">
                            Activo: {evt.assetSymbol}
                          </span>
                        )}

                        {evt.isCustom ? (
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => {
                                setSelectedDayEvents(null);
                                handleEditCustomEvent(evt.id);
                              }}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-900 hover:underline cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={() => setDeletingEventId(evt.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-rose-700 hover:underline cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Eliminar</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span>Fuente: {evt.source}</span>
                            {evt.sourceUrl && (
                              <a
                                href={evt.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-emerald-900 hover:underline"
                              >
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-4 border-t border-slate-200 bg-slate-50 text-right">
              <button
                onClick={() => setSelectedDayEvents(null)}
                className="px-4 py-2 bg-slate-900 text-white font-bold text-xs rounded-xl hover:bg-slate-800 cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Custom Event Modal */}
      {showEventModal && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowEventModal(false)}
        >
          <div 
            className="bg-white w-full max-w-lg rounded-3xl border border-slate-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
              <h3 className="text-base font-extrabold text-slate-900">
                {editingEventId ? 'Editar Evento de Cartera' : 'Nuevo Evento de Cartera'}
              </h3>
              <button
                onClick={() => setShowEventModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomEvent} className="p-6 space-y-4 text-xs">
              {/* Fecha */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Fecha del evento</label>
                <input
                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-emerald-700"
                />
              </div>

              {/* Activo */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Activo financiero</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
                    value={formAsset}
                    onChange={(e) => setFormAsset(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-800 focus:outline-none focus:border-emerald-700"
                  >
                    {userAssetSymbols.map(sym => (
                      <option key={sym} value={sym}>{sym}</option>
                    ))}
                    <option value="otro">Otro activo...</option>
                  </select>

                  {formAsset === 'otro' && (
                    <input
                      type="text"
                      placeholder="Escribí ticker (ej: BMA)"
                      value={customAssetInput}
                      onChange={(e) => setCustomAssetInput(e.target.value)}
                      required={formAsset === 'otro'}
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs font-mono font-bold text-slate-800 uppercase focus:outline-none focus:border-emerald-700"
                    />
                  )}
                </div>
              </div>

              {/* Acción */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Acción prevista</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['comprar', 'vender', 'cobro', 'otro'] as const).map(act => (
                    <button
                      type="button"
                      key={act}
                      onClick={() => setFormAction(act)}
                      className={`p-2 rounded-xl font-bold uppercase text-[11px] transition-all cursor-pointer border ${
                        formAction === act
                          ? 'bg-emerald-950 text-white border-emerald-950 shadow-xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {act === 'cobro' ? 'Cobro Renta' : act}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nota opcional */}
              <div className="space-y-1">
                <label className="font-bold text-slate-700">Nota u observación (opcional)</label>
                <textarea
                  rows={2}
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Ej: Cobro de renta semestral para reinversión en GD30..."
                  className="w-full bg-slate-50 border border-slate-300 rounded-xl p-2.5 text-xs text-slate-800 focus:outline-none focus:border-emerald-700"
                />
              </div>

              {/* Recordatorios multi-select */}
              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="font-bold text-slate-700 block">Recordatorios programados</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'same_day' as ReminderTiming, label: 'El mismo día (09:00)' },
                    { id: '1_day_before' as ReminderTiming, label: '1 día antes' },
                    { id: '3_days_before' as ReminderTiming, label: '3 días antes' },
                    { id: '1_week_before' as ReminderTiming, label: '1 semana antes' }
                  ].map(rem => {
                    const isChecked = formReminders.includes(rem.id);
                    return (
                      <label 
                        key={rem.id}
                        className={`flex items-center gap-2 p-2 rounded-xl border cursor-pointer select-none text-xs transition-colors ${
                          isChecked 
                            ? 'bg-emerald-50 border-emerald-300 text-emerald-950 font-bold' 
                            : 'bg-slate-50 border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setFormReminders([...formReminders, rem.id]);
                            } else {
                              setFormReminders(formReminders.filter(r => r !== rem.id));
                            }
                          }}
                          className="rounded text-emerald-700 focus:ring-emerald-700 accent-emerald-700 w-3.5 h-3.5"
                        />
                        <span>{rem.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 flex items-center justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-emerald-950 text-white font-extrabold text-xs rounded-xl hover:bg-emerald-900 cursor-pointer shadow-xs"
                >
                  {editingEventId ? 'Guardar Cambios' : 'Crear Evento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingEventId && (
        <div 
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDeletingEventId(null)}
        >
          <div 
            className="bg-white w-full max-w-sm rounded-3xl border border-slate-200 p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>

            <div>
              <h4 className="text-base font-extrabold text-slate-900">
                ¿Eliminar este evento propio?
              </h4>
              <p className="text-xs text-slate-500 mt-1">
                Esta acción borrará el evento y sus recordatorios asociados.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingEventId(null)}
                className="px-4 py-2 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                onClick={() => handleDeleteCustomEvent(deletingEventId)}
                className="px-4 py-2 bg-rose-600 text-white font-bold text-xs rounded-xl hover:bg-rose-700 cursor-pointer shadow-xs"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Simulation Test Bar (Discreet footer tool to verify day rollover and cache invalidation) */}
      <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs text-slate-500 bg-slate-50/80 p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-emerald-800" />
          <span>
            Simulación de fecha AR: <strong>{nowAR.formattedSpanish}</strong> ({nowAR.isoDate})
          </span>
          {simulatedOffset !== 0 && (
            <span className="font-mono text-[10px] font-bold text-amber-900 bg-amber-100 px-2 py-0.5 rounded-full border border-amber-300">
              +{simulatedOffset} día(s)
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              const next = simulatedOffset + 1;
              setSimulatedDayOffset(next);
              setSimulatedOffset(next);
              const fresh = getNowAR();
              setNowAR(fresh);
              setCurrentYear(fresh.year);
              setCurrentMonth(fresh.month);
              loadCalendarEvents(true);
            }}
            className="px-3 py-1 bg-white border border-slate-300 hover:bg-slate-100 rounded-lg text-xs font-bold text-slate-700 cursor-pointer shadow-2xs"
            title="Avanzar 1 día para simular el paso de medianoche y el recálculo de recordatorios"
          >
            Avanzar +1 día (probar rollover)
          </button>

          {simulatedOffset !== 0 && (
            <button
              onClick={() => {
                setSimulatedDayOffset(0);
                setSimulatedOffset(0);
                const fresh = getNowAR();
                setNowAR(fresh);
                setCurrentYear(fresh.year);
                setCurrentMonth(fresh.month);
                loadCalendarEvents(true);
              }}
              className="px-2.5 py-1 text-slate-500 hover:text-slate-800 text-xs font-bold underline cursor-pointer"
            >
              Restablecer fecha real
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
