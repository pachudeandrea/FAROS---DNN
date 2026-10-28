import { UserAccount, RiskProfile, Portfolio } from '../types';
import { DEFAULT_PREFERENCES } from '../data/mockData';

const VAULT_STORAGE_KEY = 'faros_registered_accounts_vault_v1';
const ACTIVE_SESSION_USER_KEY = 'faros_active_session_user';
const ACTIVE_SESSION_TOKEN_KEY = 'faros_session_token';

interface VaultEntry {
  user: UserAccount;
  passwordHash?: string;
  createdAt: string;
}

/**
 * Computes a standard SHA-256 hex digest for client-side password verification
 * Works in all modern browsers (Safari iOS, Chrome Android, Desktop)
 */
async function hashPasswordClient(password: string): Promise<string> {
  try {
    if (typeof window !== 'undefined' && window.crypto?.subtle) {
      const msgBuffer = new TextEncoder().encode(password);
      const hashBuffer = await window.crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    }
  } catch {}
  // Fallback simple hash for older environments
  let hash = 0;
  for (let i = 0; i < password.length; i++) {
    const char = password.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return `h_${Math.abs(hash)}`;
}

/**
 * Retrieves the local accounts vault from localStorage
 */
export function getVault(): Record<string, VaultEntry> {
  if (typeof window === 'undefined') return {};
  try {
    const data = localStorage.getItem(VAULT_STORAGE_KEY);
    if (data) {
      const parsed = JSON.parse(data);
      if (parsed && typeof parsed === 'object') {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('[FAROS VAULT] Error reading local account vault:', err);
  }
  return {};
}

/**
 * Saves a user account into the persistent local vault (keyed by normalized email)
 */
export async function saveUserToVault(user: UserAccount, plainPassword?: string): Promise<void> {
  if (typeof window === 'undefined' || !user.email) return;
  try {
    const vault = getVault();
    const normalizedEmail = user.email.trim().toLowerCase();
    
    let passwordHash = vault[normalizedEmail]?.passwordHash;
    if (plainPassword) {
      passwordHash = await hashPasswordClient(plainPassword);
    }

    vault[normalizedEmail] = {
      user,
      passwordHash,
      createdAt: vault[normalizedEmail]?.createdAt || new Date().toISOString()
    };

    localStorage.setItem(VAULT_STORAGE_KEY, JSON.stringify(vault));
  } catch (err) {
    console.warn('[FAROS VAULT] Error saving account to local vault:', err);
  }
}

/**
 * Checks if an email is already present in the local vault
 */
export function isEmailInVault(email: string): boolean {
  if (!email) return false;
  const vault = getVault();
  return Boolean(vault[email.trim().toLowerCase()]);
}

/**
 * Retrieves user by email from the local vault
 */
export function getUserFromVault(email: string): UserAccount | null {
  if (!email) return null;
  const vault = getVault();
  return vault[email.trim().toLowerCase()]?.user || null;
}

/**
 * Verifies credentials against local vault (used when server is offline or unreachable)
 */
export async function verifyVaultLogin(
  email: string,
  plainPassword: string
): Promise<{ success: boolean; user?: UserAccount; token?: string; error?: string }> {
  const normalizedEmail = email.trim().toLowerCase();
  const vault = getVault();
  const entry = vault[normalizedEmail];

  if (!entry) {
    return { success: false, error: 'Email o contraseña incorrectos.' };
  }

  if (entry.passwordHash) {
    const computedHash = await hashPasswordClient(plainPassword);
    if (computedHash !== entry.passwordHash) {
      return { success: false, error: 'Email o contraseña incorrectos.' };
    }
  }

  // Generate local session token
  const token = `loc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  saveActiveLocalSession(entry.user, token);

  return {
    success: true,
    user: entry.user,
    token
  };
}

/**
 * Creates and registers a local account when backend is offline or static on Vercel
 * Guarantees that the user is NEVER blocked by network errors
 */
export async function createLocalAccount(params: {
  name: string;
  email: string;
  password?: string;
  birthDate?: string;
  country?: string;
  city?: string;
  timeZone?: string;
  termsAccepted: boolean;
  notificationsOptIn?: boolean;
  profile?: RiskProfile;
  alyc?: string;
  portfolioName?: string;
}): Promise<{ user: UserAccount; token: string }> {
  const normalizedEmail = params.email.trim().toLowerCase();
  const newUserId = `usr_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  const portfolioId = `port_local_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  const profile = params.profile || 'moderado';

  const initialPortfolio: Portfolio = {
    id: portfolioId,
    name: params.portfolioName?.trim() || 'Mi Cartera',
    description: 'Mi espacio personal de inversión en FAROS.',
    profile,
    assetIds: [], // Explicitly clean and empty initial portfolio
    assetPositions: {}
  };

  const newUser: UserAccount = {
    id: newUserId,
    name: params.name.trim(),
    email: normalizedEmail,
    provider: 'email',
    birthDate: params.birthDate,
    country: params.country || 'Argentina',
    city: params.city || 'Buenos Aires',
    timeZone: params.timeZone || 'America/Argentina/Buenos_Aires',
    termsAccepted: params.termsAccepted,
    notificationsOptIn: Boolean(params.notificationsOptIn),
    profile,
    alyc: params.alyc || '',
    portfolio: initialPortfolio,
    preferences: {
      ...DEFAULT_PREFERENCES,
      investorProfile: profile
    },
    plan: 'prueba',
    funnelStage: 'cuenta_creada',
    lastActiveAt: new Date().toISOString(),
    createdAt: new Date().toISOString()
  };

  const token = `loc_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

  // Save to persistent local vault with hashed password
  await saveUserToVault(newUser, params.password);

  // Set active session
  saveActiveLocalSession(newUser, token);

  return { user: newUser, token };
}

/**
 * Saves active session locally
 */
export function saveActiveLocalSession(user: UserAccount, token: string): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(ACTIVE_SESSION_USER_KEY, JSON.stringify(user));
    localStorage.setItem(ACTIVE_SESSION_TOKEN_KEY, token);
  } catch (err) {
    console.warn('[FAROS VAULT] Error saving active local session:', err);
  }
}

/**
 * Gets currently active session user from localStorage
 */
export function getActiveLocalSession(): { user: UserAccount; token: string } | null {
  if (typeof window === 'undefined') return null;
  try {
    const userStr = localStorage.getItem(ACTIVE_SESSION_USER_KEY);
    const token = localStorage.getItem(ACTIVE_SESSION_TOKEN_KEY);
    if (userStr && token) {
      const user = JSON.parse(userStr) as UserAccount;
      return { user, token };
    }
  } catch {}
  return null;
}

/**
 * Clears active local session on logout
 */
export function clearActiveLocalSession(): void {
  if (typeof window === 'undefined') return;
  try {
    localStorage.removeItem(ACTIVE_SESSION_USER_KEY);
    localStorage.removeItem(ACTIVE_SESSION_TOKEN_KEY);
  } catch {}
}
