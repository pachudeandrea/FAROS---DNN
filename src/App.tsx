import { readNewsResponse } from './utils/newsResponse';
import { portfolioNewsScope } from './utils/newsCache';
import { getPortfolioAffectedAssetIds, getPortfolioNewsImpact } from './utils/portfolioNews';
import React, { useState, useMemo, useEffect, useCallback, useRef, lazy, Suspense } from 'react';
import { 
  Asset, 
  Portfolio, 
  NewsItem, 
  UserPreferences, 
  RelevanceType, 
  NewsImpact,
  AudioTrack,
  CalendarEvent,
  getQualitativeImpactLabel
} from './types';
import { 
  MOCK_ASSETS, 
  MOCK_PORTFOLIOS, 
  DEFAULT_PREFERENCES 
} from './data/mockData';
import { useAlerts } from './hooks/useAlerts';
import { NEWS_CLIENT_CACHE_PREFIX, newsClientCacheKey } from './utils/newsCache';
import { REAL_GROUNDED_NEWS } from './data/groundedRealNews';
import { readNewsSnapshot, findRecentNewsSnapshot, type NewsQueryState } from './utils/newsQuery';
import { ScreenBoundary } from './components/ScreenBoundary';
import { usePendingChanges } from './hooks/usePendingChanges';
import { VersionNotice } from './components/VersionNotice';
import { NotificationControls } from './components/NotificationControls';

// Components
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { FeedSummaryHero } from './components/FeedSummaryHero';
import { NewsCard } from './components/NewsCard';
import { MediaComparisonModal } from './components/MediaComparison';
import { NewsDetailModal } from './components/NewsDetailModal';
const FinancialCalendar = lazy(() => import('./components/FinancialCalendar').then(m => ({ default: m.FinancialCalendar })));
const PortfolioSettingsView = lazy(() => import('./components/PortfolioSettingsView').then(m => ({ default: m.PortfolioSettingsView })));
import { NotificationsModal } from './components/NotificationsModal';
import { AudioPlayerDrawer } from './components/AudioPlayerDrawer';
import { OnboardingModal } from './components/OnboardingModal';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LoginForm } from './components/LoginForm';
import { SignUpWizard } from './components/SignUpWizard';
const InteractiveTour = lazy(() => import('./components/InteractiveTour').then(m => ({ default: m.InteractiveTour })));
import { BrandLoading } from './components/BrandLoading';
import { BrandLogo } from './components/BrandLogo';
const AdminPanel = lazy(() => import('./components/admin/AdminPanel').then(m => ({ default: m.AdminPanel })));
import { UserAccount } from './types';
import { 
  audioController, 
  AudioControllerState, 
  calculateEstimatedDuration 
} from './utils/audioController';
import { generateDailySummaryScript, naturalizeScriptForSpeech } from './utils/dailySummaryGenerator';
import { getVerifiedCalendarEvents } from './utils/calendarGrounding';
import { getNowAR } from './utils/dateAR';
import { apiRequest, ApiError } from './utils/apiClient';

// Icons
import { Search, X, Bookmark, ArrowRight, ShieldCheck, Sparkles, FilterX, Compass } from 'lucide-react';

export default function App() {
  // Navigation: Exactly 3 clean screens
  const [currentTab, setCurrentTab] = useState<'feed' | 'calendar' | 'settings'>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab') === 'calendar' ? 'calendar' : 'feed');

  // Portfolios & Preferences
  const [portfolios, setPortfolios] = useState<Portfolio[]>(MOCK_PORTFOLIOS);
  const [activePortfolioId, setActivePortfolioId] = useState<string>(MOCK_PORTFOLIOS[0].id);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  // User Authentication & Session State
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [accountSaves, setAccountSaves] = useState(0);
  usePendingChanges(accountSaves > 0);
  const [accountError, setAccountError] = useState<string | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(true);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [showSignUpModal, setShowSignUpModal] = useState<boolean>(false);
  const alerts = useAlerts(currentUser, updated => {
    setPreferences(updated);
    setCurrentUser(previous => previous ? { ...previous, preferences: updated } : previous);
  });

  // Active news item for detail modal & audio drawer
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [audioState, setAudioState] = useState<AudioControllerState>(audioController.getState());
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  // Modals
  const [showNotifications, setShowNotifications] = useState<boolean>(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('alerts') === '1');
  const [showOnboarding, setShowOnboarding] = useState<boolean>(false);
  const [isTourActive, setIsTourActive] = useState<boolean>(false);
  const [showWelcomeOnboardingModal, setShowWelcomeOnboardingModal] = useState<boolean>(false);

  // Saved news state
  const [savedNewsIds, setSavedNewsIds] = useState<string[]>(['real-01', 'real-02']);

  // Feed filtering state
  const [isSearchExpanded, setIsSearchExpanded] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [relevanceTypeFilter, setRelevanceTypeFilter] = useState<'todas' | RelevanceType>('todas');
  const [impactFilter, setImpactFilter] = useState<'todos' | NewsImpact>('todos');
  const [assetFilter, setAssetFilter] = useState<string>('todos');
  const [showSavedOnly, setShowSavedOnly] = useState<boolean>(false);

  // Admin Panel view state synced with URL pathname /admin and hash #admin
  const [isAdminView, setIsAdminView] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.location.pathname === '/admin' || window.location.hash === '#admin';
    }
    return false;
  });

  // Sync URL changes (back button, address bar navigation)
  useEffect(() => {
    const handleUrlChange = () => {
      setIsAdminView(window.location.pathname === '/admin' || window.location.hash === '#admin');
    };
    window.addEventListener('popstate', handleUrlChange);
    window.addEventListener('hashchange', handleUrlChange);
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
      window.removeEventListener('hashchange', handleUrlChange);
    };
  }, []);

  const navigateToAdmin = useCallback(() => {
    try {
      window.history.pushState({}, '', '/admin');
    } catch {}
    setIsAdminView(true);
  }, []);

  const navigateBackToApp = useCallback(() => {
    try {
      window.history.pushState({}, '', '/');
    } catch {}
    setIsAdminView(false);
  }, []);

  // Admin status check (server verifies token/cookie, client provides instant UI cues)
  const isCurrentUserAdmin = useMemo(() => {
    if (currentUser?.isAdmin) return true;
    if (currentUser?.email && ['marudeandrea@gmail.com', 'pachudeandrea@gmail.com'].includes(currentUser.email.toLowerCase())) {
      return true;
    }
    return false;
  }, [currentUser]);

  // Non-blocking telemetry tracking helper
  const trackUsageEvent = useCallback((eventType: string, metadata?: Record<string, any>) => {
    try {
      const storedToken = localStorage.getItem('faros_session_token');
      fetch('/api/admin/track', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {})
        },
        body: JSON.stringify({
          eventType,
          metadata,
          userId: currentUser?.id,
          userEmail: currentUser?.email
        })
      }).catch(() => {});
    } catch {}
  }, [currentUser]);

  // Helper to get today's date in America/Argentina/Buenos_Aires dynamically
  const getArgentinaTodayKey = useCallback(() => {
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Argentina/Buenos_Aires',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }, []);

  // Helper to purge cache entries from previous days and older incompatible grouping formats
  const purgeOldClientCache = useCallback((todayKey: string) => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith('faros_news_')) {
          // Invalidate legacy unversioned caches and older days immediately
          if (!k.startsWith(NEWS_CLIENT_CACHE_PREFIX) || !k.includes(todayKey)) {
            keysToRemove.push(k);
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
  }, []);

  const [newsList, setNewsList] = useState<NewsItem[]>([]);
  const [queryState, setQueryState] = useState<NewsQueryState>({ status: 'idle', checkedAt: null });
  const [isLoadingNews, setIsLoadingNews] = useState(false);
  const newsRequest = useRef<AbortController | null>(null);
  const newsPortfolio = useRef('');
  const visibleNews = useRef<NewsItem[]>([]);
  useEffect(() => {
    visibleNews.current = newsList;
    setSelectedNews(current => current ? newsList.find(item => item.sources.some(source => current.sources.some(previous => previous.sourceUrl === source.sourceUrl))) || current : current);
  }, [newsList]);
  const [comparisonFirst, setComparisonFirst] = useState(false);
  const [pendingRemindersCount, setPendingRemindersCount] = useState<number>(0);

  const notifications = alerts.notifications;

  // Assets Map lookup
  const assetsMap = useMemo(() => {
    const map: Record<string, Asset> = {};
    [...MOCK_ASSETS, ...(portfolios.find(p => p.id === activePortfolioId)?.customAssets || [])].forEach(a => {
      map[a.id] = a;
      if (!map[a.symbol]) map[a.symbol] = a;
    });
    return map;
  }, [portfolios, activePortfolioId]);

  // Active Portfolio
  const activePortfolio = useMemo(() => {
    return portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
  }, [portfolios, activePortfolioId]);

  useEffect(() => {
    if (assetFilter !== 'todos' && !activePortfolio.assetIds.includes(assetFilter)) setAssetFilter('todos');
  }, [activePortfolio.assetIds, assetFilter]);

  // Central audio controller subscription
  useEffect(() => {
    return audioController.subscribe(setAudioState);
  }, []);

  // Fetch verified calendar events for active portfolio to ground the daily summary and calendar
  useEffect(() => {
    let active = true;
    getVerifiedCalendarEvents(activePortfolio.assetIds).then(events => {
      if (active) setCalendarEvents(events);
    });
    return () => { active = false; };
  }, [activePortfolio.id, activePortfolio.assetIds]);

  // Estimated duration calculated from the available summary script.
  const dailySummaryDurationText = useMemo(() => {
    try {
      const summary = generateDailySummaryScript(activePortfolio, newsList, calendarEvents, getNowAR());
      return summary.durationText;
    } catch {
      return '';
    }
  }, [activePortfolio, newsList, calendarEvents]);

  // Requirement 4: Background audio prefetch for the daily summary and top news items
  useEffect(() => {
    if (!newsList || newsList.length === 0) return;
    try {
      const summary = generateDailySummaryScript(activePortfolio, newsList, calendarEvents, getNowAR());
      const prefetchItems: Array<{ id?: string; text: string }> = [
        { id: `daily-summary-${activePortfolio.id}-${summary.timeSlot}`, text: summary.script }
      ];

      newsList.slice(0, 4).forEach(item => {
        const rawScript = item.audioScript 
          ? item.audioScript.replace(/^Resumen FAROS\.\s*/i, 'Resumen FAROS: ')
          : `${item.headline}. ${item.briefSummary}.`;
        prefetchItems.push({
          id: item.id,
          text: naturalizeScriptForSpeech(rawScript)
        });
      });

      audioController.prefetchScripts(prefetchItems);
    } catch {}
  }, [newsList, activePortfolio.id, calendarEvents]);

  // Tab switcher with instant audio cancellation
  const handleSelectTab = useCallback((tab: 'feed' | 'calendar' | 'settings') => {
    // CRITICAL: Switching tabs must instantly stop and clean up any ongoing audio
    audioController.stopAll('tab-switch');
    setCurrentTab(tab);
  }, []);

  // Fetch real grounded news from server pipeline with client cache per portfolio, date and hour
  const fetchPulseNews = useCallback(async (isManualRefresh = false) => {
    const todayKey = getArgentinaTodayKey();
    purgeOldClientCache(todayKey);

    let hourKey = `${todayKey}_${new Date().getHours()}`;
    try {
      const hourStr = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'America/Argentina/Buenos_Aires',
        hour: '2-digit',
        hour12: false
      }).format(new Date());
      hourKey = `${todayKey}_${hourStr}`;
    } catch {}

    const scope = `${activePortfolio.id}_${portfolioNewsScope(activePortfolio.assetIds, activePortfolio.profile, activePortfolio.assetPositions, activePortfolio.customAssets)}`;
    const cacheKey = newsClientCacheKey(scope, hourKey);

    newsRequest.current?.abort();
    const controller = new AbortController();
    newsRequest.current = controller;
    if (newsPortfolio.current !== scope) {
      newsPortfolio.current = scope;
      setNewsList([]);
      visibleNews.current = [];
      setQueryState({ status: 'idle', checkedAt: null });
    }
    if (!isManualRefresh) {
      try {
        const cached = readNewsSnapshot(localStorage.getItem(cacheKey));
        if (cached) {
          visibleNews.current = cached.news;
          setNewsList(cached.news);
          setQueryState({ status: 'cached', checkedAt: cached.checkedAt });
          setIsLoadingNews(false);
          return;
        }
      } catch {}
    }
    if (!visibleNews.current.length) {
      try {
        const recent = findRecentNewsSnapshot(localStorage, `${NEWS_CLIENT_CACHE_PREFIX}${scope}_`);
        if (recent) { visibleNews.current = recent.news; setNewsList(recent.news); setQueryState({ status: 'cached', checkedAt: recent.checkedAt }); }
      } catch {}
    }
    const retainPrevious = visibleNews.current.length > 0;
    setIsLoadingNews(true);
    setQueryState(previous => ({ ...previous, status: 'loading', error: undefined }));
    const timeout = setTimeout(() => controller.abort(), 60000);
    try {
      const response = await fetch('/api/news/pulse', {
        method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/x-ndjson' },
        body: JSON.stringify({ portfolioId: activePortfolio.id, tickers: activePortfolio.assetIds, customAssets: activePortfolio.customAssets, assetPositions: activePortfolio.assetPositions, profile: activePortfolio.profile, forceRefresh: isManualRefresh })
      });
      if (!response.ok) throw new Error('No se pudo completar la consulta.');
      const data = await readNewsResponse(response, partial => {
        if (newsRequest.current !== controller || controller.signal.aborted || retainPrevious) return;
        setNewsList(partial.news);
        setQueryState({ status: 'partial', checkedAt: partial.checkedAt || null, partial: true });
      });
      if (!Array.isArray(data.news)) throw new Error('La consulta no devolvió noticias válidas.');
      if (newsRequest.current !== controller || controller.signal.aborted) return;
      const checkedAt = typeof data.checkedAt === 'string' && Number.isFinite(Date.parse(data.checkedAt)) ? data.checkedAt : data.cached ? null : new Date().toISOString();
      setNewsList(data.news);
      setQueryState({ status: data.cached ? 'cached' : 'success', checkedAt });
      try { localStorage.setItem(cacheKey, JSON.stringify({ news: data.news, checkedAt })); } catch {}
    } catch {
      if (newsRequest.current === controller) setQueryState(previous => ({ ...previous, status: 'error' }));
    } finally {
      clearTimeout(timeout);
      if (newsRequest.current === controller) setIsLoadingNews(false);
    }
  }, [activePortfolio.id, activePortfolio.assetIds, activePortfolio.profile, activePortfolio.assetPositions, activePortfolio.customAssets, getArgentinaTodayKey, purgeOldClientCache]);

  useEffect(() => {
    if (isSessionLoading) return;
    fetchPulseNews(false);
    return () => newsRequest.current?.abort();
  }, [fetchPulseNews, isSessionLoading]);

  const handleSessionSuccess = useCallback((user: UserAccount, token?: string, isNewRegistration: boolean = false) => {
    setCurrentUser(user);
    try { if (token) localStorage.setItem('faros_session_token', token); } catch {}
    setAccountError(null);

    if (user.portfolio) {
      // Isolate view: user sees strictly their own portfolio
      setPortfolios([user.portfolio]);
      setActivePortfolioId(user.portfolio.id);
    }
    if (user.preferences) {
      setPreferences(user.preferences);
    }
    setIsSessionLoading(false);
    setShowLoginModal(false);
    setShowSignUpModal(false);

    if (isNewRegistration) {
      // Direct new user immediately to Mi Cartera (settings tab)
      setCurrentTab('settings');
      setShowWelcomeOnboardingModal(false);
    }
  }, []);

  // Session verification on mount
  useEffect(() => {
    let isMounted = true;
    async function checkSession() {
      try {
        // Remove old device-only account/password copies. Server verification
        // is the sole source of authenticated identity.
        try {
          localStorage.removeItem('faros_registered_accounts_vault_v1');
          localStorage.removeItem('faros_active_session_user');
        } catch {}
        const data = await apiRequest('/api/auth/me');
        if (data.authenticated && data.user && isMounted) handleSessionSuccess(data.user);
      } catch (error) {
        if (isMounted && error instanceof ApiError && error.status === 401) {
          try { localStorage.removeItem('faros_session_token'); } catch {}
        } else if (isMounted) {
          setAccountError(error instanceof Error ? error.message : 'No se pudo comprobar tu sesión.');
        }
      } finally {
        if (isMounted) {
          setIsSessionLoading(false);
        }
      }
    }
    checkSession();
    return () => { isMounted = false; };
  }, [handleSessionSuccess]);

  const clearSessionView = () => {
    audioController.stopAll('logout');
    try {
      localStorage.removeItem('faros_session_token');
      localStorage.removeItem('faros_active_session_user');
      localStorage.removeItem('faros_registered_accounts_vault_v1');
      localStorage.removeItem('faros_onboarding_draft');
    } catch {}
    setCurrentUser(null);
    setPortfolios(MOCK_PORTFOLIOS);
    setActivePortfolioId(MOCK_PORTFOLIOS[0].id);
    setPreferences(DEFAULT_PREFERENCES);
    setCurrentTab('feed');
    setAccountError(null);
  };

  const handleLogout = async () => {
    try {
      if (currentUser?.id !== 'usr_demo') {
        await alerts.disconnect().catch(() => {});
        await apiRequest('/api/auth/logout', { method: 'POST' });
      }
      clearSessionView();
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'No se pudo cerrar la sesión en el servidor.');
    }
  };

  const handleDeleteAccount = async () => {
    try {
      if (currentUser?.id !== 'usr_demo') {
        await alerts.disconnect().catch(() => {});
        await apiRequest('/api/auth/account', { method: 'DELETE' });
      }
      clearSessionView();
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'No se pudo eliminar la cuenta.');
    }
  };

  const handleExploreDemo = useCallback(() => {
    const demoUser: UserAccount = {
      id: 'usr_demo',
      name: 'Inversor Invitado',
      email: 'demo@faros.ar',
      timeZone: 'America/Argentina/Buenos_Aires',
      termsAccepted: true,
      profile: 'moderado',
      portfolio: MOCK_PORTFOLIOS[0],
      createdAt: new Date().toISOString()
    };
    handleSessionSuccess(demoUser);
  }, [handleSessionSuccess]);

  // Unread notifications count
  const unreadCount = useMemo(() => {
    return notifications.filter(n => !n.read).length;
  }, [notifications]);

  // Toggle Save News
  const handleToggleSave = (newsId: string) => {
    setSavedNewsIds(prev => {
      const isSaving = !prev.includes(newsId);
      trackUsageEvent('bookmark_saved', { newsId, action: isSaving ? 'saved' : 'unsaved' });
      return isSaving ? [...prev, newsId] : prev.filter(id => id !== newsId);
    });
  };

  // Play audio for an individual news item with real dynamic word-based duration
  const handlePlayNewsAudio = useCallback((news: NewsItem) => {
    trackUsageEvent('audio_listen', { newsId: news.id, title: news.headline, type: 'item' });
    const rawScript = news.audioScript 
      ? news.audioScript.replace(/^Resumen FAROS\.\s*/i, 'Resumen FAROS: ')
      : `${news.headline}. ${news.briefSummary}.`;

    const naturalScript = naturalizeScriptForSpeech(rawScript);
    const durationEst = calculateEstimatedDuration(naturalScript, 1.0);

    const track: AudioTrack = {
      id: news.id,
      title: news.headline,
      subtitle: 'Noticia en Audio',
      durationText: `${durationEst.formatted} min`,
      totalSeconds: durationEst.seconds,
      script: naturalScript,
    };

    audioController.playTrack(track);
  }, [trackUsageEvent]);

  // Play audio for "Resumen del día" (Global Daily Summary: STRICTLY 320-450 words, 2-3 mins)
  const handlePlayDailySummary = useCallback(() => {
    // If already playing daily summary, toggle pause/play
    if (audioState.isPlaying && audioState.currentTrack?.id.startsWith('daily-summary')) {
      audioController.togglePlay();
      return;
    }

    const summaryResult = generateDailySummaryScript(
      activePortfolio,
      newsList,
      calendarEvents,
      getNowAR()
    );

    const slotLabel = summaryResult.timeSlot === 'manana'
      ? 'Apertura'
      : summaryResult.timeSlot === 'mediodia'
      ? 'Mediodía'
      : 'Cierre';

    const track: AudioTrack = {
      id: `daily-summary-${activePortfolio.id}-${summaryResult.timeSlot}`,
      title: 'Resumen del día',
      subtitle: `Síntesis FAROS (${slotLabel})`,
      durationText: summaryResult.durationText,
      totalSeconds: summaryResult.durationSeconds,
      script: summaryResult.script,
    };

    trackUsageEvent('audio_listen', { newsId: `daily-summary-${summaryResult.timeSlot}`, title: 'Resumen del día', type: 'summary' });
    audioController.playTrack(track);
  }, [audioState.isPlaying, audioState.currentTrack, activePortfolio, newsList, calendarEvents, trackUsageEvent]);

  // Filtered News stream (based on verified grounded newsList)
  const filteredNews = useMemo(() => {
    return newsList.filter(item => {
      // 1. Saved filter
      if (showSavedOnly && !savedNewsIds.includes(item.id)) return false;

      // 2. Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const matchesHeadline = item.headline.toLowerCase().includes(query);
        const matchesSummary = item.briefSummary.toLowerCase().includes(query);
        const matchesAssets = getPortfolioAffectedAssetIds(item, activePortfolio.assetIds).some(aid => aid.toLowerCase().includes(query));
        if (!matchesHeadline && !matchesSummary && !matchesAssets) return false;
      }

      // 3. Relevance Type filter
      if (relevanceTypeFilter !== 'todas' && item.relevanceType !== relevanceTypeFilter) {
        return false;
      }

      // 4. Impact filter (computed dynamically based on Long/Short positions)
      if (impactFilter !== 'todos') {
        const effectiveImpact = getPortfolioNewsImpact(item, activePortfolio);
        const itemNorm = 
          (effectiveImpact === 'favorable' || effectiveImpact === 'positivo') ? 'favorable' :
          (effectiveImpact === 'alerta' || effectiveImpact === 'negativo') ? 'alerta' : 'neutral';
        const filterNorm = 
          (impactFilter === 'favorable' || impactFilter === 'positivo') ? 'favorable' :
          (impactFilter === 'alerta' || impactFilter === 'negativo') ? 'alerta' : 'neutral';
        if (itemNorm !== filterNorm) {
          return false;
        }
      }


      // 5. Specific Asset filter
      if (assetFilter !== 'todos' && !item.affectedAssetIds.includes(assetFilter)) {
        return false;
      }

      // 6. User preferences check (if disabled in settings)
      if (!preferences.enabledRelevanceTypes.includes(item.relevanceType)) {
        return false;
      }

      return true;
    }).sort((a, b) => {
      // Prioritize news touching active portfolio assets
      const aImpactCount = a.affectedAssetIds.filter(aid => activePortfolio.assetIds.includes(aid)).length;
      const bImpactCount = b.affectedAssetIds.filter(aid => activePortfolio.assetIds.includes(aid)).length;
      if (aImpactCount !== bImpactCount) return bImpactCount - aImpactCount;

      // Then by user prioritized topics
      const aTopicMatch = preferences.prioritizedTopics.includes(a.topicCategory) ? 1 : 0;
      const bTopicMatch = preferences.prioritizedTopics.includes(b.topicCategory) ? 1 : 0;
      if (aTopicMatch !== bTopicMatch) return bTopicMatch - aTopicMatch;

      return 0;
    });
  }, [
    newsList,
    activePortfolio, 
    searchQuery, 
    relevanceTypeFilter, 
    impactFilter, 
    assetFilter,
    showSavedOnly, 
    savedNewsIds, 
    preferences
  ]);

  // Only confirm account changes after PostgreSQL acknowledges them.
  const handleSavePortfolioSettings = async (updated: Portfolio) => {
    setAccountSaves(count => count + 1);
    try {
      setAccountError(null);
      if (currentUser && currentUser.id !== 'usr_demo') {
        const data = await apiRequest('/api/auth/user', { method: 'PUT', body: JSON.stringify({ portfolio: updated, profile: updated.profile }) });
        setCurrentUser(data.user);
        setPortfolios([data.user.portfolio]);
      } else {
        setPortfolios(prev => prev.map(p => p.id === updated.id ? updated : p));
      }
      try {
        for (const key of Object.keys(localStorage)) if (key.startsWith(NEWS_CLIENT_CACHE_PREFIX + updated.id + '_')) localStorage.removeItem(key);
      } catch {}
      return true;
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'No se pudo guardar la cartera.');
      return false;
    } finally { setAccountSaves(count => count - 1); }
  };

  const handleSavePreferences = async (updated: UserPreferences) => {
    setAccountSaves(count => count + 1);
    try {
      setAccountError(null);
      if (currentUser && currentUser.id !== 'usr_demo') {
        const data = await apiRequest('/api/auth/user', { method: 'PUT', body: JSON.stringify({ preferences: updated }) });
        setCurrentUser(data.user);
        setPreferences(data.user.preferences);
      } else {
        setPreferences(updated);
      }
      return true;
    } catch (error) {
      setAccountError(error instanceof Error ? error.message : 'No se pudieron guardar las preferencias.');
      return false;
    } finally { setAccountSaves(count => count - 1); }
  };

  // Toggle impact filter (toggles off if already active)
  const handleToggleImpactFilter = (impact: 'favorable' | 'alerta' | 'neutral') => {
    setImpactFilter(prev => {
      const isCurrentlyActive = 
        (impact === 'favorable' && (prev === 'favorable' || prev === 'positivo')) ||
        (impact === 'alerta' && (prev === 'alerta' || prev === 'negativo')) ||
        (impact === 'neutral' && (prev === 'neutral' || prev === 'neutro'));
      const next = isCurrentlyActive ? 'todos' : impact;
      trackUsageEvent('filter_applied', { filter: 'impact', value: next });
      return next;
    });

    // Smooth scroll down to classified news section so user sees the filtered list immediately
    const section = document.getElementById('news-feed-section');
    if (section) {
      section.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const handleToggleAssetFilter = (symbol: string) => {
    setAssetFilter(previous => previous === symbol ? 'todos' : symbol);
    document.getElementById('news-feed-section')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  // Session hydration loading state
  if (isSessionLoading) {
    return (
      <div className="min-h-screen bg-ink-950 text-paper flex flex-col items-center justify-center p-4 select-none">
        <div className="w-14 h-14 rounded-2xl bg-brand-950 border border-brand-800/80 flex items-center justify-center mb-4 shadow-xl shadow-brand-950/50">
          <BrandLogo size="lg" tone="dark" showContainer={false} className="w-8 h-8 text-paper" />
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-brand-300">
          <Sparkles className="w-4 h-4 text-brand-text animate-spin" />
          <span>Iniciando FAROS...</span>
        </div>
      </div>
    );
  }

  // Admin View: If /admin URL or state is active, render AdminPanel directly
  if (isAdminView) {
    return (
      <ScreenBoundary><Suspense fallback={<BrandLoading>Cargando administración…</BrandLoading>}><AdminPanel
        onBackToApp={navigateBackToApp}
        currentUserEmail={currentUser?.email}
      /></Suspense></ScreenBoundary>
    );
  }

  // Unauthenticated Welcome and Onboarding Gate
  if (!currentUser) {
    return (
      <>
        <VersionNotice />
        {accountError && <p role="alert" className="fixed bottom-4 left-4 right-4 z-40 mx-auto max-w-xl rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{accountError}</p>}
        <WelcomeScreen
          onOpenSignUp={() => setShowSignUpModal(true)}
          onOpenLogin={() => setShowLoginModal(true)}
          onExploreDemo={handleExploreDemo}
        />

        {showLoginModal && (
          <LoginForm
            isOpen={showLoginModal}
            onClose={() => setShowLoginModal(false)}
            onSuccess={handleSessionSuccess}
            onSwitchToSignUp={() => {
              setShowLoginModal(false);
              setShowSignUpModal(true);
            }}
          />
        )}

        {showSignUpModal && (
          <SignUpWizard
            isOpen={showSignUpModal}
            onClose={() => setShowSignUpModal(false)}
            onSuccess={handleSessionSuccess}
            onSwitchToLogin={() => {
              setShowSignUpModal(false);
              setShowLoginModal(true);
            }}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-dvh min-w-0 bg-ink-50 text-ink-900 flex flex-col font-sans antialiased">
      {/* Top Header adhering to 3-zone contract with 3 tabs */}
      <Header
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        unreadNotificationsCount={unreadCount}
        onOpenNotifications={() => setShowNotifications(true)}
        portfolioName={activePortfolio.name}
        pendingRemindersCount={pendingRemindersCount}
        onStartTour={() => setIsTourActive(true)}
        isAdmin={isCurrentUserAdmin}
        onOpenAdmin={navigateToAdmin}
        onLogout={handleLogout}
      />

      <VersionNotice />
      {/* Main View Area */}
      <main className="flex-1 min-w-0 max-w-5xl w-full mx-auto px-3 sm:px-6 py-4 sm:py-6 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-16">
        {accountError && <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-700">{accountError}</p>}
        {alerts.message && !alerts.showPrompt && <p role="status" className="mb-4 rounded-xl border border-brand-200 bg-brand-50 p-3 text-sm text-brand-900">{alerts.message}</p>}
        {alerts.error && !alerts.showPrompt && <p role="alert" className="mb-4 rounded-xl border border-danger-200 bg-danger-50 p-3 text-sm text-danger-800">{alerts.error}</p>}
        {alerts.showPrompt && currentTab === 'feed' && <section className="mb-5 p-4 sm:p-5 rounded-2xl bg-paper border border-brand-200 shadow-sm"><NotificationControls alerts={alerts} question /></section>}
        <ScreenBoundary key={currentTab}><Suspense fallback={<BrandLoading>Cargando pantalla…</BrandLoading>}>
        {/* PANTALLA 1: INICIO (FEED) */}
        {currentTab === 'feed' && (
          <div className="space-y-8">
            {/* In-App Executive Dashboard Card */}
            <FeedSummaryHero
              query={queryState}
              portfolio={activePortfolio}
              newsList={newsList}
              assetsMap={assetsMap}
              onPlayAudioBrief={handlePlayDailySummary}
              activeAssetFilter={assetFilter}
              onFilterByAsset={handleToggleAssetFilter}
              activeImpactFilter={impactFilter}
              onToggleImpactFilter={handleToggleImpactFilter}
              isLoadingNews={isLoadingNews}
              onRefreshNews={() => fetchPulseNews(true)}
              dailySummaryDurationText={dailySummaryDurationText}
              isPlayingDailySummary={audioState.isPlaying && !!audioState.currentTrack?.id?.startsWith('daily-summary')}
            />

            {/* Bottom: Classified News Section */}
            <section id="news-feed-section" data-tour="feed-news-section" className="space-y-3 pt-2">
              {/* Natural Document Flow Header: Title, Description, Search, Saved button */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 data-tour="feed-title" className="text-xl sm:text-2xl font-bold text-ink-900 tracking-tight">
                    Noticias Clasificadas
                  </h3>
                  <p className="text-xs sm:text-sm text-muted mt-0.5">
                    Información filtrada para tu cartera con análisis de impacto directo.
                  </p>
                </div>

                {/* Search Icon & Saved Toggle in natural flow */}
                <div className="flex min-w-0 flex-wrap items-center gap-2">
                  {/* Expandable Search Input */}
                  <div className="flex items-center">
                    {isSearchExpanded ? (
                      <div className="flex min-w-0 max-w-full items-center gap-1.5 bg-paper border border-ink-300 rounded-xl px-3 py-1.5 shadow-xs animate-in fade-in duration-150">
                        <Search className="w-4 h-4 text-muted shrink-0" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Buscar activo o palabra clave..."
                          autoFocus
                          className="text-xs sm:text-sm text-ink-800 focus:outline-none min-w-0 w-36 sm:w-56 bg-transparent"
                        />
                        <button
                          onClick={() => {
                            setSearchQuery('');
                            setIsSearchExpanded(false);
                          }}
                          className="p-0.5 text-muted hover:text-muted cursor-pointer"
                          aria-label="Cerrar búsqueda"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsSearchExpanded(true)}
                        className="p-2 rounded-xl bg-paper border border-ink-200 text-muted hover:text-ink-900 hover:bg-ink-100 shadow-2xs transition-colors cursor-pointer"
                        title="Buscar en noticias"
                        aria-label="Buscar"
                      >
                        <Search className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Saved news toggle */}
                  <button
                    onClick={() => setShowSavedOnly(!showSavedOnly)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs sm:text-sm font-bold transition-colors cursor-pointer ${
                      showSavedOnly
                        ? 'bg-brand-950 text-paper'
                        : 'bg-paper border border-ink-200 text-muted hover:bg-ink-50 shadow-2xs'
                    }`}
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Guardadas ({savedNewsIds.length})</span>
                  </button>
                </div>
              </div>

              {/* SLIM STICKY FILTER BAR: Minimal height (~46px) so it never obstructs reading */}
              <div data-tour="feed-filters" className="sticky top-16 z-20 bg-paper/95 backdrop-blur-md py-2 px-3 sm:px-4 rounded-2xl border border-ink-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                {/* Category Pills (horizontal scroll on mobile) */}
                <div className="flex min-w-0 items-center gap-1 overflow-x-auto max-w-full text-xs py-0.5 scrollbar-none">
                  {[
                    { id: 'todas', label: 'Todas' },
                    { id: 'impacto_precio', label: 'Impacto en precio' },
                    { id: 'valoracion_mercado', label: 'Valoración' },
                    { id: 'ruido', label: 'Ruido' },
                    { id: 'contexto_macro', label: 'Macro' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setRelevanceTypeFilter(tab.id as any)}
                      className={`shrink-0 px-3 py-1.5 font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                        relevanceTypeFilter === tab.id
                          ? 'bg-brand-950 text-paper shadow-xs'
                          : 'text-muted hover:text-ink-900 hover:bg-ink-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Sub-filters: Asset dropdown & Effect pills */}
                <div className="flex min-w-0 flex-wrap items-center justify-between md:justify-end gap-2 text-xs">
                  {/* Asset selector */}
                  <select
                    value={assetFilter}
                    onChange={(e) => setAssetFilter(e.target.value)}
                    className="text-xs font-bold bg-ink-50 border border-ink-200 rounded-xl px-2.5 py-1 text-ink-800 focus:outline-none focus:border-brand-800 cursor-pointer"
                  >
                    <option value="todos">Todos los activos</option>
                    {activePortfolio.assetIds.map(aid => (
                      <option key={aid} value={aid}>{aid}</option>
                    ))}
                  </select>

                  {/* Qualitative Impact Pills: Verde=Favorable, Rojo=Alerta, Gris=Neutral */}
                  <div className="flex min-w-0 flex-wrap items-center gap-1">
                    {[
                      { 
                        id: 'todos', 
                        label: 'Todos',
                        activeClass: 'bg-ink-900 text-paper shadow-xs border border-ink-900',
                        inactiveClass: 'text-muted hover:text-ink-900 hover:bg-ink-100'
                      },
                      { 
                        id: 'favorable', 
                        label: 'Favorables',
                        activeClass: 'bg-brand-600 text-paper shadow-xs border border-brand-600 ring-2 ring-brand-500/20',
                        inactiveClass: 'text-brand-800 hover:text-brand-950 hover:bg-brand-50'
                      },
                      { 
                        id: 'alerta', 
                        label: 'Alertas',
                        activeClass: 'bg-danger-600 text-paper shadow-xs border border-danger-600 ring-2 ring-danger-500/20',
                        inactiveClass: 'text-danger-800 hover:text-danger-950 hover:bg-danger-50'
                      },
                      { 
                        id: 'neutral', 
                        label: 'Neutrales',
                        activeClass: 'bg-ink-600 text-paper shadow-xs border border-ink-600 ring-2 ring-ink-400/20',
                        inactiveClass: 'text-muted hover:text-ink-900 hover:bg-ink-100'
                      },
                    ].map(imp => {
                      const isActive = 
                        imp.id === 'todos' 
                          ? impactFilter === 'todos'
                          : (imp.id === 'favorable' && (impactFilter === 'favorable' || impactFilter === 'positivo')) ||
                            (imp.id === 'alerta' && (impactFilter === 'alerta' || impactFilter === 'negativo')) ||
                            (imp.id === 'neutral' && (impactFilter === 'neutral' || impactFilter === 'neutro'));
                      return (
                        <button
                          key={imp.id}
                          onClick={() => {
                            if (imp.id === 'todos') {
                              setImpactFilter('todos');
                            } else {
                              setImpactFilter(prev => {
                                const isMatch = 
                                  (imp.id === 'favorable' && (prev === 'favorable' || prev === 'positivo')) ||
                                  (imp.id === 'alerta' && (prev === 'alerta' || prev === 'negativo')) ||
                                  (imp.id === 'neutral' && (prev === 'neutral' || prev === 'neutro'));
                                return isMatch ? 'todos' : (imp.id as any);
                              });
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            isActive ? imp.activeClass : imp.inactiveClass
                          }`}
                          title={isActive && imp.id !== 'todos' ? `Quitar filtro de ${imp.label}` : `Filtrar por ${imp.label}`}
                        >
                          {imp.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Active Filter Indicator Banner: Verde=Favorable, Rojo=Alerta, Gris=Neutral */}
              {impactFilter !== 'todos' && (() => {
                const isFav = impactFilter === 'favorable' || impactFilter === 'positivo';
                const isAle = impactFilter === 'alerta' || impactFilter === 'negativo';
                
                const theme = isFav
                  ? {
                      container: 'bg-brand-50/95 border-brand-300 text-brand-950 shadow-2xs ring-1 ring-brand-500/20',
                      dot: 'bg-brand-600',
                      badge: 'bg-brand-200/90 text-brand-950 border border-brand-300',
                      button: 'text-brand-950 hover:bg-brand-100 border-brand-300 bg-paper/95'
                    }
                  : isAle
                  ? {
                      container: 'bg-danger-50/95 border-danger-300 text-danger-950 shadow-2xs ring-1 ring-danger-500/20',
                      dot: 'bg-danger-600',
                      badge: 'bg-danger-200/90 text-danger-950 border border-danger-300',
                      button: 'text-danger-950 hover:bg-danger-100 border-danger-300 bg-paper/95'
                    }
                  : {
                      container: 'bg-ink-100/95 border-ink-300 text-ink-900 shadow-2xs ring-1 ring-ink-400/20',
                      dot: 'bg-ink-600',
                      badge: 'bg-ink-200 text-ink-900 border border-ink-300',
                      button: 'text-ink-900 hover:bg-ink-200 border-ink-300 bg-paper/95'
                    };

                return (
                  <div className={`flex items-center justify-between border rounded-2xl px-4 py-2.5 text-xs shadow-2xs animate-in fade-in duration-200 ${theme.container}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${theme.dot}`} />
                      <span className="font-semibold">
                        Filtrando por impacto: <strong className="font-bold">{getQualitativeImpactLabel(impactFilter)}</strong>
                      </span>
                      {assetFilter !== 'todos' && (
                        <span className="text-[11px] font-mono bg-paper border border-ink-300 px-2 py-0.5 rounded-md font-bold text-ink-800">
                          {assetFilter}
                        </span>
                      )}
                      <span className={`font-mono text-[11px] px-2 py-0.5 rounded-full font-bold ${theme.badge}`}>
                        {filteredNews.length} {filteredNews.length === 1 ? 'noticia' : 'noticias'}
                      </span>
                    </div>
                    <button
                      onClick={() => setImpactFilter('todos')}
                      className={`inline-flex items-center gap-1 text-[11px] font-bold border px-2.5 py-1 rounded-xl transition-all cursor-pointer shadow-2xs active:scale-95 ${theme.button}`}
                      title="Quitar filtro de impacto"
                    >
                      <X className="w-3 h-3" />
                      <span>Quitar filtro</span>
                    </button>
                  </div>
                );
              })()}

              {/* News Stream List or Empty State with smooth transitions */}
              {filteredNews.length === 0 ? (() => {
                const isFav = impactFilter === 'favorable' || impactFilter === 'positivo';
                const isAle = impactFilter === 'alerta' || impactFilter === 'negativo';
                const resetBtnClass = isFav 
                  ? 'bg-brand-600 hover:bg-brand-700 text-paper'
                  : isAle 
                  ? 'bg-danger-600 hover:bg-danger-700 text-paper'
                  : 'bg-ink-700 hover:bg-ink-800 text-paper';
                const iconBoxClass = isFav 
                  ? 'bg-brand-100 text-brand-text'
                  : isAle 
                  ? 'bg-danger-100 text-danger-700'
                  : 'bg-ink-100 text-muted';

                return (
                  <div className="bg-paper rounded-3xl border border-ink-200/90 p-8 sm:p-12 text-center shadow-xs transition-all duration-300 animate-in fade-in">
                    <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${iconBoxClass}`}>
                      <BrandLogo size="lg" />
                    </div>
                    <h4 className="text-lg font-bold text-ink-900 tracking-tight">
                      {isLoadingNews ? 'Buscando noticias…' : queryState.status === 'error' ? 'No pudimos actualizar las noticias' : newsList.length ? 'No hay noticias con estos filtros' : 'Sin novedades verificadas'}
                    </h4>
                    <p className="text-xs sm:text-sm text-muted max-w-md mx-auto mt-2 leading-relaxed">
                      {impactFilter !== 'todos' && assetFilter !== 'todos'
                        ? `No se encontraron noticias clasificadas como "${getQualitativeImpactLabel(impactFilter)}" para el activo ${assetFilter}.`
                        : impactFilter !== 'todos'
                        ? `No hay noticias recientes clasificadas con impacto "${getQualitativeImpactLabel(impactFilter)}" en tu cartera.`
                        : searchQuery || assetFilter !== 'todos' || relevanceTypeFilter !== 'todas' || showSavedOnly
                        ? 'No se encontraron noticias que coincidan con los filtros seleccionados.'
                        : isLoadingNews ? 'Estamos consultando publicaciones. Podés seguir navegando.' : queryState.status === 'error' ? 'La consulta falló. Intentá actualizar nuevamente; esto no indica ausencia de riesgos.' : 'No hay publicaciones verificadas disponibles en esta consulta. Esto no indica ausencia de riesgos.'}
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-2.5 mt-5">
                      {impactFilter !== 'todos' && (
                        <button
                          onClick={() => setImpactFilter('todos')}
                          className={`inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer shadow-xs active:scale-95 ${resetBtnClass}`}
                        >
                          <span>Mostrar todos los impactos</span>
                        </button>
                      )}
                      {(assetFilter !== 'todos' || relevanceTypeFilter !== 'todas' || searchQuery || showSavedOnly) && (
                        <button
                          onClick={() => {
                            setImpactFilter('todos');
                            setAssetFilter('todos');
                            setRelevanceTypeFilter('todas');
                            setSearchQuery('');
                            setShowSavedOnly(false);
                          }}
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink-100 text-muted hover:bg-ink-200 text-xs font-bold rounded-xl transition-colors cursor-pointer active:scale-95"
                        >
                          <span>Restablecer todos los filtros</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div className="space-y-4 pt-2 text-muted transition-all duration-300 animate-in fade-in">
                  {filteredNews.map((news) => (
                    <NewsCard
                      key={news.id}
                      news={news}
                      assetsMap={assetsMap}
                      onSelect={(n) => { setComparisonFirst(false); setSelectedNews(n); }}
                      onCompare={(n) => { setComparisonFirst(true); setSelectedNews(n); }}
                      onPlayAudio={handlePlayNewsAudio}
                      onToggleSave={handleToggleSave}
                      isSaved={savedNewsIds.includes(news.id)}
                      portfolioAssetIds={activePortfolio.assetIds}
                      assetPositions={activePortfolio.assetPositions}
                    />
                  ))}
                </div>
              )}
            </section>
          </div>
        )}

        {/* PANTALLA 2: CALENDARIO */}
        {currentTab === 'calendar' && (
          <FinancialCalendar 
            key={currentUser.id}
            accountId={currentUser.id === 'usr_demo' ? undefined : currentUser.id}
            notificationsControl={currentUser.id === 'usr_demo' ? <p className="text-xs text-muted">Iniciá sesión con una cuenta personal para recibir alertas en tus dispositivos.</p> : <NotificationControls alerts={alerts} />}
            portfolioId={activePortfolio.id}
            portfolioName={activePortfolio.name}
            userAssetSymbols={activePortfolio.assetIds}
            assetsMap={assetsMap}
            onPendingRemindersChange={setPendingRemindersCount}
          />
        )}

        {/* PANTALLA 3: CONFIGURACIÓN */}
        {currentTab === 'settings' && (
          <PortfolioSettingsView
            portfolio={activePortfolio}
            portfolios={portfolios}
            onSelectPortfolio={(p) => setActivePortfolioId(p.id)}
            onSavePortfolio={handleSavePortfolioSettings}
            onViewNews={() => handleSelectTab('feed')}
            preferences={preferences}
            onSavePreferences={handleSavePreferences}
            onOpenCreateNew={() => setShowOnboarding(true)}
            currentUser={currentUser}
            notificationsControl={currentUser.id === 'usr_demo' ? <p className="text-xs text-muted">Iniciá sesión con una cuenta personal para recibir alertas en tus dispositivos.</p> : <NotificationControls alerts={alerts} />}
            onAccountSaved={updated => setCurrentUser(previous => previous ? { ...previous, alyc: updated.alyc } : previous)}
            onRecoveryKeySaved={updated => setCurrentUser(previous => previous?.id === updated.id ? { ...previous, hasRecoveryKey: updated.hasRecoveryKey } : previous)}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            onStartTour={() => setIsTourActive(true)}
            onOpenAdmin={isCurrentUserAdmin ? navigateToAdmin : undefined}
          />
        )}
        </Suspense></ScreenBoundary>
      </main>

      {/* Rocket Money-Style Contrast Bottom Foundation (Deep Emerald) */}
      <footer className="mt-auto bg-brand-950 text-paper pt-10 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-12 border-t border-brand-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-brand-900/80">
            {/* Brand in footer */}
            <div className="flex items-center gap-3">
              <BrandLogo size="xl" tone="dark" variant="full" />
              <div>
                <span className="sr-only">Faros</span>
                <p className="text-xs text-brand-300">
                  La plataforma de mercado que trabaja para tu cartera.
                </p>
              </div>
            </div>

            {/* Quick footer navigation */}
            <div className="flex flex-wrap items-center justify-center gap-3 sm:gap-6 text-sm text-brand-200 font-semibold">
              <button onClick={() => setCurrentTab('feed')} className="hover:text-paper transition-colors cursor-pointer">
                Noticias
              </button>
              <button onClick={() => setCurrentTab('calendar')} className="hover:text-paper transition-colors cursor-pointer">
                Calendario
              </button>
              <button onClick={() => setCurrentTab('settings')} className="hover:text-paper transition-colors cursor-pointer">
                Mi cartera
              </button>
              <button onClick={() => setShowOnboarding(true)} className="hover:text-paper transition-colors cursor-pointer">
                Nueva Cartera
              </button>
            </div>
          </div>

          {/* Legal Notice */}
          <div className="pt-6 text-center text-xs text-brand-300/80 space-y-1">
            <p className="font-semibold text-brand-100">
              FAROS brinda información. No constituye asesoramiento financiero ni recomendación de inversión.
            </p>
            <p className="text-[11px] text-brand-text/60">
              © 2026 FAROS Intelligence. Todos los derechos reservados. Datos y coberturas de ejemplo con fines ilustrativos.
            </p>
          </div>
        </div>
      </footer>

      {/* Persistent Audio Player Drawer */}
      <AudioPlayerDrawer
        onClose={() => audioController.stopAll('drawer-close')}
        isModalOpen={!!selectedNews || !!showLoginModal || !!showSignUpModal || showNotifications || showOnboarding || isTourActive}
      />

      {/* Mobile Bottom Navigation (3 Tabs) */}
      <BottomNav
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
      />

      {/* MODALS */}
      {/* 1. News Detail View */}
      {selectedNews && (comparisonFirst ? <MediaComparisonModal news={selectedNews} onClose={() => setSelectedNews(null)} onReadImpact={() => setComparisonFirst(false)} /> :
        <NewsDetailModal
          news={selectedNews}
          onClose={() => {
            audioController.stopAll('news-modal-closed');
            setSelectedNews(null);
          }}
          assetsMap={assetsMap}
          onPlayAudio={handlePlayNewsAudio}
          portfolio={activePortfolio}
          assetPositions={activePortfolio.assetPositions}
          isAudioActive={audioState.isPlaying}
          activeTrackId={audioState.currentTrack?.id}
        />
      )}

      {/* 2. Notifications Modal */}
      <NotificationsModal
        isOpen={showNotifications}
        onClose={() => setShowNotifications(false)}
        notifications={notifications}
        onMarkAllAsRead={() => void alerts.markRead()}
        onSelectNotification={notification => {
          if (notification.calendarEventId) { handleSelectTab('calendar'); return; }
          const target = newsList.find(item => notification.sourceUrl ? item.sources.some(source => source.sourceUrl === notification.sourceUrl) : item.id === notification.newsId && item.headline === notification.title);
          if (target) setSelectedNews(target);
          else if (notification.sourceUrl) window.open(notification.sourceUrl, '_blank', 'noopener,noreferrer');
        }}
      />

      {/* 3. Onboarding Modal with Progress Bar */}
      {showOnboarding && (
        <OnboardingModal
          isOpen={showOnboarding}
          onComplete={(newP, allP) => {
            setPortfolios(allP);
            setActivePortfolioId(newP.id);
            setShowOnboarding(false);
            setCurrentTab('feed');
          }}
          onClose={() => setShowOnboarding(false)}
        />
      )}

      {/* 4. Full Sign Up Wizard */}
      {showSignUpModal && (
        <SignUpWizard
          isOpen={showSignUpModal}
          onClose={() => setShowSignUpModal(false)}
          onSuccess={handleSessionSuccess}
          onSwitchToLogin={() => {
            setShowSignUpModal(false);
            setShowLoginModal(true);
          }}
        />
      )}

      {/* 5. Login Modal */}
      {showLoginModal && (
        <LoginForm
          isOpen={showLoginModal}
          onClose={() => setShowLoginModal(false)}
          onSuccess={handleSessionSuccess}
          onSwitchToSignUp={() => {
            setShowLoginModal(false);
            setShowSignUpModal(true);
          }}
        />
      )}

      {/* 6. Initial Welcome Onboarding Modal for New Registrations */}
      {showWelcomeOnboardingModal && (
        <div className="fixed inset-0 z-50 bg-ink-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-paper rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-ink-100 text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-brand-950 text-paper flex items-center justify-center mx-auto shadow-md">
              <BrandLogo size="lg" tone="dark" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-bold text-ink-900 tracking-tight">
                ¡Bienvenido a FAROS!
              </h3>
              <p className="text-sm text-muted leading-relaxed">
                Te vamos a mostrar cómo funciona la plataforma. No necesitás configurar todo ahora: podés agregar tus inversiones y personalizar tus preferencias cuando quieras.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setShowWelcomeOnboardingModal(false);
                  setIsTourActive(true);
                }}
                className="w-full sm:w-auto px-6 py-3.5 bg-brand-950 hover:bg-brand-900 text-paper font-extrabold rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer text-sm"
              >
                Comenzar recorrido
              </button>
              <button
                type="button"
                onClick={() => setShowWelcomeOnboardingModal(false)}
                className="w-full sm:w-auto px-6 py-3.5 bg-ink-100 hover:bg-ink-200 text-muted font-bold rounded-2xl transition-all cursor-pointer text-sm"
              >
                Explorar por mi cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Comprehensive 3-Stage Guided Interactive Tour (15 Steps) */}
      {isTourActive && <ScreenBoundary><Suspense fallback={<BrandLoading>Cargando guía…</BrandLoading>}><InteractiveTour
        isActive={isTourActive}
        onClose={() => setIsTourActive(false)}
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onOpenNewsDetail={(item) => setSelectedNews(item)}
        sampleNews={newsList[0] || REAL_GROUNDED_NEWS[0]}
      /></Suspense></ScreenBoundary>}
    </div>
  );
}
