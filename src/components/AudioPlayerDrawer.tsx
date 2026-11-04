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

  const seekableDuration = Math.max(0, audioState.seekableDuration ?? 0);
  const canSeek = audioState.canSeek === true && seekableDuration > 0;
  const isLoading = audioState.isLoading && !audioState.error;
  const voiceLabel = audioState.voice === 'es-AR-TomasNeural'
    ? 'Voz argentina · Tomás'
    : audioState.voice === 'es-AR-ElenaNeural'
      ? 'Voz argentina · Elena'
      : null;

  const seekToAvailableTime = (seconds: number) => {
    if (!canSeek) return;
    audioController.seek(Math.max(0, Math.min(seekableDuration, seconds)));
  };

  const handleProgressBarClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canSeek || audioState.totalDuration === 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width === 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    seekToAvailableTime(ratio * audioState.totalDuration);
  };

  const handleProgressBarKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSeek) return;
    const nextTime = e.key === 'ArrowLeft' ? audioState.currentSeconds - 10
      : e.key === 'ArrowRight' ? audioState.currentSeconds + 10
        : e.key === 'Home' ? 0
          : e.key === 'End' ? seekableDuration
            : null;
    if (nextTime === null) return;
    e.preventDefault();
    seekToAvailableTime(nextTime);
  };

  const handlePlaybackClick = () => {
    if (isLoading) {
      audioController.pause();
    } else if (audioState.error) {
      audioController.retry();
    } else {
      audioController.togglePlay();
    }
  };

  const progressPercent = audioState.totalDuration > 0
    ? Math.min(100, Math.max(0, (audioState.currentSeconds / audioState.totalDuration) * 100))
    : 0;
  const availablePercent = audioState.totalDuration > 0
    ? Math.min(100, (seekableDuration / audioState.totalDuration) * 100)
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
      <div className="bg-ink-950/95 backdrop-blur-xl text-paper rounded-3xl shadow-brand-soft border border-brand-800/70 overflow-hidden ring-1 ring-paper/10">
        
        {/* Playback errors remain visible until retry or dismissal. */}
        {audioState.error && (
          <div role="alert" aria-live="assertive" className="p-3.5 bg-ink-900/95 border-b border-brand-800/40 text-xs text-brand-200 space-y-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-2 text-brand-300 font-medium min-w-0">
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <span>{audioState.error}</span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => audioController.retry()}
                  disabled={!track}
                  className="px-2.5 py-1 bg-brand-500 hover:bg-brand-400 text-ink-950 font-bold text-[11px] rounded-lg transition-colors cursor-pointer shadow-xs active:scale-95 disabled:opacity-40"
                >
                  Reintentar
                </button>
                <button
                  type="button"
                  onClick={handleClose}
                  className="text-muted hover:text-paper p-0.5 cursor-pointer"
                  title="Cerrar aviso"
                  aria-label="Cerrar aviso y detener audio"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
            {track?.script && (
              <button
                type="button"
                onClick={() => setShowScript(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1 bg-brand-950 text-brand-300 rounded-lg border border-brand-800/60 hover:bg-brand-900 transition-colors text-[11px] font-medium cursor-pointer"
              >
                <FileText className="w-3 h-3" />
                <span>Leer resumen en texto</span>
              </button>
            )}
          </div>
        )}

        {/* Notice banner for fallback voice (e.g. edge-tts) */}
        {!audioState.error && audioState.notice && (
          <div role="status" aria-live="polite" className="px-4 py-2 bg-warning-950/80 border-b border-warning-800/40 text-[11px] text-warning-200 flex items-center justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <Info className="w-3.5 h-3.5 text-warning-300 shrink-0" />
              <span>{audioState.notice}</span>
            </div>
            <button
              type="button"
              onClick={() => audioController.clearError()}
              className="text-warning-text hover:text-paper p-0.5 cursor-pointer shrink-0"
              title="Descartar"
              aria-label="Descartar aviso de audio"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* Collapsible Transcript / Voice Script */}
        {showScript && track?.script && (
          <div className="p-4 bg-ink-900/90 border-b border-brand-900/40 text-xs text-ink-300 max-h-44 overflow-y-auto leading-relaxed space-y-1.5">
            <div className="flex items-center justify-between text-brand-text font-bold uppercase tracking-wide text-[10px]">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-brand-text" />
                Texto del Resumen
              </span>
              <button
                type="button"
                onClick={() => setShowScript(false)}
                className="text-muted hover:text-paper p-0.5 cursor-pointer"
                title="Ocultar texto"
              >
                <ChevronDown className="w-4 h-4" />
              </button>
            </div>
            <p className="text-ink-200 font-normal leading-relaxed">{track.script}</p>
          </div>
        )}

        {/* Main Player Bar */}
        {track && (
          <div className="p-3.5 sm:p-4 space-y-3">
            
            {/* Top Row: Track Title, Badges & Close Button */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-widest text-brand-300 bg-brand-950 px-2 py-0.5 rounded-md border border-brand-800/60 shadow-xs">
                    <Volume2 className="w-3 h-3 text-brand-text" />
                    {track.subtitle || (track.title === 'Resumen del día' ? 'Síntesis FAROS' : 'Noticia en Audio')}
                  </span>

                  <span className="text-[10px] text-muted font-mono" title={audioState.isDurationEstimated ? 'Duración aproximada; se ajusta al preparar el audio' : 'Duración del audio'}>
                    {audioState.isDurationEstimated ? '≈ ' : ''}{formatTime(audioState.totalDuration)}
                  </span>
                </div>

                <p className="text-xs sm:text-sm font-bold text-paper truncate mt-1" title={track.title}>
                  {track.title}
                </p>
              </div>

              <button
                type="button"
                onClick={handleClose}
                className="text-muted hover:text-paper p-1.5 rounded-full hover:bg-ink-800/80 transition-colors shrink-0 cursor-pointer"
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
                onKeyDown={handleProgressBarKeyDown}
                role="slider"
                tabIndex={canSeek ? 0 : -1}
                aria-label="Progreso del audio"
                aria-disabled={!canSeek}
                aria-valuemin={0}
                aria-valuemax={seekableDuration}
                aria-valuenow={Math.min(seekableDuration, Math.max(0, audioState.currentSeconds))}
                aria-valuetext={`${formatTime(audioState.currentSeconds)} reproducidos; ${formatTime(seekableDuration)} disponibles`}
                className={`w-full bg-ink-800 rounded-full h-2 relative overflow-hidden transition-colors py-0.5 ${canSeek ? 'hover:bg-ink-700/80 cursor-pointer' : 'cursor-default'}`}
                title={!canSeek ? 'El audio se está preparando' : audioState.isDurationEstimated ? 'Podés avanzar en el audio disponible; el resto se está preparando' : 'Avanzar o retroceder'}
              >
                <div
                  className="absolute inset-y-0 left-0 bg-brand-900/70 rounded-full"
                  style={{ width: `${availablePercent}%` }}
                />
                <div
                  className="relative bg-brand-500 h-full rounded-full transition-all duration-100"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between items-center text-[10px] font-mono text-muted">
                <span className="font-semibold text-brand-300">
                  {formatTime(audioState.currentSeconds)}
                </span>
                <span className="text-muted font-medium">
                  {audioState.isDurationEstimated ? '≈ ' : ''}-{formatTime(audioState.remainingSeconds)}
                </span>
              </div>
            </div>

            {/* Bottom Controls Row: Speed selector, 10s back/forward, play/pause */}
            <div className="flex items-center justify-between pt-0.5">
              {/* Speed Selector (1x, 1.25x, 1.5x) & Transcript button */}
              <div className="flex items-center gap-1.5">
                <div className="flex items-center gap-0.5 bg-brand-950/80 p-0.5 rounded-lg border border-brand-800/50">
                  {([1, 1.25, 1.5] as const).map(rate => (
                    <button
                      key={rate}
                      type="button"
                      onClick={() => audioController.setSpeed(rate)}
                      className={`px-1.5 py-0.5 text-[10px] font-mono font-bold rounded transition-colors cursor-pointer ${
                        audioState.speed === rate
                          ? 'bg-brand-500 text-ink-950 shadow-xs'
                          : 'text-brand-300 hover:text-paper hover:bg-brand-900/60'
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
                        ? 'bg-brand-900/80 text-brand-300 border border-brand-700/60'
                        : 'text-muted hover:text-paper hover:bg-ink-800/60'
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
                  onClick={() => seekToAvailableTime(audioState.currentSeconds - 10)}
                  disabled={!canSeek || audioState.currentSeconds <= 0}
                  className="p-2 text-ink-300 hover:text-paper hover:bg-ink-800/80 rounded-full transition-colors cursor-pointer relative group disabled:opacity-40"
                  title="Retroceder 10 segundos"
                  aria-label="Retroceder 10 segundos"
                >
                  <RotateCcw className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-muted font-mono group-hover:text-brand-300">
                    -10s
                  </span>
                </button>

                {/* Play / Pause or Loading Spinner Button */}
                <button
                  type="button"
                  onClick={handlePlaybackClick}
                  className={`w-10 h-10 rounded-full flex items-center justify-center transition-all shadow-lg cursor-pointer active:scale-95 ${
                    isLoading
                      ? 'bg-brand-900/80 text-brand-300'
                      : 'bg-brand-500 hover:bg-brand-400 text-ink-950 shadow-brand-950/50'
                  }`}
                  aria-label={isLoading ? 'Cancelar preparación del audio' : audioState.error ? 'Reintentar audio' : audioState.isPlaying ? 'Pausar audio' : 'Reproducir audio'}
                  title={isLoading ? 'Cancelar preparación del audio' : audioState.error ? 'Reintentar audio' : audioState.isPlaying ? 'Pausar' : 'Reproducir'}
                >
                  {isLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin text-brand-300" />
                  ) : audioState.isPlaying ? (
                    <Pause className="w-4 h-4 fill-current stroke-current" />
                  ) : (
                    <Play className="w-4 h-4 fill-current stroke-current ml-0.5" />
                  )}
                </button>

                {/* Avanzar 10 segundos */}
                <button
                  type="button"
                  onClick={() => seekToAvailableTime(audioState.currentSeconds + 10)}
                  disabled={!canSeek || audioState.currentSeconds >= seekableDuration - 0.05}
                  className="p-2 text-ink-300 hover:text-paper hover:bg-ink-800/80 rounded-full transition-colors cursor-pointer relative group disabled:opacity-40"
                  title={audioState.isDurationEstimated ? 'Avanzar en el audio disponible; el resto se está preparando' : 'Avanzar 10 segundos'}
                  aria-label="Avanzar 10 segundos"
                >
                  <RotateCw className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
                  <span className="absolute -bottom-2.5 left-1/2 -translate-x-1/2 text-[8px] font-bold text-muted font-mono group-hover:text-brand-300">
                    +10s
                  </span>
                </button>
              </div>

              {/* Voice metadata reflects the voice actually returned by the service. */}
              <div role="status" aria-live="polite" className="hidden sm:flex items-center gap-1.5 text-[10px] text-brand-300 font-medium">
                {isLoading ? (
                  <span className="text-brand-300/90 flex items-center gap-1 animate-pulse">
                    <Loader2 className="w-3 h-3 animate-spin text-brand-text" />
                    <span>Preparando audio...</span>
                  </span>
                ) : (
                  <span className="text-brand-text/90">{voiceLabel}</span>
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
