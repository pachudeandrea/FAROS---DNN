import React, { useState, useEffect, useCallback } from 'react';
import { 
  X, 
  Sparkles, 
  Check, 
  Minimize2,
  Maximize2
} from 'lucide-react';
import { NewsItem } from '../types';

export interface TourStep {
  stage: 1 | 2 | 3;
  stageName: string;
  stepNumber: number;
  totalInStage: number;
  targetId: string;
  title: string;
  description: string;
  tabRequired: 'settings' | 'feed' | 'calendar';
  isStageEnd?: boolean;
  nextStageName?: string;
}

export const TOUR_STEPS: TourStep[] = [
  // ================= ETAPA 1: MI CARTERA (5 Pasos) =================
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 1,
    totalInStage: 5,
    targetId: 'portfolio-title',
    tabRequired: 'settings',
    title: 'Tu Cartera',
    description: 'Acá gestionás tus activos y personalizás el seguimiento. Podés empezar con tu cartera vacía o sumar los que operás.'
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 2,
    totalInStage: 5,
    targetId: 'portfolio-search',
    tabRequired: 'settings',
    title: 'Buscador y posiciones',
    description: 'Buscá un activo como YPFD o AL30 y definí LONG o SHORT antes de sumarlo.'
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 3,
    totalInStage: 5,
    targetId: 'portfolio-assets-list',
    tabRequired: 'settings',
    title: 'Administrar activos',
    description: 'Probá cambiar entre LONG y SHORT o eliminar un activo. También podés gestionar distintas carteras.'
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 4,
    totalInStage: 5,
    targetId: 'portfolio-profile',
    tabRequired: 'settings',
    title: 'Perfil y temas clave',
    description: 'Elegí tu perfil inversor y activá las temáticas de mercado que te interesa priorizar.'
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 5,
    totalInStage: 5,
    targetId: 'portfolio-notifications',
    tabRequired: 'settings',
    title: 'Notificaciones y opciones',
    description: 'Activá las alertas de impacto o desplegá opciones avanzadas para seguir temas estratégicos.',
    isStageEnd: true,
    nextStageName: 'Noticias'
  },

  // ================= ETAPA 2: NOTICIAS (5 Pasos) =================
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 1,
    totalInStage: 5,
    targetId: 'feed-hero-pulso',
    tabRequired: 'feed',
    title: 'Pulso Diario',
    description: 'Revisá la dirección del mercado según tus posiciones y filtrá por Favorable, Alerta o Neutral.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 2,
    totalInStage: 5,
    targetId: 'feed-audio-brief',
    tabRequired: 'feed',
    title: 'Audio y actualización',
    description: 'Escuchá la síntesis del día con voz neuronal y usá Actualizar para recibir novedades frescas.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 3,
    totalInStage: 5,
    targetId: 'feed-news-section',
    tabRequired: 'feed',
    title: 'Noticias clasificadas',
    description: 'Revisá las notas del mercado filtradas por su impacto directo sobre tus activos.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 4,
    totalInStage: 5,
    targetId: 'feed-filters',
    tabRequired: 'feed',
    title: 'Búsqueda y filtros',
    description: 'Filtrá el feed por palabra clave, tipo de impacto o consultá tus notas guardadas.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 5,
    totalInStage: 5,
    targetId: 'feed-card-detail',
    tabRequired: 'feed',
    title: 'Detalle de noticia',
    description: 'Abrí cualquier noticia para ver su análisis económico y los enlaces a las fuentes originales.',
    isStageEnd: true,
    nextStageName: 'Calendario'
  },

  // ================= ETAPA 3: CALENDARIO (5 Pasos) =================
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 1,
    totalInStage: 5,
    targetId: 'calendar-summary-metrics',
    tabRequired: 'calendar',
    title: 'Métricas de calendario',
    description: 'Anticipá los cobros de renta, balances de empresas y datos macroeconómicos del mes.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 2,
    totalInStage: 5,
    targetId: 'calendar-grid',
    tabRequired: 'calendar',
    title: 'Vista del calendario',
    description: 'Navegá entre meses y tocá cualquier fecha para revisar los eventos financieros del día.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 3,
    totalInStage: 5,
    targetId: 'calendar-events-list',
    tabRequired: 'calendar',
    title: 'Detalle de eventos',
    description: 'Pulsá un evento para ver su horario oficial, activo relacionado y enlace a la fuente.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 4,
    totalInStage: 5,
    targetId: 'calendar-add-event-btn',
    tabRequired: 'calendar',
    title: 'Crear eventos propios',
    description: 'Pulsá "Agregar evento" para registrar tus propios vencimientos y programar recordatorios.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 5,
    totalInStage: 5,
    targetId: 'calendar-reminders-info',
    tabRequired: 'calendar',
    title: 'Recordatorios',
    description: 'Administrá tus alertas personales para no perder ningún vencimiento clave.',
    isStageEnd: true
  }
];

interface InteractiveTourProps {
  isActive: boolean;
  onClose: () => void;
  onSelectTab: (tab: 'settings' | 'feed' | 'calendar') => void;
  currentTab: 'settings' | 'feed' | 'calendar';
  onOpenNewsDetail?: (news: NewsItem) => void;
  sampleNews?: NewsItem;
}

export const InteractiveTour: React.FC<InteractiveTourProps> = ({
  isActive,
  onClose,
  onSelectTab,
  currentTab,
  onOpenNewsDetail,
  sampleNews
}) => {
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [hasInteracted, setHasInteracted] = useState<boolean>(false);
  const [showCompletionModal, setShowCompletionModal] = useState<boolean>(false);
  const [isMinimized, setIsMinimized] = useState<boolean>(false);

  const currentStep = TOUR_STEPS[stepIndex] || TOUR_STEPS[0];

  // Reset step index and interaction when activated
  useEffect(() => {
    if (isActive) {
      setHasInteracted(false);
      setIsMinimized(false);
    }
  }, [isActive]);

  // Sync tab with step requirements
  useEffect(() => {
    if (!isActive) return;
    if (currentStep.tabRequired !== currentTab) {
      onSelectTab(currentStep.tabRequired);
    }
  }, [stepIndex, isActive, currentStep.tabRequired, currentTab, onSelectTab]);

  // Update target bounding rect
  const updateTargetRect = useCallback(() => {
    if (!isActive) return;

    const el = document.querySelector(`[data-tour="${currentStep.targetId}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
    } else {
      setTargetRect(null);
    }
  }, [isActive, currentStep.targetId]);

  // Dynamic placement calculator: guarantees card NEVER obstructs the interactive element
  // Detects dynamically if highlighted element is in the upper or lower area of the screen:
  // - If target is in UPPER area -> FORCES card to the BOTTOM
  // - If target is in LOWER area -> FORCES card to the TOP
  const computePlacement = useCallback(() => {
    const vpWidth = window.visualViewport ? window.visualViewport.width : window.innerWidth;
    const vpHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const isDesktop = vpWidth >= 1024;

    if (!targetRect) {
      return {
        style: {
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          right: isDesktop ? '24px' : undefined,
          left: isDesktop ? undefined : '50%',
          transform: isDesktop ? undefined : 'translateX(-50%)',
        } as React.CSSProperties,
        pillStyle: {
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          right: isDesktop ? '24px' : undefined,
          left: isDesktop ? undefined : '50%',
          transform: isDesktop ? undefined : 'translateX(-50%)',
        } as React.CSSProperties,
      };
    }

    // Measure vertical midpoint of target in current viewport
    const targetMidY = (targetRect.top + targetRect.bottom) / 2;
    const isTargetInUpperArea = targetMidY < vpHeight * 0.5;

    if (isTargetInUpperArea) {
      // Element is in the UPPER area of screen -> FORCE card to the BOTTOM
      const bottomPos = isDesktop
        ? 'calc(env(safe-area-inset-bottom, 0px) + 20px)'
        : 'calc(env(safe-area-inset-bottom, 0px) + 14px)';

      if (isDesktop) {
        // Place in bottom corner with maximum horizontal clearance away from target
        const targetMidX = (targetRect.left + targetRect.right) / 2;
        if (targetMidX > vpWidth * 0.5) {
          // Target is in the right half -> place card in bottom-left corner
          return {
            style: { bottom: bottomPos, left: '24px' } as React.CSSProperties,
            pillStyle: { bottom: bottomPos, left: '24px' } as React.CSSProperties,
          };
        } else {
          // Target is in the left half or centered -> place card in bottom-right corner
          return {
            style: { bottom: bottomPos, right: '24px' } as React.CSSProperties,
            pillStyle: { bottom: bottomPos, right: '24px' } as React.CSSProperties,
          };
        }
      }

      // Mobile / Tablet: pinned bottom center
      return {
        style: {
          bottom: bottomPos,
          left: '50%',
          transform: 'translateX(-50%)',
        } as React.CSSProperties,
        pillStyle: {
          bottom: bottomPos,
          left: '50%',
          transform: 'translateX(-50%)',
        } as React.CSSProperties,
      };
    } else {
      // Element is in the LOWER area of screen -> FORCE card to the TOP
      const topPos = isDesktop
        ? 'calc(env(safe-area-inset-top, 0px) + 76px)'
        : 'calc(env(safe-area-inset-top, 0px) + 74px)';

      if (isDesktop) {
        // Place in top corner with maximum horizontal clearance away from target
        const targetMidX = (targetRect.left + targetRect.right) / 2;
        if (targetMidX > vpWidth * 0.5) {
          // Target is in the right half -> place card in top-left corner
          return {
            style: { top: topPos, left: '24px' } as React.CSSProperties,
            pillStyle: { top: topPos, left: '24px' } as React.CSSProperties,
          };
        } else {
          // Target is in the left half or centered -> place card in top-right corner
          return {
            style: { top: topPos, right: '24px' } as React.CSSProperties,
            pillStyle: { top: topPos, right: '24px' } as React.CSSProperties,
          };
        }
      }

      // Mobile / Tablet: pinned top center
      return {
        style: {
          top: topPos,
          left: '50%',
          transform: 'translateX(-50%)',
        } as React.CSSProperties,
        pillStyle: {
          top: topPos,
          left: '50%',
          transform: 'translateX(-50%)',
        } as React.CSSProperties,
      };
    }
  }, [targetRect]);

  const placement = computePlacement();

  // Smart offset scroll: keeps target element fully visible without jarring jumps
  useEffect(() => {
    if (!isActive) return;

    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-tour="${currentStep.targetId}"]`) as HTMLElement | null;
      if (!el) return;

      const rect = el.getBoundingClientRect();
      const currentScrollY = window.scrollY || window.pageYOffset;
      const targetAbsTop = rect.top + currentScrollY;
      const vpHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;

      // Check whether target is in upper or lower part of document
      const isTargetNearDocumentTop = targetAbsTop < 550;

      if (isTargetNearDocumentTop) {
        // Target is intended for upper screen area (card at bottom):
        // If not already comfortably positioned near top, scroll gently
        if (rect.top < 75 || rect.bottom > vpHeight - 165) {
          const idealScroll = Math.max(0, targetAbsTop - 90);
          window.scrollTo({ top: idealScroll, behavior: 'smooth' });
        }
      } else {
        // Target is intended for lower screen area (card at top):
        // Keep it visible below the top card zone (~220px)
        if (rect.top < 220 || rect.bottom > vpHeight - 20) {
          const idealScroll = Math.max(0, targetAbsTop - 220);
          window.scrollTo({ top: idealScroll, behavior: 'smooth' });
        }
      }

      updateTargetRect();
      setTimeout(updateTargetRect, 200);
      setTimeout(updateTargetRect, 450);
    }, 180);

    return () => clearTimeout(timer);
  }, [isActive, stepIndex, currentTab, currentStep.targetId, updateTargetRect]);

  // Listen to window resize, scroll, visualViewport and DOM mutations (menus, modals, accordions)
  useEffect(() => {
    if (!isActive) return;

    const handleUpdate = () => {
      updateTargetRect();
    };

    window.addEventListener('resize', handleUpdate);
    window.addEventListener('scroll', handleUpdate, true);

    const vv = window.visualViewport;
    if (vv) {
      vv.addEventListener('resize', handleUpdate);
      vv.addEventListener('scroll', handleUpdate);
    }

    const observer = new MutationObserver(handleUpdate);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true });

    return () => {
      window.removeEventListener('resize', handleUpdate);
      window.removeEventListener('scroll', handleUpdate, true);
      if (vv) {
        vv.removeEventListener('resize', handleUpdate);
        vv.removeEventListener('scroll', handleUpdate);
      }
      observer.disconnect();
    };
  }, [updateTargetRect, isActive]);

  // Auto-minimize on small screens when space is critical
  useEffect(() => {
    if (!isActive || !targetRect) return;
    const vpHeight = window.visualViewport ? window.visualViewport.height : window.innerHeight;
    const spaceBelow = vpHeight - targetRect.bottom;
    const spaceAbove = targetRect.top;

    if (window.innerWidth < 640 && spaceBelow < 130 && spaceAbove < 130) {
      setIsMinimized(true);
    }
  }, [isActive, targetRect, stepIndex]);

  // Elevate highlighted target above dark backdrop
  useEffect(() => {
    if (!isActive) return;

    const el = document.querySelector(`[data-tour="${currentStep.targetId}"]`) as HTMLElement | null;
    if (el) {
      const prevPosition = el.style.position;
      const prevZIndex = el.style.zIndex;
      el.style.position = prevPosition || 'relative';
      el.style.zIndex = '46';

      return () => {
        el.style.zIndex = prevZIndex;
        el.style.position = prevPosition;
      };
    }
  }, [isActive, currentStep.targetId, stepIndex]);

  // Real-time Action Recognition: listen to user clicks, typing and changes on highlighted element
  useEffect(() => {
    setHasInteracted(false);
    if (!isActive) return;

    const el = document.querySelector(`[data-tour="${currentStep.targetId}"]`);
    if (!el) return;

    const onUserAction = () => {
      setHasInteracted(true);
    };

    el.addEventListener('click', onUserAction, true);
    el.addEventListener('input', onUserAction, true);
    el.addEventListener('change', onUserAction, true);

    return () => {
      el.removeEventListener('click', onUserAction, true);
      el.removeEventListener('input', onUserAction, true);
      el.removeEventListener('change', onUserAction, true);
    };
  }, [isActive, currentStep.targetId, stepIndex]);

  const handleNext = () => {
    if (currentStep.isStageEnd && currentStep.stage === 3) {
      // Completed full 15-step tour!
      setShowCompletionModal(true);
      try {
        localStorage.setItem('faros_tour_completed', 'true');
      } catch {}
      return;
    }

    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
      setHasInteracted(false);
      setIsMinimized(false);
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
      setHasInteracted(false);
      setIsMinimized(false);
    }
  };

  const handleFinishTour = () => {
    setShowCompletionModal(false);
    onClose();
  };

  if (!isActive) return null;

  // Calculate inverted clip-path cutout polygon for the overlay
  // This leaves a clean transparent hole over targetRect so clicks pass through 100%
  const pad = 8;
  const t = targetRect ? Math.max(0, targetRect.top - pad) : 0;
  const l = targetRect ? Math.max(0, targetRect.left - pad) : 0;
  const r = targetRect ? Math.min(window.innerWidth, targetRect.right + pad) : 0;
  const b = targetRect ? Math.min(window.innerHeight, targetRect.bottom + pad) : 0;

  const clipPathStyle = targetRect ? {
    clipPath: `polygon(
      0% 0%, 
      0% 100%, 
      ${l}px 100%, 
      ${l}px ${t}px, 
      ${r}px ${t}px, 
      ${r}px ${b}px, 
      ${l}px ${b}px, 
      ${l}px 100%, 
      100% 100%, 
      100% 0%
    )`
  } : undefined;

  return (
    <>
      {/* Semi-transparent dark overlay with inverted cutout polygon */}
      {/* Clicks inside the hole pass right through to the underlying element! */}
      <div 
        style={clipPathStyle}
        className="fixed inset-0 z-40 bg-slate-950/65 backdrop-blur-[1px] transition-all duration-200 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Target spotlight glowing ring directly framing the interactive area */}
      {targetRect && (
        <div
          style={{
            position: 'fixed',
            top: t,
            left: l,
            width: r - l,
            height: b - t,
            zIndex: 45,
            pointerEvents: 'none'
          }}
          className="rounded-2xl ring-4 ring-emerald-400 ring-offset-2 ring-offset-slate-950/80 shadow-[0_0_35px_rgba(16,185,129,0.38)] transition-all duration-200"
        >
          {/* Interactive badge pill */}
          <div className="absolute -top-3.5 left-4 px-2.5 py-0.5 rounded-full bg-emerald-500 text-slate-950 text-[10px] font-black uppercase tracking-wider shadow-sm flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-slate-950 animate-ping" />
            <span>Zona interactiva</span>
          </div>
        </div>
      )}

      {/* Minimized Pill */}
      {isMinimized ? (
        <div 
          style={placement.pillStyle}
          className="fixed z-50 pointer-events-auto"
        >
          <div 
            className="bg-white/95 backdrop-blur-md border border-slate-200/90 shadow-lg rounded-full px-3 py-1.5 flex items-center gap-2 text-xs animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            <span className="font-bold text-slate-800 text-[11px] shrink-0">{stepIndex + 1}/15</span>
            <span className="font-semibold text-slate-700 text-[11px] truncate max-w-[130px] sm:max-w-[190px]">
              {currentStep.title}
            </span>
            <div className="flex items-center gap-1 border-l border-slate-200 pl-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setIsMinimized(false)}
                className="p-1 text-emerald-800 hover:text-emerald-950 rounded-full hover:bg-emerald-50 transition-colors cursor-pointer"
                title="Expandir instructivo"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </button>
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="px-1 py-0.5 text-slate-500 hover:text-slate-800 text-xs font-semibold cursor-pointer"
                  title="Anterior"
                >
                  ‹
                </button>
              )}
              <button
                type="button"
                onClick={handleNext}
                className="px-2 py-0.5 bg-[#0d4f3b] hover:bg-[#093d2d] text-white text-[10px] font-bold rounded-full transition-colors cursor-pointer"
                title="Siguiente"
              >
                ›
              </button>
              <button
                type="button"
                onClick={onClose}
                className="p-1 text-slate-400 hover:text-slate-700 transition-colors cursor-pointer"
                title="Salir del tutorial"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Mini Floating Card — Exactly as requested in image_7d59e02d.png */
        <div 
          style={placement.style}
          className="fixed z-50 pointer-events-auto"
        >
          <div 
            className="w-[320px] max-w-[calc(100vw-24px)] bg-white rounded-2xl border border-slate-200/90 shadow-xl p-3.5 flex flex-col justify-between animate-in fade-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header: One single line */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-baseline gap-2 min-w-0">
                <span className="text-xs font-bold text-slate-900 shrink-0">
                  {stepIndex + 1}/15
                </span>
                <h4 className="text-xs font-bold text-slate-900 truncate">
                  {currentStep.title}
                </h4>
              </div>

              <div className="flex items-center gap-1 shrink-0 ml-2">
                <button
                  type="button"
                  onClick={() => setIsMinimized(true)}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
                  title="Minimizar instructivo"
                >
                  <Minimize2 className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={onClose}
                  className="p-1 text-slate-400 hover:text-slate-700 rounded-md transition-colors cursor-pointer"
                  title="Salir del tutorial"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* Body: exactly 1 or 2 concise practical sentences */}
            <div className="py-2">
              <p className="text-xs sm:text-[13px] text-slate-700 leading-snug font-normal">
                {currentStep.description}
              </p>
            </div>

            {/* Divider & Footer */}
            <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
              <div>
                {stepIndex > 0 ? (
                  <button
                    type="button"
                    onClick={handlePrev}
                    className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
                  >
                    <span>‹</span>
                    <span>Anterior</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={onClose}
                    className="text-[11px] font-medium text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
                  >
                    Salir
                  </button>
                )}
              </div>

              <button
                type="button"
                onClick={handleNext}
                className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-white text-xs font-bold rounded-xl transition-all shadow-xs cursor-pointer active:scale-95 ${
                  hasInteracted ? 'bg-[#0d4f3b] hover:bg-[#093d2d] ring-2 ring-emerald-400/40' : 'bg-[#0d4f3b] hover:bg-[#093d2d]'
                }`}
              >
                <span>{currentStep.isStageEnd && currentStep.stage === 3 ? 'Comenzar' : 'Siguiente'}</span>
                <span>→</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tour Completion Celebration Modal */}
      {showCompletionModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/80 backdrop-blur-xs flex items-center justify-center p-4">
          <div 
            className="bg-white rounded-3xl max-w-md w-full border border-slate-200 shadow-2xl p-6 sm:p-8 text-center space-y-5 animate-in fade-in zoom-in-95 duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="w-16 h-16 rounded-3xl bg-emerald-950 text-emerald-300 flex items-center justify-center mx-auto shadow-md">
              <Sparkles className="w-8 h-8" />
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-black uppercase tracking-wider text-emerald-900 bg-emerald-100/80 px-2.5 py-0.5 rounded-full">
                ¡Recorrido Completado!
              </span>
              <h3 className="text-xl sm:text-2xl font-black text-slate-900">
                ¡Ya conocés FAROS!
              </h3>
              <p className="text-xs sm:text-sm text-slate-600 leading-relaxed max-w-sm mx-auto">
                Ahora podés administrar tu cartera, seguir las noticias que te interesan y organizar tus eventos financieros desde un mismo lugar.
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-left text-xs text-slate-700 space-y-1.5">
              <div className="flex items-center gap-1.5 font-bold text-slate-900">
                <Check className="w-4 h-4 text-emerald-700 stroke-[3]" />
                <span>¿Necesitás repasar alguna sección?</span>
              </div>
              <p className="text-[11px] text-slate-500 leading-normal">
                Podés volver a iniciar este tutorial interactivo cuando quieras haciendo clic en el botón <strong>"Tutorial"</strong> en la cabecera o en la pestaña Mi Cartera.
              </p>
            </div>

            <button
              type="button"
              onClick={handleFinishTour}
              className="w-full py-3 px-6 bg-emerald-950 hover:bg-emerald-900 text-white text-xs font-black uppercase tracking-wider rounded-2xl shadow-md cursor-pointer transition-all active:scale-95"
            >
              Empezar a usar FAROS
            </button>
          </div>
        </div>
      )}
    </>
  );
};
