import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  Play, 
  Pause, 
  RotateCcw, 
  RotateCw, 
  X, 
  Volume2, 
  FileText, 
  Sparkles, 
  ChevronDown, 
  Loader2,
  AlertCircle,
  Info
} from 'lucide-react';
import { 
  audioController, 
  AudioControllerState, 
  formatTime 
} from '../utils/audioController';

interface AudioPlayerDrawerProps {
  onClose?: () => void;
  isModalOpen?: boolean;
}

export const AudioPlayerDrawer: React.FC<AudioPlayerDrawerProps> = ({
  onClose,
  isModalOpen = false,
}) => {
  const [audioState, setAudioState] = useState<AudioControllerState>(audioController.getState());
  const [showScript, setShowScript] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  useEffect(() => {
    setMounted(true);
    const unsubscribe = audioController.subscribe(setAudioState);
    return () => {
      unsubscribe();
    };
  }, []);

  const track = audioState.currentTrack;

  if (!mounted || (!track && !audioState.error)) {
    return null;
  }

  const handleClose = () => {
    audioController.stopAll('drawer-close-button');
    if (onClose) onClose();
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioState.isLoading || audioState.totalDuration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    audioController.seek(ratio * audioState.totalDuration);
  };

  const progressPercent = audioState.totalDuration > 0
    ? Math.min(100, Math.max(0, (audioState.currentSeconds / audioState.totalDuration) * 100))
    : 0;

  const bottomPositionClass = isModalOpen
    ? 'bottom-[calc(0.75rem+env(safe-area-inset-bottom,0px))]'
    : 'bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] lg:bottom-4';

  return createPortal(
    <aside
      role="region"
      aria-label="Reproductor de audio"
      onClick={(e) => e.stopPropagation()}
      className={`fixed z-[9999] ${bottomPositionClass} left-3 right-3 sm:left-1/2 sm:-translate-x-1/2 sm:right-auto sm:w-[580px] max-w-[calc(100vw-1.5rem)] animate-in fade-in slide-in-from-bottom-5 duration-200 select-none`}
    >
      <div className="bg-slate-950/95 backdrop-blur-xl text-white rounded-3xl shadow-[0_20px_50px_rgba(0,0,0,0.7)] border border-emerald-800/70 overflow-hidden ring-1 ring-white/10">
        
        {/* Preparing audio status with retry button */}
        {audioState.error && (
          <div className="p-3.5 bg-slate-900/95 border-b border-emerald-800/40 text-xs text-emerald-200 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-300 font-bold">
                <Loader2 className="w-4 h-4 animate-spin text-emerald-400" />
                <span>Preparando audio...</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => track && audioController.playTrack(track)}
                  className="px-2.5 py-1 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] rounded-lg transition-colors cursor-pointer shadow-xs active:scale-95"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                  title="Cerrar aviso"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {track?.script && (
              <button
                type="button"
                onClick={() => setShowScript(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-950 text-emerald-300 rounded-lg border border-emerald-800/60 hover:bg-emerald-900 transition-colors text-[11px] font-medium cursor-pointer"
              >
                <FileText className="w-3 h-3" />
                <span>Leer resumen en texto</span>
              </button>
            )}
          </div>
        )}

        {/* Notice banner for fallback voice (e.g. edge-tts) */}
        {!audioState.error && audioState.notice && (
          <div className="px-4 py-2 bg-amber-950/80 border-b border-amber-800/40 text-[11px] text-amber-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Info className="w-3.5 h-3.5 text-amber-300 shrink-0" />
              <span className="truncate">{audioState.notice}</span>
            </div>
            <button
              type="button"
              onClick={() => audioController.clearError()}
              className="text-amber-400 hover:text-white p-0.5 cursor-pointer shrink-0"
              title="Descartar"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Collapsible Transcript / Voice Script */}
        {showScript && track?.script && (
          <div className="p-4 bg-slate-900/90 border-b border-emerald-900/40 text-xs text-slate-300 max-h-44 overflow-y-auto leading-relaxed space-y-1.5">
            <div className="flex items-center justify-between text-emerald-400 font-bold uppercase tracking-wide text-[10px]">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
                Texto del Resumen
              </span>
              <button
                type="button"
                onClick={() => setShowScript(false)}
                className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
                title="Ocultar texto"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <p className="text-slate-200 font-normal leading-relaxed">{track.script}</p>
          </div>
        )}

        {/* Main Player Bar */}
        {track && (
          <div className="p-3.5 sm:p-4 space-y-3">
            
            {/* Top Row: Track Title, Badges & Close Button */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-300 bg-emerald-950 px-2 py-0.5 rounded-md border border-emerald-800/60 shadow-xs">
                    <Volume2 className="w-3 h-3 text-emerald-400" />
                    {track.subtitle || (track.title === 'Resumen del día' ? 'Síntesis FAROS' : 'Noticia en Audio')}
                  </span>

                  <span className="text-[10px] text-slate-400 font-mono">
                    {formatTime(audioState.totalDuration)}
                  </span>
                </div>

                <p className="text-xs sm:text-sm font-bold text-white truncate mt-1" title={track.title}>
                  {track.title}
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="text-slate-400 hover:text-white p-1.5 rounded-full hover:bg-slate-800/80 transition-colors shrink-0 cursor-pointer"
                aria-label="Cerrar reproductor y detener audio"
                title="Cerrar reproductor"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Interactive Progress Bar & Real Remaining Time */}
            <div className="space-y-1">
              <div
                onClick={handleProgressBarClick}
                className="w-full bg-slate-800 hover:bg-slate-700/80 rounded-full h-2 cursor-pointer relative overflow-hidden transition-colors py-0.5"
                title="Avanzar o retroceder"
              >
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-100"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                <span className="font-semibold text-emerald-300">
                  {formatTime(audioState.currentSeconds)}
                </span>
                <span className="text-slate-400 font-medium">
                  -{formatTime(audioState.remainingSeconds)}
                </span>
              </div>
            </div>

            {/* Bottom Controls Row: Speed selector, 10s back/forward, play/pause */}
            <div className="flex items-center justify-between pt-0.5">
              {/* Speed Selector (1x, 1.25x, 1.5x) & Transcript button */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 bg-emerald-950/80 p-0.5 rounded-lg border border-emerald-800/50">
                  {([1, 1.25, 1.5] as const).map(rate => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => audioController.setSpeed(rate)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer ${
                        audioState.speed === rate
                          ? 'bg-emerald-500 text-slate-950 shadow-xs'
                          : 'text-emerald-300 hover:text-white hover:bg-emerald-900/60'
                      }`}
                      title={`Velocidad ${rate}x`}
                    >
                      {rate}x
                    </button>
                  ))}
                </div>

                {track.script && (
                  <button
                    type="button"
                    onClick={() => setShowScript(!showScript)}
                    className={`p-1.5 rounded-lg text-xs flex items-center gap-1 transition-colors cursor-pointer ${
                      showScript
                        ? 'bg-emerald-900/80 text-emerald-300 border border-emerald-700/60'
                        : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                    }`}
                    title={showScript ? "Ocultar transcripción" : "Ver transcripción"}
                  >
                    <FileText className="w-3.5 h-3.5" />
                    <span className="text-[10px] font-medium hidden sm:inline">Texto</span>
                  </button>
                )}
              </div>

              {/* Core Play / Pause and Skip 10s Buttons */}
              <div className="flex items-center gap-2 sm:gap-2.5">
                {/* Retroceder 10 segundos */}
                <button
                  type="button"
                  onClick={() => audioController.rewind(10)}
                  disabled={audioState.isLoading || audioState.totalDuration === 0}
                  className="p-2 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-full transition-colors cursor-pointer relative group disabled:opacity-40"
                  title="Retroceder 10 segundos"
                  aria-label="Retroceder 10 segundos"
                >
                  <RotateCcw className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-slate-400 font-mono group-hover:text-emerald-300">
                    -10s
                  </span>
                </button>

                {/* Play / Pause or Loading Spinner Button */}
                <button
                  type="button"
                  onClick={() => audioController.togglePlay()}
                  disabled={audioState.isLoading}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg cursor-pointer active:scale-95 ${
                    audioState.isLoading
                      ? 'bg-emerald-900/80 text-emerald-300 cursor-wait'
                      : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-emerald-950/50'
                  }`}
                  aria-label={audioState.isLoading ? "Cargando audio" : audioState.isPlaying ? "Pausar audio" : "Reproducir audio"}
                  title={audioState.isLoading ? "Generando audio en backend..." : audioState.isPlaying ? "Pausar" : "Reproducir"}
                >
                  {audioState.isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-emerald-300" />
                  ) : audioState.isPlaying ? (
                    <Pause className="w-4 h-4 fill-current stroke-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current stroke-current ml-0.5" />
                  )}
                </button>

                {/* Avanzar 10 segundos */}
                <button
                  type="button"
                  onClick={() => audioController.forward(10)}
                  disabled={audioState.isLoading || audioState.totalDuration === 0}
                  className="p-2 text-slate-300 hover:text-white hover:bg-slate-800/80 rounded-full transition-colors cursor-pointer relative group disabled:opacity-40"
                  title="Avanzar 10 segundos"
                  aria-label="Avanzar 10 segundos"
                >
                  <RotateCw className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-slate-400 font-mono group-hover:text-emerald-300">
                    +10s
                  </span>
                </button>
              </div>

              {/* Status indicator: Shows engine or 'Preparando audio...' when waiting */}
              <div className="hidden sm:flex items-center gap-1.5 text-[10px] text-emerald-300 font-medium">
                {audioState.isLoading ? (
                  <span className="text-emerald-300/90 flex items-center gap-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                    <span>Preparando audio...</span>
                  </span>
                ) : (
                  <span className="text-emerald-400/90 font-mono">{audioState.engine || 'Piper TTS'}</span>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    </aside>,
    document.body
  );
};
