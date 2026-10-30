import express from 'express';
import fs from 'fs';
import path from 'path';
import cookieParser from 'cookie-parser';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { sanitizeGroundingSources } from '../utils/sourceGrounding';
import {
  buildCacheKey,
  resolveFinalUrl,
  validateArticleUrl,
  extractArticleMeta,
  filterByFreshness,
  verifySourceUrl,
  purgeUrlVerificationCache,
  getArgentinaDateInfo
} from '../utils/urlResolver';
import { getLiveVerifiedArgentineNews } from '../utils/liveFinancialNews';
import {
  getNowAR,
  setSimulatedDayOffset,
  getSimulatedDayOffset
} from '../utils/dateAR';
import {
  getBondSchedule,
  validateSource,
  getVerifiedCalendarEvents,
  buildCalendarCacheKey
} from '../utils/calendarGrounding';
import { checkReminders } from '../utils/calendarReminders';
import { NewsItem, CalendarEvent } from '../types';
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
} from './auth';
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
} from './adminRoutes';
import { trackEventNonBlocking, isUserAdmin } from './dbAdapter';
import { 
  synthesizeArgentineSpeech, 
  prefetchAudioScripts, 
  computeScriptHash 
} from './ttsEngine';

dotenv.config();

const app = express();

// Middleware to prevent Express from hanging on pre-parsed bodies in Vercel Serverless
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    (req as any)._body = true;
  }
  next();
});

app.use(express.json());
app.use(cookieParser());

// Universal CORS & preflight OPTIONS handler for mobile Safari, webviews & cross-origin requests
app.use((req, res, next) => {
  if (!res.headersSent) {
    const reqOrigin = req.headers.origin;
    if (reqOrigin) {
      res.setHeader('Access-Control-Allow-Origin', reqOrigin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    } else {
      const host = req.headers.host;
      if (host) {
        const proto = req.protocol === 'https' || req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http';
        res.setHeader('Access-Control-Allow-Origin', `${proto}://${host}`);
        res.setHeader('Access-Control-Allow-Credentials', 'true');
      }
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, PATCH');
    res.setHeader('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization, Cookie, Cache-Control');
  }

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }
  next();
});

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

// Lazy Gemini AI client (Server-side only, does not crash on missing key)
let aiClient: GoogleGenAI | null = null;
function getAiClient(): GoogleGenAI | null {
  if (!process.env.GEMINI_API_KEY) return null;
  if (!aiClient) {
    try {
      aiClient = new GoogleGenAI({
        apiKey: process.env.GEMINI_API_KEY,
        httpOptions: {
          headers: {
            'User-Agent': 'aistudio-build'
          }
        }
      });
    } catch {
      aiClient = null;
    }
  }
  return aiClient;
}

let rateLimitCooldownUntil = 0;

/**
 * 2-Step Gemini Search Grounding Pipeline for News
 */
async function fetchGroundedNewsFromGemini(tickers: string[], portfolioProfile: string): Promise<NewsItem[] | null> {
  const ai = getAiClient();
  if (!ai || !process.env.GEMINI_API_KEY) {
    return null;
  }

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

      const vResult = await verifySourceUrl(uri, title);
      if (!vResult.verified || !vResult.source) {
        continue;
      }

      validSourcesMap.set(sourceIdCounter, {
        id: sourceIdCounter,
        mediaName: vResult.source.mediaName,
        originalHeadline: vResult.source.originalHeadline,
        sourceUrl: vResult.source.sourceUrl,
        domain: vResult.source.domain,
        publishedTime: vResult.source.publishedTime,
        publishedDateIso: vResult.source.publishedDateIso
      });
      rawChunkToSourceId.set(i, sourceIdCounter);
      sourceIdCounter++;
    }

    if (validSourcesMap.size === 0) {
      return null;
    }

    const searchContentText = candidate?.content?.parts?.map(p => p.text).filter(Boolean).join('\n') || '';

    const groundedSourcesList = Array.from(validSourcesMap.values()).map(s => 
      `[ID ${s.id}] Titular original: "${s.originalHeadline}" | Medio: ${s.mediaName} | Dominio: ${s.domain}`
    ).join('\n');

    const extractionPrompt = `Sos el motor de análisis y filtro de FAROS, plataforma de inteligencia financiera para inversores en Argentina.
Fecha actual en Argentina: ${argDate.formattedSpanish} (${argDate.isoDate}).
Perfil del inversor: ${portfolioProfile}. Activos bajo monitoreo: ${tickersStr}.

A continuación tenés el informe de mercado y la lista de fuentes reales verificadas con su ID numérico:

=== FUENTES VERIFICADAS DISPONIBLES ===
${groundedSourcesList}

=== INFORME DE MERCADO BASADO EN BÚSQUEDA ===
${searchContentText}

INSTRUCCIONES ESTRICTAS:
1. Extraé entre 3 y 8 noticias del mercado argentino directamente relevantes para la cartera.
2. Cada noticia DEBE asignar al campo "sourceId" un número entero correspondiente a uno de los IDs de las [FUENTES VERIFICADAS DISPONIBLES].
3. IMPACTO POR ACTIVO: En "portfolioImpactAnalysis.affectedHoldings", evaluá el impacto ticker por ticker.
4. "sentiment": "favorable" si beneficia al activo/cartera, "adverso" si perjudica, genera alerta o incertidumbre, o "neutral" si es informativo.
5. "audioScript": síntesis concisa de 2 oraciones para locución en audio argentino.

Respondé ÚNICAMENTE con un JSON con el siguiente esquema:
{
  "items": [
    {
      "sourceId": 1,
      "headline": "Titular periodístico profesional y conciso",
      "summary": "Resumen ejecutivo del acontecimiento (máx 3 oraciones con datos concretos)",
      "economicAnalysis": "Explicación detallada del mecanismo de transmisión sobre las variables financieras",
      "sentiment": "favorable" | "adverso" | "neutral",
      "impact": "alto" | "medio" | "bajo",
      "category": "Mercados" | "Renta Fija" | "Renta Variable" | "Macroeconomía" | "Dólar" | "Regulatorio" | "Corporativo",
      "affectedHoldings": ["AL30", "GD30"],
      "audioScript": "Texto optimizado para ser leído por locutor",
      "portfolioImpactAnalysis": {
        "portfolioVerdict": "favorable" | "adverso" | "neutral",
        "affectedHoldings": [
          {
            "ticker": "AL30",
            "position": "long",
            "verdict": "favorable" | "adverso" | "neutral",
            "transmissionMechanism": "Por qué y cómo impacta este activo específico"
          }
        ]
      }
    }
  ]
}`;

    const extractionResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: extractionPrompt,
      config: {
        responseMimeType: 'application/json'
      }
    });

    const extractionText = extractionResponse.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('');
    if (!extractionText) return null;

    const parsed = JSON.parse(extractionText);
    const rawItems = parsed.items || (Array.isArray(parsed) ? parsed : []);

    const finalNewsItems: NewsItem[] = [];

    for (let idx = 0; idx < rawItems.length; idx++) {
      const item = rawItems[idx];
      const assignedSource = validSourcesMap.get(item.sourceId) || validSourcesMap.get(idx + 1) || Array.from(validSourcesMap.values())[0];
      if (!assignedSource) continue;

      const mediaDomain = assignedSource.domain || (new URL(assignedSource.sourceUrl)).hostname;
      const mediaName = assignedSource.mediaName || mediaDomain;

      finalNewsItems.push({
        id: `gemini_${argDate.isoDate}_${idx}_${Date.now()}`,
        headline: item.headline || assignedSource.originalHeadline,
        briefSummary: item.summary || 'Resumen de mercado elaborado por FAROS.',
        fullSynthesis: [
          item.summary || '',
          item.economicAnalysis || '',
          `Información respaldada por ${mediaName}.`
        ].filter(Boolean),
        publishedAgo: assignedSource.publishedTime || 'Hoy',
        timestamp: assignedSource.publishedTime || `${argDate.isoDate}T09:00:00-03:00`,
        coverageCount: 1,
        sources: [{
          mediaName,
          originalHeadline: assignedSource.originalHeadline,
          sourceUrl: assignedSource.sourceUrl,
          publishedTime: assignedSource.publishedTime,
          domain: mediaDomain
        }],
        affectedAssetIds: Array.isArray(item.affectedHoldings) && item.affectedHoldings.length > 0 ? item.affectedHoldings : tickers.slice(0, 3),
        impact: (['alto', 'medio', 'bajo'].includes(item.impact) ? item.impact : 'medio') as any,
        relevanceType: 'impacto_precio',
        topicCategory: 'deuda_soberana',
        audioDuration: '1:00 min',
        audioScript: item.audioScript || `${item.headline}. ${item.summary}`,
        factCheck: {
          status: 'confirmado',
          officialSource: mediaName,
          detail: `Respaldado por publicación original en ${mediaName}.`
        },
        portfolioImpactAnalysis: {
          directExplanation: item.economicAnalysis || item.summary || 'Análisis de cartera FAROS.',
          affectedHoldings: (Array.isArray(item.affectedHoldings) ? item.affectedHoldings : []).map((ticker: string) => ({
            symbol: ticker,
            impactDirection: (['alto', 'medio', 'bajo'].includes(item.impact) ? item.impact : 'medio') as any,
            relationshipDetail: 'Transmisión vía variables de mercado y cotización.'
          })),
          horizon: 'Corto plazo'
        }
      });
    }

    return finalNewsItems.length > 0 ? finalNewsItems : null;
  } catch (error: any) {
    console.error('Error in fetchGroundedNewsFromGemini:', error?.message || error);
    if (error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      rateLimitCooldownUntil = Date.now() + 60000;
    }
    return null;
  }
}

/**
 * Verified Financial Calendar Events
 */
async function fetchCalendarEvents(
  tickers: string[],
  portfolioId: string,
  forceRefresh = false
): Promise<{ events: CalendarEvent[]; cached: boolean }> {
  const nowAR = getNowAR();
  const cacheKey = buildCalendarCacheKey(portfolioId, nowAR.isoMonth, nowAR.isoDate);

  if (!forceRefresh && calendarCache[cacheKey]) {
    return {
      events: calendarCache[cacheKey].events,
      cached: true
    };
  }

  const verifiedEvents = await getVerifiedCalendarEvents(tickers);

  calendarCache[cacheKey] = {
    timestamp: Date.now(),
    events: verifiedEvents
  };

  return {
    events: verifiedEvents,
    cached: false
  };
}

// --- NEWS PULSE ENDPOINTS ---
app.post(['/api/news/pulse', '/news/pulse'], async (req, res) => {
  const pulseStartTime = Date.now();
  const user = await getSessionUser(req);

  if (!checkIpRateLimit(req.ip || 'ip', 45)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Por favor reintentá en un momento.' });
  }

  const { portfolioId, tickers = [], profile = 'moderado', forceRefresh = false } = req.body;
  const { cacheKey, dateKey, hourKey } = buildCacheKey(portfolioId);

  if (lastProcessedDay && lastProcessedDay !== dateKey) {
    for (const k in newsCache) {
      if (!k.includes(dateKey)) {
        delete newsCache[k];
      }
    }
    purgeUrlVerificationCache();
  }
  lastProcessedDay = dateKey;

  if (!forceRefresh && newsCache[cacheKey]) {
    trackEventNonBlocking('news_pulse_query', {
      userId: user?.id,
      metadata: { cached: true, tickersCount: tickers.length, newsCount: newsCache[cacheKey].news.length },
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

  const liveNews = await fetchGroundedNewsFromGemini(tickers, profile);
  if (liveNews && liveNews.length > 0) {
    newsCache[cacheKey] = {
      timestamp: Date.now(),
      news: liveNews
    };

    trackEventNonBlocking('news_pulse_query', {
      userId: user?.id,
      metadata: { cached: false, usedGemini: true, tickersCount: tickers.length, newsCount: liveNews.length },
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

  const liveVerifiedNews = await getLiveVerifiedArgentineNews(tickers);
  if (liveVerifiedNews && liveVerifiedNews.length > 0) {
    newsCache[cacheKey] = {
      timestamp: Date.now(),
      news: liveVerifiedNews
    };

    trackEventNonBlocking('news_pulse_query', {
      userId: user?.id,
      metadata: { cached: false, usedGemini: false, tickersCount: tickers.length, newsCount: liveVerifiedNews.length },
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

  return res.json({
    news: [],
    cached: false,
    fallback: false,
    dateKey,
    hourKey
  });
});

// --- CALENDAR ENDPOINTS ---
app.post(['/api/calendar/events', '/calendar/events'], async (req, res) => {
  const { portfolioId = 'default', tickers = [], forceRefresh = false } = req.body;
  const result = await fetchCalendarEvents(tickers, portfolioId, forceRefresh);
  return res.json(result);
});

app.post(['/api/calendar/check-reminders', '/calendar/check-reminders'], (req, res) => {
  const { events = [], sentReminderIds = [] } = req.body;
  const result = checkReminders(events, sentReminderIds);
  return res.json(result);
});

app.get(['/api/date/info', '/date/info'], (req, res) => {
  const now = getNowAR();
  return res.json({
    ...now,
    simulatedOffsetDays: getSimulatedDayOffset()
  });
});

app.post(['/api/date/simulate-offset', '/date/simulate-offset'], async (req, res) => {
  const user = await getSessionUser(req);
  if (process.env.NODE_ENV === 'production' && (!user || !isUserAdmin(user.email))) {
    return res.status(403).json({ error: 'Solo los administradores pueden simular fechas en producción.' });
  }

  const { offsetDays = 0 } = req.body;
  setSimulatedDayOffset(Number(offsetDays) || 0);
  const newDate = getNowAR();

  return res.json({
    success: true,
    offsetDays,
    nowAR: newDate
  });
});

// --- AUTHENTICATION & ACCOUNT ROUTES ---
app.get(['/api/auth/me', '/auth/me'], handleGetMe);
app.post(['/api/auth/register', '/auth/register'], handleRegister);
app.post(['/api/auth/login', '/auth/login'], handleLogin);
app.post(['/api/auth/logout', '/auth/logout'], handleLogout);
app.post(['/api/auth/forgot-password', '/auth/forgot-password'], handleForgotPassword);
app.post(['/api/auth/reset-password', '/auth/reset-password'], handleResetPassword);
app.put(['/api/auth/user', '/auth/user'], handleUpdateUser);
app.delete(['/api/auth/account', '/auth/account'], handleDeleteAccount);
app.post(['/api/auth/draft', '/auth/draft'], handleSaveDraft);
app.get(['/api/auth/draft', '/auth/draft'], handleGetDraft);

// OAuth 2.0 (Google & Microsoft) Endpoints
app.get(['/api/auth/google/url', '/auth/google/url'], handleGetGoogleAuthUrl);
app.get(['/api/auth/google/callback', '/auth/google/callback'], handleGoogleCallback);
app.get(['/api/auth/microsoft/url', '/auth/microsoft/url'], handleGetMicrosoftAuthUrl);
app.get(['/api/auth/microsoft/callback', '/auth/microsoft/callback'], handleMicrosoftCallback);

// --- PROTECTED ADMIN PANEL ENDPOINTS ---
app.get(['/api/admin/check', '/admin/check'], handleAdminCheck);
app.post(['/api/admin/track', '/admin/track'], handleClientTrackEvent);

app.use(['/api/admin', '/admin'], requireAdminMiddleware);
app.get(['/api/admin/overview', '/admin/overview'], handleAdminOverview);
app.get(['/api/admin/users', '/admin/users'], handleAdminUsers);
app.put(['/api/admin/users/:userId/plan', '/admin/users/:userId/plan'], handleAdminUpdateUserPlan);
app.get(['/api/admin/funnel', '/admin/funnel'], handleAdminFunnel);
app.get(['/api/admin/usage', '/admin/usage'], handleAdminUsage);
app.get(['/api/admin/pipeline-health', '/admin/pipeline-health'], handleAdminPipelineHealth);
app.get(['/api/admin/thesis-financials', '/admin/thesis-financials'], handleAdminThesisFinancials);

// --- AUDIO SENSING & TTS ENDPOINTS ---
const SAFE_AUDIO_CACHE_DIR = path.join('/tmp', 'faros_audio_cache');

app.get(['/api/audio/file/:filename', '/audio/file/:filename'], (req, res) => {
  const filename = path.basename(req.params.filename);
  const candidateDirs = [
    SAFE_AUDIO_CACHE_DIR,
    path.resolve(process.cwd(), 'audio_cache')
  ];

  let filePath = '';
  for (const dir of candidateDirs) {
    const p = path.join(dir, filename);
    if (fs.existsSync(p)) {
      filePath = p;
      break;
    }
  }

  if (!filePath) {
    return res.status(404).json({ error: 'Archivo de audio no encontrado' });
  }

  const ext = path.extname(filename).toLowerCase();
  res.setHeader('Content-Type', ext === '.wav' ? 'audio/wav' : 'audio/mpeg');
  res.setHeader('Accept-Ranges', 'bytes');
  res.setHeader('Cache-Control', 'public, max-age=86400, immutable');
  res.sendFile(filePath);
});

app.post(['/api/audio/prefetch', '/audio/prefetch'], (req, res) => {
  const { items = [] } = req.body;
  if (Array.isArray(items) && items.length > 0) {
    prefetchAudioScripts(items);
  }
  return res.json({ success: true, count: items.length });
});

app.post(['/api/audio/synthesize', '/audio/synthesize'], async (req, res) => {
  if (!checkIpRateLimit(req.ip || 'ip', 30)) {
    return res.status(429).json({ 
      success: false, 
      error: 'Demasiadas solicitudes de síntesis de voz. Por favor aguardá unos segundos.' 
    });
  }

  const abortController = new AbortController();
  res.on('close', () => {
    if (!res.writableEnded) {
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
      return;
    }
    console.warn('TTS endpoint warning:', error?.message || error);
    if (!res.writableEnded) {
      return res.json({
        success: false,
        error: 'El audio no está disponible en este momento.',
        fallbackTextOnly: true
      });
    }
  }
});

// Global JSON error handler preventing raw HTML 500 error pages
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error('[SERVER ERROR]', err);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Error interno del servidor. Por favor reintentá en unos momentos.' });
  }
});

export { app };
export default app;
