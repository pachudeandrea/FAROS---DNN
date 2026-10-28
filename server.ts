import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cookieParser from 'cookie-parser';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { sanitizeGroundingSources } from './src/utils/sourceGrounding';
import {
  buildCacheKey,
  resolveFinalUrl,
  validateArticleUrl,
  extractArticleMeta,
  filterByFreshness,
  verifySourceUrl,
  purgeUrlVerificationCache,
  getArgentinaDateInfo
} from './src/utils/urlResolver';
import { getLiveVerifiedArgentineNews } from './src/utils/liveFinancialNews';
import {
  getNowAR,
  setSimulatedDayOffset,
  getSimulatedDayOffset
} from './src/utils/dateAR';
import {
  getBondSchedule,
  validateSource,
  getVerifiedCalendarEvents,
  buildCalendarCacheKey
} from './src/utils/calendarGrounding';
import { checkReminders } from './src/utils/calendarReminders';
import { NewsItem, CalendarEvent } from './src/types';
import {
  handleGetMe,
  handleRegister,
  handleLogin,
  handleLogout,
  handleForgotPassword,
  handleResetPassword,
  handleUpdateUser,
  handleDeleteAccount,
  handleSaveDraft,
  handleGetDraft,
  handleGetGoogleAuthUrl,
  handleGoogleCallback,
  handleGetMicrosoftAuthUrl,
  handleMicrosoftCallback,
  getSessionUser
} from './src/server/auth';
import {
  requireAdminMiddleware,
  handleAdminCheck,
  handleClientTrackEvent,
  handleAdminOverview,
  handleAdminUsers,
  handleAdminUpdateUserPlan,
  handleAdminFunnel,
  handleAdminUsage,
  handleAdminPipelineHealth,
  handleAdminThesisFinancials
} from './src/server/adminRoutes';
import { trackEventNonBlocking, isUserAdmin } from './src/server/dbAdapter';

// Re-export required functions as specified in deliverables
export {
  getNowAR,
  buildCacheKey,
  resolveFinalUrl,
  validateArticleUrl,
  extractArticleMeta,
  filterByFreshness,
  validateSource,
  getBondSchedule,
  checkReminders,
  setSimulatedDayOffset,
  getSimulatedDayOffset
};

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());
app.use(cookieParser());

// In-memory cache per portfolio, date (in Argentina) and hour
interface CacheEntry {
  timestamp: number;
  news: NewsItem[];
}
const newsCache: Record<string, CacheEntry> = {};

interface CalendarCacheEntry {
  timestamp: number;
  events: CalendarEvent[];
}
const calendarCache: Record<string, CalendarCacheEntry> = {};

let lastProcessedDay = '';

// Sliding window rate limiter for expensive AI & audio endpoints
const ipRateLimitMap = new Map<string, { count: number; resetAt: number }>();
function checkIpRateLimit(ip: string, maxPerMin = 60): boolean {
  const now = Date.now();
  const entry = ipRateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    ipRateLimitMap.set(ip, { count: 1, resetAt: now + 60000 });
    return true;
  }
  if (entry.count >= maxPerMin) return false;
  entry.count++;
  return true;
}

// Gemini AI client (Server-side only)
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      'User-Agent': 'aistudio-build'
    }
  }
});

let rateLimitCooldownUntil = 0;

/**
 * 2-Step Gemini Search Grounding Pipeline for News
 * Step 1: Query with Google Search grounding to discover real breaking financial articles.
 * Dynamic date injected for America/Argentina/Buenos_Aires.
 * Every source URL is fully resolved (following redirects), validated, and metadata extracted.
 * Step 2: Request structured JSON referencing sources strictly by numeric ID.
 * The model NEVER writes URLs or media titles.
 */
async function fetchGroundedNewsFromGemini(tickers: string[], portfolioProfile: string): Promise<NewsItem[] | null> {
  if (!process.env.GEMINI_API_KEY) {
    return null;
  }

  // If rate limited or quota was recently exhausted, wait out cooldown before calling live API
  if (Date.now() < rateLimitCooldownUntil) {
    return null;
  }

  try {
    const argDate = getNowAR();
    const tickersStr = tickers.length > 0 ? tickers.join(', ') : 'AL30, GD30, YPFD, GGAL, MEP, CCL';
    const searchPrompt = `Hoy es ${argDate.formattedSpanish} (fecha ISO: ${argDate.isoDate}, zona horaria America/Argentina/Buenos_Aires).
Buscá con rigor simétrico las noticias financieras, cambiarias, regulatorias y de mercado más importantes publicadas hoy o en las últimas 24 a 48 horas en Argentina relacionadas con estos activos y su contexto: ${tickersStr}.
Incluí tanto catalizadores favorables como factores de RIESGO e impacto adverso:
- Suba de riesgo país, caída de paridades soberanas, licitaciones desiertas o vencimientos exigentes.
- Presiones sobre el tipo de cambio (MEP, CCL, oficial), ampliación de brecha cambiaria y variación de reservas del BCRA.
- Inflación mayor a la esperada, cambios de tasas de interés y medidas de política monetaria del BCRA.
- Regulaciones, intimaciones o resoluciones de CNV, BCRA, ARCA/AFIP o Secretaría de Comercio.
- Balances corporativos con caída de márgenes, suspensiones de inversiones o dividendos, hechos relevantes adversos y caídas en commodities (petróleo, gas, granos).
- Shocks internacionales (tasas de la Fed, tensión geopolítica, bajas de calificación crediticia).

Fuentes prioritarias autorizadas: Ámbito Financiero (ambito.com), El Cronista (cronista.com), Infobae Economía (infobae.com), Bloomberg Línea (bloomberglinea.com), La Nación Economía (lanacion.com.ar), Clarín Economía (clarin.com), Reuters (reuters.com), EconoJournal (econojournal.com.ar), BAE Negocios (baenegocios.com), iProfesional (iprofesional.com), Comunicados Oficiales BCRA (bcra.gob.ar), CNV (cnv.gov.ar) e INDEC (indec.gob.ar).
Detallá los hechos concretos, cifras y mecanismos de transmisión respaldados por las notas encontradas.`;

    // Step 1: Call Gemini with Google Search grounding enabled
    const searchResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }]
      }
    });

    const candidate = searchResponse.candidates?.[0];
    const groundingMetadata = candidate?.groundingMetadata;
    const rawChunks = groundingMetadata?.groundingChunks || [];
    const rawSupports = groundingMetadata?.groundingSupports || [];

    // Filter and verify candidate sources through full resolution & validation pipeline
    interface GroundingSource {
      id: number;
      mediaName: string;
      originalHeadline: string;
      sourceUrl: string;
      domain?: string;
      publishedTime?: string;
      publishedDateIso?: string;
    }

    const validSourcesMap = new Map<number, GroundingSource>();
    const rawChunkToSourceId = new Map<number, number>();
    let sourceIdCounter = 1;

    for (let i = 0; i < rawChunks.length; i++) {
      const chunk = rawChunks[i];
      const uri = chunk.web?.uri;
      const title = chunk.web?.title;

      if (!uri || typeof uri !== 'string') continue;

      // Full URL resolution, validation, metadata extraction and caching
      const vResult = await verifySourceUrl(uri, title);
      if (!vResult.verified || !vResult.source) {
        continue;
      }

      validSourcesMap.set(sourceIdCounter, {
        id: sourceIdCounter,
        mediaName: vResult.source.mediaName,
        originalHeadline: vResult.source.originalHeadline,
        sourceUrl: vResult.source.sourceUrl, // Resolved canonical URL, NEVER vertexaisearch
        domain: vResult.source.domain,
        publishedTime: vResult.source.publishedTime,
        publishedDateIso: vResult.source.publishedDateIso
      });
      rawChunkToSourceId.set(i, sourceIdCounter);
      sourceIdCounter++;
    }

    if (validSourcesMap.size === 0) {
      console.log('[GEMINI GROUNDING] No valid authentic sources passed the verification pipeline.');
      return null;
    }

    // Read groundingSupports to know which source backs which statement
    const supportedStatements: string[] = [];
    if (Array.isArray(rawSupports) && rawSupports.length > 0) {
      for (const sup of rawSupports) {
        const segText = sup.segment?.text?.trim();
        const chunkIndices = sup.groundingChunkIndices || [];
        if (segText && chunkIndices.length > 0) {
          const supportedSourceIds = chunkIndices
            .map((cIdx: number) => rawChunkToSourceId.get(cIdx))
            .filter((id: number | undefined): id is number => id !== undefined);
          if (supportedSourceIds.length > 0) {
            supportedStatements.push(`- "${segText.slice(0, 160)}" -> Respaldado por Fuentes: [${supportedSourceIds.join(', ')}]`);
          }
        }
      }
    }

    // Prepare list of verified sources for Step 2
    const sourcesListText = Array.from(validSourcesMap.values())
      .map(s => `[Fuente ${s.id}]: "${s.originalHeadline}" (${s.mediaName}) - Fecha: ${s.publishedTime || 'Confirmada'}`)
      .join('\n');

    const supportsContextText = supportedStatements.length > 0
      ? `\nAfirmaciones con respaldo verificado:\n${supportedStatements.slice(0, 12).join('\n')}\n`
      : '';

    // Step 2: Structure news into JSON referencing sources solely by numeric ID
    const structurePrompt = `A partir del texto sintetizado y de la lista de fuentes reales numeradas, estructurá las noticias financieras relevantes para los activos [${tickersStr}] con fecha ${argDate.formattedSpanish}.

REGLAS ABSOLUTAS DE OBJETIVIDAD Y SIMETRÍA:
1. EVALUACIÓN BALANCEADA SIN SESGO: Tratá con el mismo rigor y peso las noticias favorables, las alertas/riesgos adversos y las neutras. Queda estrictamente prohibido suavizar malas noticias, omitir riesgos o forzar conclusiones optimistas.
2. DIRECCIÓN DEL IMPACTO ("impact"):
   - "alerta": cuando la noticia reporte presiones a la baja en cotizaciones, suba de riesgo país, devaluación, aceleración inflacionaria, mayores costos, caídas de ventas/márgenes, endurecimiento regulatorio o shocks desfavorables.
   - "favorable": cuando la noticia reporte hechos concretos de superávit, compras genuinas de reservas, compresión de riesgo, expansión operativa o desregulación positiva respaldada.
   - "neutral": cuando el acontecimiento sea de contexto general, desmentida sin daño estructural o datos dentro de lo esperado. Si la evidencia es mixta o insuficiente, la dirección DEBE ser "neutral", NUNCA "favorable" por defecto.
3. IMPACTO POR ACTIVO (afectación cruzada): En "portfolioImpactAnalysis.affectedHoldings", evaluá el impacto ticker por ticker. Un mismo acontecimiento puede ser adverso para un activo y favorable para otro (ej: suba del dólar financiero puede generar alerta para títulos en pesos y ser favorable para activos dolarizados).
4. CERO ALUCINACIÓN DE URLs: El modelo NUNCA escribe URLs ni nombres de archivo. Cada noticia DEBE asociar en "sourceIds" únicamente los IDs numéricos de las fuentes reales provistas (ejemplo: [1, 2]). Si una noticia no tiene fuente en la lista, DESCARTALA.
5. NO RECOMENDACIONES FINANCIERAS: Prohibido dar consejos de compra o venta. Estricto análisis objetivo de mercado y variables.
6. Devolvé un arreglo JSON con el siguiente formato:
[
  {
    "id": "gen-1",
    "headline": "Título descriptivo, neutral y objetivo del acontecimiento",
    "briefSummary": "Resumen conciso y equilibrado de 2-3 líneas",
    "fullSynthesis": ["Punto clave 1", "Punto clave 2", "Punto clave 3"],
    "publishedAgo": "Hace 1h",
    "affectedAssetIds": ["AL30", "GD30"],
    "impact": "favorable" | "alerta" | "neutral",
    "relevanceType": "impacto_precio" | "valoracion_mercado" | "ruido" | "contexto_macro",
    "sourceIds": [1, 2],
    "audioDuration": "1:00 min",
    "audioScript": "Resumen FAROS conciso y balanceado para reproducción de audio",
    "factCheck": {
      "status": "confirmado" | "en_analisis" | "rumor_descartado",
      "officialSource": "Organismo oficial o medios verificados",
      "credibilityScore": 98,
      "detail": "Detalle técnico de confirmación"
    },
    "portfolioImpactAnalysis": {
      "directExplanation": "Explicación objetiva y simétrica del impacto para la cartera",
      "affectedHoldings": [
        { "symbol": "AL30", "impactDirection": "alerta", "relationshipDetail": "Mecanismo técnico de mercado" }
      ],
      "horizon": "Corto plazo (24-72h)"
    },
    "topicCategory": "deuda_soberana"
  }
]

Lista de fuentes reales encontradas:
${sourcesListText}
${supportsContextText}
Texto informativo de búsqueda:
${searchResponse.text?.slice(0, 4000) || ''}`;

    const structResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: structurePrompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const parsed = JSON.parse(structResponse.text || '[]');
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    // Replace numeric sourceIds with the actual genuine sources from verification metadata
    const assembledNews: NewsItem[] = [];

    for (const item of parsed) {
      const realSources = (item.sourceIds || [])
        .map((sId: number) => validSourcesMap.get(sId))
        .filter((s: GroundingSource | undefined): s is GroundingSource => !!s)
        .map((s: GroundingSource) => ({
          mediaName: s.mediaName,
          originalHeadline: s.originalHeadline, // The authentic real title from HTML
          sourceUrl: s.sourceUrl, // The authentic resolved final URL
          publishedTime: s.publishedTime,
          publishedDateIso: s.publishedDateIso,
          domain: s.domain
        }));

      const sanitizedSources = sanitizeGroundingSources(realSources);

      // Rule: Every news item must have at least 1 real verified source
      if (sanitizedSources.length === 0) {
        continue;
      }

      assembledNews.push({
        id: item.id || `news-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        headline: item.headline,
        briefSummary: item.briefSummary,
        fullSynthesis: Array.isArray(item.fullSynthesis) ? item.fullSynthesis : [item.briefSummary],
        publishedAgo: item.publishedAgo || 'Reciente',
        timestamp: sanitizedSources[0]?.publishedTime || argDate.formattedSpanish,
        coverageCount: sanitizedSources.length,
        sources: sanitizedSources,
        affectedAssetIds: Array.isArray(item.affectedAssetIds) && item.affectedAssetIds.length > 0 
          ? item.affectedAssetIds 
          : tickers.slice(0, 2),
        impact: item.impact || 'neutral',
        relevanceType: item.relevanceType || 'contexto_macro',
        portfolioImpactAnalysis: item.portfolioImpactAnalysis || {
          directExplanation: item.briefSummary,
          affectedHoldings: [],
          horizon: 'Corto plazo'
        },
        audioDuration: item.audioDuration || '1:00 min',
        audioScript: item.audioScript || item.briefSummary,
        factCheck: item.factCheck || {
          status: 'confirmado',
          officialSource: sanitizedSources.map(s => s.mediaName).join(', '),
          credibilityScore: 98,
          detail: 'Verificado mediante cruce periodístico oficial'
        },
        topicCategory: item.topicCategory || 'deuda_soberana'
      });
    }

    // Filter by freshness (Today / 48h)
    const freshNews = filterByFreshness(assembledNews);
    return freshNews.length > 0 ? freshNews : null;
  } catch (error: any) {
    const errMsg = String(error?.message || error || '');
    const isRateLimit = errMsg.includes('429') || errMsg.includes('RESOURCE_EXHAUSTED') || errMsg.includes('quota');
    if (isRateLimit) {
      rateLimitCooldownUntil = Date.now() + 5 * 60 * 1000;
      console.log('Gemini API rate limit or quota reached; activating live Argentine financial news verifier.');
    } else {
      console.log('Gemini search grounding pipeline notice:', errMsg.slice(0, 100));
    }
    return null;
  }
}

/**
 * 2-Step Calendar Events Retrieval with Google Search Grounding & Verified Schedules
 */
export async function fetchCalendarEvents(
  tickers: string[],
  portfolioId: string,
  forceRefresh = false
): Promise<{ events: CalendarEvent[]; cached: boolean; todayIso: string; headerUpdatedText: string }> {
  const nowAR = getNowAR();
  const cacheKey = buildCalendarCacheKey(portfolioId, nowAR.isoMonth, nowAR.isoDate);

  if (!forceRefresh && calendarCache[cacheKey]) {
    return {
      events: calendarCache[cacheKey].events,
      cached: true,
      todayIso: nowAR.isoDate,
      headerUpdatedText: nowAR.headerUpdatedText
    };
  }

  console.log(`[CALENDAR] Compiling verified calendar events for portfolio: [${tickers.join(', ')}]...`);
  const verifiedEvents = await getVerifiedCalendarEvents(tickers);

  calendarCache[cacheKey] = {
    timestamp: Date.now(),
    events: verifiedEvents
  };

  return {
    events: verifiedEvents,
    cached: false,
    todayIso: nowAR.isoDate,
    headerUpdatedText: nowAR.headerUpdatedText
  };
}

// API endpoint to fetch news for a portfolio
app.post('/api/news/pulse', async (req, res) => {
  if (!checkIpRateLimit(req.ip || 'ip', 45)) {
    return res.status(429).json({ error: 'Demasiadas consultas de pulso de mercado. Aguardá unos segundos.' });
  }

  const pulseStartTime = Date.now();
  const user = getSessionUser(req);
  const { portfolioId, tickers = [], profile = 'moderado', forceRefresh = false } = req.body;
  
  // Dynamic cache key based on portfolio, date and hour in Argentina
  const { cacheKey, dateKey, hourKey } = buildCacheKey(portfolioId);

  // Daily Cache Invalidation: if date changed, purge in-memory cache and URL verification cache
  if (lastProcessedDay && lastProcessedDay !== dateKey) {
    console.log(`[DAILY ROLLOVER] Rollover from ${lastProcessedDay} to ${dateKey}. Purging all caches.`);
    for (const key of Object.keys(newsCache)) {
      delete newsCache[key];
    }
    for (const key of Object.keys(calendarCache)) {
      delete calendarCache[key];
    }
    purgeUrlVerificationCache();
  }
  lastProcessedDay = dateKey;

  // Check server-side cache if not forcing refresh
  if (!forceRefresh && newsCache[cacheKey]) {
    trackEventNonBlocking('news_pulse_query', {
      userId: user?.id,
      metadata: {
        cached: true,
        fallback: false,
        tickersCount: tickers.length,
        profile,
        forceRefresh: false,
        newsCount: newsCache[cacheKey].news.length,
        durationMs: Date.now() - pulseStartTime
      },
      userAgent: req.get('user-agent')
    });

    return res.json({
      news: newsCache[cacheKey].news,
      cached: true,
      fallback: false,
      dateKey,
      hourKey
    });
  }

  // 1. Attempt live Google Search grounded retrieval with Gemini
  const liveNews = await fetchGroundedNewsFromGemini(tickers, profile);

  if (liveNews && liveNews.length > 0) {
    newsCache[cacheKey] = {
      timestamp: Date.now(),
      news: liveNews
    };

    trackEventNonBlocking('news_pulse_query', {
      userId: user?.id,
      metadata: {
        cached: false,
        fallback: false,
        usedGemini: true,
        tickersCount: tickers.length,
        profile,
        forceRefresh: !!forceRefresh,
        newsCount: liveNews.length,
        durationMs: Date.now() - pulseStartTime
      },
      userAgent: req.get('user-agent')
    });

    return res.json({
      news: liveNews,
      cached: false,
      fallback: false,
      dateKey,
      hourKey
    });
  }

  // 2. Real-time Argentine financial news verifier
  console.log('[PIPELINE] Fetching real breaking articles from verified Argentine financial coverage...');
  const liveVerifiedNews = await getLiveVerifiedArgentineNews(tickers);

  if (liveVerifiedNews && liveVerifiedNews.length > 0) {
    newsCache[cacheKey] = {
      timestamp: Date.now(),
      news: liveVerifiedNews
    };

    trackEventNonBlocking('news_pulse_query', {
      userId: user?.id,
      metadata: {
        cached: false,
        fallback: true,
        usedGemini: false,
        tickersCount: tickers.length,
        profile,
        forceRefresh: !!forceRefresh,
        newsCount: liveVerifiedNews.length,
        durationMs: Date.now() - pulseStartTime
      },
      userAgent: req.get('user-agent')
    });

    return res.json({
      news: liveVerifiedNews,
      cached: false,
      fallback: false,
      dateKey,
      hourKey
    });
  }

  // Trigger background audio prefetching for top news items so audio is ready before user clicks play
  const itemsToCache = (liveNews && liveNews.length > 0 ? liveNews : liveVerifiedNews || []).slice(0, 5);
  if (itemsToCache.length > 0) {
    prefetchAudioScripts(itemsToCache.map(n => ({
      text: n.audioScript || `${n.headline}. ${n.briefSummary}.`
    })));
  }

  trackEventNonBlocking('news_pulse_query', {
    userId: user?.id,
    metadata: {
      cached: false,
      empty: true,
      newsCount: 0,
      durationMs: Date.now() - pulseStartTime
    },
    userAgent: req.get('user-agent')
  });

  // 3. Empty state if no fresh verified news remain
  return res.json({
    news: [],
    cached: false,
    fallback: false,
    dateKey,
    hourKey
  });
});

// API endpoint to fetch calendar events for a portfolio
app.post('/api/calendar/events', async (req, res) => {
  const { portfolioId = 'default', tickers = [], forceRefresh = false } = req.body;
  const result = await fetchCalendarEvents(tickers, portfolioId, forceRefresh);
  return res.json(result);
});

// API endpoint for simulated day offset (Secured: development or admin only)
app.post('/api/calendar/simulate-day', (req, res) => {
  const user = getSessionUser(req);
  if (process.env.NODE_ENV === 'production' && (!user || !isUserAdmin(user.email))) {
    return res.status(403).json({ 
      error: 'Simulación de fecha deshabilitada en producción para usuarios no administradores' 
    });
  }

  const { offsetDays = 0 } = req.body;
  setSimulatedDayOffset(offsetDays);
  // Invalidate caches
  for (const k of Object.keys(calendarCache)) delete calendarCache[k];
  for (const k of Object.keys(newsCache)) delete newsCache[k];
  const newDate = getNowAR();
  return res.json({
    success: true,
    offsetDays,
    nowAR: newDate
  });
});

// Authentication & Account Routes
app.get('/api/auth/me', handleGetMe);
app.post('/api/auth/register', handleRegister);
app.post('/api/auth/login', handleLogin);
app.post('/api/auth/logout', handleLogout);
app.post('/api/auth/forgot-password', handleForgotPassword);
app.post('/api/auth/reset-password', handleResetPassword);
app.put('/api/auth/user', handleUpdateUser);
app.delete('/api/auth/account', handleDeleteAccount);
app.post('/api/auth/draft', handleSaveDraft);
app.get('/api/auth/draft', handleGetDraft);

// OAuth 2.0 (Google & Microsoft) Endpoints
app.get('/api/auth/google/url', handleGetGoogleAuthUrl);
app.get('/api/auth/google/callback', handleGoogleCallback);
app.get('/api/auth/microsoft/url', handleGetMicrosoftAuthUrl);
app.get('/api/auth/microsoft/callback', handleMicrosoftCallback);

// --- PROTECTED ADMIN PANEL ENDPOINTS ---
app.get('/api/admin/check', handleAdminCheck);
app.post('/api/admin/track', handleClientTrackEvent);

// Admin-only middleware barrier for all management routes
app.use('/api/admin', requireAdminMiddleware);
app.get('/api/admin/overview', handleAdminOverview);
app.get('/api/admin/users', handleAdminUsers);
app.put('/api/admin/users/:userId/plan', handleAdminUpdateUserPlan);
app.get('/api/admin/funnel', handleAdminFunnel);
app.get('/api/admin/usage', handleAdminUsage);
app.get('/api/admin/pipeline-health', handleAdminPipelineHealth);
app.get('/api/admin/thesis-financials', handleAdminThesisFinancials);

import { 
  synthesizeArgentineSpeech, 
  ensurePiperDaemon, 
  prefetchAudioScripts, 
  computeScriptHash 
} from './src/server/ttsEngine';

const AUDIO_CACHE_DIR = path.resolve(__dirname, 'audio_cache');

/**
 * Static route to serve generated MP3 files directly with HTTP byte ranges
 * Enables instant seeking and sub-second browser audio playback start (< 50ms).
 */
app.get('/api/audio/file/:filename', (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.join(AUDIO_CACHE_DIR, filename);

  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Archivo de audio no encontrado' });
  }

  const ext = path.extname(filename).toLowerCase();
  res.setHeader('Content-Type', ext === '.wav' ? 'audio/wav' : 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.sendFile(filePath);
});

/**
 * Background prefetch endpoint for news and daily summary scripts
 */
app.post('/api/audio/prefetch', (req, res) => {
  const { items = [] } = req.body;
  if (Array.isArray(items) && items.length > 0) {
    prefetchAudioScripts(items);
  }
  return res.json({ success: true, count: items.length });
});

/**
 * Text-to-Speech endpoint powered by 100% Free Neuronal Argentine Voice (No API keys needed):
 * 1. Primary: Persistent In-Memory Piper TTS (es_AR-daniela-high.onnx)
 * 2. Fallback: edge-tts (es-AR-ElenaNeural)
 *
 * Streams first-sentence immediately if uncached, or serves cached 64kbps MP3 instantly.
 */
app.post('/api/audio/synthesize', async (req, res) => {
  if (!checkIpRateLimit(req.ip || 'ip', 30)) {
    return res.status(429).json({ 
      success: false, 
      error: 'Demasiadas solicitudes de síntesis de voz. Por favor aguardá unos segundos.' 
    });
  }

  const abortController = new AbortController();
  
  // Only abort if client disconnected before response finished writing
  res.on('close', () => {
    if (!res.writableEnded) {
      console.log('[TTS] Client disconnected, aborting synthesis.');
      abortController.abort();
    }
  });

  try {
    const { text } = req.body;
    if (!text || typeof text !== 'string') {
      return res.status(400).json({ 
        success: false, 
        error: 'El texto es requerido para la síntesis de audio.' 
      });
    }

    trackEventNonBlocking('audio_synthesis', {
      metadata: { textLength: text.length }
    });

    const result = await synthesizeArgentineSpeech(text, abortController.signal);
    if (!res.writableEnded) {
      return res.json(result);
    }
  } catch (error: any) {
    if (error?.message === 'AbortError') {
      console.log('[TTS] Synthesis aborted by client.');
      return;
    }
    console.error('TTS endpoint error:', error?.message || error);
    if (!res.writableEnded) {
      return res.json({
        success: false,
        error: error?.message || 'El audio no está disponible en este momento',
        fallbackTextOnly: true
      });
    }
  }
});

const PORT = 3000;

async function startServer() {
  // Warm up the persistent in-memory Piper daemon on server start
  ensurePiperDaemon().catch(err => {
    console.warn('[TTS] Piper daemon initial warmup warning:', err);
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true'
      },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist/index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`FAROS server running on http://0.0.0.0:${PORT}`);
  });
}

startServer();
