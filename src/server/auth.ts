import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { UserAccount, RiskProfile, Portfolio } from '../types/index.js';
import { DEFAULT_PREFERENCES } from '../data/mockData.js';
import { resetPasswordWithRecoveryKey, setRecoveryKey, limitRecoveryAttempts } from './passwordRecovery.js';
import { getRecoveryKeyError } from '../utils/recoveryKey.js';
import { 
  trackEventNonBlocking, 
  isUserAdmin, 
  deleteUserDb, 
  saveSessionDb, 
  deleteSessionDb,
  getUserFromDbById,
  getUserFromDbByEmail,
  getUserFromDbByOAuth,
  getSessionDb,
  createUserAndSessionDb,
  updateUserDb,
  saveAuthFlow, getAuthFlow, consumeAuthFlow
} from './dbAdapter.js';

// Accounts and sessions are always read from PostgreSQL, never process caches.
export interface StoredUser extends UserAccount {
  passwordHash?: string;
  recoveryKeyHash?: string;
  googleSub?: string;
  microsoftOid?: string;
  updatedAt?: string;
}

interface FailedAttempt { count: number; lockedUntil: number }
const failedLoginAttempts = new Map<string, FailedAttempt>();
const sessionDuration = (rememberMe: boolean) => (rememberMe ? 30 : 1) * 24 * 60 * 60 * 1000;
const newToken = () => crypto.randomBytes(32).toString('hex');
const cookieOptions = () => ({
  httpOnly: true, secure: process.env.NODE_ENV === 'production' || process.env.VERCEL === '1',
  sameSite: 'lax' as const, path: '/'
});
const sessionTokenFrom = (req: Request): string | undefined => {
  const bearer = req.headers.authorization?.match(/^Bearer\s+([a-f0-9]{64})$/i)?.[1];
  const cookie = req.cookies?.faros_session;
  return bearer || (typeof cookie === 'string' && /^[a-f0-9]{64}$/i.test(cookie) ? cookie : undefined);
};

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
  const { passwordHash, recoveryKeyHash, googleSub, microsoftOid, ...safeUser } = user;
  safeUser.hasRecoveryKey = Boolean(recoveryKeyHash);
  safeUser.isAdmin = isUserAdmin(user.email);
  return safeUser;
}

/** Every request checks durable session revocation and the current account. */
export async function getSessionUser(req: Request): Promise<UserAccount | null> {
  const token = sessionTokenFrom(req);
  if (!token) return null;
  const session = await getSessionDb(token);
  if (!session) return null;
  const user = await getUserFromDbById(session.userId);
  return user ? sanitizeUser(user) : null;
}

export async function createSession(userId: string, rememberMe = true, expectedPasswordHash?: string): Promise<string> {
  const token = newToken();
  await saveSessionDb(token, userId, Date.now() + sessionDuration(rememberMe), expectedPasswordHash);
  return token;
}

export function setSessionCookie(res: Response, token: string, rememberMe = true) {
  res.cookie('faros_session', token, { ...cookieOptions(), maxAge: sessionDuration(rememberMe) });
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
export async function handleGetMe(req: Request, res: Response) {
  const user = await getSessionUser(req);
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
    recoveryKey,
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
  if (typeof name !== 'string' || !name.trim() || name.length > 120 || typeof email !== 'string' || email.length > 254 || termsAccepted !== true) {
    return res.status(400).json({ error: 'Faltan datos obligatorios para el registro.' });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(normalizedEmail)) {
    return res.status(400).json({ error: 'El formato del correo electrónico no es válido.' });
  }

  if (!['email', 'google', 'microsoft'].includes(provider)) {
    return res.status(400).json({ error: 'Proveedor de autenticación inválido.' });
  }
  if (!['conservador', 'moderado', 'dinamico'].includes(profile)) {
    return res.status(400).json({ error: 'El perfil de inversión no es válido.' });
  }
  if (provider === 'email' && (typeof password !== 'string' || password.length < 8 || Buffer.byteLength(password, 'utf8') > 72)) {
    return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres y hasta 72 bytes.' });
  }
  if (provider === 'email') {
    const recoveryError = getRecoveryKeyError(recoveryKey, password);
    if (recoveryError) return res.status(400).json({ error: recoveryError });
  }
  if (provider === 'email' && (googleSub || microsoftOid)) {
    return res.status(400).json({ error: 'Los identificadores externos requieren autenticación con el proveedor.' });
  }
  let verifiedIdentity: any = null;
  const signupTicket = req.body.signupTicket;
  if (provider !== 'email') {
    if (typeof signupTicket !== 'string' || !/^[a-f0-9]{64}$/.test(signupTicket)) {
      return res.status(401).json({ error: 'Iniciá sesión con el proveedor para verificar tu identidad.', code: 'OAUTH_PROOF_REQUIRED' });
    }
    verifiedIdentity = await getAuthFlow(signupTicket, 'signup');
    if (!verifiedIdentity || verifiedIdentity.provider !== provider || verifiedIdentity.email !== normalizedEmail) {
      return res.status(401).json({ error: 'La verificación externa venció o no coincide con la cuenta.', code: 'OAUTH_PROOF_INVALID' });
    }
  }

  if (await getUserFromDbByEmail(normalizedEmail)) {
    return res.status(409).json({ error: 'Este correo electrónico ya se encuentra registrado en FAROS. Por favor iniciá sesión con tu contraseña.', code: 'EMAIL_EXISTS' });
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

  const [passwordHash, recoveryKeyHash] = provider === 'email'
    ? await Promise.all([bcrypt.hash(password, 10), bcrypt.hash(recoveryKey, 10)])
    : [undefined, undefined];

  if (!Array.isArray(assets) || assets.length > 500 || assets.some((a: any) => !a || typeof a.symbol !== 'string' || a.symbol.length > 64) || typeof portfolioName !== 'string') {
    return res.status(400).json({ error: 'Los datos de la cartera no son válidos.' });
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
    recoveryKeyHash,
    provider: provider as 'email' | 'google' | 'microsoft',
    googleSub: verifiedIdentity?.googleSub,
    microsoftOid: verifiedIdentity?.microsoftOid,
    picture: verifiedIdentity?.picture,
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

  const sessionToken = newToken();
  await createUserAndSessionDb(newUser, sessionToken, Date.now() + sessionDuration(true), provider === 'email' ? undefined : signupTicket);

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


  // The user and session have already committed together.
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

  if (!normalizedEmail || typeof password !== 'string' || !password || Buffer.byteLength(password, 'utf8') > 72) {
    return res.status(400).json({ error: 'Ingresá tu correo electrónico y contraseña.' });
  }

  const user = await getUserFromDbByEmail(normalizedEmail);

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

  await updateUserDb(user.id, { lastActiveAt: new Date().toISOString() });

  trackEventNonBlocking('login', {
    userId: user.id,
    metadata: {
      provider: user.provider || 'email'
    },
    userAgent: req.get('user-agent')
  });

  const sessionToken = await createSession(user.id, rememberMe, user.passwordHash);
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
export async function handleLogout(req: Request, res: Response) {
  const token = sessionTokenFrom(req);
  if (token) {
    await deleteSessionDb(token);
  }
  res.clearCookie('faros_session', cookieOptions());
  return res.json({ success: true, message: 'Sesión cerrada correctamente.' });
}

const normalizedAddress = (value: unknown) => typeof value === 'string' ? value.trim().toLowerCase() : '';
const validAddress = (value: string) => value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function handleResetPassword(req: Request, res: Response) {
  const email = normalizedAddress(req.body?.email);
  const { recoveryKey, newPassword } = req.body || {};
  if (!validAddress(email)) return res.status(400).json({ error: 'Ingresá un correo electrónico válido.' });
  const recoveryError = getRecoveryKeyError(recoveryKey, newPassword);
  if (recoveryError) return res.status(400).json({ error: recoveryError });
  if (typeof newPassword !== 'string' || newPassword.length < 8 || Buffer.byteLength(newPassword, 'utf8') > 72) return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres y hasta 72 bytes.' });
  await limitRecoveryAttempts(email, req.ip || 'unknown');
  await resetPasswordWithRecoveryKey(email, recoveryKey, newPassword);
  res.clearCookie('faros_session', cookieOptions());
  return res.json({ success: true, message: 'Contraseña actualizada. Iniciá sesión con tu nueva contraseña.' });
}

export async function handleSetRecoveryKey(req: Request, res: Response) {
  const user = await getSessionUser(req);
  if (!user) return res.status(401).json({ error: 'Iniciá sesión para configurar tu clave de recuperación.' });
  const { currentPassword, recoveryKey } = req.body || {};
  if (typeof currentPassword !== 'string' || !currentPassword || Buffer.byteLength(currentPassword, 'utf8') > 72) return res.status(400).json({ error: 'Ingresá tu contraseña actual.' });
  const recoveryError = getRecoveryKeyError(recoveryKey, currentPassword);
  if (recoveryError) return res.status(400).json({ error: recoveryError });
  await limitRecoveryAttempts(`setup:${user.id}`, req.ip || 'unknown');
  const updated = await setRecoveryKey(user.id, currentPassword, recoveryKey);
  return res.json({ success: true, user: sanitizeUser(updated), message: 'Clave de recuperación guardada. Conservala para recuperar tu cuenta si olvidás la contraseña.' });
}

/**
 * PUT /api/auth/user
 */
export async function handleUpdateUser(req: Request, res: Response) {
  const currentUser = await getSessionUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  const target = await getUserFromDbById(currentUser.id);
  if (!target) {
    return res.status(404).json({ error: 'Usuario no encontrado.' });
  }

  const { name, alyc, profile, portfolio, preferences } = req.body;
  const updates: Partial<StoredUser> = { updatedAt: new Date().toISOString() };
  if (name !== undefined) {
    if (typeof name !== 'string' || !name.trim() || name.length > 120) return res.status(400).json({ error: 'El nombre no es válido.' });
    updates.name = name.trim();
  }
  if (alyc !== undefined) {
    if (typeof alyc !== 'string' || alyc.length > 200) return res.status(400).json({ error: 'El ALyC no es válido.' });
    updates.alyc = alyc;
  }
  if (profile !== undefined) {
    if (!['conservador', 'moderado', 'dinamico'].includes(profile)) return res.status(400).json({ error: 'El perfil no es válido.' });
    updates.profile = profile;
  }
  if (portfolio !== undefined) {
    if (!portfolio || typeof portfolio !== 'object' || !Array.isArray(portfolio.assetIds) ||
        portfolio.assetIds.length > 500 || portfolio.assetIds.some((a: unknown) => typeof a !== 'string' || a.length > 64) ||
        typeof portfolio.name !== 'string' || portfolio.name.length > 200 ||
        !['conservador', 'moderado', 'dinamico'].includes(portfolio.profile) ||
        (portfolio.assetPositions && (typeof portfolio.assetPositions !== 'object' || Object.values(portfolio.assetPositions).some(p => p !== 'long' && p !== 'short')))) {
      return res.status(400).json({ error: 'Los datos de la cartera no son válidos.' });
    }
    updates.portfolio = {
      id: target.portfolio?.id || `port_${crypto.randomUUID()}`,
      name: portfolio.name, description: typeof portfolio.description === 'string' ? portfolio.description.slice(0, 2000) : '',
      profile: portfolio.profile, assetIds: portfolio.assetIds,
      assetPositions: Object.fromEntries(portfolio.assetIds.map((id: string) => [id, portfolio.assetPositions?.[id] === 'short' ? 'short' : 'long']))
    };
  }
  if (preferences !== undefined) {
    if (!preferences || typeof preferences !== 'object' || !Array.isArray(preferences.enabledRelevanceTypes) ||
        !Array.isArray(preferences.prioritizedTopics) || typeof preferences.notificationsEnabled !== 'boolean' ||
        typeof preferences.alertOnHighImpactOnly !== 'boolean' || typeof preferences.audioSpeed !== 'number' ||
        preferences.audioSpeed < 0.5 || preferences.audioSpeed > 3) return res.status(400).json({ error: 'Las preferencias no son válidas.' });
    updates.preferences = {
      investorProfile: updates.profile || updates.portfolio?.profile || target.profile,
      enabledRelevanceTypes: preferences.enabledRelevanceTypes, prioritizedTopics: preferences.prioritizedTopics,
      notificationsEnabled: preferences.notificationsEnabled, alertOnHighImpactOnly: preferences.alertOnHighImpactOnly, audioSpeed: preferences.audioSpeed
    };
  }
  const updated = await updateUserDb(currentUser.id, updates);

  return res.json({
    success: true,
    user: sanitizeUser(updated),
    message: 'Datos actualizados con éxito.'
  });
}

/**
 * DELETE /api/auth/account
 */
export async function handleDeleteAccount(req: Request, res: Response) {
  const currentUser = await getSessionUser(req);
  if (!currentUser) {
    return res.status(401).json({ error: 'No autorizado.' });
  }

  await deleteUserDb(currentUser.id);
  res.clearCookie('faros_session', cookieOptions());
  return res.json({ 
    success: true, 
    message: 'Tu cuenta y todos tus datos personales y de cartera fueron eliminados definitivamente de FAROS.' 
  });
}

/** Unsubmitted drafts stay on this browser; never expose drafts by email. */
export function handleSaveDraft(req: Request, res: Response) {
  return res.status(410).json({ error: 'Guardá el borrador de registro en este dispositivo.' });
}
export function handleGetDraft(req: Request, res: Response) {
  return res.status(410).json({ draft: null, error: 'Los borradores no se consultan por correo electrónico.' });
}

// --- OAUTH 2.0 (GOOGLE & MICROSOFT) ---
type OAuthProvider = 'google' | 'microsoft';

async function startOAuth(provider: OAuthProvider, req: Request, res: Response) {
  const prefix = provider.toUpperCase();
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  const redirectUri = `${getAppUrl(req)}/api/auth/${provider}/callback`;
  if (!clientId || !clientSecret || clientId.startsWith('YOUR_')) {
    return res.json({ configured: false, provider,
      missingVars: [`${prefix}_CLIENT_ID`, `${prefix}_CLIENT_SECRET`],
      instructions: `Falta configurar OAuth de ${provider}. Configurá las credenciales y la URI de retorno: ${redirectUri}` });
  }
  const codeVerifier = generateCodeVerifier();
  const state = newToken();
  // The cookie ties state to the browser, while PostgreSQL survives cold starts.
  res.cookie(`faros_oauth_${provider}`, state, { ...cookieOptions(), maxAge: 10 * 60 * 1000 });
  await saveAuthFlow(state, `oauth_${provider}`, { codeVerifier, redirectUri }, Date.now() + 10 * 60 * 1000);
  const params = new URLSearchParams({ client_id: clientId, response_type: 'code', redirect_uri: redirectUri,
    scope: provider === 'google' ? 'openid email profile' : 'openid email profile User.Read',
    state, code_challenge: generateCodeChallenge(codeVerifier), code_challenge_method: 'S256', prompt: 'select_account' });
  const endpoint = provider === 'google' ? 'https://accounts.google.com/o/oauth2/v2/auth' : 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
  return res.json({ configured: true, url: `${endpoint}?${params}` });
}

export const handleGetGoogleAuthUrl = (req: Request, res: Response) => startOAuth('google', req, res);
export const handleGetMicrosoftAuthUrl = (req: Request, res: Response) => startOAuth('microsoft', req, res);

async function oauthCallback(provider: OAuthProvider, req: Request, res: Response) {
  const send = (payload: Parameters<typeof renderOAuthCallbackHtml>[0]) => res.type('html').send(renderOAuthCallbackHtml(payload, new URL(getAppUrl(req)).origin));
  res.setHeader('Cache-Control', 'no-store');
  const state = typeof req.query.state === 'string' ? req.query.state : '';
  const cookieName = `faros_oauth_${provider}`;
  if (!state || req.cookies?.[cookieName] !== state) {
    return send({ success: false, type: 'OAUTH_AUTH_ERROR', provider, error: 'La validación de seguridad falló. Volvé a intentar.', errorType: 'state_mismatch' });
  }
  res.clearCookie(cookieName, cookieOptions());
  const record = await consumeAuthFlow(state, `oauth_${provider}`);
  if (!record || typeof req.query.code !== 'string' || req.query.error) {
    return send({ success: false, type: 'OAUTH_AUTH_ERROR', provider, error: 'La autorización fue cancelada o venció. Volvé a intentar.', errorType: 'auth_cancelled' });
  }
  try {
    const prefix = provider.toUpperCase();
    const clientId = process.env[`${prefix}_CLIENT_ID`];
    const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
    if (!clientId || !clientSecret) throw new Error('OAuth unavailable');
    const endpoint = provider === 'google' ? 'https://oauth2.googleapis.com/token' : 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
    const tokenRes = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code: req.query.code,
        redirect_uri: record.redirectUri, grant_type: 'authorization_code', code_verifier: record.codeVerifier }), signal: AbortSignal.timeout(10000) });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) throw new Error('OAuth exchange failed');
    const userInfoRes = await fetch(provider === 'google' ? 'https://www.googleapis.com/oauth2/v3/userinfo' : 'https://graph.microsoft.com/v1.0/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` }, signal: AbortSignal.timeout(10000) });
    if (!userInfoRes.ok) throw new Error('OAuth profile failed');
    const profile = await userInfoRes.json();
    const id = provider === 'google' ? profile.sub : profile.id;
    const email = String(provider === 'google' ? profile.email || '' : profile.mail || profile.userPrincipalName || '').trim().toLowerCase();
    if (typeof id !== 'string' || !email || (provider === 'google' && profile.email_verified !== true)) throw new Error('Unverified identity');
    // Only a provider-verified identity may authenticate an already linked account.
    // Do not link by email automatically (especially Microsoft tenant addresses).
    const existingUser = await getUserFromDbByOAuth(provider, id);
    if (existingUser) {
      const token = await createSession(existingUser.id);
      setSessionCookie(res, token);
      return send({ success: true, type: 'OAUTH_AUTH_SUCCESS', provider, user: sanitizeUser(existingUser), token });
    }
    if (await getUserFromDbByEmail(email)) {
      return send({ success: false, type: 'OAUTH_AUTH_ERROR', provider, error: 'El correo ya tiene una cuenta. Iniciá sesión con su método original; no se vinculó otra identidad automáticamente.' });
    }
    const identity = { email, name: profile.name || profile.displayName || email.split('@')[0], provider,
      ...(provider === 'google' ? { googleSub: id, picture: profile.picture } : { microsoftOid: id }) };
    const signupTicket = newToken();
    await saveAuthFlow(signupTicket, 'signup', identity, Date.now() + 10 * 60 * 1000);
    return send({ success: true, type: 'OAUTH_AUTH_NEW_USER', provider,
      tempUser: { name: identity.name, email, provider, picture: profile.picture, signupTicket } });
  } catch {
    return send({ success: false, type: 'OAUTH_AUTH_ERROR', provider, error: 'No se pudo verificar la identidad con el proveedor o guardar la sesión. Intentá nuevamente.', errorType: 'auth_failed' });
  }
}

export const handleGoogleCallback = (req: Request, res: Response) => oauthCallback('google', req, res);
export const handleMicrosoftCallback = (req: Request, res: Response) => oauthCallback('microsoft', req, res);

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
}, targetOrigin: string): string {
  const serialized = JSON.stringify(payload).replace(/</g, '\\u003c');
  const safeError = (payload.error || 'Ocurrió un error al procesar el inicio de sesión.').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
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
      <p id="err-text">${safeError}</p>
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
            window.opener.postMessage(data, ${JSON.stringify(targetOrigin)});
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
