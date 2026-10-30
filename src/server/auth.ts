import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { UserAccount, RiskProfile, Portfolio, OnboardingDraft, UserPreferences } from '../types';
import { DEFAULT_PREFERENCES } from '../data/mockData';
import { 
  trackEventNonBlocking, 
  isUserAdmin, 
  saveUserDb, 
  deleteUserDb, 
  loadAllUsersFromStorage, 
  saveSessionDb, 
  deleteSessionDb 
} from './dbAdapter';

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
const DB_PATH = path.resolve(DATA_DIR, 'users_db.json');

// User and session types
export interface StoredUser extends UserAccount {
  passwordHash?: string;
  googleSub?: string;
  microsoftOid?: string;
  updatedAt?: string;
}

interface Session {
  userId: string;
  createdAt: number;
  expiresAt: number;
}

interface FailedAttempt {
  count: number;
  lockedUntil: number;
}

interface OAuthStateRecord {
  provider: 'google' | 'microsoft';
  codeVerifier: string;
  redirectUri: string;
  createdAt: number;
  expiresAt: number;
}

// In-memory runtime caches & state tracking
const usersById = new Map<string, StoredUser>();
const usersByEmail = new Map<string, StoredUser>();
const usersByGoogleSub = new Map<string, StoredUser>();
const usersByMicrosoftOid = new Map<string, StoredUser>();

const sessions = new Map<string, Session>();
const failedLoginAttempts = new Map<string, FailedAttempt>();
const passwordResetTokens = new Map<string, { email: string; expiresAt: number }>();
const userDrafts = new Map<string, OnboardingDraft>();
const oauthStates = new Map<string, OAuthStateRecord>();

/**
 * Saves current in-memory database to persistent storage (PostgreSQL + JSON fallback)
 */
export function persistDatabase(targetUser?: StoredUser): void {
  // If targetUser is given, persist specifically to PostgreSQL/storage
  if (targetUser) {
    saveUserDb(targetUser).catch(err => {
      console.warn('[AUTH DB] Error syncing user to persistent storage:', err);
    });
  }

  try {
    const userList = Array.from(usersById.values());
    fs.writeFileSync(DB_PATH, JSON.stringify(userList, null, 2), 'utf-8');
  } catch (err) {
    try {
      const fallbackDir = path.join('/tmp', 'faros_data');
      if (!fs.existsSync(fallbackDir)) fs.mkdirSync(fallbackDir, { recursive: true });
      fs.writeFileSync(path.join(fallbackDir, 'users_db.json'), JSON.stringify(Array.from(usersById.values()), null, 2), 'utf-8');
    } catch {}
  }
}

/**
 * Loads database from persistent storage (PostgreSQL first, then candidate disk paths)
 */
export async function loadDatabase(): Promise<void> {
  usersById.clear();
  usersByEmail.clear();
  usersByGoogleSub.clear();
  usersByMicrosoftOid.clear();

  try {
    const persistentList = await loadAllUsersFromStorage();
    if (Array.isArray(persistentList) && persistentList.length > 0) {
      for (const u of persistentList) {
        indexUser(u);
      }
      console.log(`[AUTH DB] Loaded ${persistentList.length} user(s) from primary database storage.`);
      return;
    }
  } catch (err) {
    console.warn('[AUTH DB] Primary storage load warning:', err);
  }

  const candidatePaths = [
    DB_PATH,
    path.resolve(ROOT_DIR, 'data', 'users_db.json'),
    path.join('/tmp', 'faros_data', 'users_db.json')
  ];

  for (const p of candidatePaths) {
    if (fs.existsSync(p)) {
      try {
        const content = fs.readFileSync(p, 'utf-8');
        const list: StoredUser[] = JSON.parse(content);
        if (Array.isArray(list) && list.length > 0) {
          for (const u of list) {
            indexUser(u);
          }
          console.log(`[AUTH DB] Loaded ${list.length} user(s) from ${p}.`);
          return;
        }
      } catch (err) {
        console.warn(`[AUTH DB] Error loading ${p}:`, err);
      }
    }
  }

  // Initial seed accounts for testing real multi-user isolation
  seedInitialTestAccounts();
}

/**
 * Indexes a user across all identity maps
 */
function indexUser(user: StoredUser): void {
  usersById.set(user.id, user);
  if (user.email) {
    usersByEmail.set(user.email.toLowerCase(), user);
  }
  if (user.googleSub) {
    usersByGoogleSub.set(user.googleSub, user);
  }
  if (user.microsoftOid) {
    usersByMicrosoftOid.set(user.microsoftOid, user);
  }
}

/**
 * Seeds distinct test accounts for testing multi-user isolation
 */
function seedInitialTestAccounts(): void {
  const hash = bcrypt.hashSync('Inversor2026!', 10);

  const initialUsers: StoredUser[] = [
    {
      id: 'usr_mariano_demo',
      name: 'Mariano De Andrea',
      email: 'marudeandrea@gmail.com',
      passwordHash: hash,
      provider: 'email',
      timeZone: 'America/Argentina/Buenos_Aires',
      termsAccepted: true,
      profile: 'moderado',
      alyc: 'Balanz',
      portfolio: {
        id: 'port_mariano_1',
        name: 'Cartera Renta Fija Soberana',
        description: 'Títulos de deuda soberana y corporativa argentina en dólares.',
        profile: 'moderado',
        assetIds: ['AL30', 'GD30', 'YPFD', 'GGAL'],
        assetPositions: { 'AL30': 'long', 'GD30': 'long', 'YPFD': 'long', 'GGAL': 'long' }
      },
      createdAt: '2026-10-01T10:00:00.000Z'
    }
  ];

  for (const u of initialUsers) {
    indexUser(u);
  }
  persistDatabase();
}

// Load database on boot
loadDatabase();

/**
 * Helper to determine the canonical public App URL
 * Strict priority: APP_URL env var > request host
 */
export function getAppUrl(req: Request): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL.replace(/\/$/, '');
  }
  const host = req.get('host') || 'localhost:3000';
  const protocol = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' ? 'https' : 'http';
  return `${protocol}://${host}`;
}

/**
 * Helper to sanitize UserAccount (strips password hash before sending to client)
 */
function sanitizeUser(user: StoredUser): UserAccount {
  const { passwordHash, ...safeUser } = user;
  safeUser.isAdmin = isUserAdmin(user.email);
  return safeUser;
}

/**
 * Extracts session user from cookie or Authorization header
 */
export function getSessionUser(req: Request): UserAccount | null {
  const token = req.cookies?.faros_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;

  const session = sessions.get(token);
  if (!session) return null;

  if (Date.now() > session.expiresAt) {
    sessions.delete(token);
    return null;
  }

  const user = usersById.get(session.userId);
  if (!user) return null;

  return sanitizeUser(user);
}

/**
 * Creates new session token
 */
export function createSession(userId: string, rememberMe = true): string {
  const token = crypto.randomBytes(32).toString('hex');
  const duration = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  const expiresAt = Date.now() + duration;
  sessions.set(token, {
    userId,
    createdAt: Date.now(),
    expiresAt
  });
  saveSessionDb(token, userId, expiresAt).catch(() => {});
  return token;
}

/**
 * Sets session cookie with cross-origin iframe security flags and Safari iOS compatibility
 */
export function setSessionCookie(res: Response, token: string, rememberMe = true) {
  const maxAge = rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
  res.cookie('faros_session', token, {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/',
    maxAge
  });
}

// --- PKCE HELPERS (RFC 7636) ---

function generateCodeVerifier(): string {
  return crypto.randomBytes(48).toString('base64url');
}

function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

// --- CONTROLLERS ---

/**
 * GET /api/auth/me
 */
export function handleGetMe(req: Request, res: Response) {
  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ authenticated: false, message: 'No hay sesión activa.' });
  }
  return res.json({ authenticated: true, user });
}

/**
 * POST /api/auth/register
 */
export async function handleRegister(req: Request, res: Response) {
  const {
    name,
    email,
    password,
    birthDate,
    country = 'Argentina',
    city = 'Buenos Aires',
    phone = '',
    timeZone = 'America/Argentina/Buenos_Aires',
    termsAccepted,
    notificationsOptIn = false,
    profile = 'moderado',
    alyc = '',
    portfolioName = 'Mi Cartera',
    currency = 'USD',
    assets = [],
    provider = 'email',
    googleSub,
    microsoftOid,
    picture
  } = req.body;

  // Validation
  if (!name || !email || !termsAccepted) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para el registro.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return res.status(400).json({ error: 'El formato del correo electrónico no es válido.' });
  }

  // Check existing user by email, googleSub or microsoftOid
  let existingUser = usersByEmail.get(normalizedEmail);
  if (!existingUser && googleSub) {
    existingUser = usersByGoogleSub.get(googleSub);
  }
  if (!existingUser && microsoftOid) {
    existingUser = usersByMicrosoftOid.get(microsoftOid);
  }

  if (existingUser) {
    // If standard email registration and user already exists, reject with 409 Conflict
    if (provider === 'email' || !provider) {
      return res.status(409).json({
        success: false,
        error: 'Este correo electrónico ya se encuentra registrado en FAROS. Por favor iniciá sesión con tu contraseña.'
      });
    }

    // If OAuth, link provider IDs if not linked yet
    if (googleSub && !existingUser.googleSub) existingUser.googleSub = googleSub;
    if (microsoftOid && !existingUser.microsoftOid) existingUser.microsoftOid = microsoftOid;
    if (picture && !existingUser.picture) existingUser.picture = picture;
    existingUser.updatedAt = new Date().toISOString();
    indexUser(existingUser);
    persistDatabase(existingUser);

    const sessionToken = createSession(existingUser.id, true);
    setSessionCookie(res, sessionToken, true);

    return res.status(200).json({
      success: true,
      user: sanitizeUser(existingUser),
      token: sessionToken,
      message: 'Cuenta existente vinculada con éxito.'
    });
  }

  // Age validation
  if (birthDate) {
    const birth = new Date(birthDate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age--;
    }
    if (isNaN(age) || age < 18) {
      return res.status(400).json({ error: 'Debés ser mayor de 18 años para operar en FAROS.' });
    }
  }

  // Password validation if email provider
  let passwordHash: string | undefined = undefined;
  if (provider === 'email' || password) {
    if (password && String(password).length < 8) {
      return res.status(400).json({ error: 'La contraseña debe contener al menos 8 caracteres.' });
    }
    if (password) {
      passwordHash = await bcrypt.hash(password, 10);
    }
  }

  // Build isolated Portfolio from provided assets (allow 0 assets)
  const assetIds: string[] = [];
  const assetPositions: Record<string, 'long' | 'short'> = {};

  if (Array.isArray(assets) && assets.length > 0) {
    for (const a of assets) {
      const sym = (a.symbol || '').toUpperCase().trim();
      if (sym && !assetIds.includes(sym)) {
        assetIds.push(sym);
        assetPositions[sym] = a.position === 'short' ? 'short' : 'long';
      }
    }
  }

  const newUserId = `usr_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
  const portfolioId = `port_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;

  const initialPortfolio: Portfolio = {
    id: portfolioId,
    name: (portfolioName && portfolioName.trim()) ? portfolioName.trim() : 'Mi Cartera',
    description: assetIds.length > 0
      ? `Cartera (${profile === 'dinamico' ? 'Dinámica' : profile === 'conservador' ? 'Conservadora' : 'Moderada'}) con ${assetIds.length} activos monitoreados.`
      : 'Mi espacio personal de inversión en FAROS.',
    profile: profile as RiskProfile,
    assetIds,
    assetPositions
  };

  const newUser: StoredUser = {
    id: newUserId,
    name: name.trim(),
    email: normalizedEmail,
    passwordHash,
    provider: provider as 'email' | 'google' | 'microsoft',
    googleSub: googleSub || undefined,
    microsoftOid: microsoftOid || undefined,
    picture: picture || undefined,
    birthDate,
    country,
    city,
    phone,
    timeZone: timeZone || 'America/Argentina/Buenos_Aires',
    termsAccepted: Boolean(termsAccepted),
    notificationsOptIn: Boolean(notificationsOptIn),
    profile: profile as RiskProfile,
    alyc,
    portfolio: initialPortfolio,
    preferences: {
      ...DEFAULT_PREFERENCES,
      investorProfile: profile as RiskProfile
    },
    plan: 'prueba',
    funnelStage: 'cuenta_creada',
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  indexUser(newUser);
  persistDatabase(newUser);

  // Non-blocking telemetry event
  trackEventNonBlocking('signup', {
    userId: newUserId,
    metadata: {
      provider,
      profile,
      hasAssets: assetIds.length > 0,
      alyc: alyc || undefined
    },
    userAgent: req.get('user-agent')
  });

  // Clear any draft
  userDrafts.delete(normalizedEmail);

  // Create session
  const sessionToken = createSession(newUserId, true);
  setSessionCookie(res, sessionToken, true);

  return res.status(201).json({
    success: true,
    user: sanitizeUser(newUser),
    token: sessionToken,
    message: 'Cuenta creada con éxito.'
  });
}

/**
 * POST /api/auth/login
 */
export async function handleLogin(req: Request, res: Response) {
  const { email, password, rememberMe = true } = req.body;
  const ip = req.ip || 'unknown';
  const normalizedEmail = String(email || '').trim().toLowerCase();

  // Rate Limiting: Lockout check
  const attemptKey = `${ip}_${normalizedEmail}`;
  const existingAttempt = failedLoginAttempts.get(attemptKey);
  if (existingAttempt && existingAttempt.lockedUntil > Date.now()) {
    const minutesLeft = Math.ceil((existingAttempt.lockedUntil - Date.now()) / (60 * 1000));
    return res.status(429).json({
      error: `Demasiados intentos fallidos. Tu cuenta está bloqueada temporalmente. Intentá nuevamente en ${minutesLeft} minuto(s).`
    });
  }

  if (!normalizedEmail || !password) {
    return res.status(400).json({ error: 'Ingresá tu correo electrónico y contraseña.' });
  }

  const user = usersByEmail.get(normalizedEmail);
  if (!user || !user.passwordHash) {
    const count = (existingAttempt?.count || 0) + 1;
    const lockedUntil = count >= 5 ? Date.now() + 5 * 60 * 1000 : 0;
    failedLoginAttempts.set(attemptKey, { count, lockedUntil });
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) {
    const count = (existingAttempt?.count || 0) + 1;
    const lockedUntil = count >= 5 ? Date.now() + 5 * 60 * 1000 : 0;
    failedLoginAttempts.set(attemptKey, { count, lockedUntil });
    return res.status(401).json({ error: 'Email o contraseña incorrectos.' });
  }

  failedLoginAttempts.delete(attemptKey);

  user.lastActiveAt = new Date().toISOString();
  persistDatabase();

  trackEventNonBlocking('login', {
    userId: user.id,
    metadata: {
      provider: user.provider || 'email'
    },
    userAgent: req.get('user-agent')
  });

  const sessionToken = createSession(user.id, rememberMe);
  setSessionCookie(res, sessionToken, rememberMe);

  return res.json({
    success: true,
    user: sanitizeUser(user),
    token: sessionToken,
    message: 'Inicio de sesión exitoso.'
  });
}

/**
 * POST /api/auth/logout
 */
export function handleLogout(req: Request, res: Response) {
  const token = req.cookies?.faros_session || req.headers.authorization?.replace(/^Bearer\s+/i, '');
  if (token) {
    sessions.delete(token);
    deleteSessionDb(token).catch(() => {});
  }
  res.clearCookie('faros_session', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/'
  });
  return res.json({ success: true, message: 'Sesión cerrada correctamente.' });
}

/**
 * POST /api/auth/forgot-password
 */
export function handleForgotPassword(req: Request, res: Response) {
  const { email } = req.body;
  const normalizedEmail = String(email || '').trim().toLowerCase();

  if (!normalizedEmail) {
    return res.status(400).json({ error: 'Ingresá tu correo electrónico.' });
  }

  const token = crypto.randomBytes(24).toString('hex');
  const expiresAt = Date.now() + 60 * 60 * 1000;
  passwordResetTokens.set(token, { email: normalizedEmail, expiresAt });

  return res.json({
    success: true,
    message: 'Si el correo electrónico está registrado, recibirás un enlace de un solo uso para restablecer tu contraseña.',
    resetToken: token,
    expiresIn: '60 minutos'
  });
}

/**
 * POST /api/auth/reset-password
 */
export async function handleResetPassword(req: Request, res: Response) {
  const { token, newPassword } = req.body;

  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Faltan datos obligatorios.' });
  }

  if (String(newPassword).length < 8) {
    return res.status(400).json({ error: 'La nueva contraseña debe tener al menos 8 caracteres.' });
  }

  const record = passwordResetTokens.get(token);
  if (!record || Date.now() > record.expiresAt) {
    return res.status(400).json({ error: 'El enlace de recuperación es inválido o ha expirado.' });
  }

  const user = usersByEmail.get(record.email);
  if (!user) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  user.passwordHash = await bcrypt.hash(newPassword, 10);
  user.updatedAt = new Date().toISOString();
  passwordResetTokens.delete(token);
  persistDatabase(user);

  return res.json({
    success: true,
    message: 'Contraseña restablecida con éxito. Ya podés iniciar sesión con tus nuevas credenciales.'
  });
}

/**
 * PUT /api/auth/user
 */
export function handleUpdateUser(req: Request, res: Response) {
  const currentUser = getSessionUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const target = usersById.get(currentUser.id);
  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  const { name, alyc, profile, portfolio, preferences } = req.body;
  if (name) target.name = name;
  if (alyc !== undefined) target.alyc = alyc;
  if (profile) target.profile = profile;
  if (portfolio) target.portfolio = portfolio;
  if (preferences) target.preferences = preferences;
  target.updatedAt = new Date().toISOString();

  persistDatabase(target);

  return res.json({
    success: true,
    user: sanitizeUser(target),
    message: 'Datos actualizados con éxito.'
  });
}

/**
 * DELETE /api/auth/account
 */
export function handleDeleteAccount(req: Request, res: Response) {
  const currentUser = getSessionUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const target = usersById.get(currentUser.id);
  if (target) {
    usersById.delete(target.id);
    usersByEmail.delete(target.email.toLowerCase());
    if (target.googleSub) usersByGoogleSub.delete(target.googleSub);
    if (target.microsoftOid) usersByMicrosoftOid.delete(target.microsoftOid);
    userDrafts.delete(target.email.toLowerCase());
    deleteUserDb(target.id).catch(() => {});
    persistDatabase();
  }

  for (const [token, session] of sessions.entries()) {
    if (session.userId === currentUser.id) {
      sessions.delete(token);
      deleteSessionDb(token).catch(() => {});
    }
  }

  res.clearCookie('faros_session', {
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    path: '/'
  });

  return res.json({
    success: true,
    message: 'Tu cuenta y todos tus datos personales y de cartera fueron eliminados definitivamente de FAROS.'
  });
}

/**
 * Onboarding Draft Endpoints
 */
export function handleSaveDraft(req: Request, res: Response) {
  const { email, draft } = req.body;
  const key = (email || 'anonymous').toLowerCase();
  userDrafts.set(key, draft);
  return res.json({ success: true });
}

export function handleGetDraft(req: Request, res: Response) {
  const email = (req.query.email as string || 'anonymous').toLowerCase();
  const draft = userDrafts.get(email);
  return res.json({ draft: draft || null });
}

// --- OAUTH 2.0 (GOOGLE & MICROSOFT) ---

/**
 * GET /api/auth/google/url
 * Google OAuth 2.0 with Authorization Code + PKCE (RFC 7636) and State validation
 */
export function handleGetGoogleAuthUrl(req: Request, res: Response) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const appUrl = getAppUrl(req);
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  if (!clientId || clientId.startsWith('YOUR_')) {
    return res.json({
      configured: false,
      provider: 'google',
      missingVars: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      instructions: `Configurá tus credenciales en Google Cloud Console con redirect URI: ${redirectUri}`
    });
  }

  // 1. Generate PKCE code_verifier and code_challenge
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);

  // 2. Generate cryptographically random state
  const state = crypto.randomBytes(24).toString('hex');

  // 3. Store state & PKCE verifier (10 minute expiry)
  oauthStates.set(state, {
    provider: 'google',
    codeVerifier,
    redirectUri,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'openid email profile',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    access_type: 'offline',
    prompt: 'select_account'
  });

  const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  return res.json({ configured: true, url: authUrl, state });
}

/**
 * GET /api/auth/google/callback
 */
export async function handleGoogleCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query;
  const appUrl = getAppUrl(req);
  const redirectUri = `${appUrl}/api/auth/google/callback`;

  // 1. Check for OAuth error from Google
  if (error || !code) {
    let userMsg = 'Autorización cancelada o denegada en Google.';
    if (error === 'access_denied') {
      userMsg = 'Acceso denegado o cancelado por el usuario en la pantalla de Google.';
    } else if (error === 'redirect_uri_mismatch') {
      userMsg = `La redirect URI configurada en Google Cloud Console no coincide con: ${redirectUri}`;
    } else if (error_description) {
      userMsg = String(error_description);
    }

    return res.send(renderOAuthCallbackHtml({
      success: false,
      provider: 'google',
      error: userMsg,
      errorType: String(error || 'cancelled')
    }));
  }

  // 2. Validate state & retrieve PKCE code_verifier
  const stateStr = String(state || '');
  const stateRecord = oauthStates.get(stateStr);

  if (!stateRecord || stateRecord.provider !== 'google' || Date.now() > stateRecord.expiresAt) {
    oauthStates.delete(stateStr);
    return res.send(renderOAuthCallbackHtml({
      success: false,
      provider: 'google',
      error: 'La validación de seguridad (state) falló o la sesión ha expirado. Por favor, volvé a intentar.',
      errorType: 'state_mismatch'
    }));
  }

  const { codeVerifier } = stateRecord;
  oauthStates.delete(stateStr);

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;

  try {
    // 3. Exchange authorization code with PKCE code_verifier
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: String(code),
        client_id: clientId || '',
        client_secret: clientSecret || '',
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || 'Fallo en intercambio de tokens con Google.';
      throw new Error(errMsg);
    }

    // 4. Retrieve user profile
    const userInfoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await userInfoRes.json();

    const sub = profile.sub; // Google's permanent unique subject identifier
    const email = (profile.email || '').toLowerCase().trim();
    const name = profile.name || email.split('@')[0];
    const picture = profile.picture;
    const isEmailVerified = profile.email_verified === true;

    if (!email || !sub) {
      throw new Error('Google no proveyó el correo electrónico o identificador del usuario.');
    }

    if (!isEmailVerified) {
      throw new Error('El correo electrónico de tu cuenta Google no está verificado.');
    }

    // 5. Real Multi-user Lookup & Account Linking
    let existingUser = usersByGoogleSub.get(sub);
    if (!existingUser) {
      existingUser = usersByEmail.get(email);
    }

    if (existingUser) {
      // User exists: link Google sub if missing, update picture
      if (!existingUser.googleSub) existingUser.googleSub = sub;
      if (picture && !existingUser.picture) existingUser.picture = picture;
      existingUser.updatedAt = new Date().toISOString();
      indexUser(existingUser);
      persistDatabase(existingUser);

      const sessionToken = createSession(existingUser.id, true);
      setSessionCookie(res, sessionToken, true);

      return res.send(renderOAuthCallbackHtml({
        success: true,
        type: 'OAUTH_AUTH_SUCCESS',
        provider: 'google',
        user: sanitizeUser(existingUser),
        token: sessionToken,
        message: 'Bienvenido de nuevo a FAROS.'
      }));
    } else {
      // New user: Send verified profile to onboarding wizard
      return res.send(renderOAuthCallbackHtml({
        success: true,
        type: 'OAUTH_AUTH_NEW_USER',
        provider: 'google',
        tempUser: {
          name,
          email,
          picture,
          provider: 'google',
          googleSub: sub
        },
        message: 'Cuenta de Google verificada con éxito. Completá tus preferencias de inversión.'
      }));
    }
  } catch (err: any) {
    return res.send(renderOAuthCallbackHtml({
      success: false,
      provider: 'google',
      error: err.message || 'Error durante la conexión con Google.',
      errorType: 'auth_failed'
    }));
  }
}

/**
 * GET /api/auth/microsoft/url
 * Microsoft OAuth 2.0 with tenant 'common' (supports personal @outlook and corporate Entra accounts)
 */
export function handleGetMicrosoftAuthUrl(req: Request, res: Response) {
  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const appUrl = getAppUrl(req);
  const redirectUri = `${appUrl}/api/auth/microsoft/callback`;

  if (!clientId || clientId.startsWith('YOUR_')) {
    return res.json({
      configured: false,
      provider: 'microsoft',
      missingVars: ['MICROSOFT_CLIENT_ID', 'MICROSOFT_CLIENT_SECRET'],
      instructions: `Configurá tus credenciales en Microsoft Entra ID con redirect URI: ${redirectUri}`
    });
  }

  // PKCE + State
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = generateCodeChallenge(codeVerifier);
  const state = crypto.randomBytes(24).toString('hex');

  oauthStates.set(state, {
    provider: 'microsoft',
    codeVerifier,
    redirectUri,
    createdAt: Date.now(),
    expiresAt: Date.now() + 10 * 60 * 1000
  });

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: redirectUri,
    response_mode: 'query',
    scope: 'openid email profile User.Read',
    state,
    code_challenge: codeChallenge,
    code_challenge_method: 'S256',
    prompt: 'select_account'
  });

  // Strict: tenant 'common' for personal + corporate accounts
  const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?${params.toString()}`;
  return res.json({ configured: true, url: authUrl, state });
}

/**
 * GET /api/auth/microsoft/callback
 */
export async function handleMicrosoftCallback(req: Request, res: Response) {
  const { code, state, error, error_description } = req.query;
  const appUrl = getAppUrl(req);
  const redirectUri = `${appUrl}/api/auth/microsoft/callback`;

  // 1. Check for OAuth error from Microsoft
  if (error || !code) {
    let userMsg = 'Autorización cancelada o denegada en Microsoft.';
    if (error === 'access_denied') {
      userMsg = 'Acceso denegado o cancelado por el usuario en la pantalla de Microsoft.';
    } else if (error === 'redirect_uri_mismatch') {
      userMsg = `La redirect URI configurada en Microsoft Entra no coincide con: ${redirectUri}`;
    } else if (error_description) {
      userMsg = String(error_description);
    }

    return res.send(renderOAuthCallbackHtml({
      success: false,
      provider: 'microsoft',
      error: userMsg,
      errorType: String(error || 'cancelled')
    }));
  }

  // 2. Validate state & retrieve PKCE code_verifier
  const stateStr = String(state || '');
  const stateRecord = oauthStates.get(stateStr);

  if (!stateRecord || stateRecord.provider !== 'microsoft' || Date.now() > stateRecord.expiresAt) {
    oauthStates.delete(stateStr);
    return res.send(renderOAuthCallbackHtml({
      success: false,
      provider: 'microsoft',
      error: 'La validación de seguridad (state) falló o la sesión ha expirado. Por favor, volvé a intentar.',
      errorType: 'state_mismatch'
    }));
  }

  const { codeVerifier } = stateRecord;
  oauthStates.delete(stateStr);

  const clientId = process.env.MICROSOFT_CLIENT_ID;
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET;

  try {
    // 3. Exchange code at tenant common
    const tokenRes = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId || '',
        client_secret: clientSecret || '',
        code: String(code),
        redirect_uri: redirectUri,
        grant_type: 'authorization_code',
        code_verifier: codeVerifier
      })
    });

    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      const errMsg = tokenData.error_description || tokenData.error || 'Fallo en intercambio de tokens con Microsoft.';
      throw new Error(errMsg);
    }

    // 4. Retrieve user profile via Microsoft Graph
    const userInfoRes = await fetch('https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }
    });
    const profile = await userInfoRes.json();

    // In Microsoft Entra, id is the user Object ID (oid)
    const oid = profile.id;
    const email = (profile.mail || profile.userPrincipalName || '').toLowerCase().trim();
    const name = profile.displayName || email.split('@')[0];

    if (!email || !oid) {
      throw new Error('Microsoft no proveyó el correo electrónico o el identificador del usuario.');
    }

    // 5. Multi-user Lookup & Account Linking
    let existingUser = usersByMicrosoftOid.get(oid);
    if (!existingUser) {
      existingUser = usersByEmail.get(email);
    }

    if (existingUser) {
      if (!existingUser.microsoftOid) existingUser.microsoftOid = oid;
      existingUser.updatedAt = new Date().toISOString();
      indexUser(existingUser);
      persistDatabase(existingUser);

      const sessionToken = createSession(existingUser.id, true);
      setSessionCookie(res, sessionToken, true);

      return res.send(renderOAuthCallbackHtml({
        success: true,
        type: 'OAUTH_AUTH_SUCCESS',
        provider: 'microsoft',
        user: sanitizeUser(existingUser),
        token: sessionToken,
        message: 'Bienvenido de nuevo a FAROS.'
      }));
    } else {
      return res.send(renderOAuthCallbackHtml({
        success: true,
        type: 'OAUTH_AUTH_NEW_USER',
        provider: 'microsoft',
        tempUser: {
          name,
          email,
          provider: 'microsoft',
          microsoftOid: oid
        },
        message: 'Cuenta de Microsoft verificada con éxito. Completá tus preferencias de inversión.'
      }));
    }
  } catch (err: any) {
    return res.send(renderOAuthCallbackHtml({
      success: false,
      provider: 'microsoft',
      error: err.message || 'Error durante la conexión con Microsoft.',
      errorType: 'auth_failed'
    }));
  }
}

/**
 * Renders HTML that safely sends postMessage to opener popup and closes window
 */
function renderOAuthCallbackHtml(payload: {
  success: boolean;
  type?: string;
  provider?: string;
  user?: UserAccount;
  tempUser?: any;
  token?: string;
  error?: string;
  errorType?: string;
  message?: string;
}): string {
  const serialized = JSON.stringify(payload);
  const isError = !payload.success;

  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>FAROS Autenticación</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
      background-color: ${isError ? '#1c1917' : '#022c22'};
      color: #ffffff;
      text-align: center;
      padding: 16px;
      box-sizing: border-box;
    }
    .box {
      background: rgba(255, 255, 255, 0.08);
      padding: 32px 24px;
      border-radius: 24px;
      border: 1px solid rgba(255, 255, 255, 0.15);
      max-width: 440px;
      width: 100%;
      box-shadow: 0 20px 40px rgba(0,0,0,0.4);
    }
    h2 { font-size: 18px; margin: 12px 0 6px; font-weight: 800; }
    p { font-size: 13px; color: ${isError ? '#fecdd3' : '#a7f3d0'}; line-height: 1.5; margin: 8px 0 16px; }
    .spinner {
      border: 3px solid rgba(255, 255, 255, 0.2);
      border-top: 3px solid #34d399;
      border-radius: 50%;
      width: 28px;
      height: 28px;
      animation: spin 1s linear infinite;
      margin: 0 auto;
    }
    .error-icon {
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background: rgba(244, 63, 94, 0.2);
      border: 2px solid #f43f5e;
      color: #f43f5e;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 20px;
      font-weight: bold;
      margin: 0 auto 12px;
    }
    .btn {
      display: inline-block;
      padding: 10px 20px;
      background: #059669;
      color: white;
      border: none;
      border-radius: 12px;
      font-size: 13px;
      font-weight: 700;
      cursor: pointer;
      text-decoration: none;
      transition: background 0.2s;
    }
    .btn:hover { background: #047857; }
    @keyframes spin { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="box">
    ${isError ? `
      <div class="error-icon">!</div>
      <h2>Error de autenticación</h2>
      <p id="err-text">${payload.error || 'Ocurrió un error al procesar el inicio de sesión.'}</p>
      <button class="btn" onclick="retryClose()">Cerrar y Reintentar</button>
    ` : `
      <div class="spinner"></div>
      <h2>Procesando autenticación...</h2>
      <p>Conectando con FAROS. Esta ventana se cerrará automáticamente.</p>
    `}
  </div>
  <script>
    (function() {
      const data = ${serialized};
      function sendToOpener() {
        if (window.opener) {
          try {
            window.opener.postMessage(data, '*');
          } catch(e) {}
          if (data.success) {
            setTimeout(function() { window.close(); }, 700);
          }
        }
      }
      sendToOpener();
    })();

    function retryClose() {
      window.close();
    }
  </script>
</body>
</html>`;
}

// Development and testing helper: returns all users sanitized
export function debugGetAllUsers(): UserAccount[] {
  return Array.from(usersById.values()).map(sanitizeUser);
}
