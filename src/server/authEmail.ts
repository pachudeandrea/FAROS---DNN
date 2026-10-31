import { RequestError } from './requestError.js';

export class EmailError extends RequestError {
  constructor(code: string, message: string, status = 503) { super(code, message, status); }
}

function configuration() {
  const from = (process.env.EMAIL_FROM || '').trim();
  const provider = (process.env.EMAIL_PROVIDER || (process.env.BREVO_API_KEY ? 'brevo' : 'resend')).trim().toLowerCase();
  const key = (provider === 'brevo' ? process.env.BREVO_API_KEY : process.env.RESEND_API_KEY)?.trim();
  const anySetting = Boolean(from || process.env.EMAIL_PROVIDER || process.env.BREVO_API_KEY || process.env.RESEND_API_KEY);
  if (!anySetting) return null;
  if (!['brevo', 'resend'].includes(provider) || !key || !/^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(from)) {
    throw new EmailError('EMAIL_NOT_CONFIGURED', 'Falta completar el servicio de correo y su remitente autorizado.');
  }
  return { from, provider, key };
}

export function requireEmailDelivery(): void {
  if (!configuration()) throw new EmailError('EMAIL_NOT_CONFIGURED', 'Falta configurar el servicio de correo seguro. No se envió ningún código.');
}

export async function sendPasswordResetCode(email: string, code: string): Promise<void> {
  const config = configuration();
  if (!config) return requireEmailDelivery();
  const subject = 'Tu código para recuperar la contraseña de FAROS';
  const text = `Solicitaste cambiar tu contraseña de FAROS.\n\nTu código es:\n\n${code}\n\nIngresalo en la pantalla de recuperación junto con tu nueva contraseña. Vence en 10 minutos y se puede usar una sola vez. Si no lo solicitaste, ignorá este correo.\n\nFAROS`;
  const html = `<div style="font-family:Arial,sans-serif;max-width:540px;margin:auto;color:#022c22"><h1>FAROS</h1><p>Solicitaste cambiar tu contraseña.</p><p>Tu código de recuperación es:</p><p style="font-size:32px;letter-spacing:6px;font-weight:bold">${code}</p><p>Ingresalo en la pantalla de recuperación junto con tu nueva contraseña. Vence en 10 minutos y se puede usar una sola vez.</p><p>Si no lo solicitaste, ignorá este correo.</p></div>`;
  const brevo = config.provider === 'brevo';
  let failure = 'transport_error';
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
      failure = `http_${response.status}`;
      throw new Error('Mail provider rejected the message');
    }
    failure = 'invalid_receipt';
    const receipt = await response.json();
    const id = brevo ? receipt.messageId : receipt.id;
    if (typeof id !== 'string' || !id) throw new Error('Mail provider did not accept the message');
    console.info(`[PASSWORD RECOVERY] provider=${config.provider} status=accepted`);
  } catch {
    // Log only controlled status values, never recipient addresses, codes,
    // credentials or raw provider responses.
    console.error(`[PASSWORD RECOVERY] provider=${config.provider} status=${failure}`);
    throw new EmailError('EMAIL_DELIVERY_FAILED', 'El servicio de correo no pudo aceptar el código. Intentá nuevamente en unos momentos.');
  }
}
