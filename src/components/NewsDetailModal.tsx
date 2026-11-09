import { VerifiedCoverage } from './MediaComparison';
import { useModalFocus } from '../hooks/useModalFocus';
import React, { useState, useMemo, useEffect, useRef } from 'react';
import { 
  NewsItem, 
  Asset, 
  Portfolio, 
  AssetPosition, 
  MediaCoverage,
} from '../types';
import { getPortfolioAffectedAssetIds, getPortfolioNewsImpact } from '../utils/portfolioNews';
import { generatePortfolioNewsScript } from '../utils/dailySummaryGenerator';
import { getRelevanceLabel } from './NewsCard';
import { 
  X, 
  TrendingUp, 
  TrendingDown, 
  Minus, 
  Volume2, 
  Play,
  Pause,
  Landmark,
  ShieldAlert,
  ExternalLink,
  Share2,
  Layers,
  Compass,
  FileText,
  AlertCircle,
  Eye,
  Info
} from 'lucide-react';
import { 
  audioController, 
  AudioControllerState, 
  calculateEstimatedDuration 
} from '../utils/audioController';

interface NewsDetailModalProps {
  news: NewsItem | null;
  onClose: () => void;
  assetsMap: Record<string, Asset>;
  onPlayAudio: (news: NewsItem) => void;
  portfolio: Portfolio;
  assetPositions?: Record<string, AssetPosition>;
  isAudioActive?: boolean;
  activeTrackId?: string;
}

import { distinctMediaSources } from '../utils/sourceGrounding';

/** Keep the explanation tied to the reported event, rather than a ticker-based narrative. */
interface AssetAnalysisDetail {
  mecanismo: string;
  factores: string[];
}

function getAssetAnalysisDetail(
  symbol: string,
  asset: Asset | undefined,
  headline: string,
  relevanceType: NewsItem['relevanceType'],
  relationshipDetail?: string
): AssetAnalysisDetail {
  const scopeByRelevance: Record<NewsItem['relevanceType'], string> = {
    impacto_precio: 'La categoría recoge un hecho material o una variación de cotización reportados. La etiqueta por sí sola no demuestra que el precio haya cambiado.',
    valoracion_mercado: 'El hecho puede aportar información para la valoración del instrumento o de su emisor. No demuestra una reacción de la cotización.',
    contexto_macro: 'La relación es de contexto macroeconómico. No demuestra un efecto de precio específico sobre este instrumento.',
    ruido: 'La información se clasifica como ruido: no hay evidencia suficiente de un efecto financiero específico sobre este instrumento.',
  };

  return {
    mecanismo: relationshipDetail?.trim()
      || `El hecho publicado es: «${headline}». La información disponible no detalla un efecto específico sobre ${asset?.name || symbol}.`,
    factores: [
      scopeByRelevance[relevanceType],
      'La lectura se limita al hecho publicado y no estima precios, rendimientos ni movimientos futuros.',
    ],
  };
}

export const NewsDetailModal: React.FC<NewsDetailModalProps> = ({
  news,
  onClose,
  assetsMap,
  onPlayAudio,
  portfolio,
  assetPositions,
  isAudioActive = false,
  activeTrackId,
}) => {
  if (!news) return null;

  const modalRef = useModalFocus(onClose);
  const [copied, setCopied] = useState(false);
  const coverageRef = useRef<HTMLElement>(null);
  const [audioState, setAudioState] = useState<AudioControllerState>(audioController.getState());
  const audioDuration = useMemo(() => calculateEstimatedDuration(generatePortfolioNewsScript(portfolio, news), 1.0), [portfolio, news]);

  useEffect(() => {
    const unsub = audioController.subscribe(setAudioState);
    return () => {
      unsub();
      // CRITICAL: Stop all audio when detail modal unmounts
      audioController.stopAll('modal-unmount');
    };
  }, []);

  const handleCloseModal = () => {
    // CRITICAL: Stop all audio immediately upon closing with X, outside click, or escape
    audioController.stopAll('modal-close');
    onClose();
  };

  // Calculate effective impact based on portfolio positions
  const matchingAssetIds = getPortfolioAffectedAssetIds(news, portfolio.assetIds);
  const effectiveImpact = getPortfolioNewsImpact(news, { assetIds: portfolio.assetIds, assetPositions });
  const isFavorable = effectiveImpact === 'favorable' || effectiveImpact === 'positivo';
  const isAlert = effectiveImpact === 'alerta' || effectiveImpact === 'negativo';

  const handleShare = () => {
    const dir = isFavorable ? 'FAVORABLE' : isAlert ? 'DESFAVORABLE' : 'NEUTRAL';
    navigator.clipboard?.writeText(
      `FAROS - ${news.headline}\nSíntesis: ${news.briefSummary}\nDesglose cualitativo: ${dir}`
    );
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Block 2: Etiqueta de efecto (Favorable / Desfavorable / Neutral)
  const getImpactBadge = () => {
    if (isFavorable) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-brand-950 bg-brand-100 border border-brand-300">
          <TrendingUp className="w-4 h-4 text-brand-text" />
          Favorable
        </span>
      );
    }
    if (isAlert) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-danger-950 bg-danger-100 border border-danger-300">
          <TrendingDown className="w-4 h-4 text-danger-700" />
          Desfavorable
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-ink-800 bg-ink-100 border border-ink-300">
        <Minus className="w-4 h-4 text-muted" />
        Neutral
      </span>
    );
  };

  // Valid sources with legitimate, real grounded links (strictly real URLs and headlines)
  const verifiedSources = useMemo(() => {
    return distinctMediaSources(news.sources || []);
  }, [news.sources]);

  // Count matches verified real sources count
  const validSourcesCount = verifiedSources.length;

  // Generate customized introduction paragraph for portfolio analysis
  // STRICTLY NON-ADVISORY: Objective news & market transmission breakdown
  const introParagraph = useMemo(() => {
    const portfolioName = portfolio.name || 'Cartera Principal';

    if (matchingAssetIds.length === 0) {
      return `Ninguno de los activos vinculados con esta publicación forma parte de tu cartera '${portfolioName}'. La noticia se muestra como información de mercado, sin atribuirle un efecto sobre tus posiciones.`;
    }

    const symbolsText = matchingAssetIds.join(', ');
    const scope = news.relevanceType === 'contexto_macro'
      ? 'El vínculo es macroeconómico y no demuestra un impacto de precio sobre cada instrumento.'
      : news.relevanceType === 'ruido'
        ? 'La información se clasifica como ruido y no permite establecer un efecto financiero específico.'
        : 'El desglose distingue el hecho publicado de su interpretación condicional para cada posición Long o Short.';

    return `Esta publicación se relaciona con los activos ${symbolsText} de tu cartera '${portfolioName}'. ${scope}`;
  }, [portfolio, matchingAssetIds, news]);

  if (!news) return null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-ink-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={handleCloseModal}
    >
      <div 
        ref={modalRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="news-detail-title"
        className="bg-paper rounded-3xl max-w-2xl w-full border border-ink-200 shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* BLOQUE 1: Encabezado (impacto en precio, tiempo, cantidad de medios, compartir y cerrar) */}
        <div className="flex shrink-0 items-center justify-between gap-2 px-4 sm:px-6 py-4 border-b border-ink-200 bg-ink-50">
          <div className="flex items-center gap-2 text-xs text-muted flex-wrap">
            <span className="font-bold text-brand-950">
              {getRelevanceLabel(news.relevanceType)}
            </span>
            <span>·</span>
            <span>{news.publishedAgo}</span>
            <span>·</span>
            <span className="font-medium text-muted">
              {validSourcesCount === 1 ? '1 medio verificado' : `${validSourcesCount} medios verificados`}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-1.5 text-muted hover:text-ink-800 hover:bg-ink-200/60 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
              title="Copiar síntesis"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">{copied ? '¡Copiado!' : 'Compartir'}</span>
            </button>
            <button
              onClick={handleCloseModal}
              className="p-1.5 text-muted hover:text-muted hover:bg-ink-200/60 rounded-lg transition-colors cursor-pointer"
              aria-label="Cerrar detalle y detener audio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className={`min-h-0 p-4 sm:p-6 overflow-y-auto space-y-6 text-ink-800 transition-all ${isAudioActive ? 'pb-48 sm:pb-52' : 'pb-6'}`}>
          
          {/* BLOQUE 2: Etiqueta de efecto (Favorable / Desfavorable / Neutral) y título de la noticia */}
          <div>
            <div className="mb-2.5">
              {getImpactBadge()}
            </div>
            <h2 id="news-detail-title" className="text-xl sm:text-2xl font-extrabold text-ink-900 leading-snug">
              {news.headline}
            </h2>
            {validSourcesCount > 1 && <button type="button" onClick={() => coverageRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} className="mt-3 min-h-11 inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-brand-200 bg-brand-50 text-brand-950 font-bold text-xs cursor-pointer">
              <Layers className="w-4 h-4 shrink-0" /> Comparar titulares de {validSourcesCount} medios
            </button>}
          </div>

          {/* BLOQUE 3: Referencia oficial */}
          {news.factCheck && news.factCheck.detail && (
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-ink-50 border border-ink-200 text-xs text-ink-800 shadow-2xs">
              <div className="p-1.5 rounded-lg bg-ink-200 text-muted shrink-0 mt-0.5">
                <Landmark className="w-4 h-4 text-muted" />
              </div>
              <div className="space-y-0.5 flex-1">
                <span className="font-bold text-ink-900 block">
                  Referencia oficial: {news.factCheck.officialSource}
                </span>
                <p className="text-muted leading-relaxed text-xs">
                  {news.factCheck.detail}
                </p>
              </div>
            </div>
          )}

          {/* BLOQUE 4: "Puntos Clave del Resumen Unificado" (lista con bullets) */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 border-b border-ink-200 pb-2">
              <FileText className="w-4 h-4 text-brand-900" />
              <h3 className="text-sm font-bold text-ink-900">
                Puntos Clave del Resumen Unificado
              </h3>
            </div>
            <ul className="space-y-2.5">
              {news.fullSynthesis.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-muted leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-brand-900 mt-2 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* BLOQUE 5: Bloque "Resumen en Audio" con el botón Reproducir */}
          {(() => {
            const isPlayingThisNews = audioState.isPlaying && audioState.currentTrack?.id === news.id;
            const isPausedThisNews = !audioState.isPlaying && audioState.currentTrack?.id === news.id;
            const durationEst = audioDuration;

            return (
              <div className="flex items-center justify-between p-3.5 bg-ink-900 text-paper rounded-2xl shadow-sm border border-brand-900/40">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-brand-800 text-paper shadow-xs">
                    <Volume2 className="w-4 h-4 text-brand-200" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-brand-300">Resumen en Audio</p>
                    <p className="text-[11px] text-ink-300">
                      Escuchá la síntesis en audio ({durationEst.formatted} min)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    if (isPlayingThisNews) {
                      audioController.pause();
                    } else if (isPausedThisNews) {
                      audioController.resume();
                    } else {
                      onPlayAudio(news);
                    }
                  }}
                  className={`px-3.5 py-1.5 font-bold text-xs rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                    isPlayingThisNews
                      ? 'bg-brand-400 text-ink-950 shadow-sm hover:bg-brand-300'
                      : 'bg-paper text-ink-950 hover:bg-ink-100 shadow-2xs'
                  }`}
                  aria-label={isPlayingThisNews ? "Pausar audio" : "Reproducir audio"}
                >
                  {isPlayingThisNews ? (
                    <>
                      <Pause className="w-3.5 h-3.5 fill-current stroke-current" />
                      <span>Pausar</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-3.5 h-3.5 fill-current stroke-current" />
                      <span>{isPausedThisNews ? 'Continuar' : 'Reproducir'}</span>
                    </>
                  )}
                </button>
              </div>
            );
          })()}

          {/* BLOQUE 6: "Desglose de Noticias & Impacto en tu Cartera" 
              ALTA LEGIBILIDAD: Fondo claro sofisticado, tipografía nítida y CERO RECOMENDACIONES FINANCIERAS */}
          <section className="bg-ink-50/90 border border-brand-200/90 rounded-3xl p-5 sm:p-6 space-y-4.5 shadow-xs">
            {/* Header del bloque de análisis */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-ink-200">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-brand-100 text-brand-900">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-ink-900 tracking-tight">
                    Desglose de Impacto en tu Cartera
                  </h3>
                  <p className="text-[11px] text-muted">
                    Hecho publicado, vínculo con tus activos y alcance según posición
                  </p>
                </div>
              </div>
            </div>

            {/* Aviso legal explícito (Cero recomendaciones financieras / No investment advice) */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-warning-50/90 border border-warning-200 text-xs text-warning-text">
              <ShieldAlert className="w-4 h-4 text-warning-text shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px]">
                <strong className="font-bold">Aviso legal:</strong> Este desglose es estrictamente periodístico e informativo para el análisis de variables de mercado. FAROS no provee asesoramiento financiero ni recomendaciones de compra o venta de instrumentos.
              </p>
            </div>

            {/* Párrafo introductorio de contexto y desglose */}
            <div className="bg-paper p-4 rounded-2xl border border-ink-200 text-xs sm:text-sm text-muted leading-relaxed shadow-2xs">
              {introParagraph}
            </div>

            {/* Caso A: No hay ningún activo de la cartera relacionado con la noticia */}
            {matchingAssetIds.length === 0 ? (
              <div className="p-4 rounded-2xl bg-paper border border-ink-200 text-xs text-muted space-y-1.5 shadow-2xs">
                <div className="flex items-center gap-2 text-ink-900 font-bold">
                  <AlertCircle className="w-4 h-4 text-muted shrink-0" />
                  <span>Esta noticia no tiene impacto directo sobre los activos de tu cartera actual</span>
                </div>
                <p className="text-muted leading-relaxed pl-6">
                  Ninguno de los activos relacionados con este reporte forma parte de tu cartera actual. La publicación queda como información general de mercado.
                </p>
              </div>
            ) : (
              /* Caso B: Desglose activo por activo para los tickers de la cartera relacionados */
              <div className="space-y-3.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-brand-950 block">
                    Desglose activo por activo ({matchingAssetIds.length})
                  </span>
                  <span className="text-[11px] text-muted">
                    Alcance de la noticia según posición Long / Short
                  </span>
                </div>

                <div className="space-y-3.5">
                  {matchingAssetIds.map((symbol) => {
                    const asset = assetsMap[symbol];
                    const position: AssetPosition = assetPositions?.[symbol] || 'long';
                    const holdingData = news.portfolioImpactAnalysis.affectedHoldings.find(h => h.symbol === symbol);

                    // Context and noise do not establish a directional effect on this holding.
                    // A missing per-asset explanation must not inherit another asset's direction.
                    const isContextOnly = news.relevanceType === 'contexto_macro' || news.relevanceType === 'ruido';
                    const baseDirection = isContextOnly ? 'neutral' : holdingData?.impactDirection || 'neutral';
                    const isAssetPositive = baseDirection === 'favorable' || baseDirection === 'positivo';
                    const isAssetNegative = baseDirection === 'alerta' || baseDirection === 'negativo';

                    // Determine descriptive impact on user's portfolio given position (strictly factual, zero advice)
                    let userEffect: 'favorable' | 'desfavorable' | 'neutral' = 'neutral';
                    let userEffectLabel = 'Sin dirección de precio demostrada';
                    let positionMarketContext = '';

                    if (isAssetPositive) {
                      if (position === 'long') {
                        userEffect = 'favorable';
                        userEffectLabel = 'Favorable para posición Long (condicional)';
                        positionMarketContext = 'Si el efecto favorable identificado se trasladara al valor del instrumento, coincidiría con el sentido de tu posición LONG. Esta lectura no confirma una variación de cotización.';
                      } else {
                        userEffect = 'desfavorable';
                        userEffectLabel = 'Desfavorable para posición Short (condicional)';
                        positionMarketContext = 'Si el efecto favorable identificado se trasladara al valor del instrumento, operaría en sentido contrario a tu posición SHORT. Esta lectura no confirma una variación de cotización.';
                      }
                    } else if (isAssetNegative) {
                      if (position === 'long') {
                        userEffect = 'desfavorable';
                        userEffectLabel = 'Desfavorable para posición Long (condicional)';
                        positionMarketContext = 'Si el efecto desfavorable identificado se trasladara al valor del instrumento, operaría en sentido contrario a tu posición LONG. Esta lectura no confirma una variación de cotización.';
                      } else {
                        userEffect = 'favorable';
                        userEffectLabel = 'Favorable para posición Short (condicional)';
                        positionMarketContext = 'Si el efecto desfavorable identificado se trasladara al valor del instrumento, coincidiría con el sentido de tu posición SHORT. Esta lectura no confirma una variación de cotización.';
                      }
                    } else {
                      userEffect = 'neutral';
                      positionMarketContext = news.relevanceType === 'contexto_macro'
                        ? `La relación con ${symbol} es de contexto macroeconómico y no demuestra un efecto de precio específico. Tu posición ${position.toUpperCase()} no cambia ese alcance.`
                        : news.relevanceType === 'ruido'
                          ? `No hay evidencia suficiente para atribuir un efecto financiero específico a ${symbol}. La clasificación como ruido se mantiene para tu posición ${position.toUpperCase()}.`
                          : `La información disponible no permite establecer una dirección favorable o desfavorable para ${symbol}. Tu posición ${position.toUpperCase()} no resuelve esa falta de evidencia.`;
                    }

                    const effectBadgeClass = 
                      userEffect === 'favorable'
                        ? 'bg-brand-50 text-brand-950 border-brand-300'
                        : userEffect === 'desfavorable'
                        ? 'bg-danger-50 text-danger-950 border-danger-300'
                        : 'bg-ink-100 text-ink-800 border-ink-300';

                    const analysisDetail = getAssetAnalysisDetail(
                      symbol,
                      asset,
                      news.headline,
                      news.relevanceType,
                      holdingData?.relationshipDetail
                    );

                    return (
                      <div 
                        key={symbol}
                        className="bg-paper border border-ink-200 hover:border-brand-300 p-4 sm:p-5 rounded-2xl space-y-3.5 shadow-2xs transition-colors"
                      >
                        {/* Asset Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ink-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ${
                              position === 'long'
                                ? 'bg-info-50 border-info-300 text-info-text'
                                : 'bg-warning-50 border-warning-300 text-warning-text'
                            }`}>
                              <span>{symbol}</span>
                              <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded uppercase tracking-wider ${
                                position === 'long'
                                  ? 'bg-info-600 text-paper'
                                  : 'bg-warning-400 text-warning-text border border-warning-500/60'
                              }`}>
                                {position.toUpperCase()}
                              </span>
                            </span>
                            <span className="text-ink-900 font-bold text-xs sm:text-sm">
                              {asset?.name || symbol}
                            </span>
                            {asset?.sector && (
                              <span className="hidden sm:inline text-[11px] text-muted">
                                · {asset.sector}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Effect Badge */}
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${effectBadgeClass}`}>
                              {userEffect === 'favorable' && <TrendingUp className="w-3 h-3 text-brand-text" />}
                              {userEffect === 'desfavorable' && <TrendingDown className="w-3 h-3 text-danger-700" />}
                              {userEffect === 'neutral' && <Minus className="w-3 h-3 text-muted" />}
                              <span>{userEffectLabel}</span>
                            </span>
                          </div>
                        </div>

                        {/* Market context according to user position (strictly informative, zero advice) */}
                        <div className="text-xs text-muted bg-ink-50/80 p-3 rounded-xl border border-ink-200 leading-relaxed">
                          <span className="font-bold text-ink-900">Lectura según tu posición: </span>
                          <span>{positionMarketContext}</span>
                        </div>

                        {/* Mechanism of transmission */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-brand-950 uppercase tracking-wider block">
                            Relación con el hecho publicado
                          </span>
                          <p className="text-muted leading-relaxed text-xs sm:text-[13px]">
                            {analysisDetail.mecanismo}
                          </p>
                        </div>

                        {/* Key factors to monitor */}
                        <div className="space-y-1.5 bg-brand-50/60 p-3.5 rounded-xl border border-brand-200/70">
                          <span className="text-[11px] font-bold text-brand-950 flex items-center gap-1.5 uppercase tracking-wider">
                            <Eye className="w-3.5 h-3.5 text-brand-800" />
                            Alcance de esta lectura
                          </span>
                          <ul className="space-y-1.5 pl-1 pt-1">
                            {analysisDetail.factores.map((factor, fIdx) => (
                              <li key={fIdx} className="flex items-start gap-2 text-xs text-muted leading-relaxed">
                                <span className="w-1.5 h-1.5 rounded-full bg-brand-700 mt-1.5 shrink-0" />
                                <span>{factor}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* BLOQUE 7: "Medios consultados" */}
          <section ref={coverageRef} aria-label="Comparación de medios" className="space-y-3 scroll-mt-3">
            <VerifiedCoverage news={news} />
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-ink-200 bg-ink-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-ink-900 text-paper font-medium text-xs rounded-xl hover:bg-ink-800 transition-colors cursor-pointer"
          >
            Cerrar detalle
          </button>
        </div>
      </div>
    </div>
  );
};
