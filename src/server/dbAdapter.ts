import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { StoredUser } from './auth';
import { UserPlan, FunnelStage, UsageEvent, UsageEventType } from '../types';

import { Pool } from 'pg';

const ROOT_DIR = process.cwd();

function getWritableDataDir(): string {
  const candidates = [
    path.join('/tmp', 'faros_data'),
    path.resolve(ROOT_DIR, 'data')
  ];
  for (const dir of candidates) {
    try {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const testFile = path.join(dir, `.test_w_${Date.now()}`);
      fs.writeFileSync(testFile, '1');
      fs.unlinkSync(testFile);
      return dir;
    } catch {}
  }
  return '/tmp';
}

const DATA_DIR = getWritableDataDir();
const USERS_DB_PATH = path.resolve(DATA_DIR, 'users_db.json');
const EVENTS_DB_PATH = path.resolve(DATA_DIR, 'events_db.json');

// --- POSTGRESQL CONNECTION POOL (IF CONFIGURED) ---
const dbUrl = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.POSTGRES_PRISMA_URL;
let pgPool: Pool | null = null;
let pgInitialized = false;
let schemaInitPromise: Promise<void> | null = null;

if (dbUrl) {
  try {
    pgPool = new Pool({
      connectionString: dbUrl,
      ssl: dbUrl.includes('localhost') ? false : { rejectUnauthorized: false },
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000
    });
    pgPool.on('error', (err) => {
      console.warn('[DB ADAPTER] Unexpected error on idle PostgreSQL client:', err?.message || err);
    });
    console.log('[DB ADAPTER] PostgreSQL database pool initialized successfully.');
  } catch (err) {
    console.warn('[DB ADAPTER] Error initializing PostgreSQL pool, falling back to durable JSON store:', err);
  }
}

/**
 * Initializes PostgreSQL tables if pool is active (singleton promise)
 */
export async function initPostgresSchema(): Promise<void> {
  if (!pgPool || pgInitialized) return;
  if (schemaInitPromise) return schemaInitPromise;

  schemaInitPromise = (async () => {
    try {
      const client = await pgPool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS faros_users (
            id VARCHAR(128) PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            data JSONB NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW(),
            updated_at TIMESTAMPTZ DEFAULT NOW()
          );
          CREATE INDEX IF NOT EXISTS idx_faros_users_email ON faros_users(email);

          CREATE TABLE IF NOT EXISTS faros_sessions (
            token VARCHAR(255) PRIMARY KEY,
            user_id VARCHAR(128) NOT NULL,
            expires_at BIGINT NOT NULL,
            created_at BIGINT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_faros_sessions_user_id ON faros_sessions(user_id);

          CREATE TABLE IF NOT EXISTS faros_events (
            id VARCHAR(128) PRIMARY KEY,
            user_id VARCHAR(128),
            event_type VARCHAR(128) NOT NULL,
            metadata JSONB,
            created_at TIMESTAMPTZ DEFAULT NOW()
          );
        `);
        pgInitialized = true;
        console.log('[DB ADAPTER] PostgreSQL database tables and indices verified.');
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('[DB ADAPTER] Failed to initialize PostgreSQL tables, continuing with file store:', err);
    } finally {
      schemaInitPromise = null;
    }
  })();

  return schemaInitPromise;
}

// Auto-run schema init if pool is present
if (pgPool) {
  initPostgresSchema().catch(() => {});
}

export function isPostgresActive(): boolean {
  return Boolean(pgPool && pgInitialized);
}

/**
 * Checks if a given email is listed in ADMIN_EMAILS
 */
export function isUserAdmin(email?: string): boolean {
  if (!email) return false;
  const rawAdminEmails = process.env.ADMIN_EMAILS || 'marudeandrea@gmail.com,pachudeandrea@gmail.com';
  const allowedList = rawAdminEmails
    .split(',')
    .map(e => e.trim().toLowerCase())
    .filter(Boolean);
  return allowedList.includes(email.trim().toLowerCase());
}

/**
 * In-memory buffer of events for sub-millisecond retrieval and batch saving
 */
let inMemoryEvents: UsageEvent[] = [];
let isEventsLoaded = false;

function loadEventsFromDisk(): void {
  if (isEventsLoaded) return;
  if (fs.existsSync(EVENTS_DB_PATH)) {
    try {
      const data = fs.readFileSync(EVENTS_DB_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) {
        inMemoryEvents = parsed;
      }
    } catch (err) {
      console.warn('[DB ADAPTER] Error loading events_db.json:', err);
    }
  }
  isEventsLoaded = true;
}

function persistEventsToDisk(): void {
  try {
    // Keep last 15,000 events to prevent disk bloat
    if (inMemoryEvents.length > 15000) {
      inMemoryEvents = inMemoryEvents.slice(-15000);
    }
    fs.writeFileSync(EVENTS_DB_PATH, JSON.stringify(inMemoryEvents, null, 2), 'utf-8');
  } catch (err) {
    console.error('[DB ADAPTER] Failed to persist events to disk:', err);
  }
}

// Debounced disk save for events to avoid blocking I/O on high-frequency routes
let saveEventsTimer: NodeJS.Timeout | null = null;
function scheduleEventsPersist(): void {
  if (saveEventsTimer) return;
  saveEventsTimer = setTimeout(() => {
    saveEventsTimer = null;
    persistEventsToDisk();
  }, 2000);
}

/**
 * Completely non-blocking usage event recorder
 * NEVER throws, never halts request/response lifecycle.
 */
export function trackEventNonBlocking(
  eventType: UsageEventType | string,
  params: {
    userId?: string | null;
    metadata?: Record<string, any>;
    userAgent?: string;
  } = {}
): void {
  setImmediate(() => {
    try {
      loadEventsFromDisk();
      const event: UsageEvent = {
        id: `evt_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
        userId: params.userId || null,
        eventType,
        metadata: params.metadata || {},
        timestamp: Date.now(),
        dateIso: new Date().toISOString(),
        userAgent: params.userAgent?.slice(0, 200)
      };

      inMemoryEvents.push(event);
      scheduleEventsPersist();
    } catch (err) {
      // Intentionally silent: telemetry should never crash or impact user requests
    }
  });
}

/**
 * Read all users from PostgreSQL or disk store
 */
export async function loadAllUsersFromStorage(): Promise<StoredUser[]> {
  if (pgPool) {
    try {
      await initPostgresSchema();
      if (pgInitialized) {
        const res = await pgPool.query('SELECT data FROM faros_users ORDER BY created_at DESC');
        if (res.rows && res.rows.length > 0) {
          return res.rows.map(r => r.data as StoredUser);
        }

        // If PostgreSQL table is empty, seed from local disk users
        const diskUsers = getAllUsers();
        if (diskUsers.length > 0) {
          console.log(`[DB ADAPTER] Seeding ${diskUsers.length} initial user(s) into PostgreSQL...`);
          for (const u of diskUsers) {
            try {
              await pgPool.query(
                `INSERT INTO faros_users (id, email, data, created_at, updated_at)
                 VALUES ($1, $2, $3, NOW(), NOW())
                 ON CONFLICT (id) DO UPDATE
                 SET email = EXCLUDED.email,
                     data = EXCLUDED.data,
                     updated_at = NOW()`,
                [u.id, u.email.toLowerCase(), JSON.stringify(u)]
              );
            } catch {}
          }
          return diskUsers;
        }
      }
    } catch (err) {
      console.warn('[DB ADAPTER] PostgreSQL query notice, falling back to disk store:', err);
    }
  }

  // Fallback to disk JSON file
  if (fs.existsSync(USERS_DB_PATH)) {
    try {
      const data = fs.readFileSync(USERS_DB_PATH, 'utf-8');
      const parsed = JSON.parse(data);
      if (Array.isArray(parsed)) return parsed;
    } catch {}
  }
  return [];
}

/**
 * Persists a user to PostgreSQL and syncs to disk file
 */
export async function saveUserDb(user: StoredUser): Promise<void> {
  // 1. PostgreSQL (if available)
  if (pgPool) {
    try {
      await initPostgresSchema();
      if (pgInitialized) {
        await pgPool.query(
          `INSERT INTO faros_users (id, email, data, created_at, updated_at)
           VALUES ($1, $2, $3, NOW(), NOW())
           ON CONFLICT (id) DO UPDATE
           SET email = EXCLUDED.email,
               data = EXCLUDED.data,
               updated_at = NOW()`,
          [user.id, user.email.toLowerCase(), JSON.stringify(user)]
        );
      }
    } catch (err) {
      console.warn('[DB ADAPTER] PostgreSQL save notice, writing to disk:', err);
    }
  }

  // 2. Synchronize to disk store
  try {
    const users = getAllUsers();
    const idx = users.findIndex(u => u.id === user.id);
    if (idx >= 0) {
      users[idx] = user;
    } else {
      users.push(user);
    }
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users, null, 2), 'utf-8');
  } catch (err) {
    console.warn('[DB ADAPTER] Disk persist notice:', err);
  }
}

/**
 * Deletes a user from PostgreSQL and disk
 */
export async function deleteUserDb(userId: string): Promise<void> {
  if (pgPool) {
    try {
      await initPostgresSchema();
      if (pgInitialized) {
        await pgPool.query('DELETE FROM faros_users WHERE id = $1', [userId]);
        await pgPool.query('DELETE FROM faros_sessions WHERE user_id = $1', [userId]);
      }
    } catch (err) {
      console.warn('[DB ADAPTER] Error deleting user from PostgreSQL:', err);
    }
  }

  try {
    const users = getAllUsers().filter(u => u.id !== userId);
    fs.writeFileSync(USERS_DB_PATH, JSON.stringify(users, null, 2), 'utf-8');
  } catch {}
}

/**
 * Persists session to PostgreSQL
 */
export async function saveSessionDb(token: string, userId: string, expiresAt: number): Promise<void> {
  if (pgPool) {
    try {
      await initPostgresSchema();
      if (pgInitialized) {
        await pgPool.query(
          `INSERT INTO faros_sessions (token, user_id, expires_at, created_at)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (token) DO UPDATE
           SET expires_at = EXCLUDED.expires_at`,
          [token, userId, expiresAt, Date.now()]
        );
      }
    } catch {}
  }
}

/**
 * Deletes session from PostgreSQL
 */
export async function deleteSessionDb(token: string): Promise<void> {
  if (pgPool) {
    try {
      await initPostgresSchema();
      if (pgInitialized) {
        await pgPool.query('DELETE FROM faros_sessions WHERE token = $1', [token]);
      }
    } catch {}
  }
}

/**
 * Read all users from disk (synchronous helper)
 */
export function getAllUsers(): StoredUser[] {
  const candidatePaths = [
    USERS_DB_PATH,
    path.resolve(ROOT_DIR, 'data', 'users_db.json'),
    path.join('/tmp', 'faros_data', 'users_db.json')
  ];
  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const data = fs.readFileSync(p, 'utf-8');
        const parsed = JSON.parse(data);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      } catch {}
    }
  }
  return [];
}

/**
 * Update plan or funnel stage for an individual user
 */
export function updateUserPlanAndStage(
  userId: string,
  updates: { plan?: UserPlan; funnelStage?: FunnelStage }
): boolean {
  try {
    const users = getAllUsers();
    let found = false;
    const nextUsers = users.map(u => {
      if (u.id === userId) {
        found = true;
        return {
          ...u,
          plan: updates.plan !== undefined ? updates.plan : u.plan,
          funnelStage: updates.funnelStage !== undefined ? updates.funnelStage : u.funnelStage,
          updatedAt: new Date().toISOString()
        };
      }
      return u;
    });

    if (found) {
      fs.writeFileSync(USERS_DB_PATH, JSON.stringify(nextUsers, null, 2), 'utf-8');
      trackEventNonBlocking('admin_plan_updated', {
        userId,
        metadata: { updates }
      });
      return true;
    }
  } catch (err) {
    console.error('[DB ADAPTER] Error updating user plan:', err);
  }
  return false;
}

/**
 * Get all usage events (filtered by days if needed)
 */
export function getUsageEvents(sinceTimestamp?: number): UsageEvent[] {
  loadEventsFromDisk();
  if (!sinceTimestamp) return inMemoryEvents;
  return inMemoryEvents.filter(e => e.timestamp >= sinceTimestamp);
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
