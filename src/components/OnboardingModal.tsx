import { searchAssets, CATEGORY_LABELS } from '../data/assetCatalog';
import type { AssetCategory } from '../types';
import { useModalFocus } from '../hooks/useModalFocus';
import { usePendingChanges } from '../hooks/usePendingChanges';
import React, { useState } from 'react';
import { Asset, Portfolio, RiskProfile, AssetPosition } from '../types';
import { MOCK_PORTFOLIOS } from '../data/mockData';
import { BrandLogo } from './BrandLogo';
import { ProfileSelector } from './ProfileCard';
import { 
  ArrowRight, 
  ArrowLeft, 
  Search, 
  X, 
  TrendingUp, 
  TrendingDown, 
  Trash2,
  Check
} from 'lucide-react';

interface OnboardingModalProps {
  isOpen: boolean;
  onComplete: (selectedPortfolio: Portfolio, allPortfolios: Portfolio[]) => void;
  onClose?: () => void;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onComplete,
  onClose,
}) => {
  const modalRef = useModalFocus(() => onClose?.(), isOpen);
  const [step, setStep] = useState<1 | 2>(1);
  const [profile, setProfile] = useState<RiskProfile>('moderado');
  const [portfolioName, setPortfolioName] = useState('Mi Cartera Personal');
  // Stored as assetId -> 'long' | 'short'. New assets automatically receive 'long'.
  const [assetPositions, setAssetPositions] = useState<Record<string, AssetPosition>>({
    AL30: 'long',
    GD30: 'long',
    AAPL: 'long',
    NVDA: 'short',
    YPFD: 'long',
    MEP: 'long',
  });

  const [activeCategory, setActiveCategory] = useState<'todos' | AssetCategory>('todos');
  const [searchTerm, setSearchTerm] = useState<string>('');
  usePendingChanges(isOpen);

  // 1. Automatic Long assignment when adding an asset
  const handleAddAsset = (assetId: string) => {
    setAssetPositions(prev => ({
      ...prev,
      [assetId]: 'long'
    }));
  };

  // 2. Single-tap toggle between Long and Short
  const handleTogglePosition = (assetId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAssetPositions(prev => {
      const current = prev[assetId] || 'long';
      return {
        ...prev,
        [assetId]: current === 'long' ? 'short' : 'long'
      };
    });
  };

  // 3. Remove asset from portfolio
  const handleRemoveAsset = (assetId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setAssetPositions(prev => {
      const next = { ...prev };
      delete next[assetId];
      return next;
    });
  };

  const longCount = Object.values(assetPositions).filter(p => p === 'long').length;
  const shortCount = Object.values(assetPositions).filter(p => p === 'short').length;
  const totalSelected = longCount + shortCount;
  const selectedAssetIds = Object.keys(assetPositions);

  const handleFinish = () => {
    const newPortfolio: Portfolio = {
      id: `user_port_${Date.now()}`,
      name: portfolioName.trim() || 'Mi Cartera Personal',
      description: `Cartera (${profile === 'dinamico' ? 'Perfil: Dinámico' : profile === 'conservador' ? 'Perfil: Conservador' : 'Perfil: Moderado'}) con ${selectedAssetIds.length} activos monitoreados (${longCount} Long · ${shortCount} Short).`,
      profile,
      assetIds: selectedAssetIds,
      assetPositions
    };

    const all = [newPortfolio, ...MOCK_PORTFOLIOS];
    onComplete(newPortfolio, all);
  };

  const filteredAssets = searchAssets(searchTerm).filter(asset => activeCategory === 'todos' || asset.category === activeCategory);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div 
        ref={modalRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Crear cartera"
        className="bg-paper rounded-3xl max-w-xl w-full border border-ink-200 shadow-2xl overflow-hidden flex flex-col max-h-[calc(100dvh-1.5rem)] sm:max-h-[calc(100dvh-3rem)] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header with Progress Bar */}
        <div className="shrink-0 bg-brand-950 text-paper p-4 sm:p-6 pb-4">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <BrandLogo size="sm" variant="full" tone="dark" />
              <span className="text-xs font-bold tracking-widest uppercase text-brand-300">
                FAROS · Configuración Inicial
              </span>
            </div>
            <span className="shrink-0 whitespace-nowrap text-xs font-mono font-bold text-brand-200">
              Paso {step} de 2
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-brand-900 rounded-full h-1.5 mb-3 overflow-hidden">
            <div 
              className="bg-brand-400 h-1.5 rounded-full transition-all duration-300"
              style={{ width: step === 1 ? '50%' : '100%' }}
            />
          </div>

          <h2 className="text-xl sm:text-2xl font-bold text-paper">
            {step === 1 ? 'Seleccioná tu perfil y nombre de cartera' : 'Seleccioná los activos que tenés'}
          </h2>
          <p className="text-xs text-brand-100/80 mt-1">
            {step === 1
              ? 'FAROS utilizará estos datos para clasificar las noticias que impactan en tu patrimonio.'
              : 'Marcá tus bonos, CEDEARs, acciones o divisas bajo monitoreo.'
            }
          </p>
        </div>

        {/* Content Area */}
        <div className="min-h-0 min-w-0 p-4 sm:p-6 overflow-y-auto space-y-6 flex-1 text-ink-800">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-muted uppercase tracking-wide mb-1.5">
                  Nombre de tu cartera
                </label>
                <input
                  type="text"
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder="Ej: Cartera Crecimiento Personal"
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-ink-300 focus:outline-none focus:border-brand-800 focus:ring-1 focus:ring-brand-800 bg-ink-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-muted uppercase tracking-wide mb-2">
                  Seleccioná tu perfil
                </label>
                <ProfileSelector
                  value={profile}
                  onChange={setProfile}
                />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3.5">
              {/* Header with live summary */}
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-muted uppercase tracking-wide block">
                    Activos seleccionados: {totalSelected > 0 ? (
                      <span className="text-brand-950 font-bold">
                        {totalSelected} <span className="font-semibold text-muted">({longCount} Long · {shortCount} Short)</span>
                      </span>
                    ) : (
                      <span className="text-muted font-semibold">0</span>
                    )}
                  </span>
                  <span className="text-[11px] text-muted block mt-0.5">
                    Se agregan automáticamente como Long. Tocá la etiqueta de posición para alternar entre Long y Short.
                  </span>
                </div>
              </div>

              {/* Category tabs */}
              <div role="group" aria-label="Filtrar activos por categoría" className="flex min-w-0 max-w-full items-center gap-1 p-1 bg-ink-100 rounded-xl overflow-x-auto text-xs">
                {(['todos', ...Object.keys(CATEGORY_LABELS)] as ('todos' | AssetCategory)[]).map(cat => (
                  <button
                    key={cat}
                    type="button"
                    aria-pressed={activeCategory === cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`shrink-0 min-h-11 px-3 py-2 font-bold rounded-lg capitalize whitespace-nowrap transition-colors cursor-pointer ${
                      activeCategory === cat
                        ? 'bg-paper text-brand-950 shadow-xs'
                        : 'text-muted hover:text-ink-900'
                    }`}
                  >
                    {cat === 'todos' ? 'Todos' : CATEGORY_LABELS[cat]}
                  </button>
                ))}
              </div>

              {/* Real-time Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscá por ticker o nombre (ej: AL30, YPFD, AAPL, MEP)..."
                  className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-ink-50/80 hover:bg-ink-50 focus:bg-paper rounded-xl border border-ink-200 focus:outline-none focus:border-brand-800 focus:ring-1 focus:ring-brand-800 text-ink-800 placeholder-ink-400 transition-colors"
                />
                {searchTerm.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-muted hover:text-muted rounded-lg hover:bg-ink-200/60 transition-colors cursor-pointer"
                    title="Limpiar búsqueda"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Legend: Long = azul · Short = amarillo */}
              <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-ink-50 border border-ink-200/80 text-muted">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-bold text-info-text">
                    <span className="w-2.5 h-2.5 rounded-full bg-info-600 inline-block shadow-2xs shrink-0" />
                    <span>Long = azul</span>
                  </span>
                  <span aria-hidden="true" className="text-ink-300">·</span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-warning-text">
                    <span className="w-2.5 h-2.5 rounded-full bg-warning-400 border border-warning-500 inline-block shadow-2xs shrink-0" />
                    <span>Short = amarillo</span>
                  </span>
                </div>
                <span className="text-[10px] text-muted font-medium hidden sm:inline">
                  Tocá la etiqueta para alternar con 1 toque
                </span>
              </div>

              {/* Asset grid */}
              {filteredAssets.length === 0 ? (
                <div className="py-8 px-4 text-center bg-ink-50/70 rounded-2xl border border-dashed border-ink-200 flex flex-col items-center justify-center">
                  <div className="w-9 h-9 rounded-full bg-ink-100 flex items-center justify-center text-muted mb-2">
                    <Search className="w-4 h-4" />
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-muted">
                    No encontramos activos con esa búsqueda
                  </p>
                  <p className="text-[11px] text-muted mt-1 max-w-xs">
                    Probá con otro término o cambiá el filtro de categoría.
                  </p>
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="mt-3 px-3 py-1.5 text-xs font-bold text-brand-800 hover:text-brand-950 bg-paper hover:bg-brand-50 rounded-lg transition-colors border border-brand-200 shadow-2xs cursor-pointer"
                    >
                      Limpiar búsqueda
                    </button>
                  )}
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-64 overflow-y-auto pr-1">
                  {filteredAssets.map(asset => {
                    const position = assetPositions[asset.id];
                    const isLong = position === 'long';
                    const isShort = position === 'short';
                    const isSelected = isLong || isShort;

                    return (
                      <div
                        key={asset.id}
                        onClick={() => !isSelected && handleAddAsset(asset.id)}
                        className={`rounded-2xl border transition-all text-xs p-3 flex items-center justify-between gap-2.5 ${
                          !isSelected
                            ? 'border-ink-200 hover:border-brand-300 bg-paper hover:bg-ink-50/60 cursor-pointer'
                            : isLong
                            ? 'border-info-400 bg-info-50/80 shadow-2xs'
                            : 'border-warning-400 bg-warning-50/85 shadow-2xs'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-mono font-bold text-xs ${
                              isLong ? 'text-info-text font-bold' : isShort ? 'text-warning-text font-bold' : 'text-ink-900'
                            }`}>
                              {asset.symbol}
                            </span>
                            <span className="text-[10px] text-muted uppercase font-medium">
                              {asset.category}
                            </span>
                          </div>
                          <span className={`text-[11px] truncate block ${
                            isLong ? 'text-info-text/80 font-medium' : isShort ? 'text-warning-text/80 font-medium' : 'text-muted'
                          }`}>
                            {asset.name}
                          </span>
                        </div>

                        {/* Position Badge & Actions */}
                        <div className="shrink-0 flex items-center gap-1.5">
                          {isSelected ? (
                            <>
                              {/* 1-Tap Toggle Badge (Blue for Long, Yellow for Short) */}
                              <button
                                type="button"
                                onClick={(e) => handleTogglePosition(asset.id, e)}
                                className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold tracking-wider uppercase transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95 ${
                                  isLong
                                    ? 'bg-info-600 hover:bg-info-700 text-paper shadow-info-900/20'
                                    : 'bg-warning-400 hover:bg-warning-300 text-warning-text border border-warning-500/70 shadow-warning-900/20'
                                }`}
                                title={`Posición actual: ${position.toUpperCase()}. Tocá para cambiar a ${isLong ? 'SHORT' : 'LONG'}`}
                              >
                                {isLong ? (
                                  <TrendingUp className="w-2.5 h-2.5 stroke-[3]" />
                                ) : (
                                  <TrendingDown className="w-2.5 h-2.5 stroke-[3]" />
                                )}
                                <span>{position.toUpperCase()}</span>
                              </button>

                              {/* Quick remove button */}
                              <button
                                type="button"
                                onClick={(e) => handleRemoveAsset(asset.id, e)}
                                className="p-1 rounded-md text-muted hover:text-danger-600 hover:bg-ink-200/60 transition-colors cursor-pointer"
                                title={`Quitar ${asset.symbol}`}
                                aria-label={`Quitar ${asset.symbol}`}
                              >
                                <X className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleAddAsset(asset.id)}
                              className="px-2.5 py-1 rounded-lg bg-ink-100 hover:bg-brand-100 hover:text-brand-950 text-muted font-bold text-[10px] border border-ink-200 transition-colors cursor-pointer flex items-center gap-1"
                              title={`Agregar ${asset.symbol} como Long`}
                            >
                              <span>+ Agregar</span>
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Navigation */}
        <div className="shrink-0 px-4 sm:px-6 py-4 border-t border-ink-200 bg-ink-50 flex items-center justify-between gap-3">
          {step === 2 ? (
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-muted hover:text-ink-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Atrás</span>
            </button>
          ) : (
            <div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-xs font-semibold text-muted hover:text-ink-800"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}

          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand-950 text-paper font-bold text-xs rounded-xl hover:bg-brand-900 transition-colors shadow-xs"
            >
              <span>Elegir activos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={selectedAssetIds.length === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-brand-950 text-paper font-bold text-xs rounded-xl hover:bg-brand-900 transition-colors shadow-xs disabled:opacity-50"
            >
              <span>Comenzar en FARO</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
