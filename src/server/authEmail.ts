import { RequestError } from './requestError.js';
type EmailPurpose = 'verify_email' | 'reset_password';

export class EmailError extends RequestError {
  constructor(code: string, message: string, status = 503) { super(code, message, status); }
}

function configuration() {
  const from = (process.env.EMAIL_FROM || '').trim();
  const provider = (process.env.EMAIL_PROVIDER || (process.env.BREVO_API_KEY ? 'brevo' : 'resend')).trim();
  const key = provider === 'brevo' ? process.env.BREVO_API_KEY : process.env.RESEND_API_KEY;
  const anySetting = Boolean(from || process.env.EMAIL_PROVIDER || process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
  if (!anySetting) return null;
  if (!['brevo', 'resend'].includes(provider) || !key || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) {
    throw new EmailError('EMAIL_NOT_CONFIGURED', 'Falta completar el servicio de correo y su remitente autorizado.');
  }
  let origin: URL;
  try { origin = new URL(process.env.APP_URL || ''); } catch {
    throw new EmailError('EMAIL_NOT_CONFIGURED', 'Falta configurar la dirección pública de FAROS para enviar enlaces seguros.');
  }
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(origin.hostname);
  if (origin.username || origin.password || (origin.protocol !== 'https:' && !(local && origin.protocol === 'http:'))) {
    throw new EmailError('EMAIL_NOT_CONFIGURED', 'La dirección pública de FAROS debe usar HTTPS.');
  }
  return { from, provider, key, origin: origin.origin };
}

// No settings: keep the established email/password workflow until mail is set up.
// Partial settings: fail explicitly instead of silently bypassing confirmation.
export function emailConfirmationEnabled(): boolean { return Boolean(configuration()); }

export function requireEmailDelivery(): void {
  if (!configuration()) throw new EmailError('EMAIL_NOT_CONFIGURED', 'Falta configurar el servicio de correo seguro. No se envió ningún enlace.');
}

export async function sendAccountEmail(email: string, purpose: EmailPurpose, token: string): Promise<void> {
  const config = configuration();
  if (!config) return requireEmailDelivery();
  const verify = purpose === 'verify_email';
  const subject = verify ? 'Confirmá tu correo en FAROS' : 'Restablecé tu contraseña de FAROS';
  // Fragments stay out of server access logs and Referrer headers. Opening a
  // link only shows a confirmation form; mail scanners never consume a token.
  const link = `${config.origin}/#${verify ? 'verify-email' : 'reset-password'}=${encodeURIComponent(token)}`;
  const lead = verify ? 'Confirmá que este correo te pertenece para activar tu cuenta de FAROS.' : 'Solicitaste cambiar la contraseña de tu cuenta de FAROS.';
  const expiry = verify ? '24 horas' : '30 minutos';
  const text = `${lead}\n\n${link}\n\nEste enlace vence en ${expiry} y se puede usar una sola vez. Si no lo solicitaste, ignorá este correo.\n\nFAROS`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;color:#022c22"><h1>FAROS</h1><p>${lead}</p><p><a href="${link}" style="background:#065f46;color:white;padding:12px 18px;border-radius:8px;display:inline-block">${verify ? 'Confirmar mi correo' : 'Cambiar mi contraseña'}</a></p><p>El enlace vence en ${expiry} y se puede usar una sola vez.</p><p>Si no lo solicitaste, ignorá este correo.</p></div>`;
  const brevo = config.provider === 'brevo';
  try {
    const response = await fetch(brevo ? 'https://api.brevo.com/v3/smtp/email' : 'https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(brevo ? { 'api-key': config.key } : { Authorization: `Bearer ${config.key}` }) },
      body: JSON.stringify(brevo
        ? { sender: { name: 'FAROS', email: config.from }, to: [{ email }], subject, textContent: text, htmlContent: html }
        : { from: `FAROS <${config.from}>`, to: [email], subject, text, html }),
      signal: AbortSignal.timeout(10000)
    });
    if (!response.ok) {
      console.error(`[AUTH EMAIL] ${config.provider}: HTTP ${response.status}.`);
      throw new Error('Mail provider rejected the message');
    }
    const receipt = await response.json();
    const id = brevo ? receipt.messageId : receipt.id;
    if (typeof id !== 'string' || !id) throw new Error('Mail provider did not accept the message');
  } catch {
    // Provider bodies can contain addresses, credentials or the tokenized link.
    throw new EmailError('EMAIL_DELIVERY_FAILED', 'El servicio de correo no pudo aceptar el mensaje. Intentá nuevamente en unos momentos.');
  }
}
