import { argentinaNewsDay, dailyNewsItems, mergeDailyNews } from '../utils/dailyNews.js';
import { pulseSelectionKey, readPulseSnapshot, usablePulseSnapshot, writePulseSnapshot } from './newsPulseCache.js';
import { registerNewsLibraryRoutes } from './newsLibraryRoutes.js';
import { COVERAGE_PUBLISHERS, collectPublisherSections } from '../utils/publisherSections.js';
import { NewsJobs } from './newsJobs.js';
import { portfolioAssets, normalizeAssetText } from '../data/assetCatalog.js';
import { validateCustomAssets } from '../utils/manualAssets.js';
import { describeAssets } from '../utils/assetNews.js';
import { analyzeNewsRelevance } from '../utils/newsRelevance.js';
import { portfolioNewsScope } from '../utils/newsCache.js';
import type { Asset } from '../types/index.js';
import express, { type RequestHandler } from 'express';
import { DatabaseError, query } from './database.js';
import { RequestError } from './requestError.js';
import { registerNotificationRoutes } from './notificationRoutes.js';
import { backgroundNotification, publishNews } from './notifications.js';
import fs from 'fs';
import path from 'path';
import cookieParser from 'cookie-parser';
import { GoogleGenAI } from '@google/genai';
import dotenv from 'dotenv';
import { sanitizeGroundingSources } from '../utils/sourceGrounding.js';
import {
  buildCacheKey,
  resolveFinalUrl,
  validateArticleUrl,
  extractArticleMeta,
  filterByFreshness,
  verifySourceUrl,
  purgeUrlVerificationCache,
  getArgentinaDateInfo
} from '../utils/urlResolver.js';
import { getLiveVerifiedArgentineNews, createCollectionDiagnostics } from '../utils/liveFinancialNews.js';
import { enrichNewsCoverage, mergeVerifiedNews } from '../utils/newsCoverage.js';
import { NEWS_CACHE_VERSION } from '../utils/newsCache.js';
import { discoverMissingCoverage, createCoverageDiscoveryDiagnostics } from '../utils/coverageDiscovery.js';
import {
  getNowAR,
  setSimulatedDayOffset,
  getSimulatedDayOffset
} from '../utils/dateAR.js';
import {
  getBondSchedule,
  validateSource,
  getVerifiedCalendarEvents,
  buildCalendarCacheKey
} from '../utils/calendarGrounding.js';
import { checkReminders } from '../utils/calendarReminders.js';
import { NewsItem, CalendarEvent } from '../types/index.js';
import {
  handleGetMe,
  handleRegister,
  handleLogin,
  handleLogout,
  handleSetRecoveryKey,
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
} from './auth.js';
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
} from './adminRoutes.js';
import { trackEventNonBlocking, isUserAdmin } from './dbAdapter.js';
import { 
  synthesizeArgentineSpeech, 
  prefetchAudioScripts
} from './ttsEngine.js';

dotenv.config();

const app = express();
app.set('trust proxy', 1);
const asyncRoute = (handler: RequestHandler): RequestHandler => (req, res, next) => {
  Promise.resolve().then(() => handler(req, res, next)).catch(next);
};
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
// Public deployment diagnostics; contains no credentials or account data.
app.get('/api/version', (_req, res) => {
  const revision = process.env.VERCEL_GIT_COMMIT_SHA || '';
  res.json({ revision: /^[a-f0-9]{40}$/i.test(revision) ? revision : null, newsVersion: NEWS_CACHE_VERSION });
});
app.get('/api/health', asyncRoute(async (_req, res) => {
  await query('SELECT id FROM faros_users LIMIT 0');
  await query('SELECT token FROM faros_sessions LIMIT 0');
  await query('SELECT token_hash FROM faros_auth_flows LIMIT 0');
  await query('SELECT id FROM faros_news_library LIMIT 0');
  res.json({ status: 'ok', database: 'postgresql' });
}));

// Middleware to prevent Express from hanging on pre-parsed bodies in Vercel Serverless
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    (req as any)._body = true;
  }
  next();
});

app.use('/api/news/library', express.json({ limit: '2mb' }));
app.use(express.json());
app.use(cookieParser());

// Auth cookies are same-origin. Never reflect arbitrary credentialed origins.
app.use((req, res, next) => {
  const origin = req.get('origin');
  const sameOrigin = `${req.protocol}://${req.get('host')}`;
  const configuredOrigin = process.env.APP_URL ? new URL(process.env.APP_URL).origin : sameOrigin;
  if (origin && origin !== sameOrigin && origin !== configuredOrigin) {
    return res.status(403).json({ code: 'ORIGIN_NOT_ALLOWED', error: 'El origen de la solicitud no está permitido.' });
  }
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

// Per-instance hot cache; completed results also survive in PostgreSQL.
interface CacheEntry {
  timestamp: number;
  news: NewsItem[];
}
const newsCache: Record<string, CacheEntry> = {};
type PulseResult = { news: NewsItem[]; diagnostics: ReturnType<typeof createCollectionDiagnostics>; coverageDiscovery: ReturnType<typeof createCoverageDiscoveryDiagnostics>; fallback: boolean; timestamp: number; timingsMs: { firstNews: number | null; total: number } };
const newsJobs = new NewsJobs<PulseResult>();

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
async function fetchGroundedNewsFromGemini(tickers: string[], portfolioProfile: string, assets: Asset[]): Promise<NewsItem[] | null> {
  const ai = getAiClient();
  if (!ai || !process.env.GEMINI_API_KEY) {
    return null;
  }

  if (Date.now() < rateLimitCooldownUntil) {
    return null;
  }

  const controller = new AbortController();
  const deadline = setTimeout(() => controller.abort(), 20000);
  try {
    const argDate = getNowAR();
    const tickersStr = describeAssets(tickers.length ? tickers : ['AL30', 'GD30', 'YPFD', 'GGAL', 'MEP', 'CCL'], assets);
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
Para cada acontecimiento, buscá publicaciones del MISMO HECHO en dos o más medios distintos, con sus titulares y enlaces originales. Buscá también cuando usen palabras diferentes para describirlo. No confundas noticias del mismo sector con un mismo acontecimiento y no inventes una segunda fuente si no la encontrás.
Detallá los hechos concretos, cifras y mecanismos de transmisión respaldados por las notas encontradas.`;

    const searchResponse = await ai.models.generateContent({
      model: 'gemini-3.8-flash',
      contents: searchPrompt,
      config: {
        tools: [{ googleSearch: {} }], abortSignal: controller.signal, httpOptions: { timeout: 8000 }
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
      publishedTimestamp?: number;
    }

    const validSourcesMap = new Map<number, GroundingSource>();
    const rawChunkToSourceId = new Map<number, number>();
    let sourceIdCounter = 1;

    const candidates = rawChunks.slice(0, 24);
    const results: Awaited<ReturnType<typeof verifySourceUrl>>[] = new Array(candidates.length);
    let next = 0;
    await Promise.all(Array.from({ length: Math.min(4, candidates.length) }, async () => {
      while (!controller.signal.aborted && next < candidates.length) {
        const index = next++;
        const chunk = candidates[index];
        const uri = chunk.web?.uri;
        if (typeof uri === 'string') results[index] = await verifySourceUrl(uri, chunk.web?.title, controller.signal);
      }
    }));
    if (controller.signal.aborted) return null;
    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      if (!result?.verified || !result.source) continue;
      validSourcesMap.set(sourceIdCounter, { id: sourceIdCounter, ...result.source });
      rawChunkToSourceId.set(i, sourceIdCounter++);
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
4. La síntesis debe limitarse a hechos respaldados por la fuente asignada. No incluyas recomendaciones de inversión, objetivos de precio ni pronósticos. No confundas variaciones de costos, ventas o inflación con variaciones del precio de una acción. Rumores y expectativas deben conservar su carácter no confirmado.
5. "sentiment": "favorable" si beneficia al activo/cartera, "adverso" si perjudica, genera alerta o incertidumbre, o "neutral" si es informativo.
6. "audioScript": síntesis concisa de 2 oraciones para locución en audio argentino.

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
        responseMimeType: 'application/json', abortSignal: controller.signal, httpOptions: { timeout: 8000 }
      }
    });

    const extractionText = extractionResponse.candidates?.[0]?.content?.parts?.map(p => p.text).filter(Boolean).join('');
    if (!extractionText) return null;

    const parsed = JSON.parse(extractionText);
    const rawItems = parsed.items || (Array.isArray(parsed) ? parsed : []);

    const finalNewsItems: NewsItem[] = [];

    for (let idx = 0; idx < rawItems.length; idx++) {
      const item = rawItems[idx];
      const assignedSource = validSourcesMap.get(item.sourceId);
      if (!assignedSource) continue;

      const mediaDomain = assignedSource.domain || (new URL(assignedSource.sourceUrl)).hostname;
      const mediaName = assignedSource.mediaName || mediaDomain;

      const analysis = analyzeNewsRelevance(assignedSource.originalHeadline, assets);
      const relatedIds = analysis.affectedAssetIds.filter(id => !tickers.length || tickers.includes(id));
      if (tickers.length && !relatedIds.some(id => tickers.includes(id))) continue;
      const proposedSummary = typeof item.summary === 'string' ? item.summary.trim() : '';
      const advice = /\b(recomiend\w*|recomendamos|conviene (comprar|vender|invertir)|deberias|tenes que (comprar|vender)|compra ahora|vende ahora|objetivo de precio|rentabilidad garantizada)\b/;
      const summary = proposedSummary && proposedSummary.length <= 1400 && !advice.test(normalizeAssetText(proposedSummary)) ? proposedSummary : assignedSource.originalHeadline;
      finalNewsItems.push({
        id: `gemini_${argDate.isoDate}_${idx}_${Date.now()}`,
        headline: assignedSource.originalHeadline,
        briefSummary: summary,
        fullSynthesis: [
          summary,
          analysis.explanation,
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
          publishedDateIso: assignedSource.publishedDateIso,
          publishedTimestamp: assignedSource.publishedTimestamp,
          domain: mediaDomain
        }],
        affectedAssetIds: relatedIds,
        impact: analysis.impact,
        relevanceType: analysis.relevanceType,
        topicCategory: analysis.topicCategory,
        audioDuration: '1:00 min',
        audioScript: `Resumen FAROS. ${assignedSource.originalHeadline}. ${analysis.explanation} Publicado en ${mediaName}.`,
        factCheck: {
          status: analysis.relevanceType === 'ruido' ? 'en_analisis' : 'confirmado',
          officialSource: mediaName,
          detail: analysis.relevanceType === 'ruido' ? `Publicación verificada en ${mediaName}; su contenido no se trata como un hecho financiero confirmado.` : `Respaldado por publicación original en ${mediaName}.`
        },
        portfolioImpactAnalysis: {
          directExplanation: analysis.explanation,
          affectedHoldings: relatedIds.map((ticker: string) => ({
            symbol: ticker,
            impactDirection: analysis.assetImpacts[ticker] || 'neutral',
            relationshipDetail: analysis.relationships[ticker]
          }))
        }
      });
    }

    return finalNewsItems.length > 0 ? enrichNewsCoverage(finalNewsItems, Array.from(validSourcesMap.values())) : null;
  } catch (error: any) {
    console.warn('[NEWS SEARCH] La búsqueda externa no estuvo disponible en su plazo.');
    if (error?.status === 429 || error?.message?.includes('RESOURCE_EXHAUSTED')) {
      rateLimitCooldownUntil = Date.now() + 60000;
    }
    return null;
  } finally {
    clearTimeout(deadline);
    controller.abort();
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
app.post('/api/news/pulse', asyncRoute(async (req, res) => {
  const pulseStartTime = Date.now();
  const requestDay = argentinaNewsDay(pulseStartTime);
  // This is a public read endpoint. Validate identity independently for personal
  // alerts/analytics; a session-store outage must not block public news. No
  // previous user identity is reused, and private routes keep their auth checks.
  const identity = getSessionUser(req).catch(error => {
    console.warn('[NEWS SESSION]', error instanceof DatabaseError ? error.code : 'LOOKUP_FAILED');
    return null;
  });
  const trackPulse = (metadata: Record<string, unknown>) => backgroundNotification(identity.then(user => {
    trackEventNonBlocking('news_pulse_query', { userId: user?.id, metadata, userAgent: req.get('user-agent') });
  }));
  const streaming = req.get('accept')?.includes('application/x-ndjson');
  const writeFrame = (body: any) => {
    if (body.type === 'progress') {
      if (requestDay !== argentinaNewsDay()) return;
      body = { ...body, news: dailyNewsItems(body.news, requestDay) };
      if (!body.news.length) return;
    }
    if (res.destroyed || res.writableEnded) return;
    if (!res.headersSent) {
      res.setHeader('Content-Type', 'application/x-ndjson; charset=utf-8');
      res.setHeader('X-Accel-Buffering', 'no');
      res.setHeader('Cache-Control', 'private, no-store, no-transform');
      res.flushHeaders();
    }
    res.write(JSON.stringify(body) + '\n');
  };
  const respondWithNews = (body: any) => {
    body = { ...body, news: requestDay === argentinaNewsDay() ? dailyNewsItems(body.news, requestDay) : [] };
    if (Array.isArray(body.news)) {
      console.info('[NEWS PULSE]', JSON.stringify({ cached: !!body.cached, news: body.news.length,
        publications: body.news.reduce((count: number, item: NewsItem) => count + item.sources.length, 0),
        multiMedia: body.news.filter((item: NewsItem) => new Set(item.sources.map(source => source.mediaName)).size > 1).length }));
      backgroundNotification(identity.then(user => user ? publishNews(user, body.news) : undefined));
    }
    const result = { checkedAt: new Date().toISOString(), ...body, newsVersion: NEWS_CACHE_VERSION };
    if (streaming) { writeFrame({ type: 'complete', ...result }); return res.end(); }
    return res.json(result);
  };

  if (!checkIpRateLimit(req.ip || 'ip', 45)) {
    return res.status(429).json({ error: 'Demasiadas solicitudes. Por favor reintentá en un momento.' });
  }

  const { portfolioId = 'default', tickers = [], profile = 'moderado', forceRefresh = false, assetPositions = {} } = req.body;
  if (typeof portfolioId !== 'string' || portfolioId.length > 200 || !Array.isArray(tickers) || tickers.length > 500 ||
      tickers.some((id: unknown) => typeof id !== 'string' || id.length > 64) ||
      !['conservador', 'moderado', 'dinamico'].includes(profile) || !assetPositions || typeof assetPositions !== 'object' ||
      Object.values(assetPositions).some(position => position !== 'long' && position !== 'short')) {
    return res.status(400).json({ error: 'La selección de activos no es válida.' });
  }
  let customAssets;
  try { customAssets = validateCustomAssets(req.body.customAssets); }
  catch { return res.status(400).json({ error: 'La identificación de los activos no es válida.' }); }
  const assets = portfolioAssets({ customAssets });
  const scope = portfolioNewsScope(tickers, profile, assetPositions, customAssets);
  const { cacheKey, dateKey, hourKey } = buildCacheKey(pulseSelectionKey(scope));

  if (lastProcessedDay && lastProcessedDay !== dateKey) {
    for (const k in newsCache) {
      if (!k.includes(dateKey)) {
        delete newsCache[k];
      }
    }
    purgeUrlVerificationCache();
  }
  lastProcessedDay = dateKey;

  // Hourly work accumulates into the current Argentina day. Old hours are
  // retained for the whole day; yesterday is never a fallback for today's feed.
  const selectionPrefix = `${NEWS_CACHE_VERSION}_${pulseSelectionKey(scope)}_${dateKey}_`;
  const memoryRows = Object.entries(newsCache).filter(([key]) => key.startsWith(selectionPrefix)).sort((a, b) => a[1].timestamp - b[1].timestamp);
  let previousNews: NewsItem[] = [];
  for (const [, value] of memoryRows) previousNews = mergeDailyNews(previousNews, value.news, dateKey);
  let cached = !forceRefresh && newsCache[cacheKey]
    ? usablePulseSnapshot({ ...newsCache[cacheKey], hourKey }) : null;
  let recent = null;
  if (!cached) {
    recent = await readPulseSnapshot(scope);
    if (recent) previousNews = mergeDailyNews(previousNews, recent.news, dateKey);
    if (!forceRefresh && recent?.hourKey === hourKey) cached = recent;
  }
  if (cached) {
    const news = mergeDailyNews(previousNews, cached.news, dateKey);
    newsCache[cacheKey] = { news, timestamp: cached.timestamp };
    trackPulse({ cached: true, tickersCount: tickers.length, newsCount: news.length });

    return respondWithNews({ news, checkedAt: new Date(cached.timestamp).toISOString(), cached: true, fallback: false, dateKey, hourKey });
  }
  if (streaming && previousNews.length) {
    const previousAt = recent?.timestamp || memoryRows.at(-1)?.[1].timestamp;
    writeFrame({ type: 'progress', news: previousNews, checkedAt: previousAt ? new Date(previousAt).toISOString() : null, cached: true, newsVersion: NEWS_CACHE_VERSION });
  }

  const job = newsJobs.getOrCreate(cacheKey, async publish => {
    const startedAt = pulseStartTime;
    let firstNews: number | null = null;
    const emit = (incoming: NewsItem[]) => {
      if (requestDay !== argentinaNewsDay()) return;
      const news = mergeDailyNews(previousNews, incoming, dateKey);
      if (news.length && firstNews === null) firstNews = Date.now() - startedAt;
      publish(news);
    };
    const diagnostics = createCollectionDiagnostics();
    const coverageDiscovery = createCoverageDiscoveryDiagnostics();
    // Retrieve shared indexes while RSS and synthesis run, not after them.
    const prefetchedSections = collectPublisherSections(COVERAGE_PUBLISHERS, coverageDiscovery.sections, AbortSignal.timeout(5000)).catch(() => {
      coverageDiscovery.sections.filter(section => section.status === 'pending').forEach(section => { section.status = 'unavailable'; });
      return [];
    });
    let modelNews: NewsItem[] = []; let rssNews: NewsItem[] = [];
    // Publish verified results as they arrive, retaining the full collection budgets.
    const [grounded, rss] = await Promise.allSettled([
      fetchGroundedNewsFromGemini(tickers, profile, assets).then(news => { modelNews = dailyNewsItems(news || [], dateKey); emit(mergeVerifiedNews(modelNews, rssNews)); return modelNews; }),
      getLiveVerifiedArgentineNews(tickers, diagnostics, assets, emit, dateKey).then(news => { rssNews = news; emit(mergeVerifiedNews(modelNews, rssNews)); return news; })
    ]);
    if (!modelNews.length && rss.status === 'rejected') throw new Error('NEWS_SOURCES_UNAVAILABLE');
    const collected = await discoverMissingCoverage(mergeVerifiedNews(modelNews, rssNews), coverageDiscovery, { prefetchedSections });
    const timestamp = Date.now();
    let news = requestDay === argentinaNewsDay(timestamp) ? mergeDailyNews(previousNews, collected, dateKey) : [];
    if (requestDay === argentinaNewsDay(timestamp)) {
      const persisted = await writePulseSnapshot(scope, { timestamp, news, hourKey });
      if (persisted) news = mergeDailyNews(news, persisted.news, dateKey);
      if (requestDay === argentinaNewsDay()) newsCache[cacheKey] = { timestamp, news };
      else news = [];
    }
    return { news, diagnostics, coverageDiscovery, fallback: grounded.status !== 'fulfilled' || !modelNews.length, timestamp, timingsMs: { firstNews, total: Date.now() - startedAt } };
  });
  const unsubscribe = streaming ? job.subscribe(progress => writeFrame({ type: 'progress', ...progress, newsVersion: NEWS_CACHE_VERSION })) : () => {};
  res.once('close', unsubscribe);
  try {
    const result = await job.promise;
    trackPulse({ cached: false, usedGemini: !result.fallback, tickersCount: tickers.length, newsCount: result.news.length });

    return respondWithNews({ ...result, cached: false, dateKey, hourKey, checkedAt: new Date(result.timestamp).toISOString() });
  } catch (failure) {
    const code = failure instanceof Error && failure.message === 'NEWS_SOURCES_UNAVAILABLE' ? 'NEWS_SOURCES_UNAVAILABLE' : 'NEWS_COLLECTION_FAILED';
    console.warn('[NEWS PULSE ERROR]', code);
    // The first read may have timed out while PostgreSQL was waking. Recover
    // today's exact selection before reporting an upstream-source failure.
    const recovered = await readPulseSnapshot(scope, true);
    if (streaming && recovered?.news.length && requestDay === argentinaNewsDay()) {
      writeFrame({ type: 'progress', news: recovered.news, checkedAt: new Date(recovered.timestamp).toISOString(), cached: true, newsVersion: NEWS_CACHE_VERSION });
    }
    const error = { code, error: 'No se pudieron consultar las fuentes. Intentá actualizar nuevamente.' };
    if (streaming && res.headersSent) { writeFrame({ type: 'error', ...error }); return res.end(); }
    return res.status(503).json(error);
  } finally { unsubscribe(); }

}));

// --- CALENDAR ENDPOINTS ---
app.post('/api/calendar/events', asyncRoute(async (req, res) => {
  const { portfolioId = 'default', tickers = [], forceRefresh = false } = req.body;
  const result = await fetchCalendarEvents(tickers, portfolioId, forceRefresh);
  return res.json(result);
}));

app.post('/api/calendar/check-reminders', (req, res) => {
  const { events = [], sentReminderIds = [] } = req.body;
  const result = checkReminders(events, sentReminderIds);
  return res.json(result);
});

app.get('/api/date/info', (req, res) => {
  const now = getNowAR();
  return res.json({
    ...now,
    simulatedOffsetDays: getSimulatedDayOffset()
  });
});

app.post('/api/date/simulate-offset', asyncRoute(async (req, res) => {
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
}));

// --- AUTHENTICATION & ACCOUNT ROUTES ---
registerNotificationRoutes(app);
registerNewsLibraryRoutes(app);

app.get('/api/auth/me', asyncRoute(handleGetMe));
app.post('/api/auth/register', asyncRoute(handleRegister));
app.post('/api/auth/login', asyncRoute(handleLogin));
app.post('/api/auth/logout', asyncRoute(handleLogout));
app.post('/api/auth/reset-password', asyncRoute(handleResetPassword));
app.put('/api/auth/recovery-key', asyncRoute(handleSetRecoveryKey));
app.put('/api/auth/user', asyncRoute(handleUpdateUser));
app.delete('/api/auth/account', asyncRoute(handleDeleteAccount));
app.post('/api/auth/draft', asyncRoute(handleSaveDraft));
app.get('/api/auth/draft', asyncRoute(handleGetDraft));

// OAuth 2.0 (Google & Microsoft) Endpoints
app.get('/api/auth/google/url', asyncRoute(handleGetGoogleAuthUrl));
app.get('/api/auth/google/callback', asyncRoute(handleGoogleCallback));
app.get('/api/auth/microsoft/url', asyncRoute(handleGetMicrosoftAuthUrl));
app.get('/api/auth/microsoft/callback', asyncRoute(handleMicrosoftCallback));

// --- PROTECTED ADMIN PANEL ENDPOINTS ---
app.get('/api/admin/check', asyncRoute(handleAdminCheck));
app.post('/api/admin/track', asyncRoute(handleClientTrackEvent));

app.use('/api/admin', asyncRoute(requireAdminMiddleware));
app.get('/api/admin/overview', asyncRoute(handleAdminOverview));
app.get('/api/admin/users', asyncRoute(handleAdminUsers));
app.put('/api/admin/users/:userId/plan', asyncRoute(handleAdminUpdateUserPlan));
app.get('/api/admin/funnel', asyncRoute(handleAdminFunnel));
app.get('/api/admin/usage', asyncRoute(handleAdminUsage));
app.get('/api/admin/pipeline-health', asyncRoute(handleAdminPipelineHealth));
app.get('/api/admin/thesis-financials', asyncRoute(handleAdminThesisFinancials));

// --- AUDIO SENSING & TTS ENDPOINTS ---
const SAFE_AUDIO_CACHE_DIR = path.join('/tmp', 'faros_audio_cache');

app.get('/api/audio/file/:filename', (req, res) => {
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

app.post('/api/audio/prefetch', asyncRoute(async (req, res) => {
  const { items = [] } = req.body;
  if (!Array.isArray(items) || items.length > 5 || items.some(item => !item || typeof item.text !== 'string' || item.text.length > 12000)) {
    return res.status(400).json({ success: false, error: 'La lista de textos de audio no es válida.' });
  }
  if (!checkIpRateLimit(`audio:${req.ip || 'ip'}`, 90)) return res.status(429).json({ success: false, error: 'Aguardá unos segundos antes de preparar otro audio.' });
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  await prefetchAudioScripts(items, controller.signal);
  if (!res.destroyed) return res.json({ success: true, count: Math.min(items.length, 2) });
}));

app.post('/api/audio/synthesize', asyncRoute(async (req, res) => {
  if (!checkIpRateLimit(`audio:${req.ip || 'ip'}`, 90)) {
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
    const { text, voice } = req.body;
    if (typeof text !== 'string' || !text.trim() || text.length > 12000 || (voice !== undefined && !['es-AR-TomasNeural', 'es-AR-ElenaNeural'].includes(voice))) {
      return res.status(400).json({ 
        success: false, 
        error: 'El texto es requerido para la síntesis de audio.' 
      });
    }

    trackEventNonBlocking('audio_synthesis', {
      metadata: { textLength: text.length }
    });

    const result = await synthesizeArgentineSpeech(text, abortController.signal, voice);
    if (!res.writableEnded && !res.destroyed) {
      res.setHeader('Cache-Control', 'private, no-store');
      return res.status(result.success ? 200 : 503).json(result);
    }
  } catch (error: any) {
    if (error?.name === 'AbortError' || error?.message === 'AbortError') {
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
}));

// Unknown API paths must never fall through to the React HTML response.
app.use('/api', (_req, res) => res.status(404).json({ code: 'API_NOT_FOUND', error: 'La ruta de API solicitada no existe.' }));

// Express 4 does not forward rejected controller promises automatically.
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  if (res.headersSent) return next(err);
  if (err instanceof RequestError) return res.status(err.status).json({ code: err.code, error: err.message });
  if (err instanceof DatabaseError) {
    const status = err.code === 'EMAIL_EXISTS' ? 409 : err.code === 'USER_NOT_FOUND' ? 401 : err.code === 'OAUTH_PROOF_INVALID' ? 401 : 503;
    return res.status(status).json({ code: err.code, error: err.message });
  }
  if (err?.type === 'entity.parse.failed') return res.status(400).json({ code: 'INVALID_JSON', error: 'El cuerpo de la solicitud no es JSON válido.' });
  console.error('[SERVER ERROR] Fallo no controlado en una solicitud.');
  res.status(500).json({ code: 'INTERNAL_ERROR', error: 'Error interno del servidor. Por favor reintentá en unos momentos.' });
});

export { app };
export default app;
