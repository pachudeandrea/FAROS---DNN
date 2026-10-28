import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { 
  Asset, 
  Portfolio, 
  NewsItem, 
  UserPreferences, 
  RelevanceType, 
  NewsImpact,
  AudioTrack,
  CalendarEvent,
  getQualitativeImpactLabel,
  getEffectiveImpactForPortfolio
} from './types';
import { 
  MOCK_ASSETS, 
  MOCK_PORTFOLIOS, 
  DEFAULT_PREFERENCES 
} from './data/mockData';
import { REAL_GROUNDED_NEWS } from './data/groundedRealNews';

// Components
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { FeedSummaryHero } from './components/FeedSummaryHero';
import { NewsCard } from './components/NewsCard';
import { NewsDetailModal } from './components/NewsDetailModal';
import { FinancialCalendar } from './components/FinancialCalendar';
import { PortfolioSettingsView } from './components/PortfolioSettingsView';
import { NotificationsModal } from './components/NotificationsModal';
import { AudioPlayerDrawer } from './components/AudioPlayerDrawer';
import { OnboardingModal } from './components/OnboardingModal';
import { WelcomeScreen } from './components/WelcomeScreen';
import { LoginForm } from './components/LoginForm';
import { SignUpWizard } from './components/SignUpWizard';
import { InteractiveTour } from './components/InteractiveTour';
import { LighthouseLogo } from './components/LighthouseLogo';
import { AdminPanel } from './components/admin/AdminPanel';
import { UserAccount } from './types';
import { 
  audioController, 
  AudioControllerState, 
  calculateEstimatedDuration 
} from './utils/audioController';
import { generateDailySummaryScript, naturalizeScriptForSpeech } from './utils/dailySummaryGenerator';
import { getVerifiedCalendarEvents } from './utils/calendarGrounding';
import { getNowAR } from './utils/dateAR';
import { saveUserToVault, clearActiveLocalSession } from './utils/accountVault';

// Icons
import { Search, X, Bookmark, ArrowRight, ShieldCheck, Sparkles, FilterX, Compass } from 'lucide-react';

export default function App() {
  // Navigation: Exactly 3 clean screens
  const [currentTab, setCurrentTab] = useState<'feed' | 'calendar' | 'settings'>('feed');

  // Portfolios & Preferences
  const [portfolios, setPortfolios] = useState<Portfolio[]>(MOCK_PORTFOLIOS);
  const [activePortfolioId, setActivePortfolioId] = useState<string>(MOCK_PORTFOLIOS[0].id);
  const [preferences, setPreferences] = useState<UserPreferences>(DEFAULT_PREFERENCES);

  // User Authentication & Session State
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [isSessionLoading, setIsSessionLoading] = useState<boolean>(true);
  const [showLoginModal, setShowLoginModal] = useState<boolean>(false);
  const [showSignUpModal, setShowSignUpModal] = useState<boolean>(false);
  const [oauthTempUser, setOauthTempUser] = useState<{
    email: string;
    name: string;
    provider: 'google' | 'microsoft';
    picture?: string;
    googleSub?: string;
    microsoftOid?: string;
  } | null>(null);

  // Active news item for detail modal & audio drawer
  const [selectedNews, setSelectedNews] = useState<NewsItem | null>(null);
  const [audioState, setAudioState] = useState<AudioControllerState>(audioController.getState());
  const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);

  // Modals
  const [showNotifications, setShowNotifications] = useState<boolean>(false);
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
          if (!k.startsWith('faros_news_v3_coherent_') || !k.includes(todayKey)) {
            keysToRemove.push(k);
          }
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
    } catch {}
  }, []);

  // Grounded Real News State initialized from today's cache or empty
  const [newsList, setNewsList] = useState<NewsItem[]>(() => {
    try {
      const timeZone = 'America/Argentina/Buenos_Aires';
      const todayKey = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
      }).format(new Date());

      const hourStr = new Intl.DateTimeFormat('en-GB', {
        timeZone,
        hour: '2-digit',
        hour12: false
      }).format(new Date());

      const hourKey = `${todayKey}_${hourStr}`;
      const cached = localStorage.getItem(`faros_news_v3_coherent_${MOCK_PORTFOLIOS[0].id}_${hourKey}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [isLoadingNews, setIsLoadingNews] = useState<boolean>(false);
  const [pendingRemindersCount, setPendingRemindersCount] = useState<number>(0);

  // Notifications (Neutral descriptive alerts)
  const [notifications, setNotifications] = useState([
    {
      id: 'notif-1',
      newsId: 'n-01',
      title: 'Compras de reservas del BCRA y compresión de riesgo país hacia 780 bps',
      timeAgo: 'Hace 25 min',
      impact: 'favorable' as NewsImpact,
      read: false,
      affectedHoldings: 'AL30 · GD30'
    },
    {
      id: 'notif-2',
      newsId: 'n-02',
      title: 'YPF amplía ductos troncales de exportación en Vaca Muerta',
      timeAgo: 'Hace 50 min',
      impact: 'favorable' as NewsImpact,
      read: false,
      affectedHoldings: 'YPFD · PAMP'
    },
    {
      id: 'notif-3',
      newsId: 'n-04',
      title: 'CNV desmintió modificaciones normativas en parking de MEP y CCL',
      timeAgo: 'Hace 2h',
      impact: 'neutral' as NewsImpact,
      read: true,
      affectedHoldings: 'MEP · CCL'
    }
  ]);

  // Assets Map lookup
  const assetsMap = useMemo(() => {
    const map: Record<string, Asset> = {};
    MOCK_ASSETS.forEach(a => {
      map[a.id] = a;
      map[a.symbol] = a;
    });
    return map;
  }, []);

  // Active Portfolio
  const activePortfolio = useMemo(() => {
    return portfolios.find(p => p.id === activePortfolioId) || portfolios[0];
  }, [portfolios, activePortfolioId]);

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

  // Real duration text of the 320-450 word Daily Summary (guaranteed 2 to 3 minutes)
  const dailySummaryDurationText = useMemo(() => {
    try {
      const summary = generateDailySummaryScript(activePortfolio, newsList, calendarEvents, getNowAR());
      return summary.durationText;
    } catch {
      return '2:40 min';
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

    const cacheKey = `faros_news_v3_coherent_${activePortfolio.id}_${hourKey}`;

    // Use cached news if available and not forced refresh
    if (!isManualRefresh) {
      try {
        const cached = localStorage.getItem(cacheKey);
        if (cached) {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed)) {
            setNewsList(parsed);
            return;
          }
        }
      } catch {}
    }

    setIsLoadingNews(true);
    try {
      const response = await fetch('/api/news/pulse', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          portfolioId: activePortfolio.id,
          tickers: activePortfolio.assetIds,
          profile: activePortfolio.profile,
          forceRefresh: isManualRefresh
        })
      });

      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data.news)) {
          setNewsList(data.news);
          if (data.news.length > 0) {
            try {
              const hKey = data.hourKey || hourKey;
              localStorage.setItem(`faros_news_v3_coherent_${activePortfolio.id}_${hKey}`, JSON.stringify(data.news));
            } catch {}
          }
        }
      }
    } catch {
      // Gracefully maintain verified grounded news in state
    } finally {
      setIsLoadingNews(false);
    }
  }, [activePortfolio.id, activePortfolio.assetIds, activePortfolio.profile, getArgentinaTodayKey, purgeOldClientCache]);

  // Fetch or load from cache when portfolio changes
  useEffect(() => {
    fetchPulseNews(false);
  }, [activePortfolio.id, fetchPulseNews]);

  const handleSessionSuccess = useCallback((user: UserAccount, token?: string, isNewRegistration: boolean = false) => {
    setCurrentUser(user);
    if (token) {
      localStorage.setItem('faros_session_token', token);
    }
    // Mirror into local vault
    saveUserToVault(user);

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
      setShowWelcomeOnboardingModal(true);
    }
  }, []);

  // Session verification on mount
  useEffect(() => {
    let isMounted = true;
    async function checkSession() {
      try {
        const storedToken = localStorage.getItem('faros_session_token');
        const headers: Record<string, string> = {};
        if (storedToken) {
          headers['Authorization'] = `Bearer ${storedToken}`;
        }
        const res = await fetch('/api/auth/me', { headers });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated && data.user && isMounted) {
            handleSessionSuccess(data.user, storedToken || undefined);
            return;
          }
        } else if (res.status === 401) {
          localStorage.removeItem('faros_session_token');
        }
      } catch {
        // Unauthenticated or network error
      } finally {
        if (isMounted) {
          setIsSessionLoading(false);
        }
      }
    }
    checkSession();
    return () => { isMounted = false; };
  }, [handleSessionSuccess]);

  const handleLogout = useCallback(async () => {
    // CRITICAL: Stop and clean up all audio upon logging out
    audioController.stopAll('logout');
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch {}
    localStorage.removeItem('faros_session_token');
    clearActiveLocalSession();
    setCurrentUser(null);
    setPortfolios(MOCK_PORTFOLIOS);
    setActivePortfolioId(MOCK_PORTFOLIOS[0].id);
    setPreferences(DEFAULT_PREFERENCES);
    setCurrentTab('feed');
  }, []);

  const handleDeleteAccount = useCallback(async () => {
    // CRITICAL: Stop and clean up all audio upon account deletion
    audioController.stopAll('account-deleted');
    try {
      const storedToken = localStorage.getItem('faros_session_token');
      await fetch('/api/auth/account', {
        method: 'DELETE',
        headers: storedToken ? { 'Authorization': `Bearer ${storedToken}` } : {}
      });
    } catch {}
    localStorage.removeItem('faros_session_token');
    localStorage.removeItem('faros_onboarding_draft');
    setCurrentUser(null);
    setCurrentTab('feed');
  }, []);

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
        const matchesAssets = item.affectedAssetIds.some(aid => aid.toLowerCase().includes(query));
        if (!matchesHeadline && !matchesSummary && !matchesAssets) return false;
      }

      // 3. Relevance Type filter
      if (relevanceTypeFilter !== 'todas' && item.relevanceType !== relevanceTypeFilter) {
        return false;
      }

      // 4. Impact filter (computed dynamically based on Long/Short positions)
      if (impactFilter !== 'todos') {
        const effectiveImpact = getEffectiveImpactForPortfolio(
          item.impact, 
          item.affectedAssetIds, 
          activePortfolio.assetPositions
        );
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
    activePortfolio, 
    searchQuery, 
    relevanceTypeFilter, 
    impactFilter, 
    assetFilter,
    showSavedOnly, 
    savedNewsIds, 
    preferences
  ]);

  // Handler for saving portfolio settings
  const handleSavePortfolioSettings = (updated: Portfolio) => {
    setPortfolios(prev => prev.map(p => p.id === updated.id ? updated : p));
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

  // Session hydration loading state
  if (isSessionLoading) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 select-none">
        <div className="w-14 h-14 rounded-2xl bg-emerald-950 border border-emerald-800/80 flex items-center justify-center mb-4 shadow-xl shadow-emerald-950/50">
          <LighthouseLogo size="lg" showContainer={false} className="w-8 h-8 text-white" />
        </div>
        <div className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
          <Sparkles className="w-4 h-4 text-emerald-400 animate-spin" />
          <span>Iniciando FAROS...</span>
        </div>
      </div>
    );
  }

  // Admin View: If /admin URL or state is active, render AdminPanel directly
  if (isAdminView) {
    return (
      <AdminPanel
        onBackToApp={navigateBackToApp}
        currentUserEmail={currentUser?.email}
      />
    );
  }

  // Unauthenticated Welcome and Onboarding Gate
  if (!currentUser) {
    return (
      <>
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
            onNeedsOnboarding={(temp) => {
              setOauthTempUser(temp);
              setShowLoginModal(false);
              setShowSignUpModal(true);
            }}
          />
        )}

        {showSignUpModal && (
          <SignUpWizard
            isOpen={showSignUpModal}
            onClose={() => {
              setShowSignUpModal(false);
              setOauthTempUser(null);
            }}
            onSuccess={handleSessionSuccess}
            onSwitchToLogin={() => {
              setShowSignUpModal(false);
              setShowLoginModal(true);
            }}
            initialTempUser={oauthTempUser}
          />
        )}
      </>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-sans antialiased">
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
      />

      {/* Main View Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-4 sm:px-6 py-6 pb-28 md:pb-16">
        {/* PANTALLA 1: INICIO (FEED) */}
        {currentTab === 'feed' && (
          <div className="space-y-8">
            {/* In-App Executive Dashboard Card */}
            <FeedSummaryHero
              portfolio={activePortfolio}
              newsList={newsList}
              assetsMap={assetsMap}
              onPlayAudioBrief={handlePlayDailySummary}
              onFilterByAsset={(sym) => setAssetFilter(sym)}
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
                  <h3 data-tour="feed-title" className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                    Noticias Clasificadas
                  </h3>
                  <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
                    Información filtrada para tu cartera con análisis de impacto directo.
                  </p>
                </div>

                {/* Search Icon & Saved Toggle in natural flow */}
                <div className="flex items-center gap-2">
                  {/* Expandable Search Input */}
                  <div className="flex items-center">
                    {isSearchExpanded ? (
                      <div className="flex items-center gap-1.5 bg-white border border-slate-300 rounded-xl px-3 py-1.5 shadow-xs animate-in fade-in duration-150">
                        <Search className="w-4 h-4 text-slate-400 shrink-0" />
                        <input
                          type="text"
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          placeholder="Buscar activo o palabra clave..."
                          autoFocus
                          className="text-xs sm:text-sm text-slate-800 focus:outline-none w-44 sm:w-56 bg-transparent"
                        />
                        <button
                          onClick={() => {
                            setSearchQuery('');
                            setIsSearchExpanded(false);
                          }}
                          className="p-0.5 text-slate-400 hover:text-slate-700 cursor-pointer"
                          aria-label="Cerrar búsqueda"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setIsSearchExpanded(true)}
                        className="p-2 rounded-xl bg-white border border-slate-200 text-slate-600 hover:text-slate-900 hover:bg-slate-100 shadow-2xs transition-colors cursor-pointer"
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
                        ? 'bg-emerald-950 text-white'
                        : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50 shadow-2xs'
                    }`}
                  >
                    <Bookmark className="w-3.5 h-3.5" />
                    <span>Guardadas ({savedNewsIds.length})</span>
                  </button>
                </div>
              </div>

              {/* SLIM STICKY FILTER BAR: Minimal height (~46px) so it never obstructs reading */}
              <div data-tour="feed-filters" className="sticky top-16 z-20 bg-white/95 backdrop-blur-md py-2 px-3 sm:px-4 rounded-2xl border border-slate-200/90 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-2.5">
                {/* Category Pills (horizontal scroll on mobile) */}
                <div className="flex items-center gap-1 overflow-x-auto max-w-full text-xs py-0.5 scrollbar-none">
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
                      className={`px-3 py-1.5 font-bold rounded-xl whitespace-nowrap transition-all cursor-pointer ${
                        relevanceTypeFilter === tab.id
                          ? 'bg-emerald-950 text-white shadow-xs'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                {/* Sub-filters: Asset dropdown & Effect pills */}
                <div className="flex items-center justify-between md:justify-end gap-2 text-xs">
                  {/* Asset selector */}
                  <select
                    value={assetFilter}
                    onChange={(e) => setAssetFilter(e.target.value)}
                    className="text-xs font-bold bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-slate-800 focus:outline-none focus:border-emerald-800 cursor-pointer"
                  >
                    <option value="todos">Todos los activos</option>
                    {activePortfolio.assetIds.map(aid => (
                      <option key={aid} value={aid}>{aid}</option>
                    ))}
                  </select>

                  {/* Qualitative Impact Pills: Verde=Favorable, Rojo=Alerta, Gris=Neutral */}
                  <div className="flex items-center gap-1">
                    {[
                      { 
                        id: 'todos', 
                        label: 'Todos',
                        activeClass: 'bg-slate-900 text-white shadow-xs border border-slate-900',
                        inactiveClass: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      },
                      { 
                        id: 'favorable', 
                        label: 'Favorables',
                        activeClass: 'bg-emerald-600 text-white shadow-xs border border-emerald-600 ring-2 ring-emerald-500/20',
                        inactiveClass: 'text-emerald-800 hover:text-emerald-950 hover:bg-emerald-50'
                      },
                      { 
                        id: 'alerta', 
                        label: 'Alertas',
                        activeClass: 'bg-rose-600 text-white shadow-xs border border-rose-600 ring-2 ring-rose-500/20',
                        inactiveClass: 'text-rose-800 hover:text-rose-950 hover:bg-rose-50'
                      },
                      { 
                        id: 'neutral', 
                        label: 'Neutrales',
                        activeClass: 'bg-slate-600 text-white shadow-xs border border-slate-600 ring-2 ring-slate-400/20',
                        inactiveClass: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
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
                      container: 'bg-emerald-50/95 border-emerald-300 text-emerald-950 shadow-2xs ring-1 ring-emerald-500/20',
                      dot: 'bg-emerald-600',
                      badge: 'bg-emerald-200/90 text-emerald-950 border border-emerald-300',
                      button: 'text-emerald-950 hover:bg-emerald-100 border-emerald-300 bg-white/95'
                    }
                  : isAle
                  ? {
                      container: 'bg-rose-50/95 border-rose-300 text-rose-950 shadow-2xs ring-1 ring-rose-500/20',
                      dot: 'bg-rose-600',
                      badge: 'bg-rose-200/90 text-rose-950 border border-rose-300',
                      button: 'text-rose-950 hover:bg-rose-100 border-rose-300 bg-white/95'
                    }
                  : {
                      container: 'bg-slate-100/95 border-slate-300 text-slate-900 shadow-2xs ring-1 ring-slate-400/20',
                      dot: 'bg-slate-600',
                      badge: 'bg-slate-200 text-slate-900 border border-slate-300',
                      button: 'text-slate-900 hover:bg-slate-200 border-slate-300 bg-white/95'
                    };

                return (
                  <div className={`flex items-center justify-between border rounded-2xl px-4 py-2.5 text-xs shadow-2xs animate-in fade-in duration-200 ${theme.container}`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`w-2.5 h-2.5 rounded-full animate-pulse ${theme.dot}`} />
                      <span className="font-semibold">
                        Filtrando por impacto: <strong className="font-black">{getQualitativeImpactLabel(impactFilter)}</strong>
                      </span>
                      {assetFilter !== 'todos' && (
                        <span className="text-[11px] font-mono bg-white border border-slate-300 px-2 py-0.5 rounded-md font-bold text-slate-800">
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
                  ? 'bg-emerald-600 hover:bg-emerald-700 text-white' 
                  : isAle 
                  ? 'bg-rose-600 hover:bg-rose-700 text-white' 
                  : 'bg-slate-700 hover:bg-slate-800 text-white';
                const iconBoxClass = isFav 
                  ? 'bg-emerald-100 text-emerald-700' 
                  : isAle 
                  ? 'bg-rose-100 text-rose-700' 
                  : 'bg-slate-100 text-slate-600';

                return (
                  <div className="bg-white rounded-3xl border border-slate-200/90 p-8 sm:p-12 text-center shadow-xs transition-all duration-300 animate-in fade-in">
                    <div className={`w-14 h-14 mx-auto rounded-2xl flex items-center justify-center mb-4 ${iconBoxClass}`}>
                      <FilterX className="w-7 h-7 stroke-[1.75]" />
                    </div>
                    <h4 className="text-lg font-black text-slate-900 tracking-tight">
                      Hoy no encontramos noticias relevantes para tu cartera
                    </h4>
                    <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-2 leading-relaxed">
                      {impactFilter !== 'todos' && assetFilter !== 'todos'
                        ? `No se encontraron noticias clasificadas como "${getQualitativeImpactLabel(impactFilter)}" para el activo ${assetFilter}.`
                        : impactFilter !== 'todos'
                        ? `No hay noticias recientes clasificadas con impacto "${getQualitativeImpactLabel(impactFilter)}" en tu cartera.`
                        : searchQuery || assetFilter !== 'todos' || relevanceTypeFilter !== 'todas' || showSavedOnly
                        ? 'No se encontraron noticias que coincidan con los filtros seleccionados.'
                        : 'El rastreo en medios financieros especializados (Ámbito, El Cronista, Infobae, Bloomberg Línea, entre otros) no arrojó acontecimientos con impacto directo en tus activos en las últimas 24 a 48 horas.'}
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
                          className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-bold rounded-xl transition-colors cursor-pointer active:scale-95"
                        >
                          <span>Restablecer todos los filtros</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })() : (
                <div className="space-y-4 pt-2 text-slate-700 transition-all duration-300 animate-in fade-in">
                  {filteredNews.map((news) => (
                    <NewsCard
                      key={news.id}
                      news={news}
                      assetsMap={assetsMap}
                      onSelect={(n) => setSelectedNews(n)}
                      onPlayAudio={handlePlayNewsAudio}
                      onToggleSave={handleToggleSave}
                      isSaved={savedNewsIds.includes(news.id)}
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
            portfolioId={activePortfolio.id}
            portfolioName={activePortfolio.name}
            userAssetSymbols={activePortfolio.assetIds}
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
            preferences={preferences}
            onSavePreferences={(upd) => setPreferences(upd)}
            onOpenCreateNew={() => setShowOnboarding(true)}
            currentUser={currentUser}
            onLogout={handleLogout}
            onDeleteAccount={handleDeleteAccount}
            onStartTour={() => setIsTourActive(true)}
            onOpenAdmin={isCurrentUserAdmin ? navigateToAdmin : undefined}
          />
        )}
      </main>

      {/* Rocket Money-Style Contrast Bottom Foundation (Deep Emerald) */}
      <footer className="mt-auto bg-emerald-950 text-white pt-10 pb-24 md:pb-12 border-t border-emerald-900">
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          <div className="flex flex-col md:flex-row items-center justify-between gap-6 pb-8 border-b border-emerald-900/80">
            {/* Brand in footer */}
            <div className="flex items-center gap-3">
              <LighthouseLogo size="md" className="bg-emerald-900" />
              <div>
                <span className="text-xl font-black tracking-tight text-white font-sans">
                  FAROS
                </span>
                <p className="text-xs text-emerald-300">
                  La plataforma de mercado que trabaja para tu cartera.
                </p>
              </div>
            </div>

            {/* Quick footer navigation */}
            <div className="flex items-center gap-6 text-xs text-emerald-200 font-semibold">
              <button onClick={() => setCurrentTab('feed')} className="hover:text-white transition-colors cursor-pointer">
                Noticias
              </button>
              <button onClick={() => setCurrentTab('calendar')} className="hover:text-white transition-colors cursor-pointer">
                Calendario
              </button>
              <button onClick={() => setCurrentTab('settings')} className="hover:text-white transition-colors cursor-pointer">
                Mi cartera
              </button>
              <button onClick={() => setShowOnboarding(true)} className="hover:text-white transition-colors cursor-pointer">
                Nueva Cartera
              </button>
            </div>
          </div>

          {/* Legal Notice */}
          <div className="pt-6 text-center text-xs text-emerald-300/80 space-y-1">
            <p className="font-semibold text-emerald-100">
              FAROS brinda información. No constituye asesoramiento financiero ni recomendación de inversión.
            </p>
            <p className="text-[11px] text-emerald-400/60">
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
      {selectedNews && (
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
        onMarkAllAsRead={() => setNotifications(prev => prev.map(n => ({ ...n, read: true })))}
        onSelectNotification={(newsId) => {
          const target = newsList.find(n => n.id === newsId) || REAL_GROUNDED_NEWS.find(n => n.id === newsId);
          if (target) setSelectedNews(target);
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
          onClose={() => {
            setShowSignUpModal(false);
            setOauthTempUser(null);
          }}
          onSuccess={handleSessionSuccess}
          onSwitchToLogin={() => {
            setShowSignUpModal(false);
            setShowLoginModal(true);
          }}
          initialTempUser={oauthTempUser}
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
          onNeedsOnboarding={(temp) => {
            setOauthTempUser(temp);
            setShowLoginModal(false);
            setShowSignUpModal(true);
          }}
        />
      )}

      {/* 6. Initial Welcome Onboarding Modal for New Registrations */}
      {showWelcomeOnboardingModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 shadow-2xl border border-slate-100 text-center space-y-6">
            <div className="w-16 h-16 rounded-3xl bg-emerald-950 text-white flex items-center justify-center mx-auto shadow-md">
              <Compass className="w-8 h-8 text-emerald-300 animate-pulse" />
            </div>
            <div className="space-y-2">
              <h3 className="text-2xl font-black text-slate-900 tracking-tight">
                ¡Bienvenido a FAROS!
              </h3>
              <p className="text-sm text-slate-600 leading-relaxed">
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
                className="w-full sm:w-auto px-6 py-3.5 bg-emerald-950 hover:bg-emerald-900 text-white font-extrabold rounded-2xl shadow-md transition-all active:scale-95 cursor-pointer text-sm"
              >
                Comenzar recorrido
              </button>
              <button
                type="button"
                onClick={() => setShowWelcomeOnboardingModal(false)}
                className="w-full sm:w-auto px-6 py-3.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-2xl transition-all cursor-pointer text-sm"
              >
                Explorar por mi cuenta
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Comprehensive 3-Stage Guided Interactive Tour */}
      <InteractiveTour
        isActive={isTourActive}
        onClose={() => setIsTourActive(false)}
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
      />
    </div>
  );
}
