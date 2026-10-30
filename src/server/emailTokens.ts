import crypto from 'node:crypto';
import type { PoolClient } from 'pg';
import type { StoredUser } from './auth.js';
import { query, transaction } from './database.js';
import { EmailError } from './authEmail.js';

export type EmailPurpose = 'verify_email' | 'reset_password';
export const newEmailToken = () => crypto.randomBytes(32).toString('hex');
const digest = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
const expiry = (purpose: EmailPurpose) => Date.now() + (purpose === 'verify_email' ? 24 * 60 : 30) * 60000;
const invalidLink = () => new EmailError('EMAIL_TOKEN_INVALID', 'El enlace no es válido, venció o ya fue utilizado. Solicitá uno nuevo.', 400);

async function insertToken(client: PoolClient, userId: string, purpose: EmailPurpose, token: string) {
  await client.query('DELETE FROM faros_email_tokens WHERE user_id = $1 AND purpose = $2', [userId, purpose]);
  await client.query('INSERT INTO faros_email_tokens (token_hash, user_id, purpose, expires_at, created_at) VALUES ($1, $2, $3, $4, $5)', [digest(token), userId, purpose, expiry(purpose), Date.now()]);
}

export async function createPendingUser(user: StoredUser, token: string): Promise<void> {
  await transaction(async client => {
    await client.query('INSERT INTO faros_users (id, email, data) VALUES ($1, $2, $3)', [user.id, user.email, JSON.stringify(user)]);
    await insertToken(client, user.id, 'verify_email', token);
  });
}

export async function issueEmailToken(userId: string, purpose: EmailPurpose, token: string): Promise<boolean> {
  return transaction(async client => {
    const user = await client.query('SELECT data FROM faros_users WHERE id = $1 FOR UPDATE', [userId]);
    if (!user.rowCount || (purpose === 'verify_email' && user.rows[0].data.emailVerified === true)) return false;
    await insertToken(client, userId, purpose, token);
    return true;
  });
}

export async function discardEmailToken(token: string): Promise<void> {
  await query('DELETE FROM faros_email_tokens WHERE token_hash = $1', [digest(token)]);
}

export async function assertEmailToken(token: string, purpose: EmailPurpose): Promise<void> {
  const result = await query('SELECT 1 FROM faros_email_tokens WHERE token_hash = $1 AND purpose = $2 AND expires_at > $3', [digest(token), purpose, Date.now()]);
  if (!result.rowCount) throw invalidLink();
}

async function takeToken(client: PoolClient, token: string, purpose: EmailPurpose) {
  if (!/^[a-f0-9]{64}$/.test(token)) throw invalidLink();
  const found = await client.query('SELECT user_id FROM faros_email_tokens WHERE token_hash = $1 AND purpose = $2 AND expires_at > $3', [digest(token), purpose, Date.now()]);
  if (!found.rowCount) throw invalidLink();
  const id = found.rows[0].user_id;
  // Always lock the user first, just like session creation/account deletion.
  const user = await client.query('SELECT data FROM faros_users WHERE id = $1 FOR UPDATE', [id]);
  const used = await client.query('DELETE FROM faros_email_tokens WHERE token_hash = $1 AND purpose = $2 AND expires_at > $3 RETURNING user_id', [digest(token), purpose, Date.now()]);
  if (!user.rowCount || !used.rowCount) throw invalidLink();
  return user.rows[0].data as StoredUser;
}

export async function confirmEmail(token: string, sessionToken: string, expiresAt: number): Promise<StoredUser> {
  return transaction(async client => {
    const user = await takeToken(client, token, 'verify_email');
    const updates = { emailVerified: true, emailVerifiedAt: new Date().toISOString() };
    await client.query('UPDATE faros_users SET data = data || $2::jsonb, updated_at = NOW() WHERE id = $1', [user.id, JSON.stringify(updates)]);
    await client.query("DELETE FROM faros_email_tokens WHERE user_id = $1 AND purpose = 'verify_email'", [user.id]);
    await client.query('INSERT INTO faros_sessions (token, user_id, expires_at, created_at) VALUES ($1, $2, $3, $4)', [`sha256:${digest(sessionToken)}`, user.id, expiresAt, Date.now()]);
    return { ...user, ...updates };
  });
}

export async function resetEmailPassword(token: string, passwordHash: string): Promise<void> {
  await transaction(async client => {
    const user = await takeToken(client, token, 'reset_password');
    const updates = { passwordHash, emailVerified: true, emailVerifiedAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    await client.query('UPDATE faros_users SET data = data || $2::jsonb, updated_at = NOW() WHERE id = $1', [user.id, JSON.stringify(updates)]);
    await client.query('DELETE FROM faros_sessions WHERE user_id = $1', [user.id]);
    await client.query('DELETE FROM faros_email_tokens WHERE user_id = $1', [user.id]);
  });
}

/** Applied before user lookup, including nonexistent emails, to avoid leaking
 * registration status through different throttling behavior. */
export async function limitAuthEmail(email: string, ip: string, purpose: string): Promise<void> {
  for (const [bucket, windowMs, maximum] of [
    [`address:${purpose}:${email}`, 60000, 1], [`ip:${ip}`, 15 * 60000, 20]
  ] as const) {
    const now = Date.now();
    const result = await query(`INSERT INTO faros_email_rate_limits (bucket_hash, attempts, window_started_at) VALUES ($1, 1, $2)
      ON CONFLICT (bucket_hash) DO UPDATE SET
        attempts = CASE WHEN faros_email_rate_limits.window_started_at <= $3 THEN 1 ELSE faros_email_rate_limits.attempts + 1 END,
        window_started_at = CASE WHEN faros_email_rate_limits.window_started_at <= $3 THEN $2 ELSE faros_email_rate_limits.window_started_at END
      RETURNING attempts`, [digest(bucket), now, now - windowMs]);
    if (result.rows[0].attempts > maximum) throw new EmailError('EMAIL_RATE_LIMITED', 'Esperá un minuto antes de pedir otro correo. Si hiciste muchos intentos, esperá 15 minutos.', 429);
  }
}
