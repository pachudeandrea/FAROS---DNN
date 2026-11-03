import { portfolioAssets, searchAssets, CATEGORY_LABELS } from '../data/assetCatalog';
import { usePendingChanges } from '../hooks/usePendingChanges';
import React, { useState, useEffect } from 'react';
import { 
  Portfolio, 
  RiskProfile, 
  RelevanceType, 
  UserPreferences,
  UserAccount,
  AssetPosition,
  Asset
} from '../types';
import { ProfileSelector } from './ProfileCard';
import { AccountDetails } from './AccountDetails';
import { RecoveryKeySettings } from './RecoveryKeySettings';
import { 
  Check, 
  X, 
  Plus, 
  Search, 
  SlidersHorizontal, 
  Bell, 
  ChevronDown, 
  ChevronUp, 
  Wallet,
  Building2,
  Trash2,
  LogOut,
  Lock,
  ArrowUpRight,
  ArrowDownRight,
  Sparkles,
  Info,
  Shield
} from 'lucide-react';

interface PortfolioSettingsViewProps {
  portfolio: Portfolio;
  portfolios: Portfolio[];
  onSelectPortfolio: (portfolio: Portfolio) => void;
  onSavePortfolio: (updated: Portfolio) => Promise<boolean>;
  preferences: UserPreferences;
  onSavePreferences: (updated: UserPreferences) => void;
  onOpenCreateNew: () => void;
  onViewNews?: () => void;
  currentUser?: UserAccount | null;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
  onStartTour?: () => void;
  onOpenAdmin?: () => void;
  onAccountSaved?: (user: UserAccount) => void;
  onRecoveryKeySaved?: (user: UserAccount) => void;
  notificationsControl?: React.ReactNode;
}

export const PortfolioSettingsView: React.FC<PortfolioSettingsViewProps> = ({
  portfolio,
  portfolios,
  onSelectPortfolio,
  onSavePortfolio,
  preferences,
  onSavePreferences,
  onOpenCreateNew,
  onViewNews,
  currentUser,
  onLogout,
  onDeleteAccount,
  onStartTour,
  onOpenAdmin,
  onAccountSaved,
  onRecoveryKeySaved,
  notificationsControl,
}) => {
  // Asset search state for adding assets
  const [assetSearch, setAssetSearch] = useState<string>('');
  const [selectedCandidate, setSelectedCandidate] = useState<Asset | null>(null);
  const [pendingPosition, setPendingPosition] = useState<AssetPosition>('long');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  const [section, setSection] = useState<'assets' | 'preferences' | 'alerts' | 'account'>('assets');
  usePendingChanges(!!selectedCandidate || !!assetSearch.trim());

  useEffect(() => {
    const reveal = (event: Event) => {
      const target = (event as CustomEvent<string>).detail;
      if (target === 'portfolio-profile' || target === 'portfolio-relevance') setSection('preferences');
      else if (target === 'portfolio-notifications') setSection('alerts');
      else if (target === 'portfolio-account') setSection('account');
      else if (target?.startsWith('portfolio-')) setSection('assets');
    };
    window.addEventListener('faros-tour-target', reveal);
    return () => window.removeEventListener('faros-tour-target', reveal);
  }, []);
  // Available assets to add
  const catalog = portfolioAssets(portfolio);
  const matchingAssets = searchAssets(assetSearch, catalog);
  const selectedAssetIds = new Set(portfolio.assetIds);
  const selectedCount = matchingAssets.filter(asset => selectedAssetIds.has(asset.id)).length;

  const handleConfirmAddAsset = async (assetId: string, position: AssetPosition = 'long') => {
    if (!portfolio.assetIds.includes(assetId)) {
      const updated: Portfolio = {
        ...portfolio,
        assetIds: [...portfolio.assetIds, assetId],
        assetPositions: {
          ...(portfolio.assetPositions || {}),
          [assetId]: position
        }
      };
      if (!await onSavePortfolio(updated)) return;
      setSelectedCandidate(null);
      setPendingPosition('long');
      setAssetSearch('');
    }
  };

  const handleTogglePosition = (assetId: string) => {
    const current = portfolio.assetPositions?.[assetId] || 'long';
    const next: AssetPosition = current === 'long' ? 'short' : 'long';
    const updated: Portfolio = {
      ...portfolio,
      assetPositions: {
        ...(portfolio.assetPositions || {}),
        [assetId]: next
      }
    };
    onSavePortfolio(updated);
  };

  const handleRemoveAsset = (assetId: string) => {
    const nextPositions = { ...(portfolio.assetPositions || {}) };
    delete nextPositions[assetId];
    const updated: Portfolio = {
      ...portfolio,
      assetIds: portfolio.assetIds.filter(id => id !== assetId),
      assetPositions: nextPositions
    };
    onSavePortfolio(updated);
  };

  const handleSelectRiskProfile = (profile: RiskProfile) => {
    const updated = {
      ...portfolio,
      profile
    };
    onSavePortfolio(updated);
  };

  const toggleRelevanceType = (type: RelevanceType) => {
    const exists = preferences.enabledRelevanceTypes.includes(type);
    let next: RelevanceType[];
    if (exists) {
      if (preferences.enabledRelevanceTypes.length > 1) {
        next = preferences.enabledRelevanceTypes.filter(t => t !== type);
      } else {
        next = preferences.enabledRelevanceTypes;
      }
    } else {
      next = [...preferences.enabledRelevanceTypes, type];
    }
    onSavePreferences({
      ...preferences,
      enabledRelevanceTypes: next
    });
  };

  const toggleTopic = (topicId: string) => {
    const exists = preferences.prioritizedTopics.includes(topicId);
    let next: string[];
    if (exists) {
      if (preferences.prioritizedTopics.length > 1) {
        next = preferences.prioritizedTopics.filter(t => t !== topicId);
      } else {
        next = preferences.prioritizedTopics;
      }
    } else {
      next = [...preferences.prioritizedTopics, topicId];
    }
    onSavePreferences({
      ...preferences,
      prioritizedTopics: next
    });
  };

  const longCount = portfolio.assetIds.filter(id => (portfolio.assetPositions?.[id] || 'long') === 'long').length;
  const shortCount = portfolio.assetIds.filter(id => portfolio.assetPositions?.[id] === 'short').length;

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-12">
      {/* Title & Onboarding Help Trigger */}
      <div 
        data-tour="portfolio-title"
        className="border-b border-ink-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand-950 bg-brand-100/70 border border-brand-300/80 px-2 py-0.5 rounded-md">
              Configuración de Cartera
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-bold text-ink-900 tracking-tight mt-1">
            Mi Cartera
          </h2>
          <p className="text-xs sm:text-sm text-muted mt-1">
            Este es tu espacio personal de inversión. Acá podés agregar los activos que querés monitorear y configurar qué información te interesa recibir.
          </p>
        </div>

        {onStartTour && (
          <button
            type="button"
            onClick={onStartTour}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-paper hover:bg-brand-50 text-brand-950 border border-ink-200 hover:border-brand-300 text-xs font-bold transition-all shadow-2xs shrink-0 cursor-pointer self-start sm:self-center"
            title="Iniciar o reiniciar la guía interactiva de FAROS"
          >
            <Sparkles className="w-3.5 h-3.5 text-brand-text" />
            <span>Ver tutorial interactivo</span>
          </button>
        )}
      </div>

      <nav aria-label="Secciones de Mi cartera" className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {([{ id: 'assets', label: 'Activos y carteras', icon: Wallet }, { id: 'preferences', label: 'Preferencias', icon: SlidersHorizontal }, { id: 'alerts', label: 'Alertas', icon: Bell }, { id: 'account', label: 'Cuenta y privacidad', icon: Lock }] as const).map(item => <button key={item.id} aria-current={section === item.id ? 'page' : undefined} onClick={() => setSection(item.id)} className={`flex items-center gap-2 px-3 py-3 rounded-xl text-sm font-semibold text-left ${section === item.id ? 'bg-brand-950 text-paper' : 'bg-paper text-muted border border-ink-200'}`}><item.icon className="w-4 h-4 shrink-0" />{item.label}</button>)}
      </nav>
      <div hidden={section !== 'assets'} className="space-y-4">
      <p className="text-base text-muted">{portfolio.assetIds.length ? 'Tu cartera está lista para personalizar las noticias.' : 'Buscá tu primer activo, elegí LONG o SHORT y agregalo a tu cartera.'}</p>
      {portfolio.assetIds.length > 0 && onViewNews && <button onClick={onViewNews} className="px-4 py-3 bg-brand-950 text-paper rounded-xl font-semibold">Ver noticias de mi cartera</button>}
      {/* BLOQUE 1: CARTERAS Y ACTIVOS */}
      <section className="bg-paper rounded-3xl border border-ink-200/90 shadow-brand-soft p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-ink-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-brand-100 text-brand-900 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-brand-950">
                Cartera Activa
              </span>
              <h3 className="text-xl font-bold text-ink-900">
                {portfolio.name}
              </h3>
            </div>
          </div>

          <button
            onClick={onOpenCreateNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-ink-100 hover:bg-brand-50 text-brand-950 text-xs font-bold transition-colors border border-ink-200/80 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-brand-800" />
            <span>Crear nueva cartera</span>
          </button>
        </div>

        {/* Carteras disponibles (Step 5 in tour) */}
        <div data-tour="portfolio-cards" className="space-y-2">
          <label className="block text-xs font-bold text-muted">
            Tus carteras de inversión ({portfolios.length}):
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {portfolios.map(p => {
              const isSelected = p.id === portfolio.id;
              const pLong = p.assetIds.filter(id => (p.assetPositions?.[id] || 'long') === 'long').length;
              const pShort = p.assetIds.filter(id => p.assetPositions?.[id] === 'short').length;
              return (
                <button
                  key={p.id}
                  onClick={() => onSelectPortfolio(p)}
                  className={`text-left p-4 rounded-2xl border transition-all cursor-pointer ${
                    isSelected
                      ? 'border-brand-800 bg-brand-50/70 shadow-sm ring-1 ring-brand-800'
                      : 'border-ink-200/90 hover:border-ink-300 bg-paper hover:bg-ink-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-extrabold text-sm text-ink-900 truncate">
                      {p.name}
                    </span>
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-brand-800 text-paper flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-ink-300 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-muted font-medium">
                    {p.assetIds.length} activos ({pLong} Long · {pShort} Short)
                  </p>
                  <span className="text-[11px] text-brand-800 font-semibold mt-1 block">
                    Perfil: {p.profile === 'dinamico' ? 'Dinámico' : p.profile === 'conservador' ? 'Conservador' : 'Moderado'}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Asset Search to Add (Step 2 in tour) */}
        <div data-tour="portfolio-search" className="space-y-3 pt-2">
          <div>
            <label className="block text-xs font-bold text-ink-900 mb-0.5">
              Buscar e incorporar activos a tu cartera:
            </label>
            <p className="text-[11px] text-muted">
              Elegí de la lista o buscá por ticker, nombre, emisor o alias (ej: AL30, Microsoft, Córdoba, QQQ).
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-muted" />
            <input
              type="text"
              aria-label="Buscar activos"
              aria-controls="portfolio-available-assets"
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder="Escribí el símbolo o nombre del activo..."
              className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-ink-300 focus:outline-none focus:border-brand-800 bg-ink-50/50"
            />
          </div>

          {/* Keep the whole catalog available, including before entering a query. */}
          {!selectedCandidate && (
            <div>
              <p className="text-xs text-muted mb-2" role="status">{matchingAssets.length} {matchingAssets.length === 1 ? 'activo' : 'activos'} {assetSearch.trim() ? 'encontrados' : 'en catálogo'} · {selectedCount} ya {selectedCount === 1 ? 'seleccionado' : 'seleccionados'}</p>
              <div id="portfolio-available-assets" role="region" aria-label="Activos disponibles" className="p-2 rounded-2xl border border-ink-200 bg-paper shadow-lg max-h-72 overflow-y-auto overscroll-contain space-y-1">
              {matchingAssets.length === 0 ? (
                <p className="text-xs text-muted p-3 text-center">
                  No se encontraron activos con esa búsqueda.
                </p>
              ) : (
                matchingAssets.map(a => {
                  const isSelected = selectedAssetIds.has(a.id);
                  return (
                  <button
                    type="button"
                    key={a.id}
                    data-asset-id={a.id}
                    disabled={isSelected}
                    onClick={() => {
                      if (isSelected) return;
                      setSelectedCandidate(a);
                      setPendingPosition('long');
                    }}
                    className={`w-full min-w-0 p-2.5 rounded-xl focus-visible:outline-2 focus-visible:outline-brand-700 flex items-center justify-between gap-2 text-left text-xs border transition-colors group ${isSelected ? 'bg-ink-50 border-ink-200 cursor-default' : 'border-transparent hover:bg-brand-50/60 hover:border-brand-200 cursor-pointer'}`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="w-7 h-7 shrink-0 rounded-lg bg-brand-950 text-paper font-mono font-bold text-xs flex items-center justify-center">
                        {a.symbol.slice(0, 2)}
                      </span>
                      <span className="min-w-0 break-words">
                        <span className="font-mono font-bold text-ink-900 mr-2 group-hover:text-brand-950">{a.symbol}</span>
                        <span className="text-muted text-[11px]">{a.name} · {a.market} · {a.currency} · {CATEGORY_LABELS[a.category]}{a.manual ? " · Manual" : ""}</span>
                      </span>
                    </span>
                    <span className={`shrink-0 inline-flex items-center gap-1 text-[11px] sm:text-xs font-bold px-2.5 py-1 rounded-lg ${isSelected ? 'text-ink-800 bg-ink-100' : 'text-brand-900 bg-brand-100/70'}`}>
                      {isSelected && <Check aria-hidden="true" className="w-3 h-3" />}
                      {isSelected ? 'Ya seleccionado' : 'Seleccionar'}
                    </span>
                  </button>
                  );
                })
              )}
              </div>
            </div>
          )}
          {/* Step 3: NUEVA FUNCIONALIDAD LONG / SHORT Selector Card */}
          {selectedCandidate && (
            <div 
              data-tour="portfolio-long-short-demo"
              className="p-4 rounded-2xl bg-gradient-to-br from-ink-50 to-brand-50/40 border-2 border-brand-600/70 shadow-sm space-y-3.5 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-brand-950 block">
                    Ticker seleccionado
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono font-bold text-base text-ink-900">
                      {selectedCandidate.symbol}
                    </span>
                    <span className="text-xs text-muted font-medium">
                      · {selectedCandidate.name}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedCandidate(null)}
                  className="p-1.5 text-muted hover:text-muted rounded-lg hover:bg-paper transition-colors"
                  title="Cancelar selección"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Selector LONG / SHORT */}
              <div>
                <label className="block text-xs font-bold text-ink-800 mb-1.5">
                  Tipo de posición para {selectedCandidate.symbol}:
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPendingPosition('long')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
                      pendingPosition === 'long'
                        ? 'bg-info-600 text-paper border-info-700 shadow-xs ring-2 ring-info-500/30'
                        : 'bg-paper text-muted border-ink-200 hover:bg-ink-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="w-4 h-4" />
                      <div className="text-left">
                        <span className="block font-bold">LONG</span>
                        <span className="text-[10px] font-normal opacity-90 block">Comprado (suba)</span>
                      </div>
                    </div>
                    {pendingPosition === 'long' && <Check className="w-4 h-4 stroke-[3]" />}
                  </button>

                  <button
                    type="button"
                    onClick={() => setPendingPosition('short')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
                      pendingPosition === 'short'
                        ? 'bg-warning-400 text-warning-text border-warning-500 shadow-xs ring-2 ring-warning-500/30'
                        : 'bg-paper text-muted border-ink-200 hover:bg-ink-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="w-4 h-4" />
                      <div className="text-left">
                        <span className="block font-bold">SHORT</span>
                        <span className="text-[10px] font-normal opacity-90 block">Vendido (baja)</span>
                      </div>
                    </div>
                    {pendingPosition === 'short' && <Check className="w-4 h-4 stroke-[3]" />}
                  </button>
                </div>

                <div className="p-2.5 bg-paper/80 rounded-xl border border-ink-200/80 text-[11px] text-muted mt-2 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-brand-800 shrink-0 mt-0.5" />
                  <span>
                    {pendingPosition === 'long'
                      ? 'Posición LONG: Te beneficiás de una suba en la cotización. Las noticias alcistas se interpretarán como favorables para tu cartera.'
                      : 'Posición SHORT: Te beneficiás de una baja en la cotización. Las noticias bajistas se interpretarán como favorables para tu cartera.'}
                  </span>
                </div>
              </div>

              {/* Botón de confirmación */}
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => handleConfirmAddAsset(selectedCandidate.id, pendingPosition)}
                  className="flex-1 py-2.5 px-4 bg-brand-950 hover:bg-brand-900 text-paper text-xs font-extrabold rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar a mi cartera ({pendingPosition.toUpperCase()})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCandidate(null)}
                  className="py-2.5 px-4 bg-paper hover:bg-ink-100 text-muted text-xs font-semibold rounded-xl border border-ink-200 transition-colors cursor-pointer"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Step 4: Administrar los activos incorporados */}
        <div data-tour="portfolio-assets-list" className="space-y-3 pt-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <span className="text-xs font-bold text-muted block">
              Activos bajo monitoreo: <span className="text-brand-950 font-bold">{portfolio.assetIds.length}</span> ({longCount} Long · {shortCount} Short)
            </span>
            <div className="text-[10px] text-muted flex items-center gap-2">
              <span className="inline-flex items-center gap-1 font-bold text-info-text bg-info-50 px-2 py-0.5 rounded-md border border-info-200">
                <span className="w-2 h-2 rounded-full bg-info-600" />
                LONG = Azul
              </span>
              <span className="inline-flex items-center gap-1 font-bold text-warning-text bg-warning-50 px-2 py-0.5 rounded-md border border-warning-300">
                <span className="w-2 h-2 rounded-full bg-warning-500" />
                SHORT = Amarillo
              </span>
            </div>
          </div>

          {portfolio.assetIds.length === 0 ? (
            <div className="p-6 rounded-2xl border-2 border-dashed border-ink-200 bg-ink-50/50 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-ink-100 text-muted flex items-center justify-center mx-auto">
                <Wallet className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-ink-800 text-sm">Tu cartera está vacía</h4>
              <p className="text-xs text-muted max-w-sm mx-auto leading-relaxed">
                Utilizá el buscador superior para agregar tus instrumentos (acciones, bonos o CEDEARs) y definir si operás en LONG o SHORT.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {portfolio.assetIds.map(assetId => {
                const asset = catalog.find(a => a.id === assetId || a.symbol === assetId);
                const position = portfolio.assetPositions?.[assetId] || 'long';
                const isLong = position === 'long';

                return (
                  <span
                    key={assetId}
                    className={`inline-flex max-w-full min-w-0 items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      isLong
                        ? 'bg-info-50/80 border-info-300 text-info-text shadow-2xs'
                        : 'bg-warning-50/90 border-warning-300 text-warning-text shadow-2xs'
                    }`}
                  >
                    <span className="font-mono font-bold" title={asset ? `${asset.market} · ${asset.currency}${asset.manual ? ' · Manual' : ''}` : assetId}>
                      {asset?.symbol || assetId}
                    </span>
                    <span className={`text-sm min-w-0 truncate max-w-[110px] ${isLong ? 'text-info-text/80' : 'text-warning-text/80'}`}>
                      {asset ? `${asset.name} · ${asset.market} · ${asset.currency}${asset.manual ? ' · Manual' : ''}` : ''}
                    </span>

                    {/* Position Toggle Badge */}
                    <button
                      type="button"
                      onClick={() => handleTogglePosition(assetId)}
                      aria-label={`${assetId}: posición ${position.toUpperCase()}, cambiar a ${isLong ? 'SHORT' : 'LONG'}`}
                      className={`shrink-0 font-mono text-xs font-bold px-1.5 py-0.5 rounded uppercase tracking-wider cursor-pointer transition-opacity hover:opacity-85 ${
                        isLong
                          ? 'bg-info-600 text-paper shadow-2xs'
                          : 'bg-warning-400 text-warning-text border border-warning-500/60 shadow-2xs'
                      }`}
                      title={`Posición actual: ${position.toUpperCase()}. Hacé clic para cambiar a ${isLong ? 'SHORT' : 'LONG'}`}
                    >
                      {position.toUpperCase()}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveAsset(assetId)}
                      className={`shrink-0 flex items-center justify-center p-0.5 rounded transition-colors ml-0.5 cursor-pointer ${
                        isLong ? 'hover:bg-info-200 text-info-text hover:text-info-text' : 'hover:bg-warning-200 text-warning-text hover:text-warning-text'
                      }`}
                      title={`Quitar ${assetId} de la cartera`}
                      aria-label={`Quitar ${assetId}`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </span>
                );
              })}
            </div>
          )}
        </div>
      </section>

      </div>
      <div hidden={section !== 'preferences'} className="space-y-4">
      {/* BLOQUE 2: MI PERFIL (Step 6 in tour) */}
      <section 
        data-tour="portfolio-profile"
        className="bg-paper rounded-3xl border border-ink-200/90 shadow-sm p-6 sm:p-7 space-y-4"
      >
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-950">
            Paso de Configuración
          </span>
          <h3 className="text-lg font-bold text-ink-900">
            Mi Perfil de Inversor
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Seleccioná tu tolerancia al riesgo para calibrar el análisis y la jerarquización de noticias.
          </p>
        </div>

        <ProfileSelector
          value={portfolio.profile}
          onChange={handleSelectRiskProfile}
        />
      </section>

      {/* BLOQUE 3: QUÉ NOTICIAS ME IMPORTAN (Step 7 in tour) */}
      <section 
        data-tour="portfolio-relevance"
        className="bg-paper rounded-3xl border border-ink-200/90 shadow-sm p-6 sm:p-7 space-y-5"
      >
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-950">
            Filtro de Ruido Informativo
          </span>
          <h3 className="text-lg font-bold text-ink-900">
            Qué Noticias me Importan
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Activá o desactivá las cuatro categorías que querés que FAROS priorice en tu pantalla de inicio.
          </p>
        </div>

        {/* Toggles for relevance types */}
        <div className="space-y-3">
          {[
            {
              id: 'impacto_precio' as RelevanceType,
              label: 'Impacto en precio',
              desc: 'Variaciones directas de cotización, licitaciones de deuda y anuncios oficiales de mercado.'
            },
            {
              id: 'valoracion_mercado' as RelevanceType,
              label: 'Valoración de mercado',
              desc: 'Balances contables, ingresos trimestrales, márgenes de ganancia y planes de inversión.'
            },
            {
              id: 'ruido' as RelevanceType,
              label: 'Ruido de mercado',
              desc: 'Filtrado de rumores de redes sociales y desmentidas oficiales de organismos reguladores.'
            },
            {
              id: 'contexto_macro' as RelevanceType,
              label: 'Contexto macroeconómico',
              desc: 'Índices de inflación (IPC), acumulación de reservas y decisiones de tasas de interés.'
            }
          ].map(item => {
            const isChecked = preferences.enabledRelevanceTypes.includes(item.id);
            return (
              <div 
                key={item.id}
                role="switch"
                aria-checked={isChecked}
                tabIndex={0}
                onKeyDown={event => { if (event.key === ' ' || event.key === 'Enter') { event.preventDefault(); toggleRelevanceType(item.id); } }}
                onClick={() => toggleRelevanceType(item.id)}
                className="flex items-center justify-between p-3.5 rounded-2xl border border-ink-200 hover:border-ink-300 bg-ink-50/40 cursor-pointer transition-colors"
              >
                <div className="pr-4">
                  <span className="text-xs sm:text-sm font-bold text-ink-900 block">
                    {item.label}
                  </span>
                  <span className="text-[11px] text-muted block leading-tight mt-0.5">
                    {item.desc}
                  </span>
                </div>

                <div className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  isChecked ? 'bg-brand-950' : 'bg-ink-300'
                }`}>
                  <div className={`bg-paper w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    isChecked ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      </div>
      <div hidden={section !== 'alerts'}>
      {/* BLOQUE 4: NOTIFICACIONES Y OPCIONES AVANZADAS (Step 8 in tour) */}
      <section 
        data-tour="portfolio-notifications"
        className="bg-paper rounded-3xl border border-ink-200/90 shadow-sm p-6 sm:p-7 space-y-4"
      >
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-950">
            Alertas & Opciones
          </span>
          <h3 className="text-lg font-bold text-ink-900">
            Notificaciones y Preferencias Avanzadas
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Configurá cuándo recibir avisos y qué temáticas del mercado te interesan.
          </p>
        </div>

        {notificationsControl}

        {/* Revelado Progresivo ("Más opciones avanzadas") */}
        <div className="pt-2 border-t border-ink-100">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-bold text-muted hover:text-ink-900 py-1 cursor-pointer"
          >
            <span>{showAdvanced ? 'Ocultar opciones avanzadas' : 'Más opciones avanzadas'}</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 rounded-2xl bg-ink-50 border border-ink-200 space-y-3 text-xs animate-in fade-in duration-150">
              <span className="font-bold text-muted block">
                Temáticas específicas con prioridad de visualización:
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {[
                  { id: 'deuda_soberana', label: 'Deuda Soberana & Bonos USD' },
                  { id: 'energia', label: 'Petróleo, Gas & Vaca Muerta' },
                  { id: 'cedears_tech', label: 'Big Tech & Semiconductores' },
                  { id: 'balances', label: 'Balances Corporativos' },
                  { id: 'regulaciones_bcra', label: 'Normativa Cambiaria & BCRA' },
                  { id: 'macro_tasas', label: 'Inflación & Tasas Mayoristas' },
                ].map(t => {
                  const isChecked = preferences.prioritizedTopics.includes(t.id);
                  return (
                    <label 
                      key={t.id} 
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-paper border border-ink-200 cursor-pointer hover:border-brand-300 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTopic(t.id)}
                        className="rounded text-brand-950 accent-brand-950 cursor-pointer"
                      />
                      <span className="text-[11px] font-semibold text-ink-800">{t.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      </div>
      <div hidden={section !== 'account'}>
      {/* BLOQUE 5: CUENTA Y PRIVACIDAD (Step 9 in tour) */}
      <section 
        data-tour="portfolio-account"
        className="bg-paper rounded-3xl border border-ink-200/90 shadow-sm p-6 sm:p-7 space-y-5"
      >
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-brand-950">
            Seguridad & Sesión
          </span>
          <h3 className="text-lg font-bold text-ink-900">
            Cuenta y Privacidad
          </h3>
          <p className="text-xs text-muted mt-0.5">
            Gestión de sesión, credenciales y protección de tus datos financieros.
          </p>
        </div>

        {currentUser && currentUser.id !== 'usr_demo' && <AccountDetails user={currentUser} onSaved={onAccountSaved} />}
        {currentUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-ink-50 border border-ink-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-brand-950 text-paper flex items-center justify-center font-bold text-sm shrink-0">
                  {currentUser.picture ? (
                    <img src={currentUser.picture} alt={currentUser.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    currentUser.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-ink-900">{currentUser.name}</h4>
                  <p className="text-xs text-muted">{currentUser.email}</p>
                  {currentUser.alyc && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-800 mt-0.5">
                      <Building2 className="w-3 h-3" />
                      ALyC: {currentUser.alyc}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-left sm:text-right text-[11px] text-muted">
                <span className="block font-medium">Método: {currentUser.provider === 'google' ? 'Google' : currentUser.provider === 'microsoft' ? 'Microsoft' : 'Email'}</span>
                <span className="block text-muted">Zona: {currentUser.timeZone}</span>
              </div>
            </div>

            {typeof currentUser.hasRecoveryKey === 'boolean' && (!currentUser.provider || currentUser.provider === 'email') && onRecoveryKeySaved && <RecoveryKeySettings key={currentUser.id} user={currentUser} onSaved={onRecoveryKeySaved} />}

            {/* Admin Access Card (founders & admins) */}
            {onOpenAdmin && (
              <div className="p-4 rounded-2xl bg-warning-50/90 border border-warning-300 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-warning-200 text-warning-text flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-warning-text" />
                  </div>
                  <div>
                    <h5 className="font-bold text-warning-text">Panel Administrador Interno</h5>
                    <p className="text-[11px] text-warning-text">
                      Métricas de negocio, usuarios, embudo, salud del pipeline y modelo de tesis.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="px-3.5 py-2 rounded-xl bg-warning-950 hover:bg-warning-900 text-paper font-bold text-xs transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  Abrir Panel
                </button>
              </div>
            )}

            {/* Privacy Compliance Notice */}
            <div className="p-4 rounded-2xl bg-brand-50/60 border border-brand-200/80 text-xs text-brand-950 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <Lock className="w-3.5 h-3.5 text-brand-800" />
                <span>Privacidad y Cumplimiento de Datos Financieros</span>
              </div>
              <p className="text-[11px] text-muted leading-relaxed">
                FAROS almacena únicamente los tickers seleccionados y tus preferencias de notificación para calibrar el feed periodístico y el calendario de vencimientos. Tus contraseñas están resguardadas mediante hash criptográfico (bcrypt) y las sesiones utilizan cookies seguras HttpOnly con SameSite. Nunca compartimos tu cartera con terceros.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-ink-100">
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-4 py-2.5 rounded-xl border border-ink-300 hover:border-ink-400 hover:bg-ink-50 text-ink-800 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-muted" />
                  <span>Cerrar sesión</span>
                </button>
              )}

              {onDeleteAccount && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Estás seguro de que deseás eliminar tu cuenta y todos los datos asociados de FAROS? Esta acción es irreversible.')) {
                      onDeleteAccount();
                    }
                  }}
                  className="px-4 py-2.5 rounded-xl border border-danger-200 hover:border-danger-300 hover:bg-danger-50 text-danger-700 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-danger-500" />
                  <span>Eliminar cuenta y datos</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-ink-50 border border-ink-200/90 text-xs text-muted flex items-center justify-between">
            <span>Sesión local activa. Podés sincronizar tu cuenta en la nube cuando lo desees.</span>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 rounded-lg border border-ink-300 hover:bg-paper text-xs font-semibold cursor-pointer"
              >
                Cerrar sesión
              </button>
            )}
          </div>
        )}
      </section>
      </div>
    </div>
  );
};
