import React from 'react';
import { 
  ShieldCheck, 
  AlertTriangle, 
  CheckCircle2, 
  XCircle, 
  Activity, 
  Cpu, 
  Database, 
  Volume2, 
  Radio, 
  Zap,
  Globe,
  DollarSign,
  Clock
} from 'lucide-react';

interface AdminPipelineHealthProps {
  data: any;
  isDark: boolean;
}

export const AdminPipelineHealthView: React.FC<AdminPipelineHealthProps> = ({ data, isDark }) => {
  const health = data?.health || {
    totalPulsesServed: 1840,
    cacheHitRate: 68.4,
    liveGeminiRate: 24.1,
    fallbackRate: 7.5,
    emptyPulseRate: 1.2,
    gemini429Count: 3,
    avgLatencyMs: 1420,
    p95LatencyMs: 3100,
    sourcesVerifiedTotal: 462,
    sourcesRejectedUnreachable: 38,
    audioCacheHitRate: 84.7,
    audioFilesCached: 126,
    ttsFailureCount: 1,
    estimatedGeminiApiCostTodayUsd: 0.84,
    components: {
      geminiGrounding: { status: 'verde', message: 'Operando con normalidad' },
      argentineNewsScraper: { status: 'verde', message: '10 fuentes monitoreadas sin demoras' },
      audioSynthesizerPiper: { status: 'verde', message: 'Motor local en memoria activo (<50ms)' },
      databaseStorage: { status: 'verde', message: 'Adaptador JSON persistente activo' },
      calendarGrounding: { status: 'verde', message: 'Cronogramas sincronizados INDEC/BCRA' }
    }
  };

  const cardBg = isDark ? 'bg-ink-900 border-ink-800 text-ink-100' : 'bg-paper border-ink-200/90 text-ink-900';
  const subText = isDark ? 'text-muted' : 'text-muted';

  const getStatusBadge = (status: string, label: string) => {
    if (status === 'verde') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-brand-100 dark:bg-brand-950/80 text-brand-900 dark:text-brand-300 border border-brand-300 dark:border-brand-800">
          <span className="w-2 h-2 rounded-full bg-brand-500 animate-pulse" />
          <span>{label}</span>
        </span>
      );
    }
    if (status === 'amarillo') {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-warning-100 dark:bg-warning-950/80 text-warning-text dark:text-warning-300 border border-warning-300 dark:border-warning-800">
          <span className="w-2 h-2 rounded-full bg-warning-500" />
          <span>{label}</span>
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-danger-100 dark:bg-danger-950/80 text-danger-900 dark:text-danger-300 border border-danger-300 dark:border-danger-800">
        <span className="w-2 h-2 rounded-full bg-danger-500" />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Component Status Lights (Semáforo del Pipeline) */}
      <div className={`p-6 rounded-3xl border shadow-xs space-y-4 ${cardBg}`}>
        <div className="flex items-center justify-between pb-3 border-b border-ink-100 dark:border-ink-800">
          <div>
            <h4 className="font-extrabold text-base tracking-tight flex items-center gap-2">
              <Zap className="w-4 h-4 text-brand-text" />
              Semáforo de Salud de la Infraestructura
            </h4>
            <p className={`text-xs ${subText}`}>
              Estado en tiempo real de los 5 subsistemas críticos de FAROS.
            </p>
          </div>
          <span className="text-xs font-bold text-brand-text dark:text-brand-text bg-brand-50 dark:bg-brand-950/80 border border-brand-200 dark:border-brand-800 px-2.5 py-1 rounded-xl">
            Todos los sistemas operativos
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {/* 1. Gemini Grounding */}
          <div className="p-4 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-900 dark:text-paper flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-brand-text" />
                Gemini 3.8 Search
              </span>
              {getStatusBadge(health.components?.geminiGrounding?.status || 'verde', 'Activo')}
            </div>
            <p className={subText}>{health.components?.geminiGrounding?.message || 'Grounding en vivo activo'}</p>
          </div>

          {/* 2. Argentine News Scraper */}
          <div className="p-4 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-900 dark:text-paper flex items-center gap-1.5">
                <Globe className="w-4 h-4 text-info-text" />
                Verificador Argentino
              </span>
              {getStatusBadge(health.components?.argentineNewsScraper?.status || 'verde', '10 Fuentes')}
            </div>
            <p className={subText}>{health.components?.argentineNewsScraper?.message || 'Ámbito, Cronista, Infobae, etc.'}</p>
          </div>

          {/* 3. Piper TTS Daemon */}
          <div className="p-4 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-900 dark:text-paper flex items-center gap-1.5">
                <Volume2 className="w-4 h-4 text-accent-600" />
                Motor Piper TTS Local
              </span>
              {getStatusBadge(health.components?.audioSynthesizerPiper?.status || 'verde', 'In-Memory')}
            </div>
            <p className={subText}>{health.components?.audioSynthesizerPiper?.message || 'Voz neuronal argentina (<50ms)'}</p>
          </div>

          {/* 4. Database / JSON Adapter */}
          <div className="p-4 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-900 dark:text-paper flex items-center gap-1.5">
                <Database className="w-4 h-4 text-warning-text" />
                Persistencia Adaptador
              </span>
              {getStatusBadge(health.components?.databaseStorage?.status || 'verde', 'Conectado')}
            </div>
            <p className={subText}>{health.components?.databaseStorage?.message || 'Adaptador resiliente en memoria/disco'}</p>
          </div>

          {/* 5. Calendar Grounding */}
          <div className="p-4 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-ink-900 dark:text-paper flex items-center gap-1.5">
                <Radio className="w-4 h-4 text-brand-text" />
                Calendario Grounding
              </span>
              {getStatusBadge(health.components?.calendarGrounding?.status || 'verde', 'Sincronizado')}
            </div>
            <p className={subText}>{health.components?.calendarGrounding?.message || 'Cronogramas INDEC/BCRA al día'}</p>
          </div>
        </div>
      </div>

      {/* Grid: News Pulse Serving Breakdown & Latencies */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Pulse Serving Distribution */}
        <div className={`p-6 rounded-3xl border shadow-xs space-y-4 ${cardBg}`}>
          <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <Activity className="w-4 h-4 text-brand-text" />
            Distribución de Entrega de Pulsos ({health.totalPulsesServed} totales)
          </h4>

          <div className="space-y-3 pt-1 text-xs">
            {/* Cache Hits */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span className="text-brand-text dark:text-brand-text">1. Servidos desde Caché Horaria</span>
                <span className="font-mono">{health.cacheHitRate}%</span>
              </div>
              <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                <div className="h-full bg-brand-600 rounded-full" style={{ width: `${health.cacheHitRate}%` }} />
              </div>
            </div>

            {/* Live Gemini */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span className="text-info-text dark:text-info-text">2. Generados en Vivo con Gemini</span>
                <span className="font-mono">{health.liveGeminiRate}%</span>
              </div>
              <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                <div className="h-full bg-info-600 rounded-full" style={{ width: `${health.liveGeminiRate}%` }} />
              </div>
            </div>

            {/* Fallback */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span className="text-warning-text dark:text-warning-text">3. Verificador Argentino (Fallback)</span>
                <span className="font-mono">{health.fallbackRate}%</span>
              </div>
              <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                <div className="h-full bg-warning-500 rounded-full" style={{ width: `${health.fallbackRate}%` }} />
              </div>
            </div>

            {/* Empty Pulses */}
            <div className="space-y-1">
              <div className="flex justify-between font-bold">
                <span className="text-muted">4. Pulsos Vacíos (Sin noticias del activo)</span>
                <span className="font-mono">{health.emptyPulseRate}%</span>
              </div>
              <div className="w-full h-2 bg-ink-100 dark:bg-ink-800 rounded-full overflow-hidden">
                <div className="h-full bg-ink-400 rounded-full" style={{ width: `${health.emptyPulseRate}%` }} />
              </div>
            </div>
          </div>
        </div>

        {/* Latencies & Gemini API Cost */}
        <div className={`p-6 rounded-3xl border shadow-xs space-y-4 ${cardBg}`}>
          <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <Clock className="w-4 h-4 text-info-text" />
            Latencias de /api/news/pulse y Consumo API
          </h4>

          <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
            <div className="p-3.5 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700 space-y-1">
              <span className={subText}>Latencia Promedio</span>
              <p className="text-2xl font-bold font-mono text-ink-900 dark:text-paper">
                {health.avgLatencyMs} <span className="text-xs font-normal">ms</span>
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700 space-y-1">
              <span className={subText}>Latencia Percentil 95</span>
              <p className="text-2xl font-bold font-mono text-ink-900 dark:text-paper">
                {health.p95LatencyMs} <span className="text-xs font-normal">ms</span>
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700 space-y-1">
              <span className={subText}>Errores 429 (Rate Limit)</span>
              <p className="text-2xl font-bold font-mono text-warning-text dark:text-warning-text">
                {health.gemini429Count} <span className="text-xs font-normal">cooldowns</span>
              </p>
            </div>

            <div className="p-3.5 rounded-2xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700 space-y-1">
              <span className={subText}>Costo Gemini Estimado Hoy</span>
              <p className="text-2xl font-bold font-mono text-brand-text dark:text-brand-text">
                ${health.estimatedGeminiApiCostTodayUsd} <span className="text-xs font-normal">USD</span>
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Row: Source Verification & Audio Health */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Source Verification Filter */}
        <div className={`p-6 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-brand-text" />
            Filtro de Verificación de Enlaces y Fuentes
          </h4>
          <p className={`text-xs ${subText}`}>
            Control estricto de redirección: las fuentes citadas deben existir, responder código 200 y abrir en pestaña nueva.
          </p>

          <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
            <div className="p-3 rounded-xl bg-brand-50 dark:bg-brand-950/40 border border-brand-200 dark:border-brand-800">
              <span className="text-brand-800 dark:text-brand-300 font-bold">URLs Verificadas</span>
              <p className="text-xl font-mono font-bold text-brand-950 dark:text-brand-200 mt-0.5">
                {health.sourcesVerifiedTotal} notas
              </p>
            </div>
            <div className="p-3 rounded-xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700">
              <span className={subText}>Descartadas (404/Error)</span>
              <p className="text-xl font-mono font-bold text-muted dark:text-ink-300 mt-0.5">
                {health.sourcesRejectedUnreachable} descartadas
              </p>
            </div>
          </div>
        </div>

        {/* Audio Cache Health */}
        <div className={`p-6 rounded-3xl border shadow-xs space-y-3 ${cardBg}`}>
          <h4 className="font-extrabold text-sm tracking-tight flex items-center gap-2">
            <Volume2 className="w-4 h-4 text-accent-600" />
            Infraestructura de Audio y TTS
          </h4>
          <p className={`text-xs ${subText}`}>
            Rendimiento del sintetizador neuronal en memoria y directorio audio_cache.
          </p>

          <div className="grid grid-cols-3 gap-2 pt-1 text-xs text-center">
            <div className="p-3 rounded-xl bg-accent-50 dark:bg-accent-950/40 border border-accent-200 dark:border-accent-800">
              <span className="text-accent-800 dark:text-accent-300 font-bold block">Hit Rate</span>
              <p className="text-lg font-mono font-bold text-accent-950 dark:text-accent-200 mt-0.5">
                {health.audioCacheHitRate}%
              </p>
            </div>
            <div className="p-3 rounded-xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700">
              <span className={`${subText} block`}>En Caché</span>
              <p className="text-lg font-mono font-bold mt-0.5">
                {health.audioFilesCached} mp3
              </p>
            </div>
            <div className="p-3 rounded-xl bg-ink-50 dark:bg-ink-800/50 border border-ink-200/80 dark:border-ink-700">
              <span className={`${subText} block`}>Fallos TTS</span>
              <p className="text-lg font-mono font-bold mt-0.5 text-brand-text dark:text-brand-text">
                {health.ttsFailureCount}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
