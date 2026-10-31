import React, { useState } from 'react';
import { 
  Portfolio, 
  RiskProfile, 
  RelevanceType, 
  UserPreferences,
  UserAccount,
  AssetPosition,
  Asset
} from '../types';
import { MOCK_ASSETS } from '../data/mockData';
import { ProfileSelector } from './ProfileCard';
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
  onSavePortfolio: (updated: Portfolio) => void;
  preferences: UserPreferences;
  onSavePreferences: (updated: UserPreferences) => void;
  onOpenCreateNew: () => void;
  currentUser?: UserAccount | null;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
  onStartTour?: () => void;
  onOpenAdmin?: () => void;
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
  currentUser,
  onLogout,
  onDeleteAccount,
  onStartTour,
  onOpenAdmin,
  onRecoveryKeySaved,
  notificationsControl,
}) => {
  // Asset search state for adding assets
  const [assetSearch, setAssetSearch] = useState<string>('');
  const [selectedCandidate, setSelectedCandidate] = useState<Asset | null>(null);
  const [pendingPosition, setPendingPosition] = useState<AssetPosition>('long');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Available assets to add
  const unownedAssets = MOCK_ASSETS.filter(a => 
    !portfolio.assetIds.includes(a.id) &&
    (assetSearch.trim() === '' || 
     a.symbol.toLowerCase().includes(assetSearch.toLowerCase()) || 
     a.name.toLowerCase().includes(assetSearch.toLowerCase()))
  );

  const handleConfirmAddAsset = (assetId: string, position: AssetPosition = 'long') => {
    if (!portfolio.assetIds.includes(assetId)) {
      const updated: Portfolio = {
        ...portfolio,
        assetIds: [...portfolio.assetIds, assetId],
        assetPositions: {
          ...(portfolio.assetPositions || {}),
          [assetId]: position
        }
      };
      onSavePortfolio(updated);
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
        className="border-b border-slate-200 pb-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-black uppercase tracking-wider text-emerald-950 bg-emerald-100/70 border border-emerald-300/80 px-2 py-0.5 rounded-md">
              Configuración de Cartera
            </span>
          </div>
          <h2 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight mt-1">
            Mi Cartera
          </h2>
          <p className="text-xs sm:text-sm text-slate-600 mt-1">
            Este es tu espacio personal de inversión. Acá podés agregar los activos que querés monitorear y configurar qué información te interesa recibir.
          </p>
        </div>

        {onStartTour && (
          <button
            type="button"
            onClick={onStartTour}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white hover:bg-emerald-50 text-emerald-950 border border-slate-200 hover:border-emerald-300 text-xs font-bold transition-all shadow-2xs shrink-0 cursor-pointer self-start sm:self-center"
            title="Iniciar o reiniciar la guía interactiva de FAROS"
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
            <span>Ver tutorial interactivo</span>
          </button>
        )}
      </div>

      {/* BLOQUE 1: CARTERAS Y ACTIVOS */}
      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_2px_16px_rgba(0,0,0,0.04)] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-950">
                Cartera Activa
              </span>
              <h3 className="text-xl font-black text-slate-900">
                {portfolio.name}
              </h3>
            </div>
          </div>

          <button
            onClick={onOpenCreateNew}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-slate-100 hover:bg-emerald-50 text-emerald-950 text-xs font-bold transition-colors border border-slate-200/80 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-emerald-800" />
            <span>Crear nueva cartera</span>
          </button>
        </div>

        {/* Carteras disponibles (Step 5 in tour) */}
        <div data-tour="portfolio-cards" className="space-y-2">
          <label className="block text-xs font-bold text-slate-700">
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
                      ? 'border-emerald-800 bg-emerald-50/70 shadow-sm ring-1 ring-emerald-800'
                      : 'border-slate-200/90 hover:border-slate-300 bg-white hover:bg-slate-50'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="font-extrabold text-sm text-slate-900 truncate">
                      {p.name}
                    </span>
                    {isSelected ? (
                      <div className="w-5 h-5 rounded-full bg-emerald-800 text-white flex items-center justify-center shrink-0">
                        <Check className="w-3 h-3 stroke-[3]" />
                      </div>
                    ) : (
                      <span className="w-2 h-2 rounded-full bg-slate-300 shrink-0" />
                    )}
                  </div>
                  <p className="text-xs text-slate-600 font-medium">
                    {p.assetIds.length} activos ({pLong} Long · {pShort} Short)
                  </p>
                  <span className="text-[11px] text-emerald-800 font-semibold mt-1 block">
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
            <label className="block text-xs font-bold text-slate-900 mb-0.5">
              Buscar e incorporar activos a tu cartera:
            </label>
            <p className="text-[11px] text-slate-500">
              Buscá por ticker o nombre (ej: AL30, GD30, YPFD, GGAL, AAPL, MEP). Podés agregar todos los que desees.
            </p>
          </div>

          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3.5 text-slate-400" />
            <input
              type="text"
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder="Escribí el símbolo o nombre del activo..."
              className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
            />
          </div>

          {/* Quick results dropdown if typing */}
          {assetSearch.trim().length > 0 && !selectedCandidate && (
            <div className="p-2 rounded-2xl border border-slate-200 bg-white shadow-lg max-h-52 overflow-y-auto space-y-1">
              {unownedAssets.length === 0 ? (
                <p className="text-xs text-slate-400 p-3 text-center">
                  No se encontraron activos disponibles o ya están en tu cartera.
                </p>
              ) : (
                unownedAssets.map(a => (
                  <div
                    key={a.id}
                    onClick={() => {
                      setSelectedCandidate(a);
                      setPendingPosition('long');
                    }}
                    className="p-2.5 rounded-xl hover:bg-emerald-50/60 flex items-center justify-between text-xs border border-transparent hover:border-emerald-200 transition-colors cursor-pointer group"
                  >
                    <div className="flex items-center gap-2">
                      <span className="w-7 h-7 rounded-lg bg-emerald-950 text-white font-mono font-bold text-xs flex items-center justify-center">
                        {a.symbol.slice(0, 2)}
                      </span>
                      <div>
                        <span className="font-mono font-bold text-slate-900 mr-2 group-hover:text-emerald-950">{a.symbol}</span>
                        <span className="text-slate-600 text-[11px]">{a.name}</span>
                      </div>
                    </div>
                    <span className="text-xs font-bold text-emerald-900 bg-emerald-100/70 px-2.5 py-1 rounded-lg">
                      Seleccionar
                    </span>
                  </div>
                ))
              )}
            </div>
          )}

          {/* Step 3: NUEVA FUNCIONALIDAD LONG / SHORT Selector Card */}
          {selectedCandidate && (
            <div 
              data-tour="portfolio-long-short-demo"
              className="p-4 rounded-2xl bg-gradient-to-br from-slate-50 to-emerald-50/40 border-2 border-emerald-600/70 shadow-sm space-y-3.5 animate-in fade-in duration-150"
            >
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider text-emerald-950 block">
                    Ticker seleccionado
                  </span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="font-mono font-black text-base text-slate-900">
                      {selectedCandidate.symbol}
                    </span>
                    <span className="text-xs text-slate-600 font-medium">
                      · {selectedCandidate.name}
                    </span>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setSelectedCandidate(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-white transition-colors"
                  title="Cancelar selección"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Selector LONG / SHORT */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1.5">
                  Tipo de posición para {selectedCandidate.symbol}:
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPendingPosition('long')}
                    className={`p-3 rounded-xl border text-xs font-bold flex items-center justify-between cursor-pointer transition-all ${
                      pendingPosition === 'long'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs ring-2 ring-blue-500/30'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ArrowUpRight className="w-4 h-4" />
                      <div className="text-left">
                        <span className="block font-black">LONG</span>
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
                        ? 'bg-amber-400 text-amber-950 border-amber-500 shadow-xs ring-2 ring-amber-500/30'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <ArrowDownRight className="w-4 h-4" />
                      <div className="text-left">
                        <span className="block font-black">SHORT</span>
                        <span className="text-[10px] font-normal opacity-90 block">Vendido (baja)</span>
                      </div>
                    </div>
                    {pendingPosition === 'short' && <Check className="w-4 h-4 stroke-[3]" />}
                  </button>
                </div>

                <div className="p-2.5 bg-white/80 rounded-xl border border-slate-200/80 text-[11px] text-slate-600 mt-2 flex items-start gap-2">
                  <Info className="w-3.5 h-3.5 text-emerald-800 shrink-0 mt-0.5" />
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
                  className="flex-1 py-2.5 px-4 bg-emerald-950 hover:bg-emerald-900 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs cursor-pointer flex items-center justify-center gap-2"
                >
                  <Plus className="w-4 h-4" />
                  <span>Agregar a mi cartera ({pendingPosition.toUpperCase()})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedCandidate(null)}
                  className="py-2.5 px-4 bg-white hover:bg-slate-100 text-slate-600 text-xs font-semibold rounded-xl border border-slate-200 transition-colors cursor-pointer"
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
            <span className="text-xs font-bold text-slate-700 block">
              Activos bajo monitoreo: <span className="text-emerald-950 font-black">{portfolio.assetIds.length}</span> ({longCount} Long · {shortCount} Short)
            </span>
            <div className="text-[10px] text-slate-500 flex items-center gap-2">
              <span className="inline-flex items-center gap-1 font-bold text-blue-900 bg-blue-50 px-2 py-0.5 rounded-md border border-blue-200">
                <span className="w-2 h-2 rounded-full bg-blue-600" />
                LONG = Azul
              </span>
              <span className="inline-flex items-center gap-1 font-bold text-amber-950 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-300">
                <span className="w-2 h-2 rounded-full bg-amber-500" />
                SHORT = Amarillo
              </span>
            </div>
          </div>

          {portfolio.assetIds.length === 0 ? (
            <div className="p-6 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/50 text-center space-y-2">
              <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Wallet className="w-5 h-5" />
              </div>
              <h4 className="font-bold text-slate-800 text-sm">Tu cartera está vacía</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto leading-relaxed">
                Utilizá el buscador superior para agregar tus instrumentos (acciones, bonos o CEDEARs) y definir si operás en LONG o SHORT.
              </p>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              {portfolio.assetIds.map(assetId => {
                const asset = MOCK_ASSETS.find(a => a.id === assetId || a.symbol === assetId);
                const position = portfolio.assetPositions?.[assetId] || 'long';
                const isLong = position === 'long';

                return (
                  <span
                    key={assetId}
                    className={`inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                      isLong
                        ? 'bg-blue-50/80 border-blue-300 text-blue-950 shadow-2xs'
                        : 'bg-amber-50/90 border-amber-300 text-amber-950 shadow-2xs'
                    }`}
                  >
                    <span className="font-mono font-bold">
                      {asset?.symbol || assetId}
                    </span>
                    <span className={`text-[11px] truncate max-w-[110px] ${isLong ? 'text-blue-800/80' : 'text-amber-900/80'}`}>
                      {asset?.name || ''}
                    </span>

                    {/* Position Toggle Badge */}
                    <button
                      type="button"
                      onClick={() => handleTogglePosition(assetId)}
                      className={`font-mono text-[9px] font-black px-1.5 py-0.5 rounded uppercase tracking-wider cursor-pointer transition-opacity hover:opacity-85 ${
                        isLong
                          ? 'bg-blue-600 text-white shadow-2xs'
                          : 'bg-amber-400 text-amber-950 border border-amber-500/60 shadow-2xs'
                      }`}
                      title={`Posición actual: ${position.toUpperCase()}. Hacé clic para cambiar a ${isLong ? 'SHORT' : 'LONG'}`}
                    >
                      {position.toUpperCase()}
                    </button>

                    <button
                      type="button"
                      onClick={() => handleRemoveAsset(assetId)}
                      className={`p-0.5 rounded transition-colors ml-0.5 cursor-pointer ${
                        isLong ? 'hover:bg-blue-200 text-blue-400 hover:text-blue-800' : 'hover:bg-amber-200 text-amber-600 hover:text-amber-950'
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

      {/* BLOQUE 2: MI PERFIL (Step 6 in tour) */}
      <section 
        data-tour="portfolio-profile"
        className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-4"
      >
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
            Paso de Configuración
          </span>
          <h3 className="text-lg font-bold text-slate-900">
            Mi Perfil de Inversor
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
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
        className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-5"
      >
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
            Filtro de Ruido Informativo
          </span>
          <h3 className="text-lg font-bold text-slate-900">
            Qué Noticias me Importan
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
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
                onClick={() => toggleRelevanceType(item.id)}
                className="flex items-center justify-between p-3.5 rounded-2xl border border-slate-200 hover:border-slate-300 bg-slate-50/40 cursor-pointer transition-colors"
              >
                <div className="pr-4">
                  <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                    {item.label}
                  </span>
                  <span className="text-[11px] text-slate-500 block leading-tight mt-0.5">
                    {item.desc}
                  </span>
                </div>

                <div className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  isChecked ? 'bg-emerald-950' : 'bg-slate-300'
                }`}>
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    isChecked ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* BLOQUE 4: NOTIFICACIONES Y OPCIONES AVANZADAS (Step 8 in tour) */}
      <section 
        data-tour="portfolio-notifications"
        className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-4"
      >
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
            Alertas & Opciones
          </span>
          <h3 className="text-lg font-bold text-slate-900">
            Notificaciones y Preferencias Avanzadas
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Configurá cuándo recibir avisos y qué temáticas del mercado te interesan.
          </p>
        </div>

        {notificationsControl}

        {/* Revelado Progresivo ("Más opciones avanzadas") */}
        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 py-1 cursor-pointer"
          >
            <span>{showAdvanced ? 'Ocultar opciones avanzadas' : 'Más opciones avanzadas'}</span>
            {showAdvanced ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>

          {showAdvanced && (
            <div className="mt-3 p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3 text-xs animate-in fade-in duration-150">
              <span className="font-bold text-slate-700 block">
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
                      className="flex items-center gap-2 p-2.5 rounded-xl bg-white border border-slate-200 cursor-pointer hover:border-emerald-300 transition-colors"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTopic(t.id)}
                        className="rounded text-emerald-950 accent-emerald-950 cursor-pointer"
                      />
                      <span className="text-[11px] font-semibold text-slate-800">{t.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </section>

      {/* BLOQUE 5: CUENTA Y PRIVACIDAD (Step 9 in tour) */}
      <section 
        data-tour="portfolio-account"
        className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-5"
      >
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
            Seguridad & Sesión
          </span>
          <h3 className="text-lg font-bold text-slate-900">
            Cuenta y Privacidad
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestión de sesión, credenciales y protección de tus datos financieros.
          </p>
        </div>

        {currentUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-950 text-white flex items-center justify-center font-bold text-sm shrink-0">
                  {currentUser.picture ? (
                    <img src={currentUser.picture} alt={currentUser.name} className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    currentUser.name.charAt(0).toUpperCase()
                  )}
                </div>
                <div>
                  <h4 className="text-sm font-bold text-slate-900">{currentUser.name}</h4>
                  <p className="text-xs text-slate-500">{currentUser.email}</p>
                  {currentUser.alyc && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-emerald-800 mt-0.5">
                      <Building2 className="w-3 h-3" />
                      ALyC: {currentUser.alyc}
                    </span>
                  )}
                </div>
              </div>

              <div className="text-left sm:text-right text-[11px] text-slate-500">
                <span className="block font-medium">Método: {currentUser.provider === 'google' ? 'Google' : currentUser.provider === 'microsoft' ? 'Microsoft' : 'Email'}</span>
                <span className="block text-slate-400">Zona: {currentUser.timeZone}</span>
              </div>
            </div>

            {typeof currentUser.hasRecoveryKey === 'boolean' && (!currentUser.provider || currentUser.provider === 'email') && onRecoveryKeySaved && <RecoveryKeySettings key={currentUser.id} user={currentUser} onSaved={onRecoveryKeySaved} />}

            {/* Admin Access Card (founders & admins) */}
            {onOpenAdmin && (
              <div className="p-4 rounded-2xl bg-amber-50/90 border border-amber-300 flex items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-200 text-amber-900 flex items-center justify-center shrink-0">
                    <Shield className="w-5 h-5 text-amber-800" />
                  </div>
                  <div>
                    <h5 className="font-black text-amber-950">Panel Administrador Interno</h5>
                    <p className="text-[11px] text-amber-800">
                      Métricas de negocio, usuarios, embudo, salud del pipeline y modelo de tesis.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={onOpenAdmin}
                  className="px-3.5 py-2 rounded-xl bg-amber-950 hover:bg-amber-900 text-white font-black text-xs transition-all shadow-xs shrink-0 cursor-pointer"
                >
                  Abrir Panel
                </button>
              </div>
            )}

            {/* Privacy Compliance Notice */}
            <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200/80 text-xs text-emerald-950 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold">
                <Lock className="w-3.5 h-3.5 text-emerald-800" />
                <span>Privacidad y Cumplimiento de Datos Financieros</span>
              </div>
              <p className="text-[11px] text-slate-700 leading-relaxed">
                FAROS almacena únicamente los tickers seleccionados y tus preferencias de notificación para calibrar el feed periodístico y el calendario de vencimientos. Tus contraseñas están resguardadas mediante hash criptográfico (bcrypt) y las sesiones utilizan cookies seguras HttpOnly con SameSite. Nunca compartimos tu cartera con terceros.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-2 border-t border-slate-100">
              {onLogout && (
                <button
                  type="button"
                  onClick={onLogout}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 hover:border-slate-400 hover:bg-slate-50 text-slate-800 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 text-slate-500" />
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
                  className="px-4 py-2.5 rounded-xl border border-rose-200 hover:border-rose-300 hover:bg-rose-50 text-rose-700 text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5 text-rose-500" />
                  <span>Eliminar cuenta y datos</span>
                </button>
              )}
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 text-xs text-slate-600 flex items-center justify-between">
            <span>Sesión local activa. Podés sincronizar tu cuenta en la nube cuando lo desees.</span>
            {onLogout && (
              <button
                type="button"
                onClick={onLogout}
                className="px-3 py-1.5 rounded-lg border border-slate-300 hover:bg-white text-xs font-semibold cursor-pointer"
              >
                Cerrar sesión
              </button>
            )}
          </div>
        )}
      </section>
    </div>
  );
};
