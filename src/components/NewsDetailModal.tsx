import React, { useState, useMemo, useEffect } from 'react';
import { 
  NewsItem, 
  Asset, 
  Portfolio, 
  AssetPosition, 
  MediaCoverage,
  getEffectiveImpactForPortfolio 
} from '../types';
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
  portfolio?: Portfolio;
  assetPositions?: Record<string, AssetPosition>;
  isAudioActive?: boolean;
  activeTrackId?: string;
}

import { sanitizeGroundingSources } from '../utils/sourceGrounding';

/**
 * Financial transmission mechanism and monitoring factors by asset category / ticker.
 * STRICTLY INFORMATIVE - ZERO INVESTMENT RECOMMENDATIONS.
 */
interface AssetAnalysisDetail {
  mecanismo: string;
  factores: string[];
}

function getAssetAnalysisDetail(
  symbol: string,
  asset: Asset | undefined,
  headline: string,
  relationshipDetail?: string
): AssetAnalysisDetail {
  switch (symbol) {
    case 'AL30':
    case 'GD30': {
      const isAL30 = symbol === 'AL30';
      return {
        mecanismo: `${relationshipDetail ? relationshipDetail + ' ' : ''}La dinámica de compresión del riesgo país y acumulación neta de reservas del Banco Central reduce la prima de riesgo exigida a la curva soberana en dólares. Al descender la tasa interna de retorno (TIR), las paridades de los títulos Hard Dollar se expanden. ${
          isAL30 
            ? 'En el caso del AL30 (bajo ley argentina), el título presenta una duración modificada de ~2.8 años que acentúa la sensibilidad de precio en la plaza local.'
            : 'En el caso del GD30 (bajo ley de Nueva York), el título concentra el mayor flujo de fondos institucionales extranjeros, liderando el estrechamiento de spreads.'
        }`,
        factores: [
          'Evolución diaria de la paridad en dólares y compresión del riesgo país hacia el soporte de 750 bps.',
          'Spread legislativo (ratio de cotización GD30 vs. AL30) y volumen diario operado en BYMA y MAE.',
          'Saldo comprador neto del Banco Central en el mercado único y libre de cambios (MULC).'
        ]
      };
    }
    case 'BOPREAL':
      return {
        mecanismo: `${relationshipDetail ? relationshipDetail + ' ' : ''}Al ser títulos de deuda comercial emitidos por el BCRA en moneda extranjera, su cotización refleja directamente la solvencia del balance monetario oficial, la demanda de corporaciones para cancelación de obligaciones y la absorción de liquidez en las licitaciones periódicas.`,
        factores: [
          'Rendimiento secundario (TIR en USD) y liquidez en las ruedas de negociación en BYMA.',
          'Adjudicación y tasa de corte en las licitaciones semanales del BCRA.',
          'Capacidad de acumulación de reservas netas por parte de la autoridad monetaria.'
        ]
      };
    case 'YPFD':
      return {
        mecanismo: `${relationshipDetail ? relationshipDetail + ' ' : ''}La ampliación de la capacidad de evacuación de crudo y gas desde Vaca Muerta elimina cuellos de botella logísticos y proyecta un crecimiento sustancial del EBITDA operativo. Este incremento en el flujo de fondos disponible (FCF) disminuye el ratio de apalancamiento neto y eleva el múltiplo de valuación intrínseco de la compañía.`,
        factores: [
          'Precio internacional del barril de petróleo crudo Brent y paridad de exportación neta (export parity).',
          'Avance físico y puesta en marcha de obras de midstream (oleoductos y plantas compresoras).',
          'Volumen diario operado en el ADR en la Bolsa de Nueva York (NYSE: YPF) y en el mercado local.'
        ]
      };
    case 'PAMP':
      return {
        mecanismo: `${relationshipDetail ? relationshipDetail + ' ' : ''}La generación eléctrica y el transporte de gas presentan ingresos indexados y contratos de provisión predecibles. Nuevas habilitaciones de capacidad eólica o térmica consolidan la generación de caja operativa y reducen el costo de financiamiento en el mercado de capitales.`,
        factores: [
          'Despacho comercial de energía contratada y cadena de pagos de CAMMESA.',
          'Tarifas mayoristas de transporte y distribución en Transportadora de Gas del Sur (TGS).',
          'Márgenes operativos consolidados y evolución del ADR en Wall Street.'
        ]
      };
    case 'GGAL':
      return {
        mecanismo: `${relationshipDetail ? relationshipDetail + ' ' : ''}La desaceleración inflacionaria y la estabilidad de tasas activas y pasivas facilitan la recuperación del crédito bancario al sector privado. La expansión del volumen de préstamos compensa la caída de rentabilidad de títulos públicos, mejorando el margen financiero neto (NIM) y reduciendo el costo de riesgo.`,
        factores: [
          'Tasa de crecimiento real de los préstamos en pesos y dólares al sector corporativo y familias.',
          'Regulaciones del BCRA en materia de encajes bancarios y tasas de política monetaria.',
          'Ratio de morosidad de cartera y volumen negociado en el ADR de Galicia (NASDAQ: GGAL).'
        ]
      };
    case 'MEP':
    case 'CCL': {
      const isMEP = symbol === 'MEP';
      return {
        mecanismo: `${relationshipDetail ? relationshipDetail + ' ' : ''}Las cotizaciones de los tipos de cambio financieros arbitran la oferta de liquidación del comercio exterior (esquema exportador blended) contra la demanda de cobertura e importación. ${
          isMEP
            ? 'El dólar MEP refleja la operatoria bursátil local entre bonos en pesos y dólares con liquidación en cuentas bancarias argentinas.'
            : 'El dólar CCL (Contado con Liquidación) canaliza transferencias hacia cuentas del exterior mediante bonos o CEDEARs, reflejando el costo de salida o canje de divisas.'
        }`,
        factores: [
          'Porcentaje de brecha cambiaria respecto a la cotización del tipo de cambio oficial mayorista.',
          'Volumen diario de liquidación de exportadores a través del mercado financiero.',
          'Normativas y plazos de parking vigentes fijados por la Comisión Nacional de Valores (CNV).'
        ]
      };
    }
    case 'AAPL':
    case 'NVDA':
    case 'MELI':
    case 'SPY': {
      return {
        mecanismo: `${relationshipDetail ? relationshipDetail + ' ' : ''}Al tratarse de instrumentos con cotización local en pesos representativos de acciones en el exterior (CEDEARs), el precio de mercado arbitra el valor en dólares del activo subyacente en Wall Street multiplicado por el ratio de conversión y la cotización del dólar Contado con Liquidación (CCL). Esta noticia afecta las expectativas de ingresos, márgenes operativos y valuación global de la compañía.`,
        factores: [
          'Cotización de la acción en los mercados de Estados Unidos (NYSE / NASDAQ) y múltiplos EV/EBITDA.',
          'Variación del tipo de cambio financiero implícito (CCL) en la plaza local de CEDEARs.',
          'Nivel de la tasa libre de riesgo de los Bonos del Tesoro de EE.UU. a 10 años (US10Y).'
        ]
      };
    }
    default:
      return {
        mecanismo: `${relationshipDetail || 'El evento genera impactos en la estructura de ingresos o en la prima de riesgo del activo.'} La dinámica reportada incide en las expectativas de rentabilidad esperada y en la liquidez disponible para la clase de activo (${asset?.sector || 'Mercado financiero'}).`,
        factores: [
          'Volumen diario negociado en el mercado secundario local.',
          'Variación porcentual de la cotización frente a soportes técnicos.',
          'Indicadores macroeconómicos y sectoriales vinculados.'
        ]
      };
  }
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

  const [copied, setCopied] = useState(false);
  const [audioState, setAudioState] = useState<AudioControllerState>(audioController.getState());

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
  const effectiveImpact = getEffectiveImpactForPortfolio(news.impact, news.affectedAssetIds, assetPositions);
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
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-emerald-950 bg-emerald-100 border border-emerald-300">
          <TrendingUp className="w-4 h-4 text-emerald-700" />
          Favorable
        </span>
      );
    }
    if (isAlert) {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-rose-950 bg-rose-100 border border-rose-300">
          <TrendingDown className="w-4 h-4 text-rose-700" />
          Desfavorable
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-bold text-slate-800 bg-slate-100 border border-slate-300">
        <Minus className="w-4 h-4 text-slate-500" />
        Neutral
      </span>
    );
  };

  // Valid sources with legitimate, real grounded links (strictly real URLs and headlines)
  const verifiedSources = useMemo(() => {
    return sanitizeGroundingSources(news.sources || []);
  }, [news.sources]);

  // Count matches verified real sources count
  const validSourcesCount = verifiedSources.length;

  // Filter tickers in the portfolio that are related to this news
  const userPortfolioTickers = useMemo(() => {
    if (portfolio?.assetIds && portfolio.assetIds.length > 0) {
      return portfolio.assetIds;
    }
    if (assetPositions) {
      return Object.keys(assetPositions);
    }
    return [];
  }, [portfolio, assetPositions]);

  // Only tickers that the user holds AND are affected by this news
  const matchingAssetIds = useMemo(() => {
    return userPortfolioTickers.filter(id => news.affectedAssetIds.includes(id));
  }, [userPortfolioTickers, news.affectedAssetIds]);

  // Generate customized introduction paragraph for portfolio analysis
  // STRICTLY NON-ADVISORY: Objective news & market transmission breakdown
  const introParagraph = useMemo(() => {
    const portfolioName = portfolio?.name || 'Cartera Principal';
    const profile = portfolio?.profile || 'moderado';
    const profileLabels: Record<string, string> = {
      conservador: 'Perfil: Conservador',
      moderado: 'Perfil: Moderado',
      dinamico: 'Perfil: Dinámico'
    };
    const profileText = profileLabels[profile] || 'Perfil: Moderado';

    if (matchingAssetIds.length === 0) {
      return `Este reporte aborda hechos vinculados a ${news.headline.toLowerCase()}. En el caso de tu cartera '${portfolioName}' (${profileText}), ninguno de los activos afectados forma parte de tus posiciones activas. Este desglose se presenta como referencia informativa de mercado para el seguimiento de variables macroeconómicas generales.`;
    }

    const symbolsText = matchingAssetIds.join(', ');
    const countText = matchingAssetIds.length === 1 ? '1 activo presente en tu cartera' : `${matchingAssetIds.length} activos presentes en tu cartera`;

    let contextTheme = 'la dinámica de cotizaciones y flujo de fondos del mercado';
    if (news.topicCategory === 'deuda_soberana') {
      contextTheme = 'la política de reservas del Banco Central y la prima de riesgo país';
    } else if (news.topicCategory === 'energia') {
      contextTheme = 'la capacidad de transporte e infraestructura energética en Vaca Muerta';
    } else if (news.topicCategory === 'regulaciones_bcra') {
      contextTheme = 'el marco normativo cambiario y la liquidez de los dólares financieros';
    } else if (news.topicCategory === 'cedears_tech') {
      contextTheme = 'la demanda tecnológica global y las tasas de referencia internacionales';
    }

    return `Este informe se contextualiza en ${contextTheme}. En relación con tu cartera '${portfolioName}' (${profileText}), la información incide sobre ${countText} (${symbolsText}). A continuación se desglosa el comportamiento técnico del mercado para cada instrumento y cómo interactúa con el sentido de tu posición (Long o Short), facilitando el seguimiento objetivo de variables clave.`;
  }, [portfolio, matchingAssetIds, news]);

  if (!news) return null;

  return (
    <div 
      className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6"
      onClick={handleCloseModal}
    >
      <div 
        className="bg-white rounded-3xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90dvh] animate-in fade-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* BLOQUE 1: Encabezado (impacto en precio, tiempo, cantidad de medios, compartir y cerrar) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
            <span className="font-bold text-emerald-950">
              {getRelevanceLabel(news.relevanceType)}
            </span>
            <span>·</span>
            <span>{news.publishedAgo}</span>
            <span>·</span>
            <span className="font-medium text-slate-600">
              Resumen de {validSourcesCount} medios
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded-lg text-xs font-medium flex items-center gap-1 transition-colors cursor-pointer"
              title="Copiar síntesis"
            >
              <Share2 className="w-4 h-4" />
              <span className="hidden sm:inline">{copied ? '¡Copiado!' : 'Compartir'}</span>
            </button>
            <button
              onClick={handleCloseModal}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
              aria-label="Cerrar detalle y detener audio"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className={`p-6 overflow-y-auto space-y-6 text-slate-800 transition-all ${isAudioActive ? 'pb-48 sm:pb-52' : 'pb-6'}`}>
          
          {/* BLOQUE 2: Etiqueta de efecto (Favorable / Desfavorable / Neutral) y título de la noticia */}
          <div>
            <div className="mb-2.5">
              {getImpactBadge()}
            </div>
            <h2 className="text-xl sm:text-2xl font-extrabold text-slate-900 leading-snug">
              {news.headline}
            </h2>
          </div>

          {/* BLOQUE 3: Referencia oficial */}
          {news.factCheck && news.factCheck.detail && (
            <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs text-slate-800 shadow-2xs">
              <div className="p-1.5 rounded-lg bg-slate-200 text-slate-700 shrink-0 mt-0.5">
                <Landmark className="w-4 h-4 text-slate-700" />
              </div>
              <div className="space-y-0.5 flex-1">
                <span className="font-bold text-slate-900 block">
                  Referencia oficial: {news.factCheck.officialSource}
                </span>
                <p className="text-slate-600 leading-relaxed text-xs">
                  {news.factCheck.detail}
                </p>
              </div>
            </div>
          )}

          {/* BLOQUE 4: "Puntos Clave del Resumen Unificado" (lista con bullets) */}
          <section className="space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
              <FileText className="w-4 h-4 text-emerald-900" />
              <h3 className="text-sm font-bold text-slate-900">
                Puntos Clave del Resumen Unificado
              </h3>
            </div>
            <ul className="space-y-2.5">
              {news.fullSynthesis.map((point, idx) => (
                <li key={idx} className="flex items-start gap-2.5 text-xs sm:text-sm text-slate-700 leading-relaxed">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-900 mt-2 shrink-0" />
                  <span>{point}</span>
                </li>
              ))}
            </ul>
          </section>

          {/* BLOQUE 5: Bloque "Resumen en Audio" con el botón Reproducir */}
          {(() => {
            const isPlayingThisNews = audioState.isPlaying && audioState.currentTrack?.id === news.id;
            const isPausedThisNews = !audioState.isPlaying && audioState.currentTrack?.id === news.id;
            const durationEst = calculateEstimatedDuration(news.audioScript || news.briefSummary, 1.0);

            return (
              <div className="flex items-center justify-between p-3.5 bg-slate-900 text-white rounded-2xl shadow-sm border border-emerald-900/40">
                <div className="flex items-center gap-3">
                  <div className="p-2 rounded-xl bg-emerald-800 text-white shadow-xs">
                    <Volume2 className="w-4 h-4 text-emerald-200" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-300">Resumen en Audio</p>
                    <p className="text-[11px] text-slate-300">
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
                      ? 'bg-emerald-400 text-slate-950 shadow-sm hover:bg-emerald-300'
                      : 'bg-white text-slate-950 hover:bg-slate-100 shadow-2xs'
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
          <section className="bg-slate-50/90 border border-emerald-200/90 rounded-3xl p-5 sm:p-6 space-y-4.5 shadow-xs">
            {/* Header del bloque de análisis */}
            <div className="flex items-center justify-between flex-wrap gap-2 pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-emerald-100 text-emerald-900">
                  <Compass className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm sm:text-base font-bold text-slate-900 tracking-tight">
                    Desglose de Impacto en tu Cartera
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Análisis de variables y mecanismos de mercado según posición
                  </p>
                </div>
              </div>

              {news.portfolioImpactAnalysis.horizon && (
                <span className="text-[11px] font-semibold text-emerald-950 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full">
                  Horizonte: {news.portfolioImpactAnalysis.horizon}
                </span>
              )}
            </div>

            {/* Aviso legal explícito (Cero recomendaciones financieras / No investment advice) */}
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50/90 border border-amber-200 text-xs text-amber-950">
              <ShieldAlert className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
              <p className="leading-relaxed text-[11px]">
                <strong className="font-bold">Aviso legal:</strong> Este desglose es estrictamente periodístico e informativo para el análisis de variables de mercado. FAROS no provee asesoramiento financiero ni recomendaciones de compra o venta de instrumentos.
              </p>
            </div>

            {/* Párrafo introductorio de contexto y desglose */}
            <div className="bg-white p-4 rounded-2xl border border-slate-200 text-xs sm:text-sm text-slate-700 leading-relaxed shadow-2xs">
              {introParagraph}
            </div>

            {/* Caso A: No hay ningún activo de la cartera relacionado con la noticia */}
            {matchingAssetIds.length === 0 ? (
              <div className="p-4 rounded-2xl bg-white border border-slate-200 text-xs text-slate-700 space-y-1.5 shadow-2xs">
                <div className="flex items-center gap-2 text-slate-900 font-bold">
                  <AlertCircle className="w-4 h-4 text-slate-500 shrink-0" />
                  <span>Esta noticia no tiene impacto directo sobre los activos de tu cartera actual</span>
                </div>
                <p className="text-slate-600 leading-relaxed pl-6">
                  Los activos involucrados en este reporte ({news.affectedAssetIds.join(', ')}) no forman parte de las posiciones activas en tu cartera. Podés utilizar la noticia como referencia macroeconómica.
                </p>
              </div>
            ) : (
              /* Caso B: Desglose activo por activo para los tickers de la cartera relacionados */
              <div className="space-y-3.5 pt-1">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold uppercase tracking-wider text-emerald-950 block">
                    Desglose activo por activo ({matchingAssetIds.length})
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Comportamiento de mercado según posición Long / Short
                  </span>
                </div>

                <div className="space-y-3.5">
                  {matchingAssetIds.map((symbol) => {
                    const asset = assetsMap[symbol];
                    const position: AssetPosition = assetPositions?.[symbol] || 'long';
                    const holdingData = news.portfolioImpactAnalysis.affectedHoldings.find(h => h.symbol === symbol);

                    // Determine intrinsic asset event direction
                    const baseDirection = holdingData?.impactDirection || news.impact;
                    const isAssetPositive = baseDirection === 'favorable' || baseDirection === 'positivo';
                    const isAssetNegative = baseDirection === 'alerta' || baseDirection === 'negativo';

                    // Determine descriptive impact on user's portfolio given position (strictly factual, zero advice)
                    let userEffect: 'favorable' | 'desfavorable' | 'neutral' = 'neutral';
                    let userEffectLabel = 'Comportamiento Neutral';
                    let positionMarketContext = '';

                    if (isAssetPositive) {
                      if (position === 'long') {
                        userEffect = 'favorable';
                        userEffectLabel = 'Favorable para posición Long';
                        positionMarketContext = 'La noticia reporta catalizadores alcistas, mayor demanda o compresión de tasa de descuento para el activo en el mercado secundario.';
                      } else {
                        userEffect = 'desfavorable';
                        userEffectLabel = 'Desfavorable para posición Short';
                        positionMarketContext = 'La noticia reporta presiones alcistas en cotización o demanda de mercado, operando en sentido contrario a la dirección de una posición bajista.';
                      }
                    } else if (isAssetNegative) {
                      if (position === 'long') {
                        userEffect = 'desfavorable';
                        userEffectLabel = 'Desfavorable para posición Long';
                        positionMarketContext = 'La noticia reporta factores de cautela, ajuste en valuaciones o mayor prima de riesgo sobre la cotización del activo en el mercado secundario.';
                      } else {
                        userEffect = 'favorable';
                        userEffectLabel = 'Favorable para posición Short';
                        positionMarketContext = 'La noticia reporta factores de corrección o debilidad en el precio de mercado del activo, alineados con la dirección de una posición bajista.';
                      }
                    } else {
                      userEffect = 'neutral';
                      userEffectLabel = 'Comportamiento Neutral';
                      positionMarketContext = `Para una posición ${position === 'long' ? 'Long' : 'Short'}, el acontecimiento aporta datos de contexto sectorial o macro sin modificar sensiblemente las variables de precio del activo.`;
                    }

                    const effectBadgeClass = 
                      userEffect === 'favorable'
                        ? 'bg-emerald-50 text-emerald-950 border-emerald-300'
                        : userEffect === 'desfavorable'
                        ? 'bg-rose-50 text-rose-950 border-rose-300'
                        : 'bg-slate-100 text-slate-800 border-slate-300';

                    const analysisDetail = getAssetAnalysisDetail(
                      symbol,
                      asset,
                      news.headline,
                      holdingData?.relationshipDetail
                    );

                    return (
                      <div 
                        key={symbol}
                        className="bg-white border border-slate-200 hover:border-emerald-300 p-4 sm:p-5 rounded-2xl space-y-3.5 shadow-2xs transition-colors"
                      >
                        {/* Asset Header Row */}
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-mono font-bold ${
                              position === 'long'
                                ? 'bg-blue-50 border-blue-300 text-blue-950'
                                : 'bg-amber-50 border-amber-300 text-amber-950'
                            }`}>
                              <span>{symbol}</span>
                              <span className={`text-[9px] font-black px-1.5 py-0.2 rounded uppercase tracking-wider ${
                                position === 'long'
                                  ? 'bg-blue-600 text-white'
                                  : 'bg-amber-400 text-amber-950 border border-amber-500/60'
                              }`}>
                                {position.toUpperCase()}
                              </span>
                            </span>
                            <span className="text-slate-900 font-bold text-xs sm:text-sm">
                              {asset?.name || symbol}
                            </span>
                            {asset?.sector && (
                              <span className="hidden sm:inline text-[11px] text-slate-500">
                                · {asset.sector}
                              </span>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-wrap">
                            {/* Effect Badge */}
                            <span className={`text-[10px] font-bold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${effectBadgeClass}`}>
                              {userEffect === 'favorable' && <TrendingUp className="w-3 h-3 text-emerald-700" />}
                              {userEffect === 'desfavorable' && <TrendingDown className="w-3 h-3 text-rose-700" />}
                              {userEffect === 'neutral' && <Minus className="w-3 h-3 text-slate-500" />}
                              <span>{userEffectLabel}</span>
                            </span>
                          </div>
                        </div>

                        {/* Market context according to user position (strictly informative, zero advice) */}
                        <div className="text-xs text-slate-700 bg-slate-50/80 p-3 rounded-xl border border-slate-200 leading-relaxed">
                          <span className="font-bold text-slate-900">Comportamiento según tu posición: </span>
                          <span>{positionMarketContext}</span>
                        </div>

                        {/* Mechanism of transmission */}
                        <div className="space-y-1">
                          <span className="text-[11px] font-bold text-emerald-950 uppercase tracking-wider block">
                            Mecanismo de transmisión de la noticia
                          </span>
                          <p className="text-slate-700 leading-relaxed text-xs sm:text-[13px]">
                            {analysisDetail.mecanismo}
                          </p>
                        </div>

                        {/* Key factors to monitor */}
                        <div className="space-y-1.5 bg-emerald-50/60 p-3.5 rounded-xl border border-emerald-200/70">
                          <span className="text-[11px] font-bold text-emerald-950 flex items-center gap-1.5 uppercase tracking-wider">
                            <Eye className="w-3.5 h-3.5 text-emerald-800" />
                            Factores clave a monitorear
                          </span>
                          <ul className="space-y-1.5 pl-1 pt-1">
                            {analysisDetail.factores.map((factor, fIdx) => (
                              <li key={fIdx} className="flex items-start gap-2 text-xs text-slate-700 leading-relaxed">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-700 mt-1.5 shrink-0" />
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
          <section className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <div className="flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-900" />
                <h3 className="text-sm font-bold text-slate-900">
                  Medios consultados ({validSourcesCount})
                </h3>
              </div>
            </div>

            <div className="space-y-2">
              {verifiedSources.map((src, i) => (
                <div 
                  key={i}
                  className="p-3.5 rounded-2xl border border-slate-200 bg-white hover:border-emerald-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs"
                >
                  <div className="space-y-1 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs">
                        {src.mediaName}
                      </span>
                      {src.publishedTime && (
                        <span className="text-[10px] text-slate-400">
                          · {src.publishedTime}
                        </span>
                      )}
                    </div>
                    <p className="text-slate-700 italic leading-snug">
                      "{src.originalHeadline}"
                    </p>
                  </div>

                  <a
                    href={src.sourceUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center gap-1.5 font-bold text-emerald-950 hover:text-white bg-slate-50 hover:bg-emerald-950 px-3.5 py-2 rounded-xl border border-slate-200 hover:border-emerald-950 transition-colors shrink-0 text-xs cursor-pointer shadow-2xs"
                    title={`Abrir noticia en ${src.mediaName}`}
                  >
                    <span>Ver noticia</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              ))}
            </div>
          </section>

        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-900 text-white font-medium text-xs rounded-xl hover:bg-slate-800 transition-colors cursor-pointer"
          >
            Cerrar detalle
          </button>
        </div>
      </div>
    </div>
  );
};
