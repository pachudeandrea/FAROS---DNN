import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import { query, transaction } from './database.js';
import { EmailError } from './authEmail.js';

const digest = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const newCode = () => crypto.randomInt(0, 1000000).toString().padStart(6, '0');
const lifetime = 10 * 60000;
const invalidCode = () => new EmailError('PASSWORD_CODE_INVALID', 'El código no es válido, venció o agotó sus cinco intentos. Solicitá uno nuevo.', 400);

export async function issuePasswordResetCode(email: string, userId?: string) {
  // Expired rows can be removed without holding an account lock.
  await query('DELETE FROM faros_password_reset_codes WHERE expires_at <= $1', [Date.now()]);
  return transaction(async client => {
    const user = userId ? await client.query('SELECT data FROM faros_users WHERE id = $1 FOR UPDATE', [userId]) : null;
    const owner = user?.rowCount && user.rows[0].data.email.toLowerCase() === email ? userId : null;
    const emailHash = digest(email);
    const previous = await client.query('SELECT code_hash FROM faros_password_reset_codes WHERE email_hash = $1 FOR UPDATE', [emailHash]);
    let code = newCode();
    while (previous.rowCount && await bcrypt.compare(code, previous.rows[0].code_hash)) code = newCode();
    const codeHash = await bcrypt.hash(code, 10);
    const requestId = crypto.randomUUID();
    if (owner) {
      await client.query('DELETE FROM faros_password_reset_codes WHERE user_id = $1 AND email_hash <> $2', [owner, emailHash]);
      await client.query("DELETE FROM faros_email_tokens WHERE user_id = $1 AND purpose = 'reset_password'", [owner]);
    }
    // Unknown addresses get the same challenge lifetime and attempt handling,
    // but no message is sent and they can never change an account.
    await client.query(`INSERT INTO faros_password_reset_codes
      (email_hash, request_id, user_id, code_hash, attempts, expires_at, created_at)
      VALUES ($1, $2, $3, $4, 0, $5, $6)
      ON CONFLICT (email_hash) DO UPDATE SET request_id = EXCLUDED.request_id,
        user_id = EXCLUDED.user_id, code_hash = EXCLUDED.code_hash, attempts = 0,
        expires_at = EXCLUDED.expires_at, created_at = EXCLUDED.created_at`,
    [emailHash, requestId, owner, codeHash, Date.now() + lifetime, Date.now()]);
    return { requestId, code, deliver: Boolean(owner) };
  });
}

export async function discardPasswordResetCode(requestId: string): Promise<void> {
  // A failed older send must not discard a more recent code.
  await query('DELETE FROM faros_password_reset_codes WHERE request_id = $1', [requestId]);
}

export async function resetPasswordWithCode(email: string, code: string, newPassword: string): Promise<void> {
  const changed = await transaction(async client => {
    const emailHash = digest(email);
    const hint = await client.query('SELECT user_id FROM faros_password_reset_codes WHERE email_hash = $1', [emailHash]);
    if (!hint.rowCount) return false;
    const userId = hint.rows[0].user_id;
    // Lock accounts before recovery rows, in the same order as issuing a code,
    // creating a session and deleting an account.
    const user = userId ? await client.query('SELECT data FROM faros_users WHERE id = $1 FOR UPDATE', [userId]) : null;
    const result = await client.query('SELECT * FROM faros_password_reset_codes WHERE email_hash = $1 FOR UPDATE', [emailHash]);
    const recovery = result.rows[0];
    if (!recovery || recovery.user_id !== userId || Number(recovery.expires_at) <= Date.now() || recovery.attempts >= 5) return false;
    await client.query('UPDATE faros_password_reset_codes SET attempts = attempts + 1 WHERE email_hash = $1', [emailHash]);
    const matches = await bcrypt.compare(code, recovery.code_hash);
    if (!matches || !user?.rowCount || user.rows[0].data.email.toLowerCase() !== email) return false;
    const passwordHash = await bcrypt.hash(newPassword, 10);
    if (Number(recovery.expires_at) <= Date.now()) return false;
    await client.query('UPDATE faros_users SET data = data || $2::jsonb, updated_at = NOW() WHERE id = $1', [userId, JSON.stringify({ passwordHash, updatedAt: new Date().toISOString() })]);
    await client.query('DELETE FROM faros_sessions WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM faros_password_reset_codes WHERE user_id = $1', [userId]);
    await client.query('DELETE FROM faros_email_tokens WHERE user_id = $1', [userId]);
    return true;
  });
  // Invalid attempts must COMMIT their counters, rather than rolling them back
  // by throwing from inside the transaction.
  if (!changed) throw invalidCode();
}

export async function limitPasswordRecovery(email: string, ip: string): Promise<void> {
  for (const [bucket, windowMs, maximum] of [
    [`address:reset_password:${email}`, 60000, 1], [`ip:${ip}`, 15 * 60000, 20]
  ] as const) {
    const now = Date.now();
    const result = await query(`INSERT INTO faros_email_rate_limits (bucket_hash, attempts, window_started_at) VALUES ($1, 1, $2)
      ON CONFLICT (bucket_hash) DO UPDATE SET
        attempts = CASE WHEN faros_email_rate_limits.window_started_at <= $3 THEN 1 ELSE faros_email_rate_limits.attempts + 1 END,
        window_started_at = CASE WHEN faros_email_rate_limits.window_started_at <= $3 THEN $2 ELSE faros_email_rate_limits.window_started_at END
      RETURNING attempts`, [digest(bucket), now, now - windowMs]);
    if (result.rows[0].attempts > maximum) throw new EmailError('EMAIL_RATE_LIMITED', 'Esperá un minuto antes de pedir otro código. Si hiciste muchos intentos, esperá 15 minutos.', 429);
  }
}
