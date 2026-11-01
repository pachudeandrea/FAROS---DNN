import { useModalFocus } from '../hooks/useModalFocus';
import { usePendingChanges } from '../hooks/usePendingChanges';
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { apiRequest } from '../utils/apiClient';
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
  accountId?: string;
  notificationsControl?: React.ReactNode;
}

const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
];

export const FinancialCalendar: React.FC<FinancialCalendarProps> = ({ 
  portfolioId = 'default',
  portfolioName = 'Mi Cartera',
  userAssetSymbols,
  onPendingRemindersChange,
  accountId,
  notificationsControl
}) => {
  const [view, setView] = useState<'agenda' | 'month'>(() => window.matchMedia('(max-width: 767px)').matches ? 'agenda' : 'month');
  const [savedMessage, setSavedMessage] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  // Current time in Argentina (Single source of truth)
  const [nowAR, setNowAR] = useState<NowAR>(() => getNowAR());

  // Visible month & year state (opens in current month of Argentina)
  const [currentYear, setCurrentYear] = useState<number>(() => getNowAR().year);
  const [currentMonth, setCurrentMonth] = useState<number>(() => getNowAR().month);

  // Loading & refresh state
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [lastUpdatedText, setLastUpdatedText] = useState<string>('Todavía sin actualizar');

  // Filter by category
  const [selectedCategory, setSelectedCategory] = useState<'todos' | CalendarEvent['category']>('todos');

  // Automatic calendar events from verified pipeline
  const [serverEvents, setServerEvents] = useState<CalendarEvent[]>([]);

  const storageKey = accountId ? `faros_custom_events:${accountId}` : 'faros_custom_events';
  const [calendarReady, setCalendarReady] = useState(!accountId);
  const [savingEvents, setSavingEvents] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [legacyEvents, setLegacyEvents] = useState<CustomCalendarEvent[]>(() => {
    if (!accountId) return [];
    try { const value = JSON.parse(localStorage.getItem('faros_custom_events') || '[]'); return Array.isArray(value) ? value : []; } catch { return []; }
  });

  // Each real account has its own cache and server calendar.
  const [customEvents, setCustomEvents] = useState<CustomCalendarEvent[]>(() => {
    try {
      const stored = localStorage.getItem(storageKey);
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
      const stored = localStorage.getItem(`faros_dismissed_reminders:${accountId || 'demo'}`);
      if (stored) return JSON.parse(stored);
    } catch {}
    return [];
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

  usePendingChanges(showEventModal || savingEvents);

  // Delete confirmation modal
  const [deletingEventId, setDeletingEventId] = useState<string | null>(null);

  const formRef = useModalFocus(() => setShowEventModal(false), showEventModal);
  const dayRef = useModalFocus(() => setSelectedDayEvents(null), !!selectedDayEvents);
  const deleteRef = useModalFocus(() => setDeletingEventId(null), !!deletingEventId);

  // Simulated day offset state (for testing daily rollover)
  const [simulatedOffset, setSimulatedOffset] = useState<number>(() => getSimulatedDayOffset());

  useEffect(() => {
    if (!accountId) return;
    let active = true;
    setCalendarReady(false);
    apiRequest(`/api/notifications/reminders?expectedUserId=${encodeURIComponent(accountId)}`).then(data => {
      if (!active || !Array.isArray(data.events)) return;
      setCustomEvents(data.events);
      try { localStorage.setItem(storageKey, JSON.stringify(data.events)); } catch {}
      setSyncError(null);
    }).catch(error => { if (active) setSyncError(error.message || 'No se pudieron sincronizar los recordatorios.'); })
      .finally(() => { if (active) setCalendarReady(true); });
    return () => { active = false; };
  }, [accountId, storageKey]);

  const saveCustomEvents = async (events: CustomCalendarEvent[]): Promise<boolean> => {
    if (!calendarReady || savingEvents) return false;
    setSavingEvents(true); setSyncError(null); setSavedMessage('');
    try {
      const saved = accountId ? (await apiRequest('/api/notifications/reminders', { method: 'PUT', body: JSON.stringify({ expectedUserId: accountId, events }) })).events : events;
      if (!Array.isArray(saved)) throw new Error('No se confirmó el guardado de los recordatorios.');
      setCustomEvents(saved);
      try { localStorage.setItem(storageKey, JSON.stringify(saved)); } catch {}
      setSavedMessage(accountId ? 'Recordatorios guardados en tu cuenta.' : 'Recordatorios guardados en este dispositivo.');
      return true;
    } catch (error) { setSyncError(error instanceof Error ? error.message : 'No se pudieron guardar los recordatorios.'); return false; }
    finally { setSavingEvents(false); }
  };

  // Revalidate date with getNowAR()
  const refreshDateState = useCallback(() => {
    const fresh = getNowAR();
    setNowAR(fresh);

    return fresh;
  }, []);

  // Fetch calendar events from server pipeline
  const loadCalendarEvents = useCallback(async (forceRefresh = false) => {
    setIsLoading(true); setLoadError(null);
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
            setLastUpdatedText('Información de una consulta anterior');
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
        setLastUpdatedText(getNowAR().headerUpdatedText);
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
        setLoadError('No pudimos actualizar. Mostramos los cronogramas locales disponibles; verificá cada fuente.');
        // Fallback to local verified generator
        const local = await getVerifiedCalendarEvents(userAssetSymbols);
        setServerEvents(local);
      }
    } catch {
      setLoadError('No pudimos actualizar. Mostramos los cronogramas locales disponibles; verificá cada fuente.');
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

  }, [customEvents, nowAR, dismissedReminderIds, onPendingRemindersChange]);

  // Run reminder check on mount and every minute
  useEffect(() => {
    runReminderCheck();
    const interval = setInterval(runReminderCheck, 60000);
    return () => clearInterval(interval);
  }, [runReminderCheck]);

  // Dismiss a reminder alert
  const handleDismissAlert = (alertId: string) => {
    const next = [...dismissedReminderIds, alertId];
    setDismissedReminderIds(next);
    try {
      localStorage.setItem(`faros_dismissed_reminders:${accountId || 'demo'}`, JSON.stringify(next));
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
  const handleSaveCustomEvent = async (e: React.FormEvent) => {
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
      if (!await saveCustomEvents(updated)) return;
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
      if (!await saveCustomEvents([...customEvents, newEvent])) return;
    }

    setShowEventModal(false);
    setEditingEventId(null);
    runReminderCheck();
  };

  // Handle delete custom event
  const handleDeleteCustomEvent = async (eventId: string) => {
    const next = customEvents.filter(e => e.id !== eventId);
    if (!await saveCustomEvents(next)) return;
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
        dotClass: 'bg-accent-600',
        textClass: 'text-accent-950 bg-accent-50 border border-accent-200'
      };
    }
    if (isMacro) {
      return { 
        label: 'Macro', 
        dotClass: 'bg-accent-600',
        textClass: 'text-accent-950 bg-accent-50 border border-accent-200'
      };
    }
    switch (cat) {
      case 'pago_cupon':
        return { 
          label: 'Pago de Renta / Bono', 
          dotClass: 'bg-brand-600',
          textClass: 'text-brand-950 bg-brand-50 border border-brand-200'
        };
      case 'balance':
        return { 
          label: 'Balance Corporativo', 
          dotClass: 'bg-info-600',
          textClass: 'text-info-text bg-info-50 border border-info-200'
        };
      case 'macro_bcra':
        return { 
          label: 'Macro INDEC / BCRA', 
          dotClass: 'bg-warning-600',
          textClass: 'text-warning-text bg-warning-50 border border-warning-200'
        };
      case 'elecciones_politica':
        return { 
          label: 'Política Monetaria', 
          dotClass: 'bg-accent-600',
          textClass: 'text-accent-950 bg-accent-50 border border-accent-200'
        };
    }
  };

  // Status badge styling
  const getStatusBadge = (status?: CalendarEvent['status']) => {
    if (status === 'realizado') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-muted bg-ink-100 border border-ink-300 px-2 py-0.5 rounded-full">
          <CheckCircle2 className="w-3 h-3 text-muted" />
          <span>Realizado</span>
        </span>
      );
    }
    if (status === 'estimada') {
      return (
        <span className="inline-flex items-center gap-1 text-[10px] font-bold text-warning-text bg-warning-100/80 border border-warning-300 px-2 py-0.5 rounded-full">
          <Clock className="w-3 h-3 text-warning-text" />
          <span>Fecha estimada</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-brand-950 bg-brand-100/80 border border-brand-300 px-2 py-0.5 rounded-full">
        <ShieldCheck className="w-3 h-3 text-brand-text" />
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
    <div className="space-y-8 min-w-0 max-w-5xl mx-auto">
      <p role="status" className="text-sm text-muted">{savingEvents ? 'Guardando recordatorios…' : !calendarReady ? 'Sincronizando recordatorios…' : savedMessage}</p>
      {loadError && <p role="alert" className="p-3 rounded-xl bg-warning-50 text-warning-text text-sm">{loadError}</p>}
      {syncError && <p role="alert" className="p-3 rounded-xl bg-danger-50 text-danger-800 text-xs">{syncError}</p>}
      {accountId && calendarReady && legacyEvents.length > 0 && customEvents.length === 0 && <div className="p-4 rounded-2xl bg-warning-50 border border-warning-200 space-y-2 text-xs">
        <p>Tenés recordatorios guardados en este dispositivo. Podés importarlos a esta cuenta para recibirlos también con FAROS cerrado.</p>
        <button type="button" disabled={savingEvents} onClick={async () => {
          if (await saveCustomEvents(legacyEvents)) { setLegacyEvents([]); try { localStorage.removeItem('faros_custom_events'); } catch {} }
        }} className="font-bold text-brand-900 underline cursor-pointer disabled:opacity-50">Importar recordatorios a esta cuenta</button>
      </div>}
      {/* Active Reminder Toast / Banner */}
      {activeAlerts.length > 0 && (
        <div className="space-y-2">
          {activeAlerts.map(alert => (
            <div 
              key={alert.id}
              className={`p-4 rounded-2xl border flex items-center justify-between gap-3 text-xs shadow-sm transition-all animate-in slide-in-from-top ${
                alert.isUrgent 
                  ? 'bg-warning-50 border-warning-300 text-warning-text'
                  : 'bg-brand-50 border-brand-300 text-brand-950'
              }`}
            >
              <div className="flex items-center gap-3">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  alert.isUrgent ? 'bg-warning-200 text-warning-text' : 'bg-brand-200 text-brand-900'
                }`}>
                  <Bell className="w-4 h-4 animate-bounce" />
                </div>
                <div>
                  <h4 className="font-extrabold text-ink-900 text-sm">
                    {alert.title}
                  </h4>
                  <p className="font-medium text-muted">
                    {alert.message}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => handleDismissAlert(alert.id)}
                  className="px-3 py-1.5 bg-paper border border-ink-300 hover:bg-ink-100 rounded-xl font-bold text-xs text-muted cursor-pointer shadow-2xs"
                >
                  Entendido
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Main Calendar Header Card */}
      <div data-tour="calendar-header" className="bg-gradient-to-br from-brand-950 via-brand-900 to-ink-950 text-paper rounded-3xl p-6 sm:p-7 shadow-brand-soft relative overflow-hidden">
        <div className="absolute top-0 right-0 -mr-16 -mt-16 w-48 h-48 rounded-full bg-brand-500/10 blur-2xl pointer-events-none" />
        
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-5 pb-5 border-b border-brand-800/60">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-300 bg-brand-900/80 px-2 py-0.5 rounded-md border border-brand-700/60">
                Calendario de Cartera
              </span>
              <span className="text-xs text-brand-200">
                · {portfolioName}
              </span>
              <span className="text-xs text-brand-300/80">
                · {lastUpdatedText}
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold text-paper tracking-tight">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h2>
          </div>

          {/* Action buttons: Refresh & Add custom event */}
          <div className="flex items-center gap-2.5 flex-wrap shrink-0">
            <button
              data-tour="calendar-refresh-btn"
              onClick={() => loadCalendarEvents(true)}
              disabled={isLoading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-brand-900/60 hover:bg-brand-900 text-brand-100 border border-brand-700/60 text-xs font-bold transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
              title="Consultar eventos y cronogramas oficiales"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-brand-300' : 'text-brand-300'}`} />
              <span>{isLoading ? 'Actualizando...' : 'Actualizar'}</span>
            </button>

            <button
              data-tour="calendar-add-event-btn"
              onClick={() => handleOpenAddEventModal()}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-paper text-brand-950 hover:bg-brand-50 text-xs font-extrabold transition-all cursor-pointer shadow-xs active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[2.5]" />
              <span>Agregar evento</span>
            </button>
          </div>
        </div>

        {/* 3 Quick Highlight Cards inside Calendar Hero (Recalculated by visible month) */}
        <div data-tour="calendar-summary-metrics" className="relative z-10 hidden sm:grid grid-cols-3 gap-3.5 pt-5">
          <div className="bg-brand-900/40 border border-brand-700/50 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-brand-500/20 text-brand-300 flex items-center justify-center shrink-0">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold font-mono text-paper block">
                {visibleSummary.cobros} {visibleSummary.cobros === 1 ? 'Cobro' : 'Cobros'}
              </span>
              <span className="text-[11px] text-brand-200 font-medium leading-tight block">
                Rentas y cupones de bonos
              </span>
            </div>
          </div>

          <div className="bg-brand-900/40 border border-brand-700/50 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-info-500/20 text-info-300 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold font-mono text-paper block">
                {visibleSummary.balances} {visibleSummary.balances === 1 ? 'Balance' : 'Balances'}
              </span>
              <span className="text-[11px] text-brand-200 font-medium leading-tight block">
                Estados contables en el mes
              </span>
            </div>
          </div>

          <div className="bg-brand-900/40 border border-brand-700/50 rounded-2xl p-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-warning-500/20 text-warning-300 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <span className="text-lg font-bold font-mono text-paper block">
                {visibleSummary.macro} IPC & Tasas
              </span>
              <span className="text-[11px] text-brand-200 font-medium leading-tight block">
                Publicación oficial INDEC / BCRA
              </span>
            </div>
          </div>
        </div>
      </div>

      <div aria-label="Vista del calendario" className="flex gap-2">
        <button aria-pressed={view === 'agenda'} onClick={() => setView('agenda')} className={`px-4 py-2 rounded-xl font-semibold text-sm ${view === 'agenda' ? 'bg-brand-950 text-paper' : 'bg-paper text-brand-900'}`}>Agenda próxima</button>
        <button aria-pressed={view === 'month'} onClick={() => setView('month')} className={`px-4 py-2 rounded-xl font-semibold text-sm ${view === 'month' ? 'bg-brand-950 text-paper' : 'bg-paper text-brand-900'}`}>Vista mensual</button>
      </div>
      {view === 'agenda' && <section aria-label="Agenda próxima" className="space-y-3">
        <h3 className="text-lg font-bold text-ink-900">Próximos eventos y recordatorios</h3>
        <p className="text-sm text-muted">Eventos financieros y tus recordatorios personales, ordenados por fecha.</p>
        {combinedEvents.filter(event => event.date >= nowAR.isoDate).sort((a,b) => a.date.localeCompare(b.date)).slice(0,30).map(event => <button key={event.id} className={`w-full text-left rounded-xl p-4 space-y-2 border ${event.isCustom ? 'bg-accent-50 border-accent-200' : 'bg-paper border-ink-200'}`} onClick={() => setSelectedDayEvents({ dateStr: event.date, events: [event] })}>
          <span className="flex flex-wrap gap-2 text-sm text-muted"><span>{event.isCustom ? 'Recordatorio personal' : 'Evento financiero'}</span><span>{event.date} · {event.time}</span></span>
          <span className="block text-base font-semibold text-ink-900">{event.title}</span><span className="block text-sm text-muted">{event.description}</span>
        </button>)}
        {!combinedEvents.some(event => event.date >= nowAR.isoDate) && <p className="text-muted">No hay próximos eventos disponibles. Podés agregar un recordatorio personal.</p>}
      </section>}
      <label className="block sm:hidden text-sm font-semibold text-muted">Tipo de evento<select value={selectedCategory} onChange={event => setSelectedCategory(event.target.value as typeof selectedCategory)} className="block w-full mt-2 border border-ink-300 rounded-xl bg-paper p-3"><option value="todos">Todos los tipos</option><option value="pago_cupon">Pagos de bonos y renta</option><option value="balance">Balances corporativos</option><option value="macro_bcra">Datos macro y BCRA</option><option value="elecciones_politica">Política monetaria</option></select></label>
      {/* Category Filter Pills */}
      <div data-tour="calendar-filters" className="hidden sm:flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-ink-100 rounded-full overflow-x-auto text-xs border border-ink-200/80">
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
                  ? 'bg-brand-950 text-paper shadow-xs'
                  : 'text-muted hover:text-ink-900 hover:bg-ink-200/60'
              }`}
            >
              {cat.label}
            </button>
          ))}
        </div>

      </div>

      {notificationsControl && <details className="rounded-xl border border-ink-200 bg-paper p-3"><summary className="font-semibold text-sm text-brand-900 cursor-pointer py-2">Alertas del calendario</summary><section data-tour="calendar-browser-notifications" className="p-4 sm:p-5 bg-paper rounded-2xl border border-ink-200">{notificationsControl}</section></details>}

      {/* Monthly Calendar Grid Card */}
      <div hidden={view !== 'month'} data-tour="calendar-grid" className="bg-paper rounded-3xl border border-ink-200/90 shadow-brand-soft p-6 sm:p-7 space-y-5">
        {/* Month Navigation Bar */}
        <div className="flex items-center justify-between pb-3 border-b border-ink-100">
          <div>
            <h3 className="text-xl font-bold text-ink-900 font-sans tracking-tight">
              {MONTH_NAMES[currentMonth]} {currentYear}
            </h3>
            <span className="text-xs text-muted">
              {visibleMonthEvents.length} {visibleMonthEvents.length === 1 ? 'evento registrado' : 'eventos registrados'} para tu cartera
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              onClick={prevMonth}
              disabled={!canGoPrev}
              className="p-2 rounded-xl border border-ink-200 text-muted hover:text-ink-900 hover:bg-ink-100 transition-colors disabled:opacity-30 cursor-pointer"
              aria-label="Mes anterior"
              title={canGoPrev ? "Mes anterior" : "Límite de histórico"}
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <span className="text-xs font-mono font-bold text-muted px-2">
              {currentMonth + 1}/{currentYear}
            </span>

            <button
              onClick={nextMonth}
              disabled={!canGoNext}
              className="p-2 rounded-xl border border-ink-200 text-muted hover:text-ink-900 hover:bg-ink-100 transition-colors disabled:opacity-30 cursor-pointer"
              aria-label="Mes siguiente"
              title={canGoNext ? "Mes siguiente" : "Límite de proyección (+6 meses)"}
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Days of week header */}
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-xs font-bold text-muted uppercase tracking-wider py-1">
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
            <div key={`empty-${i}`} className="min-h-[64px] sm:min-h-[82px] rounded-xl bg-ink-50/50" />
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
                    ? 'border-brand-700 bg-brand-50/70 ring-2 ring-brand-600/30 font-bold'
                    : hasCustom
                      ? 'border-accent-300 hover:border-accent-600 bg-accent-50/30 shadow-2xs'
                      : dayEvents.length > 0 
                        ? 'border-ink-300 hover:border-brand-700 bg-paper hover:bg-brand-50/20 shadow-2xs'
                        : 'border-ink-100 bg-paper hover:bg-ink-50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className={`text-xs sm:text-sm font-mono ${isToday ? 'text-brand-950 font-bold' : 'text-ink-800 font-semibold'}`}>
                    {dayNum}
                  </span>
                  {isToday && (
                    <span className="text-[9px] uppercase font-bold tracking-wider text-brand-900 bg-brand-200/90 px-1.5 py-0.2 rounded-md sm:inline hidden">
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
          <div className="p-8 text-center bg-ink-50 rounded-2xl border border-ink-200/80 space-y-1">
            <CalendarIcon className="w-8 h-8 text-muted mx-auto" />
            <h4 className="font-extrabold text-ink-800 text-sm">
              Sin eventos este mes
            </h4>
            <p className="text-xs text-muted max-w-sm mx-auto">
              No hay pagos de cupones ni balances corporativos previstos para tus activos en {MONTH_NAMES[currentMonth]} {currentYear}.
            </p>
            <button
              onClick={() => handleOpenAddEventModal(`${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-01`)}
              className="mt-3 inline-flex items-center gap-1.5 px-3 py-1.5 bg-paper border border-ink-300 rounded-xl text-xs font-bold text-muted hover:bg-ink-100 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Programar un evento propio en este mes</span>
            </button>
          </div>
        )}

        {/* Color Legend */}
        <div className="pt-3 border-t border-ink-100 flex flex-wrap items-center justify-between gap-3 text-xs text-muted">
          <div className="flex flex-wrap items-center gap-4">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-brand-600" />
              <span>Pagos de bonos</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-info-600" />
              <span>Balances</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-600" />
              <span>Macro INDEC & BCRA</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-accent-600" />
              <span>Mis eventos</span>
            </span>
          </div>

          <span className="text-[11px] text-muted">
            Tocá cualquier día para inspeccionar o agregar un evento
          </span>
        </div>
      </div>

      {/* Section "Mis recordatorios próximos" */}
      <section data-tour="calendar-reminders-info" className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bell className="w-4 h-4 text-brand-900" />
            <h3 className="text-base font-extrabold text-ink-900">
              Mis recordatorios y alertas programadas
            </h3>
          </div>
          <span className="text-xs text-muted">
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
                  className="p-4 rounded-2xl bg-paper border border-accent-200 hover:border-accent-400 shadow-2xs space-y-2 text-xs"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold text-accent-950 bg-accent-50 border border-accent-200 px-2 py-0.5 rounded-md">
                      {ce.assetSymbol}
                    </span>
                    <span className={`px-2 py-0.5 rounded-full font-bold text-[10px] ${
                      ce.diff <= 1 ? 'bg-warning-100 text-warning-text border border-warning-300' : 'bg-ink-100 text-muted'
                    }`}>
                      {countdownLabel}
                    </span>
                  </div>

                  <h4 className="font-extrabold text-ink-900 text-sm capitalize">
                    {ce.action}: {ce.assetSymbol}
                  </h4>

                  {ce.note && (
                    <p className="text-muted text-xs italic line-clamp-2">
                      "{ce.note}"
                    </p>
                  )}

                  <div className="pt-2 border-t border-ink-100 flex items-center justify-between text-[11px] text-muted">
                    <span>{ce.date}</span>
                    <button
                      onClick={() => handleEditCustomEvent(ce.id)}
                      className="text-accent-900 font-bold hover:underline cursor-pointer"
                    >
                      Editar
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="p-4 bg-ink-50 border border-ink-200/90 rounded-2xl flex items-center justify-between text-xs text-muted">
            <span className="flex items-center gap-2">
              <Info className="w-4 h-4 text-brand-800 shrink-0" />
              Podés agendar compras, ventas, cobros o vencimientos con recordatorios automáticos (en el día o 1 día antes).
            </span>
            <button
              onClick={() => handleOpenAddEventModal()}
              className="text-brand-950 font-bold hover:underline shrink-0 ml-3 cursor-pointer"
            >
              + Agregar evento
            </button>
          </div>
        )}
      </section>

      {/* Próximos Eventos Destacados del Mes Visible */}
      <section hidden={view !== 'month'} data-tour="calendar-events-list" className="space-y-3">
        <h3 className="text-base font-extrabold text-ink-900">
          Próximos Eventos Destacados ({MONTH_NAMES[currentMonth]} {currentYear})
        </h3>
        {visibleMonthEvents.length === 0 ? (
          <p className="text-xs text-muted italic">No hay eventos en este mes para tu cartera.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {visibleMonthEvents.slice(0, 6).map(evt => {
              const meta = getCategoryMeta(evt.category, evt.isMacro, evt.isCustom);
              return (
                <div
                  key={evt.id}
                  role="button" tabIndex={0}
                  onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedDayEvents({ dateStr: evt.date, events: [evt] }); } }}
                  onClick={() => {
                    setSelectedDayEvents({
                      dateStr: evt.date,
                      events: [evt]
                    });
                  }}
                  className={`bg-paper rounded-2xl border p-4 hover:shadow-xs transition-all cursor-pointer space-y-2 ${
                    evt.isCustom 
                      ? 'border-accent-300 hover:border-accent-500 ring-1 ring-accent-200/50'
                      : 'border-ink-200/90 hover:border-brand-700'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs flex-wrap gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${meta.textClass}`}>
                        {meta.label}
                      </span>
                      {getStatusBadge(evt.status)}
                    </div>
                    <span className="font-mono text-muted text-xs">
                      {evt.date} · {evt.time}
                    </span>
                  </div>

                  <h4 className="text-sm font-extrabold text-ink-900 leading-snug">
                    {evt.title}
                  </h4>

                  <p className="text-xs text-muted line-clamp-2 leading-relaxed">
                    {evt.description}
                  </p>

                  <div className="pt-2 border-t border-ink-100 flex items-center justify-between gap-2 text-xs">
                    {evt.assetSymbol ? (
                      <span className="font-mono font-bold text-brand-950 bg-brand-50 border border-brand-200 px-2 py-0.5 rounded-md text-[11px]">
                        {evt.assetSymbol}
                      </span>
                    ) : (
                      <span className="text-[11px] font-bold text-accent-900 bg-accent-50 px-2 py-0.5 rounded-md">
                        Macro
                      </span>
                    )}

                    {evt.sourceUrl && (
                      <a
                        href={evt.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-900 hover:text-brand-950 hover:underline"
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
          className="fixed inset-0 z-50 bg-ink-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4"
          onClick={() => setSelectedDayEvents(null)}
        >
          <div 
            ref={dayRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Eventos del día"
            className="bg-paper w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl border border-ink-200 shadow-2xl overflow-hidden max-h-[85dvh] flex flex-col animate-in slide-in-from-bottom duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Sheet Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-ink-200 bg-ink-50">
              <div>
                <span className="text-[11px] font-bold text-muted uppercase tracking-wider">
                  Eventos del Día
                </span>
                <h3 className="text-base font-extrabold text-ink-900 font-mono">
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
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-brand-950 text-paper rounded-xl text-xs font-bold hover:bg-brand-900 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Crear evento</span>
                </button>

                <button
                  onClick={() => setSelectedDayEvents(null)}
                  className="p-1.5 rounded-lg text-muted hover:text-muted hover:bg-ink-200/60 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Events List */}
            <div className="p-6 overflow-y-auto space-y-4">
              {selectedDayEvents.events.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted space-y-2">
                  <CalendarIcon className="w-7 h-7 text-muted mx-auto" />
                  <p>No hay eventos registrados para esta fecha.</p>
                  <button
                    onClick={() => {
                      const date = selectedDayEvents.dateStr;
                      setSelectedDayEvents(null);
                      handleOpenAddEventModal(date);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-brand-50 text-brand-950 border border-brand-200 rounded-xl text-xs font-bold hover:bg-brand-100 cursor-pointer"
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
                          ? 'border-accent-300 bg-accent-50/40'
                          : 'border-ink-200 bg-ink-50/60'
                      }`}
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <span className={`px-2 py-0.5 rounded-md font-bold text-[11px] ${meta.textClass}`}>
                            {meta.label}
                          </span>
                          {getStatusBadge(evt.status)}
                        </div>

                        <span className="font-mono text-muted font-semibold">
                          {evt.time}
                        </span>
                      </div>

                      <h4 className="text-sm font-extrabold text-ink-900 leading-snug">
                        {evt.title}
                      </h4>

                      <p className="text-xs text-muted leading-relaxed">
                        {evt.description}
                      </p>

                      <div className="pt-2 border-t border-ink-200/80 flex flex-wrap items-center justify-between gap-2">
                        {evt.assetSymbol && (
                          <span className="font-mono font-bold text-ink-800 bg-paper px-2 py-0.5 rounded border border-ink-200">
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
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-accent-900 hover:underline cursor-pointer"
                            >
                              <Edit2 className="w-3 h-3" />
                              <span>Editar</span>
                            </button>
                            <button
                              onClick={() => setDeletingEventId(evt.id)}
                              className="inline-flex items-center gap-1 text-[11px] font-bold text-danger-700 hover:underline cursor-pointer"
                            >
                              <Trash2 className="w-3 h-3" />
                              <span>Eliminar</span>
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 text-[11px] text-muted">
                            <span>Fuente: {evt.source}</span>
                            {evt.sourceUrl && (
                              <a
                                href={evt.sourceUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 font-bold text-brand-900 hover:underline"
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

            <div className="p-4 border-t border-ink-200 bg-ink-50 text-right">
              <button
                onClick={() => setSelectedDayEvents(null)}
                className="px-4 py-2 bg-ink-900 text-paper font-bold text-xs rounded-xl hover:bg-ink-800 cursor-pointer"
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
          className="fixed inset-0 z-50 bg-ink-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setShowEventModal(false)}
        >
          <div 
            ref={formRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-title"
            className="bg-paper w-full max-w-lg max-h-[calc(100dvh-2rem)] flex flex-col rounded-3xl border border-ink-200 shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex shrink-0 items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-ink-200 bg-ink-50">
              <h3 id="calendar-event-title" className="text-base font-extrabold text-ink-900">
                {editingEventId ? 'Editar Evento de Cartera' : 'Nuevo Evento de Cartera'}
              </h3>
              <button
                onClick={() => setShowEventModal(false)}
                aria-label="Cerrar evento"
                className="p-1 rounded-lg text-muted hover:text-muted hover:bg-ink-200/60 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomEvent} className="min-h-0 overflow-y-auto p-4 sm:p-6 space-y-4 text-xs">
              {syncError && <p role="alert" className="p-3 rounded-xl bg-danger-50 text-danger-800">{syncError}</p>}
              {/* Fecha */}
              <div className="space-y-1">
                <label htmlFor="event-date" className="font-bold text-muted">Fecha del evento</label>
                <input
 id="event-date"                  type="date"
                  required
                  value={formDate}
                  onChange={(e) => setFormDate(e.target.value)}
                  className="w-full bg-ink-50 border border-ink-300 rounded-xl p-2.5 text-xs font-mono font-bold text-ink-800 focus:outline-none focus:border-brand-700"
                />
              </div>

              {/* Activo */}
              <div className="space-y-1">
                <label htmlFor="event-asset" className="font-bold text-muted">Activo financiero</label>
                <div className="grid grid-cols-2 gap-2">
                  <select
 id="event-asset"                    value={formAsset}
                    onChange={(e) => setFormAsset(e.target.value)}
                    className="w-full bg-ink-50 border border-ink-300 rounded-xl p-2.5 text-xs font-mono font-bold text-ink-800 focus:outline-none focus:border-brand-700"
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
                      className="w-full bg-ink-50 border border-ink-300 rounded-xl p-2.5 text-xs font-mono font-bold text-ink-800 uppercase focus:outline-none focus:border-brand-700"
                    />
                  )}
                </div>
              </div>

              {/* Acción */}
              <div className="space-y-1">
                <label className="font-bold text-muted">Acción prevista</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(['comprar', 'vender', 'cobro', 'otro'] as const).map(act => (
                    <button
                      type="button"
                      key={act}
                      onClick={() => setFormAction(act)}
                      className={`p-2 rounded-xl font-bold uppercase text-[11px] transition-all cursor-pointer border ${
                        formAction === act
                          ? 'bg-brand-950 text-paper border-brand-950 shadow-xs'
                          : 'bg-ink-50 text-muted border-ink-200 hover:bg-ink-100'
                      }`}
                    >
                      {act === 'cobro' ? 'Cobro Renta' : act}
                    </button>
                  ))}
                </div>
              </div>

              {/* Nota opcional */}
              <div className="space-y-1">
                <label htmlFor="event-note" className="font-bold text-muted">Nota u observación (opcional)</label>
                <textarea
 id="event-note"                  rows={2}
                  value={formNote}
                  onChange={(e) => setFormNote(e.target.value)}
                  placeholder="Ej: Cobro de renta semestral para reinversión en GD30..."
                  className="w-full bg-ink-50 border border-ink-300 rounded-xl p-2.5 text-xs text-ink-800 focus:outline-none focus:border-brand-700"
                />
              </div>

              {/* Recordatorios multi-select */}
              <div className="space-y-2 pt-2 border-t border-ink-100">
                <label className="font-bold text-muted block">Recordatorios programados</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'same_day' as ReminderTiming, label: 'El mismo día' },
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
                            ? 'bg-brand-50 border-brand-300 text-brand-950 font-bold'
                            : 'bg-ink-50 border-ink-200 text-muted'
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
                          className="rounded text-brand-text focus:ring-brand-700 accent-brand-700 w-3.5 h-3.5"
                        />
                        <span>{rem.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 flex items-center justify-end gap-2 border-t border-ink-100">
                <button
                  type="button"
                  onClick={() => setShowEventModal(false)}
                  className="px-4 py-2 border border-ink-300 text-muted font-bold text-xs rounded-xl hover:bg-ink-100 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={savingEvents || !calendarReady}
                  className="px-5 py-2 disabled:opacity-50 bg-brand-950 text-paper font-extrabold text-xs rounded-xl hover:bg-brand-900 cursor-pointer shadow-xs"
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
          className="fixed inset-0 z-50 bg-ink-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setDeletingEventId(null)}
        >
          <div 
            ref={deleteRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Eliminar evento"
            className="bg-paper w-full max-w-sm rounded-3xl border border-ink-200 p-6 space-y-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-10 h-10 rounded-2xl bg-danger-100 text-danger-700 flex items-center justify-center">
              <AlertCircle className="w-5 h-5" />
            </div>

            <div>
              <h4 className="text-base font-extrabold text-ink-900">
                ¿Eliminar este evento propio?
              </h4>
              <p className="text-xs text-muted mt-1">
                Esta acción borrará el evento y sus recordatorios asociados.
              </p>
            </div>

            {syncError && <p role="alert" className="p-3 rounded-xl bg-danger-50 text-danger-800 text-xs">{syncError}</p>}
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                onClick={() => setDeletingEventId(null)}
                className="px-4 py-2 border border-ink-300 text-muted font-bold text-xs rounded-xl hover:bg-ink-100 cursor-pointer"
              >
                Cancelar
              </button>
              <button
                disabled={savingEvents}
                onClick={() => void handleDeleteCustomEvent(deletingEventId)}
                className="px-4 py-2 bg-danger-600 text-paper font-bold text-xs rounded-xl hover:bg-danger-700 cursor-pointer shadow-xs"
              >
                Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Day Simulation Test Bar (Discreet footer tool to verify day rollover and cache invalidation) */}
      <div className="pt-4 border-t border-ink-200 flex flex-wrap items-center justify-between gap-3 text-xs text-muted bg-ink-50/80 p-4 rounded-2xl">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-brand-800" />
          <span>
            Simulación de fecha AR: <strong>{nowAR.formattedSpanish}</strong> ({nowAR.isoDate})
          </span>
          {simulatedOffset !== 0 && (
            <span className="font-mono text-[10px] font-bold text-warning-text bg-warning-100 px-2 py-0.5 rounded-full border border-warning-300">
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
            className="px-3 py-1 bg-paper border border-ink-300 hover:bg-ink-100 rounded-lg text-xs font-bold text-muted cursor-pointer shadow-2xs"
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
              className="px-2.5 py-1 text-muted hover:text-ink-800 text-xs font-bold underline cursor-pointer"
            >
              Restablecer fecha real
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
