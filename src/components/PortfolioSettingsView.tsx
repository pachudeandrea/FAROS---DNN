import React, { useState } from 'react';
import { Portfolio, Asset, RiskProfile, UserPreferences, RelevanceType, AssetPosition, UserAccount } from '../types';
import { MOCK_ASSETS } from '../data/mockData';
import { ProfileSelector } from './ProfileCard';
import { 
  Plus, 
  Search, 
  X, 
  Check, 
  Bell, 
  ChevronDown, 
  ChevronUp, 
  Sliders,
  Wallet,
  Shield,
  Sparkles,
  TrendingUp,
  TrendingDown,
  LogOut,
  Trash2,
  User,
  Building2,
  Lock
} from 'lucide-react';

interface PortfolioSettingsViewProps {
  portfolio: Portfolio;
  portfolios: Portfolio[];
  onSelectPortfolio: (p: Portfolio) => void;
  onSavePortfolio: (updated: Portfolio) => void;
  preferences: UserPreferences;
  onSavePreferences: (updated: UserPreferences) => void;
  onOpenCreateNew: () => void;
  currentUser?: UserAccount | null;
  onLogout?: () => void;
  onDeleteAccount?: () => void;
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
}) => {
  // Asset search state for adding assets
  const [assetSearch, setAssetSearch] = useState<string>('');
  const [showAdvanced, setShowAdvanced] = useState<boolean>(false);

  // Available assets to add
  const unownedAssets = MOCK_ASSETS.filter(a => 
    !portfolio.assetIds.includes(a.id) &&
    (assetSearch.trim() === '' || 
     a.symbol.toLowerCase().includes(assetSearch.toLowerCase()) || 
     a.name.toLowerCase().includes(assetSearch.toLowerCase()))
  );

  const handleAddAsset = (assetId: string, position: AssetPosition = 'long') => {
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
    if (portfolio.assetIds.length > 1) {
      const nextPositions = { ...(portfolio.assetPositions || {}) };
      delete nextPositions[assetId];
      const updated: Portfolio = {
        ...portfolio,
        assetIds: portfolio.assetIds.filter(id => id !== assetId),
        assetPositions: nextPositions
      };
      onSavePortfolio(updated);
    }
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

  const toggleNotificationGeneral = () => {
    onSavePreferences({
      ...preferences,
      notificationsEnabled: !preferences.notificationsEnabled
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

  return (
    <div className="max-w-3xl mx-auto space-y-8 pb-10">
      {/* Title */}
      <div className="border-b border-slate-200 pb-4">
        <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Mi cartera
        </h2>
        <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
          Ajustá tus activos monitoreados, carteras activas y preferencias informativas.
        </p>
      </div>

      {/* BLOQUE (a): MI CARTERA (Rocket Money Accounts Style) */}
      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-[0_2px_16px_rgba(0,0,0,0.04)] p-6 sm:p-8 space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-emerald-100 text-emerald-900 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-950">
                Cuentas & Portfolios
              </span>
              <h3 className="text-xl font-black text-slate-900">
                Mi Cartera de Inversión
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

        {/* Portfolio switcher tabs styled like Rocket Money Connected Accounts */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {portfolios.map(p => {
            const isSelected = p.id === portfolio.id;
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
                  {p.assetIds.length} activos ({p.assetIds.filter(id => (p.assetPositions?.[id] || 'long') === 'long').length} Long · {p.assetIds.filter(id => p.assetPositions?.[id] === 'short').length} Short)
                </p>
                <span className="text-[11px] text-emerald-800 font-semibold mt-1 block">
                  Perfil: {p.profile === 'dinamico' ? 'Dinámico' : p.profile === 'conservador' ? 'Conservador' : 'Moderado'}
                </span>
              </button>
            );
          })}
        </div>

        {/* Asset Search to Add */}
        <div className="space-y-2 pt-2">
          <label className="block text-xs font-bold text-slate-700">
            Agregar activos a {portfolio.name}:
          </label>
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-400" />
            <input
              type="text"
              value={assetSearch}
              onChange={(e) => setAssetSearch(e.target.value)}
              placeholder="Escribí el símbolo o nombre (ej: AL30, YPFD, NVDA, MEP)..."
              className="w-full pl-10 pr-3.5 py-2.5 text-xs rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50"
            />
          </div>

          {/* Quick results if typing */}
          {assetSearch.trim().length > 0 && (
            <div className="p-2 rounded-xl border border-slate-200 bg-white shadow-md max-h-48 overflow-y-auto space-y-1">
              {unownedAssets.length === 0 ? (
                <p className="text-xs text-slate-400 p-2 text-center">
                  No se encontraron activos o ya están en tu cartera.
                </p>
              ) : (
                unownedAssets.map(a => (
                  <div
                    key={a.id}
                    className="p-2 rounded-lg hover:bg-slate-50 flex items-center justify-between text-xs border border-slate-100"
                  >
                    <div>
                      <span className="font-mono font-bold text-slate-900 mr-2">{a.symbol}</span>
                      <span className="text-slate-600 text-[11px]">{a.name}</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleAddAsset(a.id, 'long')}
                      className="text-xs font-semibold text-emerald-950 bg-emerald-50 hover:bg-emerald-600 hover:text-white px-3 py-1 rounded-lg border border-emerald-300 transition-colors cursor-pointer shrink-0"
                      title={`Agregar ${a.symbol} a la cartera (se asigna Long por defecto)`}
                    >
                      + Agregar
                    </button>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Current Assets Chips with position badges and remove button */}
        <div className="space-y-2 pt-2">
          {(() => {
            const longCount = portfolio.assetIds.filter(id => (portfolio.assetPositions?.[id] || 'long') === 'long').length;
            const shortCount = portfolio.assetIds.filter(id => portfolio.assetPositions?.[id] === 'short').length;
            return (
              <div className="flex items-center justify-between flex-wrap gap-1">
                <span className="text-xs font-bold text-slate-700 block">
                  Activos bajo monitoreo: <span className="text-emerald-950 font-black">{portfolio.assetIds.length}</span> ({longCount} Long · {shortCount} Short)
                </span>
                <span className="text-[10px] text-slate-500 flex items-center gap-1.5">
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-600 inline-block"></span> Long = azul</span>
                  <span>·</span>
                  <span className="inline-flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-amber-400 border border-amber-500 inline-block"></span> Short = amarillo</span>
                </span>
              </div>
            );
          })()}

          <div className="flex flex-wrap gap-2">
            {portfolio.assetIds.map(assetId => {
              const asset = MOCK_ASSETS.find(a => a.id === assetId);
              const position = portfolio.assetPositions?.[assetId] || 'long';
              const isLong = position === 'long';

              return (
                <span
                  key={assetId}
                  className={`inline-flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-xl border text-xs font-semibold transition-all ${
                    isLong
                      ? 'bg-blue-50/75 border-blue-300 text-blue-950 shadow-2xs'
                      : 'bg-amber-50/85 border-amber-300 text-amber-950 shadow-2xs'
                  }`}
                >
                  <span className="font-mono font-bold">
                    {asset?.symbol || assetId}
                  </span>
                  <span className={`text-[11px] truncate max-w-[100px] ${isLong ? 'text-blue-800/80' : 'text-amber-900/80'}`}>
                    {asset?.name}
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
                    title={`Posición ${position.toUpperCase()}. Click para alternar a ${isLong ? 'Short' : 'Long'}`}
                  >
                    {position.toUpperCase()}
                  </button>

                  <button
                    onClick={() => handleRemoveAsset(assetId)}
                    className={`p-0.5 rounded transition-colors ml-0.5 ${
                      isLong ? 'hover:bg-blue-200 text-blue-400 hover:text-blue-800' : 'hover:bg-amber-200 text-amber-600 hover:text-amber-950'
                    }`}
                    title={`Quitar ${assetId}`}
                    aria-label={`Quitar ${assetId}`}
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* BLOQUE 2: MI PERFIL */}
      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-4">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
            Bloque 2
          </span>
          <h3 className="text-lg font-bold text-slate-900">
            Mi Perfil de Inversor
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Seleccioná tu perfil
          </p>
        </div>

        <ProfileSelector
          value={portfolio.profile}
          onChange={handleSelectRiskProfile}
        />
      </section>

      {/* BLOQUE (c): QUÉ NOTICIAS ME IMPORTAN */}
      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-5">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
            Bloque 3
          </span>
          <h3 className="text-lg font-bold text-slate-900">
            Qué Noticias me Importan
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Activá los tipos de eventos que querés que FAROS priorice en tu pantalla de inicio.
          </p>
        </div>

        {/* Toggles for relevance types */}
        <div className="space-y-3">
          {[
            {
              id: 'impacto_precio' as RelevanceType,
              label: 'Impacto en precio',
              desc: 'Variaciones directas de cotización, licitaciones de deuda y anuncios de mercado.'
            },
            {
              id: 'valoracion_mercado' as RelevanceType,
              label: 'Valoración de mercado',
              desc: 'Balances contables, ingresos trimestrales, márgenes de ganancia y planes de capex.'
            },
            {
              id: 'ruido' as RelevanceType,
              label: 'Ruido de mercado',
              desc: 'Filtrado de rumores de redes sociales y desmentidos de organismos oficiales.'
            },
            {
              id: 'contexto_macro' as RelevanceType,
              label: 'Contexto macroeconómico',
              desc: 'Índices de inflación, acumulación de reservas y decisiones de tasas de interés.'
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

                {/* Custom toggle switch */}
                <div className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
                  isChecked ? 'bg-emerald-900' : 'bg-slate-300'
                }`}>
                  <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    isChecked ? 'translate-x-5' : 'translate-x-0'
                  }`} />
                </div>
              </div>
            );
          })}
        </div>

        {/* General Notifications Toggle */}
        <div 
          onClick={toggleNotificationGeneral}
          className="flex items-center justify-between p-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 cursor-pointer pt-3"
        >
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-emerald-800 shrink-0" />
            <div>
              <span className="text-xs sm:text-sm font-bold text-slate-900 block">
                Notificaciones de noticias relevantes en mi cartera
              </span>
              <span className="text-[11px] text-slate-600 block">
                Aviso inmediato cuando un evento confirmado impacta en tus activos.
              </span>
            </div>
          </div>

          <div className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors shrink-0 ${
            preferences.notificationsEnabled ? 'bg-emerald-900' : 'bg-slate-300'
          }`}>
            <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
              preferences.notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
            }`} />
          </div>
        </div>

        {/* Revelado Progresivo ("Más opciones") */}
        <div className="pt-2 border-t border-slate-100">
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900 py-1"
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
                      className="flex items-center gap-2 p-2 rounded-lg bg-white border border-slate-200 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleTopic(t.id)}
                        className="rounded text-emerald-950 accent-emerald-950"
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

      {/* BLOQUE 5: CUENTA Y SEGURIDAD */}
      <section className="bg-white rounded-3xl border border-slate-200/90 shadow-sm p-6 sm:p-7 space-y-5">
        <div>
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
            Bloque 5
          </span>
          <h3 className="text-lg font-bold text-slate-900">
            Cuenta y Privacidad
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestión de sesión, credenciales y protección de tus datos financieros
          </p>
        </div>

        {currentUser ? (
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-emerald-800 text-white flex items-center justify-center font-bold text-sm shrink-0">
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
                  Cerrar sesión
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
                  Eliminar cuenta y datos
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

