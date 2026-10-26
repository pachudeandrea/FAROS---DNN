import React, { useState } from 'react';
import { Asset, Portfolio, RiskProfile, AssetPosition } from '../types';
import { MOCK_ASSETS, MOCK_PORTFOLIOS } from '../data/mockData';
import { LighthouseLogo } from './LighthouseLogo';
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

  const [activeCategory, setActiveCategory] = useState<'todos' | 'bonos' | 'acciones' | 'cedears' | 'divisas'>('todos');
  const [searchTerm, setSearchTerm] = useState<string>('');

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

  // Accent- and case-insensitive string normalizer
  const normalizeText = (text: string) =>
    text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();

  const normalizedQuery = normalizeText(searchTerm);

  const filteredAssets = MOCK_ASSETS.filter(asset => {
    // 1. Filter by category
    const matchesCategory = activeCategory === 'todos' || asset.category === activeCategory;
    if (!matchesCategory) return false;

    // 2. Real-time search by ticker or name
    if (!normalizedQuery) return true;
    const matchesSymbol = normalizeText(asset.symbol).includes(normalizedQuery);
    const matchesName = normalizeText(asset.name).includes(normalizedQuery);
    return matchesSymbol || matchesName;
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6">
      <div 
        className="bg-white rounded-3xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Top Header with Progress Bar */}
        <div className="bg-emerald-950 text-white p-6 pb-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2.5">
              <LighthouseLogo size="sm" />
              <span className="text-xs font-bold tracking-widest uppercase text-emerald-300">
                FAROS · Configuración Inicial
              </span>
            </div>
            <span className="text-xs font-mono font-bold text-emerald-200">
              Paso {step} de 2
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-emerald-900 rounded-full h-1.5 mb-3 overflow-hidden">
            <div 
              className="bg-emerald-400 h-1.5 rounded-full transition-all duration-300"
              style={{ width: step === 1 ? '50%' : '100%' }}
            />
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-white">
            {step === 1 ? 'Seleccioná tu perfil y nombre de cartera' : 'Seleccioná los activos que tenés'}
          </h2>
          <p className="text-xs text-emerald-100/80 mt-1">
            {step === 1
              ? 'FAROS utilizará estos datos para clasificar las noticias que impactan en tu patrimonio.'
              : 'Marcá tus bonos, CEDEARs, acciones o divisas bajo monitoreo.'
            }
          </p>
        </div>

        {/* Content Area */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-1.5">
                  Nombre de tu cartera
                </label>
                <input
                  type="text"
                  value={portfolioName}
                  onChange={(e) => setPortfolioName(e.target.value)}
                  placeholder="Ej: Cartera Crecimiento Personal"
                  className="w-full px-4 py-2.5 text-xs sm:text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800 bg-slate-50/50"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wide mb-2">
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
                  <span className="text-xs font-bold text-slate-700 uppercase tracking-wide block">
                    Activos seleccionados: {totalSelected > 0 ? (
                      <span className="text-emerald-950 font-black">
                        {totalSelected} <span className="font-semibold text-slate-600">({longCount} Long · {shortCount} Short)</span>
                      </span>
                    ) : (
                      <span className="text-slate-400 font-semibold">0</span>
                    )}
                  </span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    Se agregan automáticamente como Long. Tocá la etiqueta de posición para alternar entre Long y Short.
                  </span>
                </div>
              </div>

              {/* Category tabs */}
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl overflow-x-auto text-xs">
                {(['todos', 'bonos', 'acciones', 'cedears', 'divisas'] as const).map(cat => (
                  <button
                    key={cat}
                    onClick={() => setActiveCategory(cat)}
                    className={`px-3 py-1 font-bold rounded-lg capitalize whitespace-nowrap transition-colors cursor-pointer ${
                      activeCategory === cat
                        ? 'bg-white text-emerald-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {cat}
                  </button>
                ))}
              </div>

              {/* Real-time Search Bar */}
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  placeholder="Buscá por ticker o nombre (ej: AL30, YPFD, AAPL, MEP)..."
                  className="w-full pl-9 pr-9 py-2 text-xs sm:text-sm bg-slate-50/80 hover:bg-slate-50 focus:bg-white rounded-xl border border-slate-200 focus:outline-none focus:border-emerald-800 focus:ring-1 focus:ring-emerald-800 text-slate-800 placeholder-slate-400 transition-colors"
                />
                {searchTerm.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
                    title="Limpiar búsqueda"
                    aria-label="Limpiar búsqueda"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* Legend: Long = azul · Short = amarillo */}
              <div className="flex items-center justify-between text-[11px] px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-200/80 text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 font-bold text-blue-900">
                    <span className="w-2.5 h-2.5 rounded-full bg-blue-600 inline-block shadow-2xs shrink-0" />
                    <span>Long = azul</span>
                  </span>
                  <span className="text-slate-300">·</span>
                  <span className="inline-flex items-center gap-1.5 font-bold text-amber-950">
                    <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-amber-500 inline-block shadow-2xs shrink-0" />
                    <span>Short = amarillo</span>
                  </span>
                </div>
                <span className="text-[10px] text-slate-500 font-medium hidden sm:inline">
                  Tocá la etiqueta para alternar con 1 toque
                </span>
              </div>

              {/* Asset grid */}
              {filteredAssets.length === 0 ? (
                <div className="py-8 px-4 text-center bg-slate-50/70 rounded-2xl border border-dashed border-slate-200 flex flex-col items-center justify-center">
                  <div className="w-9 h-9 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-2">
                    <Search className="w-4 h-4" />
                  </div>
                  <p className="text-xs sm:text-sm font-bold text-slate-700">
                    No encontramos activos con esa búsqueda
                  </p>
                  <p className="text-[11px] text-slate-500 mt-1 max-w-xs">
                    Probá con otro término o cambiá el filtro de categoría.
                  </p>
                  {searchTerm && (
                    <button
                      type="button"
                      onClick={() => setSearchTerm('')}
                      className="mt-3 px-3 py-1.5 text-xs font-bold text-emerald-800 hover:text-emerald-950 bg-white hover:bg-emerald-50 rounded-lg transition-colors border border-emerald-200 shadow-2xs cursor-pointer"
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
                            ? 'border-slate-200 hover:border-emerald-300 bg-white hover:bg-slate-50/60 cursor-pointer'
                            : isLong
                            ? 'border-blue-400 bg-blue-50/80 shadow-2xs'
                            : 'border-amber-400 bg-amber-50/85 shadow-2xs'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5">
                            <span className={`font-mono font-bold text-xs ${
                              isLong ? 'text-blue-950 font-black' : isShort ? 'text-amber-950 font-black' : 'text-slate-900'
                            }`}>
                              {asset.symbol}
                            </span>
                            <span className="text-[10px] text-slate-400 uppercase font-medium">
                              {asset.category}
                            </span>
                          </div>
                          <span className={`text-[11px] truncate block ${
                            isLong ? 'text-blue-800/80 font-medium' : isShort ? 'text-amber-900/80 font-medium' : 'text-slate-500'
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
                                className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-black tracking-wider uppercase transition-all shadow-xs flex items-center gap-1 cursor-pointer active:scale-95 ${
                                  isLong
                                    ? 'bg-blue-600 hover:bg-blue-700 text-white shadow-blue-900/20'
                                    : 'bg-amber-400 hover:bg-amber-300 text-amber-950 border border-amber-500/70 shadow-amber-900/20'
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
                                className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-slate-200/60 transition-colors cursor-pointer"
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
                              className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-100 hover:text-emerald-950 text-slate-700 font-bold text-[10px] border border-slate-200 transition-colors cursor-pointer flex items-center gap-1"
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
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between">
          {step === 2 ? (
            <button
              onClick={() => setStep(1)}
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Atrás</span>
            </button>
          ) : (
            <div>
              {onClose && (
                <button
                  onClick={onClose}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Cancelar
                </button>
              )}
            </div>
          )}

          {step === 1 ? (
            <button
              onClick={() => setStep(2)}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-950 text-white font-bold text-xs rounded-xl hover:bg-emerald-900 transition-colors shadow-xs"
            >
              <span>Elegir activos</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              disabled={selectedAssetIds.length === 0}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-emerald-950 text-white font-bold text-xs rounded-xl hover:bg-emerald-900 transition-colors shadow-xs disabled:opacity-50"
            >
              <span>Comenzar en FARO</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
