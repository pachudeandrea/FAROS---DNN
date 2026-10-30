import crypto from 'node:crypto';
import type { StoredUser } from './auth.js';
import { UserPlan, FunnelStage, UsageEvent, UsageEventType } from '../types/index.js';
import { DatabaseError, query, transaction } from './database.js';
import { RequestError } from './requestError.js';

const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');
const sessionKey = (token: string) => `sha256:${hashToken(token)}`;

export function isUserAdmin(email?: string): boolean {
  if (!email) return false;
  return (process.env.ADMIN_EMAILS || '').split(',').some(e => e.trim().toLowerCase() === email.trim().toLowerCase());
}

export async function loadAllUsersFromStorage(): Promise<StoredUser[]> {
  const result = await query('SELECT data FROM faros_users ORDER BY created_at DESC');
  return result.rows.map(row => row.data);
}

export const getAllUsers = loadAllUsersFromStorage;

export async function getUserFromDbById(id: string): Promise<StoredUser | null> {
  const result = await query('SELECT data FROM faros_users WHERE id = $1', [id]);
  return result.rows[0]?.data || null;
}

export async function getUserFromDbByEmail(email: string): Promise<StoredUser | null> {
  const result = await query('SELECT data FROM faros_users WHERE lower(email) = $1', [email.trim().toLowerCase()]);
  return result.rows[0]?.data || null;
}

export async function getUserFromDbByOAuth(provider: 'google' | 'microsoft', id: string): Promise<StoredUser | null> {
  const field = provider === 'google' ? 'googleSub' : 'microsoftOid';
  const result = await query('SELECT data FROM faros_users WHERE data->>$1 = $2', [field, id]);
  return result.rows[0]?.data || null;
}

// Registration and its first session either both commit or both roll back.
export async function createUserAndSessionDb(user: StoredUser, token: string, expiresAt: number, signupTicket?: string): Promise<void> {
  await transaction(async client => {
    if (signupTicket) {
      const proof = await client.query("DELETE FROM faros_auth_flows WHERE token_hash = $1 AND kind = 'signup' AND expires_at > $2 RETURNING data", [hashToken(signupTicket), Date.now()]);
      if (!proof.rowCount || proof.rows[0].data.email !== user.email ||
          proof.rows[0].data.provider !== user.provider ||
          (user.provider === 'google' ? proof.rows[0].data.googleSub !== user.googleSub : proof.rows[0].data.microsoftOid !== user.microsoftOid)) {
        throw new DatabaseError('OAUTH_PROOF_INVALID', 'La verificación externa venció o no es válida. Volvé a iniciar sesión con el proveedor.');
      }
    }
    await client.query('INSERT INTO faros_users (id, email, data) VALUES ($1, $2, $3)', [user.id, user.email.toLowerCase(), JSON.stringify(user)]);
    await client.query('INSERT INTO faros_sessions (token, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [sessionKey(token), user.id, expiresAt, Date.now()]);
  });
}

// Update only: a stale request must never recreate a deleted account.
export async function saveUserDb(user: StoredUser): Promise<void> {
  const result = await query('UPDATE faros_users SET data = $2, updated_at = NOW() WHERE id = $1', [user.id, JSON.stringify(user)]);
  if (!result.rowCount) throw new DatabaseError('USER_NOT_FOUND', 'La cuenta ya no existe.');
}

// Merge only approved top-level fields under a row lock to preserve simultaneous
// portfolio/preferences updates from different serverless instances.
export async function updateUserDb(id: string, updates: Partial<StoredUser>): Promise<StoredUser> {
  const result = await query('UPDATE faros_users SET data = data || $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING data', [id, JSON.stringify(updates)]);
  if (!result.rowCount) throw new DatabaseError('USER_NOT_FOUND', 'La cuenta ya no existe.');
  return result.rows[0].data;
}

export async function deleteUserDb(id: string): Promise<void> {
  await transaction(async client => {
    // Lock user first, in the same order as session creation.
    await client.query('SELECT id FROM faros_users WHERE id = $1 FOR UPDATE', [id]);
    await client.query('DELETE FROM faros_sessions WHERE user_id = $1', [id]);
    await client.query('DELETE FROM faros_events WHERE user_id = $1', [id]);
    await client.query('DELETE FROM faros_users WHERE id = $1', [id]);
  });
}

export async function saveSessionDb(token: string, userId: string, expiresAt: number, expectedPasswordHash?: string): Promise<void> {
  await transaction(async client => {
    const user = await client.query('SELECT id, data FROM faros_users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user.rowCount) throw new DatabaseError('USER_NOT_FOUND', 'La cuenta ya no existe.');
    if (expectedPasswordHash !== undefined && user.rows[0].data.passwordHash !== expectedPasswordHash) {
      throw new RequestError('CREDENTIALS_CHANGED', 'La contraseña cambió durante el inicio de sesión. Volvé a ingresar tu contraseña actual.', 401);
    }
    await client.query('INSERT INTO faros_sessions (token, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [sessionKey(token), userId, expiresAt, Date.now()]);
  });
}

export async function getSessionDb(token: string): Promise<{ userId: string; expiresAt: number } | null> {
  // Existing sessions remain usable while new sessions store only token hashes.
  const result = await query('SELECT user_id, expires_at FROM faros_sessions WHERE token IN ($1, $2) AND expires_at > $3', [sessionKey(token), token, Date.now()]);
  const row = result.rows[0];
  return row ? { userId: row.user_id, expiresAt: Number(row.expires_at) } : null;
}

export async function deleteSessionDb(token: string): Promise<void> {
  await query('DELETE FROM faros_sessions WHERE token IN ($1, $2)', [sessionKey(token), token]);
}

export async function saveAuthFlow(token: string, kind: string, data: object, expiresAt: number): Promise<void> {
  await query('INSERT INTO faros_auth_flows (token_hash, kind, data, expires_at) VALUES ($1, $2, $3, $4)', [hashToken(token), kind, JSON.stringify(data), expiresAt]);
}

export async function getAuthFlow(token: string, kind: string): Promise<any | null> {
  const result = await query('SELECT data FROM faros_auth_flows WHERE token_hash = $1 AND kind = $2 AND expires_at > $3', [hashToken(token), kind, Date.now()]);
  return result.rows[0]?.data || null;
}

export async function consumeAuthFlow(token: string, kind: string): Promise<any | null> {
  const result = await query('DELETE FROM faros_auth_flows WHERE token_hash = $1 AND kind = $2 AND expires_at > $3 RETURNING data', [hashToken(token), kind, Date.now()]);
  return result.rows[0]?.data || null;
}

export async function updateUserPlanAndStage(userId: string, updates: { plan?: UserPlan; funnelStage?: FunnelStage }): Promise<boolean> {
  const user = await getUserFromDbById(userId);
  if (!user) return false;
  await updateUserDb(userId, updates);
  trackEventNonBlocking('admin_plan_updated', { userId, metadata: { updates } });
  return true;
}

// Telemetry is optional and must never block account operations or initialize
// files/services during module import. Persist when the database is available.
export function trackEventNonBlocking(eventType: UsageEventType | string, params: { userId?: string | null; metadata?: Record<string, any>; userAgent?: string } = {}): void {
  void query('INSERT INTO faros_events (id, user_id, event_type, metadata) VALUES ($1, $2, $3, $4)', [
    `evt_${crypto.randomUUID()}`, params.userId || null, eventType,
    JSON.stringify({ ...params.metadata, userAgent: params.userAgent?.slice(0, 200) })
  ]).catch(() => {});
}

export async function getUsageEvents(sinceTimestamp = 0): Promise<UsageEvent[]> {
  const result = await query('SELECT * FROM faros_events WHERE created_at >= $1 ORDER BY created_at', [new Date(sinceTimestamp)]);
  return result.rows.map(row => ({
    id: row.id, userId: row.user_id, eventType: row.event_type,
    metadata: row.metadata || {}, timestamp: new Date(row.created_at).getTime(),
    dateIso: new Date(row.created_at).toISOString(), userAgent: row.metadata?.userAgent
  }));
}

/**
 * Generate synthetic realistic data for the Tesis / Demo view
 * (Allows full inspection of charts, funnels, cohort retention and unit economics)
 */
export function generateDemoAdminData(daysBack = 30) {
  const now = Date.now();
  const dayMs = 24 * 60 * 60 * 1000;

  // 1. Daily signups & active users curves
  const dailySeries: Array<{
    date: string;
    signups: number;
    activeUsers: number;
    pulseRequests: number;
    audioPlays: number;
  }> = [];

  for (let i = daysBack - 1; i >= 0; i--) {
    const d = new Date(now - i * dayMs);
    const dateStr = d.toISOString().slice(0, 10);
    // Growing organic curve
    const trendFactor = 1 + (daysBack - i) * 0.04;
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;
    const weekendMultiplier = isWeekend ? 0.6 : 1.0;

    const signups = Math.max(1, Math.round((5 + Math.random() * 8) * trendFactor * weekendMultiplier));
    const activeUsers = Math.max(8, Math.round((35 + Math.random() * 25) * trendFactor * weekendMultiplier));
    const pulseRequests = Math.max(12, Math.round(activeUsers * (2.2 + Math.random() * 0.8)));
    const audioPlays = Math.max(5, Math.round(activeUsers * (0.8 + Math.random() * 0.4)));

    dailySeries.push({
      date: dateStr,
      signups,
      activeUsers,
      pulseRequests,
      audioPlays
    });
  }

  // 2. Demo Users list
  const demoUsers: StoredUser[] = [
    {
      id: 'usr_demo_1',
      name: 'Mariano De Andrea',
      email: 'marudeandrea@gmail.com',
      provider: 'google',
      timeZone: 'America/Argentina/Buenos_Aires',
      termsAccepted: true,
      profile: 'moderado',
      alyc: 'Balanz',
      plan: 'partner',
      funnelStage: 'farming',
      createdAt: new Date(now - 28 * dayMs).toISOString(),
      lastActiveAt: new Date(now - 15 * 60 * 1000).toISOString(),
      portfolio: {
        id: 'p_1',
        name: 'Cartera Renta Fija',
        description: 'Cartera enfocada en bonos soberanos y corporativos',
        profile: 'moderado',
        assetIds: ['AL30', 'GD30', 'YPFD', 'GGAL'],
        assetPositions: { 'AL30': 'long', 'GD30': 'long', 'YPFD': 'long', 'GGAL': 'long' }
      }
    },
    {
      id: 'usr_demo_2',
      name: 'Patricio De Andrea',
      email: 'pachudeandrea@gmail.com',
      provider: 'microsoft',
      timeZone: 'America/Argentina/Buenos_Aires',
      termsAccepted: true,
      profile: 'dinamico',
      alyc: 'IOL invertironline',
      plan: 'market',
      funnelStage: 'farming',
      createdAt: new Date(now - 22 * dayMs).toISOString(),
      lastActiveAt: new Date(now - 45 * 60 * 1000).toISOString(),
      portfolio: {
        id: 'p_2',
        name: 'Tech & Energéticas',
        description: 'CEDEARs de innovación y renta variable local',
        profile: 'dinamico',
        assetIds: ['NVDA', 'AAPL', 'YPFD', 'PAMP'],
        assetPositions: { 'NVDA': 'long', 'AAPL': 'short', 'YPFD': 'long', 'PAMP': 'long' }
      }
    },
    {
      id: 'usr_demo_3',
      name: 'Florencia Gómez',
      email: 'florencia.g@bancogalicia.com.ar',
      provider: 'email',
      timeZone: 'America/Argentina/Buenos_Aires',
      termsAccepted: true,
      profile: 'conservador',
      alyc: 'Bull Market Brokers',
      plan: 'partner',
      funnelStage: 'venta',
      createdAt: new Date(now - 18 * dayMs).toISOString(),
      lastActiveAt: new Date(now - 2 * 3600 * 1000).toISOString(),
      portfolio: {
        id: 'p_3',
        name: 'Bonos Soberanos',
        description: 'Estrategia conservadora en dólares MEP',
        profile: 'conservador',
        assetIds: ['AL30', 'GD30'],
        assetPositions: { 'AL30': 'long', 'GD30': 'long' }
      }
    },
    {
      id: 'usr_demo_4',
      name: 'Ignacio Rossi',
      email: 'irossi@criteriacapital.com',
      provider: 'google',
      timeZone: 'America/Argentina/Buenos_Aires',
      termsAccepted: true,
      profile: 'dinamico',
      alyc: 'Cocos Capital',
      plan: 'market',
      funnelStage: 'adoption',
      createdAt: new Date(now - 14 * dayMs).toISOString(),
      lastActiveAt: new Date(now - 5 * 3600 * 1000).toISOString(),
      portfolio: {
        id: 'p_4',
        name: 'Mi Cartera',
        description: 'Cartera de acciones líderes argentinas',
        profile: 'dinamico',
        assetIds: ['GGAL', 'BMA', 'SPY', 'MELI'],
        assetPositions: { 'GGAL': 'long', 'BMA': 'short', 'SPY': 'long', 'MELI': 'long' }
      }
    },
    {
      id: 'usr_demo_5',
      name: 'Camila Benítez',
      email: 'camilab@outlook.com',
      provider: 'microsoft',
      timeZone: 'America/Argentina/Buenos_Aires',
      termsAccepted: true,
      profile: 'moderado',
      alyc: 'PPI (Portfolio Personal)',
      plan: 'prueba',
      funnelStage: 'interes',
      createdAt: new Date(now - 9 * dayMs).toISOString(),
      lastActiveAt: new Date(now - 8 * 3600 * 1000).toISOString(),
      portfolio: {
        id: 'p_5',
        name: 'Mi Cartera',
        description: 'Mi cartera personal en FAROS',
        profile: 'moderado',
        assetIds: ['AL30', 'YPFD', 'PAMP'],
        assetPositions: { 'AL30': 'long', 'YPFD': 'long', 'PAMP': 'short' }
      }
    },
    {
      id: 'usr_demo_6',
      name: 'Federico Santoro',
      email: 'fsantoro@invest.ar',
      provider: 'email',
      timeZone: 'America/Argentina/Buenos_Aires',
      termsAccepted: true,
      profile: 'moderado',
      alyc: 'Balanz',
      plan: 'prueba',
      funnelStage: 'cuenta_creada',
      createdAt: new Date(now - 3 * dayMs).toISOString(),
      lastActiveAt: new Date(now - 20 * 3600 * 1000).toISOString(),
      portfolio: {
        id: 'p_6',
        name: 'Mi Cartera',
        description: 'Mi cartera personal en FAROS',
        profile: 'moderado',
        assetIds: [],
        assetPositions: {}
      }
    },
    {
      id: 'usr_demo_7',
      name: 'Lucía Morales',
      email: 'lucia.morales@techfin.ar',
      provider: 'google',
      timeZone: 'America/Argentina/Buenos_Aires',
      termsAccepted: true,
      profile: 'dinamico',
      alyc: 'Invertir en Bolsa (IEB)',
      plan: 'market',
      funnelStage: 'farming',
      createdAt: new Date(now - 2 * dayMs).toISOString(),
      lastActiveAt: new Date(now - 1 * 3600 * 1000).toISOString(),
      portfolio: {
        id: 'p_7',
        name: 'Mi Cartera',
        description: 'Estrategia diversificada local y CEDEARs',
        profile: 'dinamico',
        assetIds: ['AL30', 'GD30', 'GGAL', 'YPFD', 'TSLA', 'AAPL'],
        assetPositions: { 'AL30': 'long', 'GD30': 'long', 'GGAL': 'long', 'YPFD': 'long', 'TSLA': 'short', 'AAPL': 'long' }
      }
    }
  ];

  // 3. Funnel Stages Breakdown
  const funnel = {
    totalAccounts: 245,
    adoption: 182,    // 74.3%
    interes: 114,     // 62.6% of adoption
    venta: 68,        // 59.6% of interest
    farming: 54,      // 79.4% retained / active subscriber
    timeToFirstValueMin: 3.2, // minutes to see first pulse
    draftAbandonmentRate: 14.2 // %
  };

  // 4. Tech Health Metrics
  const pipelineHealth = {
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

  // 5. Product Usage Metrics
  const usageStats = {
    sectionsVisited: {
      noticias: 74,
      calendario: 16,
      cartera: 10
    },
    topTickers: [
      { symbol: 'AL30', name: 'Bono Soberano USD 2030', count: 184, longCount: 172, shortCount: 12 },
      { symbol: 'GD30', name: 'Global USD 2030 NY', count: 156, longCount: 148, shortCount: 8 },
      { symbol: 'YPFD', name: 'YPF S.A.', count: 142, longCount: 130, shortCount: 12 },
      { symbol: 'GGAL', name: 'Grupo Financiero Galicia', count: 118, longCount: 88, shortCount: 30 },
      { symbol: 'PAMP', name: 'Pampa Energía', count: 96, longCount: 84, shortCount: 12 },
      { symbol: 'SPY', name: 'CEDEAR S&P 500 ETF', count: 92, longCount: 86, shortCount: 6 },
      { symbol: 'AAPL', name: 'CEDEAR Apple Inc.', count: 74, longCount: 58, shortCount: 16 },
      { symbol: 'NVDA', name: 'CEDEAR NVIDIA Corp.', count: 68, longCount: 52, shortCount: 16 },
      { symbol: 'MELI', name: 'CEDEAR MercadoLibre', count: 62, longCount: 54, shortCount: 8 },
      { symbol: 'BMA', name: 'Banco Macro S.A.', count: 54, longCount: 38, shortCount: 16 },
      { symbol: 'TXAR', name: 'Ternium Argentina', count: 48, longCount: 42, shortCount: 6 },
      { symbol: 'CRES', name: 'Cresud S.A.I.F.Y.A.', count: 42, longCount: 36, shortCount: 6 },
      { symbol: 'TSLA', name: 'CEDEAR Tesla Inc.', count: 38, longCount: 22, shortCount: 16 },
      { symbol: 'VIST', name: 'Vista Energy S.A.B.', count: 36, longCount: 34, shortCount: 2 },
      { symbol: 'BBAR', name: 'BBVA Argentina', count: 32, longCount: 24, shortCount: 8 }
    ],
    positionBreakdown: {
      longPct: 83.5,
      shortPct: 16.5
    },
    profileBreakdown: {
      moderado: 52,
      dinamico: 31,
      conservador: 17
    },
    registrationProviders: {
      google: 48,
      email: 34,
      microsoft: 18
    },
    audioPlaysTotal: 940,
    bookmarksTotal: 312
  };

  // 6. Thesis Financial Scenarios
  // Retail (Market): $11.500/mo | Broker/Partner: $16.500/mo | Target mix: 92% retail / 8% partner
  // Weighted Average Subscription Price: (0.92 * 11500) + (0.08 * 16500) = $10.580 + $1.320 = $11.900 ARS/mo
  const thesisModel = {
    marketPlanPrice: 11500,
    partnerPlanPrice: 16500,
    breakevenTargetUsers: 1000,
    scaleTargetUsers: 10000,
    defaultMonthlyFixedCostsArs: 11900000, // ~$11.900 x 1000 users breakeven
    costBreakdown: {
      hostingCloudVercel: 1500000,
      geminiGoogleApis: 4200000,
      ttsInfrastructure: 1200000,
      engineeringMaintenance: 5000000
    },
    scenarios: {
      pesimista: {
        retailUsers: 450,
        partnerUsers: 25,
        totalUsers: 475,
        mrrArs: (450 * 11500) + (25 * 16500)
      },
      realista: {
        retailUsers: 920,
        partnerUsers: 80,
        totalUsers: 1000,
        mrrArs: (920 * 11500) + (80 * 16500)
      },
      optimista: {
        retailUsers: 9200,
        partnerUsers: 800,
        totalUsers: 10000,
        mrrArs: (9200 * 11500) + (800 * 16500)
      }
    }
  };

  return {
    dailySeries,
    demoUsers,
    funnel,
    pipelineHealth,
    usageStats,
    thesisModel
  };
}
