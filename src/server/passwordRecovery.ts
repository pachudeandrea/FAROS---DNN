import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { StoredUser } from './auth.js';
import { query, transaction } from './database.js';
import { RequestError } from './requestError.js';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const invalidRecovery = () => new RequestError('RECOVERY_CREDENTIALS_INVALID', 'No se pudo recuperar la cuenta con esos datos. Revisá tu correo y tu clave de recuperación.', 401);

export async function resetPasswordWithRecoveryKey(email: string, recoveryKey: string, newPassword: string): Promise<void> {
  await transaction(async client => {
    // Use the same account-first lock order as login and account deletion.
    const result = await client.query('SELECT data FROM faros_users WHERE LOWER(email) = $1 FOR UPDATE', [email]);
    const user = result.rows[0]?.data as StoredUser | undefined;
    if (!user?.recoveryKeyHash) {
      // Do comparable hashing work for unknown accounts and accounts without a
      // configured key. Neither case reveals registration status to the client.
      await bcrypt.hash(recoveryKey, 10);
      throw invalidRecovery();
    }
    if (!await bcrypt.compare(recoveryKey, user.recoveryKeyHash)) throw invalidRecovery();
    const passwordHash = await bcrypt.hash(newPassword, 10);
    await client.query('UPDATE faros_users SET data = data || $2::jsonb, updated_at = NOW() WHERE id = $1', [user.id, JSON.stringify({ passwordHash, updatedAt: new Date().toISOString() })]);
    await client.query('DELETE FROM faros_sessions WHERE user_id = $1', [user.id]);
    await client.query('DELETE FROM faros_password_reset_codes WHERE user_id = $1', [user.id]);
    await client.query('DELETE FROM faros_email_tokens WHERE user_id = $1', [user.id]);
  });
}

export async function setRecoveryKey(userId: string, currentPassword: string, recoveryKey: string): Promise<StoredUser> {
  return transaction(async client => {
    const result = await client.query('SELECT data FROM faros_users WHERE id = $1 FOR UPDATE', [userId]);
    const user = result.rows[0]?.data as StoredUser | undefined;
    if (!user?.passwordHash || !await bcrypt.compare(currentPassword, user.passwordHash)) {
      throw new RequestError('CURRENT_PASSWORD_INVALID', 'La contraseña actual no es correcta.', 401);
    }
    const recoveryKeyHash = await bcrypt.hash(recoveryKey, 10);
    const updated = await client.query('UPDATE faros_users SET data = data || $2::jsonb, updated_at = NOW() WHERE id = $1 RETURNING data', [user.id, JSON.stringify({ recoveryKeyHash, updatedAt: new Date().toISOString() })]);
    await client.query('DELETE FROM faros_password_reset_codes WHERE user_id = $1', [user.id]);
    await client.query('DELETE FROM faros_email_tokens WHERE user_id = $1', [user.id]);
    return updated.rows[0].data as StoredUser;
  });
}

/** Counts every validated request before account lookup, so unknown addresses
 * have the same limits. Counters persist even when credential checks fail. */
export async function limitRecoveryAttempts(identity: string, ip: string): Promise<void> {
  const windowMs = 15 * 60000;
  for (const [bucket, maximum] of [[`identity:${identity}`, 5], [`ip:${ip}`, 20]] as const) {
    const now = Date.now();
    const result = await query(`INSERT INTO faros_recovery_limits (bucket_hash, attempts, window_started_at) VALUES ($1, 1, $2)
      ON CONFLICT (bucket_hash) DO UPDATE SET
        attempts = CASE WHEN faros_recovery_limits.window_started_at <= $3 THEN 1 ELSE LEAST(faros_recovery_limits.attempts + 1, $4) END,
        window_started_at = CASE WHEN faros_recovery_limits.window_started_at <= $3 THEN $2 ELSE faros_recovery_limits.window_started_at END
      RETURNING attempts`, [digest(bucket), now, now - windowMs, maximum + 1]);
    if (result.rows[0].attempts > maximum) throw new RequestError('RECOVERY_RATE_LIMITED', 'Demasiados intentos de recuperación. Esperá 15 minutos antes de volver a intentar.', 429);
  }
}
