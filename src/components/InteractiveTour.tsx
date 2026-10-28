import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  ArrowRight, 
  ArrowLeft, 
  X, 
  Sparkles, 
  Check, 
  Wallet, 
  Newspaper, 
  Calendar as CalendarIcon, 
  ChevronRight,
  TrendingUp,
  ShieldCheck,
  Info
} from 'lucide-react';

export interface TourStep {
  stage: 1 | 2 | 3;
  stageName: string;
  stepNumber: number;
  totalInStage: number;
  targetId: string;
  title: string;
  description: string;
  tabRequired: 'settings' | 'feed' | 'calendar';
  exampleSnippet?: React.ReactNode;
  isStageEnd?: boolean;
  nextStageName?: string;
}

export const TOUR_STEPS: TourStep[] = [
  // ================= STAGE 1: MI CARTERA (9 Steps) =================
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 1,
    totalInStage: 9,
    targetId: 'portfolio-title',
    tabRequired: 'settings',
    title: 'Presentación de Mi Cartera',
    description: 'Este es tu espacio personal de inversión. Acá podés agregar los activos que querés monitorear y configurar qué información te interesa recibir.'
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 2,
    totalInStage: 9,
    targetId: 'portfolio-search',
    tabRequired: 'settings',
    title: 'Cómo agregar tickers a tu cartera',
    description: 'Podés buscar por ticker o nombre del activo (acciones como YPFD o GGAL, bonos soberanos como AL30 y GD30, CEDEARs de Apple y Nvidia, o divisas). Al escribir aparecen sugerencias automáticas. Podés sumar todos los activos que desees, sin obligación de hacerlo ahora.',
    exampleSnippet: (
      <div className="p-2.5 rounded-xl bg-slate-50 border border-slate-200 text-[11px] text-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="font-mono font-bold text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">YPFD</span>
          <span>YPF S.A. · Renta Variable</span>
        </div>
        <span className="text-[10px] font-bold text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded">Ejemplo demostrativo</span>
      </div>
    )
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 3,
    totalInStage: 9,
    targetId: 'portfolio-long-short-demo',
    tabRequired: 'settings',
    title: 'Posición LONG o SHORT',
    description: 'Por defecto, tus activos se agregan como LONG (te beneficiás de una suba). Si tenés una posición SHORT (te beneficiás de una baja o cobertura), podés seleccionarla antes de agregar el activo. FAROS utiliza esta información para interpretar cómo las noticias afectan tu cartera sin alterar el hecho financiero original.',
    exampleSnippet: (
      <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 text-[11px] text-slate-800 space-y-1.5">
        <div className="flex items-center gap-2 font-mono font-bold text-xs">
          <span>YPFD</span>
          <span className="text-[10px] px-2 py-0.2 rounded bg-blue-600 text-white font-sans">LONG ✓</span>
          <span className="text-[10px] px-2 py-0.2 rounded bg-amber-400 text-amber-950 font-sans border border-amber-500/60">SHORT</span>
        </div>
        <p className="text-[10px] text-slate-600">LONG viene seleccionado por defecto. Podés cambiarlo con un clic antes o después de incorporarlo.</p>
      </div>
    )
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 4,
    totalInStage: 9,
    targetId: 'portfolio-assets-list',
    tabRequired: 'settings',
    title: 'Administrar tus activos',
    description: 'En esta grilla podés visualizar todos tus tickers incorporados, identificar cuáles están en LONG (azul) y cuáles en SHORT (amarillo), cambiar el tipo de posición con un solo clic o eliminar activos. Tu cartera puede tener los instrumentos que quieras o quedar vacía.'
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 5,
    totalInStage: 9,
    targetId: 'portfolio-cards',
    tabRequired: 'settings',
    title: 'Carteras disponibles',
    description: 'Acá podés visualizar tu cartera activa, alternar entre carteras existentes con un clic y utilizar "Crear nueva cartera" para separar diferentes estrategias de inversión.'
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 6,
    totalInStage: 9,
    targetId: 'portfolio-profile',
    tabRequired: 'settings',
    title: 'Mi Perfil de Inversor',
    description: 'Podés elegir entre perfil Conservador, Moderado o Dinámico. Esta calibración define el tono y la jerarquización del contexto informativo sin sesgar las noticias.'
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 7,
    totalInStage: 9,
    targetId: 'portfolio-relevance',
    tabRequired: 'settings',
    title: 'Qué noticias me importan',
    description: 'FAROS clasifica el flujo informativo en 4 categorías: Impacto en precio, Valoración de mercado, Ruido de mercado y Contexto macro. Podés activar o desactivar las que quieras priorizar.'
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 8,
    totalInStage: 9,
    targetId: 'portfolio-notifications',
    tabRequired: 'settings',
    title: 'Notificaciones y opciones avanzadas',
    description: 'Activá las notificaciones de eventos relevantes y desplegá las opciones avanzadas para seleccionar temáticas específicas con prioridad (deuda soberana, energía, balances, normativa del BCRA o inflación).'
  },
  {
    stage: 1,
    stageName: 'Mi Cartera',
    stepNumber: 9,
    totalInStage: 9,
    targetId: 'portfolio-account',
    tabRequired: 'settings',
    title: 'Cuenta y privacidad',
    description: 'Acá podés consultar tus datos registrados, gestionar tu sesión y acceder a las opciones de privacidad y eliminación definitiva de cuenta de forma segura.',
    isStageEnd: true,
    nextStageName: 'Noticias'
  },

  // ================= STAGE 2: NOTICIAS (9 Steps) =================
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 1,
    totalInStage: 9,
    targetId: 'feed-title',
    tabRequired: 'feed',
    title: 'Noticias en FAROS',
    description: 'FAROS reúne y analiza noticias financieras de distintos medios verificados (Ámbito, El Cronista, Infobae, Bloomberg Línea, BCRA e INDEC) para ayudarte a identificar cuáles son relevantes para tus inversiones.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 2,
    totalInStage: 9,
    targetId: 'feed-hero-pulso',
    tabRequired: 'feed',
    title: 'Pulso Diario de Mercado',
    description: 'Sintetiza la dirección general de las noticias (Favorable, Alerta o Neutral) teniendo en cuenta si tus posiciones son LONG o SHORT, y muestra el balance objetivo de noticias del día sin porcentajes inventados.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 3,
    totalInStage: 9,
    targetId: 'feed-refresh-btn',
    tabRequired: 'feed',
    title: 'Actualización en tiempo real',
    description: 'Este botón te permite consultar novedades de última hora y refrescar la información disponible con fuentes periodísticas verificadas.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 4,
    totalInStage: 9,
    targetId: 'feed-audio-brief',
    tabRequired: 'feed',
    title: 'Resumen del día en audio',
    description: 'Podés escuchar un resumen completo de 2 a 3 minutos con voz neuronal argentina para ponerte al día sin necesidad de leer todas las notas. El reproductor te permite pausar, regular velocidad y leer la transcripción.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 5,
    totalInStage: 9,
    targetId: 'feed-news-section',
    tabRequired: 'feed',
    title: 'Noticias Clasificadas',
    description: 'Cada tarjeta contiene el titular, resumen conciso, categoría, fecha, tickers vinculados con badge LONG/SHORT, dirección del impacto y medios que reportaron la noticia.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 6,
    totalInStage: 9,
    targetId: 'feed-filters',
    tabRequired: 'feed',
    title: 'Filtros interactivos de noticias',
    description: 'Podés combinar filtros por categoría (Impacto, Valoración, Ruido, Macro), por dirección (Favorables, Alertas, Neutrales), por activo específico o buscar por palabra clave.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 7,
    totalInStage: 9,
    targetId: 'feed-card-bookmark',
    tabRequired: 'feed',
    title: 'Noticias guardadas',
    description: 'Con el ícono de marcador podés guardar noticias clave para revisarlas más tarde y alternar fácilmente entre tus guardadas y el feed completo.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 8,
    totalInStage: 9,
    targetId: 'feed-card-detail',
    tabRequired: 'feed',
    title: 'Análisis detallado de una noticia',
    description: 'Al abrir cualquier tarjeta accedés al análisis cualitativo completo: mecanismo de transmisión, factores a monitorear, impacto por activo según posición LONG/SHORT, síntesis en audio y enlaces a los artículos originales.'
  },
  {
    stage: 2,
    stageName: 'Noticias',
    stepNumber: 9,
    totalInStage: 9,
    targetId: 'header-notifications',
    tabRequired: 'feed',
    title: 'Alertas de Cartera',
    description: 'En la campana de notificaciones recibís avisos inmediatos: noticias adversas para tus activos, fechas de riesgo del calendario y aclaraciones regulatorias, con enlace directo a las fuentes originales.',
    isStageEnd: true,
    nextStageName: 'Calendario'
  },

  // ================= STAGE 3: CALENDARIO (10 Steps) =================
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 1,
    totalInStage: 10,
    targetId: 'calendar-header',
    tabRequired: 'calendar',
    title: 'Calendario Financiero',
    description: 'El Calendario Financiero te ayuda a seguir fechas importantes relacionadas con tus inversiones y acontecimientos macroeconómicos clave del mercado argentino e internacional.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 2,
    totalInStage: 10,
    targetId: 'calendar-summary-metrics',
    tabRequired: 'calendar',
    title: 'Resumen mensual de eventos',
    description: 'Indicadores superiores que resumen cobros de rentas y cupones, balances corporativos y publicaciones macroeconómicas (como el IPC del INDEC y licitaciones del Tesoro).'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 3,
    totalInStage: 10,
    targetId: 'calendar-grid',
    tabRequired: 'calendar',
    title: 'Navegación del calendario',
    description: 'Podés consultar el mes actual, avanzar o retroceder entre meses, identificar días con eventos mediante colores por categoría y seleccionar cualquier fecha para ver su detalle.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 4,
    totalInStage: 10,
    targetId: 'calendar-filters',
    tabRequired: 'calendar',
    title: 'Filtros de eventos',
    description: 'Filtrá rápidamente por tipo de acontecimiento: Todos, Pagos de Bonos y Renta, Balances Corporativos, Datos Macro y BCRA, o Política Monetaria.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 5,
    totalInStage: 10,
    targetId: 'calendar-events-list',
    tabRequired: 'calendar',
    title: 'Consultar un evento del día',
    description: 'Hacé clic en cualquier fecha para consultar el nombre del evento, horario, descripción oficial, activo relacionado, estado (confirmada o estimada) y enlace oficial.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 6,
    totalInStage: 10,
    targetId: 'calendar-refresh-btn',
    tabRequired: 'calendar',
    title: 'Actualizar calendario',
    description: 'Refrescá en cualquier momento los cronogramas y fechas confirmadas con las últimas circulares y avisos oficiales emitidos.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 7,
    totalInStage: 10,
    targetId: 'calendar-add-event-btn',
    tabRequired: 'calendar',
    title: 'Crear tus propios eventos',
    description: 'Podés agendar tus propios hitos financieros: seleccioná la fecha, elegí el activo, indicá la acción (comprar, vender, cobrar renta), sumá notas personales y configurá recordatorios.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 8,
    totalInStage: 10,
    targetId: 'calendar-reminders-info',
    tabRequired: 'calendar',
    title: 'Recordatorios anticipados',
    description: 'Elegí cuándo querés que FAROS te avise: el mismo día, 1 día antes, 3 días antes o una semana antes del acontecimiento programado.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 9,
    totalInStage: 10,
    targetId: 'calendar-events-list',
    tabRequired: 'calendar',
    title: 'Editar o eliminar eventos propios',
    description: 'Tus eventos personalizados se pueden editar o eliminar en cualquier momento sin alterar los eventos oficiales del mercado.'
  },
  {
    stage: 3,
    stageName: 'Calendario',
    stepNumber: 10,
    totalInStage: 10,
    targetId: 'calendar-browser-notifications',
    tabRequired: 'calendar',
    title: 'Notificaciones del navegador',
    description: 'Podés activar las notificaciones web del navegador para recibir alertas de tus eventos agendados incluso cuando no tengas la pestaña abierta. Solo se activan si vos decidís conceder el permiso.',
    isStageEnd: true
  }
];

interface InteractiveTourProps {
  isActive: boolean;
  onClose: () => void;
  onSelectTab: (tab: 'settings' | 'feed' | 'calendar') => void;
  currentTab: 'settings' | 'feed' | 'calendar';
}

export const InteractiveTour: React.FC<InteractiveTourProps> = ({
  isActive,
  onClose,
  onSelectTab,
  currentTab
}) => {
  const [stepIndex, setStepIndex] = useState<number>(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const [showCompletionModal, setShowCompletionModal] = useState<boolean>(false);

  const currentStep = TOUR_STEPS[stepIndex] || TOUR_STEPS[0];

  // Sync tab with step requirements
  useEffect(() => {
    if (!isActive) return;
    if (currentStep.tabRequired !== currentTab) {
      onSelectTab(currentStep.tabRequired);
    }
  }, [stepIndex, isActive, currentStep.tabRequired, currentTab, onSelectTab]);

  // Update target bounding rect and smooth scroll
  const updateTargetRect = useCallback(() => {
    if (!isActive) return;

    const el = document.querySelector(`[data-tour="${currentStep.targetId}"]`);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      // Smooth scroll target into view if offscreen
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      setTargetRect(null);
    }
  }, [isActive, currentStep.targetId]);

  useEffect(() => {
    if (!isActive) return;
    const timer = setTimeout(updateTargetRect, 250);
    window.addEventListener('resize', updateTargetRect);
    window.addEventListener('scroll', updateTargetRect, true);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updateTargetRect);
      window.removeEventListener('scroll', updateTargetRect, true);
    };
  }, [updateTargetRect, isActive, stepIndex, currentTab]);

  const handleNext = () => {
    if (currentStep.isStageEnd && currentStep.stage === 3) {
      // Completed full tour!
      setShowCompletionModal(true);
      try {
        localStorage.setItem('faros_tour_completed', 'true');
      } catch {}
      return;
    }

    if (stepIndex < TOUR_STEPS.length - 1) {
      setStepIndex(stepIndex + 1);
    }
  };

  const handlePrev = () => {
    if (stepIndex > 0) {
      setStepIndex(stepIndex - 1);
    }
  };

  const handleFinishTour = () => {
    setShowCompletionModal(false);
    onClose();
  };

  if (!isActive) return null;

  return (
    <>
      {/* Semi-transparent dark overlay */}
      <div 
        className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-[1px] transition-opacity duration-300 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      />

      {/* Target spotlight cutout if target exists */}
      {targetRect && (
        <div
          style={{
            position: 'fixed',
            top: targetRect.top - 6,
            left: targetRect.left - 6,
            width: targetRect.width + 12,
            height: targetRect.height + 12,
            zIndex: 45,
            pointerEvents: 'none'
          }}
          className="rounded-2xl ring-4 ring-emerald-400 ring-offset-2 ring-offset-slate-950/80 shadow-[0_0_30px_rgba(16,185,129,0.35)] transition-all duration-300 animate-pulse"
        />
      )}

      {/* Floating Tooltip Card */}
      <div className="fixed inset-x-0 bottom-4 sm:bottom-6 z-50 flex items-center justify-center p-3 pointer-events-none">
        <div 
          className="w-full max-w-lg bg-white rounded-3xl border-2 border-emerald-600/90 shadow-2xl overflow-hidden pointer-events-auto flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-200"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-5 py-3.5 bg-gradient-to-r from-emerald-950 via-emerald-900 to-slate-950 text-white flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="w-6 h-6 rounded-lg bg-emerald-800 text-emerald-200 flex items-center justify-center text-xs font-black">
                {currentStep.stage}
              </span>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-emerald-300 block">
                  Etapa {currentStep.stage} de 3: {currentStep.stageName}
                </span>
                <span className="text-xs font-bold text-white block">
                  Paso {currentStep.stepNumber} de {currentStep.totalInStage}
                </span>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-1 text-slate-300 hover:text-white rounded-lg hover:bg-emerald-900/60 transition-colors cursor-pointer"
              title="Salir del tutorial"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Body */}
          <div className="p-5 sm:p-6 space-y-3.5 max-h-[50vh] overflow-y-auto">
            <h4 className="text-base sm:text-lg font-black text-slate-900 leading-tight">
              {currentStep.title}
            </h4>

            <p className="text-xs sm:text-sm text-slate-700 leading-relaxed font-normal">
              {currentStep.description}
            </p>

            {currentStep.exampleSnippet && (
              <div className="pt-1">
                {currentStep.exampleSnippet}
              </div>
            )}
          </div>

          {/* Footer Controls */}
          <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={onClose}
              className="text-xs font-semibold text-slate-500 hover:text-slate-800 transition-colors cursor-pointer"
            >
              Salir del tutorial
            </button>

            <div className="flex items-center gap-2">
              {stepIndex > 0 && (
                <button
                  type="button"
                  onClick={handlePrev}
                  className="inline-flex items-center gap-1 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-200 rounded-xl transition-all cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleNext}
                className="inline-flex items-center gap-1.5 px-4 sm:px-5 py-2 bg-emerald-950 hover:bg-emerald-900 text-white text-xs font-extrabold rounded-xl transition-all shadow-xs cursor-pointer"
              >
                {currentStep.isStageEnd && currentStep.nextStageName ? (
                  <>
                    <span>Continuar a {currentStep.nextStageName}</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                ) : currentStep.isStageEnd && currentStep.stage === 3 ? (
                  <>
                    <Check className="w-3.5 h-3.5 stroke-[3]" />
                    <span>Empezar a usar FAROS</span>
                  </>
                ) : (
                  <>
                    <span>Siguiente</span>
                    <ArrowRight className="w-3.5 h-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

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
                Podés volver a iniciar este tutorial interactivo cuando quieras haciendo clic en el botón <strong>"Ver tutorial"</strong> en la cabecera o en la pestaña Mi Cartera.
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
