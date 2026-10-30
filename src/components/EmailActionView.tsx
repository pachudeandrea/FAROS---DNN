import React, { useState } from 'react';
import { CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { LighthouseLogo } from './LighthouseLogo';
import { apiRequest } from '../utils/apiClient';
import type { UserAccount } from '../types';

export interface EmailAction { kind: 'verify-email' | 'reset-password'; token: string }

export function readEmailAction(hash: string): EmailAction | null {
  const values = new URLSearchParams(hash.replace(/^#/, ''));
  for (const kind of ['verify-email', 'reset-password'] as const) {
    if (values.has(kind)) return { kind, token: values.get(kind) || '' };
  }
  return null;
}

export function EmailActionView({ action, onVerified, onReset, onClose }: {
  action: EmailAction;
  onVerified: (user: UserAccount, token?: string) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const verify = action.kind === 'verify-email';
  const validToken = /^[a-f0-9]{64}$/.test(action.token);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(validToken ? null : 'El enlace no es válido. Solicitá uno nuevo.');
  const [done, setDone] = useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy || !validToken) return;
    if (!verify && password !== confirmation) return setError('Las contraseñas no coinciden.');
    setBusy(true); setError(null);
    try {
      const data = await apiRequest(`/api/auth/${action.kind}`, { method: 'POST', body: JSON.stringify({ token: action.token, ...(verify ? {} : { newPassword: password }) }) });
      if (!data.success || (verify && !data.user)) throw new Error('El servidor no confirmó la operación. Intentá nuevamente.');
      if (verify) onVerified(data.user, data.token);
      else setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo completar la solicitud.');
    } finally { setBusy(false); }
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-white rounded-3xl max-w-md w-full shadow-2xl overflow-hidden">
        <div className="bg-emerald-950 p-6 text-white">
          <div className="flex items-center gap-2 mb-3"><LighthouseLogo size="sm" showContainer={false} /><span className="text-xs font-bold">FAROS INVERSORES</span></div>
          <h1 className="text-xl font-black">{verify ? 'Confirmar tu correo' : 'Restablecer contraseña'}</h1>
        </div>
        <div className="p-6 space-y-4 text-sm text-slate-700">
          {error && <p role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-800 flex gap-2"><AlertCircle className="w-4 h-4 shrink-0" />{error}</p>}
          {done ? <>
            <p className="flex gap-2 text-emerald-800"><CheckCircle2 className="w-5 h-5 shrink-0" />Tu contraseña se actualizó. Las sesiones anteriores se cerraron.</p>
            <button onClick={onReset} className="w-full rounded-xl bg-emerald-800 text-white font-bold p-3 cursor-pointer">Iniciar sesión</button>
          </> : <form onSubmit={submit} className="space-y-4">
            {verify ? <p>Confirmá que este correo te pertenece para activar tu cuenta de FAROS.</p> : <>
              <label className="block font-semibold">Nueva contraseña<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label>
              <label className="block font-semibold">Repetir contraseña<input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className="mt-2 w-full rounded-xl border border-slate-300 p-3" /></label>
            </>}
            <button type="submit" disabled={busy || !validToken} className="w-full rounded-xl bg-emerald-800 text-white font-bold p-3 disabled:opacity-50 cursor-pointer flex justify-center items-center gap-2">
              {busy && <Loader2 className="w-4 h-4 animate-spin" />}{verify ? 'Confirmar mi correo' : 'Guardar nueva contraseña'}
            </button>
          </form>}
          {!done && <button onClick={onClose} className="w-full text-emerald-800 font-semibold cursor-pointer">Volver a iniciar sesión</button>}
        </div>
      </div>
    </div>
  );
}
