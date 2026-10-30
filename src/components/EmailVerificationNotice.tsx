import React, { useState } from 'react';
import { Mail, Loader2 } from 'lucide-react';
import { apiRequest } from '../utils/apiClient';

export function EmailVerificationNotice({ email, initialMessage, onLogin }: { email: string; initialMessage?: string; onLogin: () => void }) {
  const [message, setMessage] = useState(initialMessage || 'Confirmá tu correo para activar la cuenta. Revisá también la carpeta de spam.');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const resend = async () => {
    if (busy) return;
    setBusy(true); setError(null);
    try {
      const data = await apiRequest('/api/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) });
      setMessage(data.message);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo enviar el correo.'); }
    finally { setBusy(false); }
  };
  return <div className="space-y-4 text-sm text-slate-700">
    <Mail className="w-8 h-8 text-emerald-800" />
    <h3 className="font-bold text-lg text-emerald-950">Confirmá tu correo</h3>
    <p>{message}</p><p className="font-semibold break-words">{email}</p>
    {error && <p role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-800">{error}</p>}
    <button type="button" onClick={resend} disabled={busy} className="w-full rounded-xl bg-emerald-800 text-white font-bold p-3 disabled:opacity-50 cursor-pointer flex justify-center gap-2">
      {busy && <Loader2 className="w-4 h-4 animate-spin" />}Reenviar confirmación
    </button>
    <button type="button" onClick={onLogin} className="w-full text-emerald-800 font-semibold cursor-pointer">Volver a iniciar sesión</button>
  </div>;
}
