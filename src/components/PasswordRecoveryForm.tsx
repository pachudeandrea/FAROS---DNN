import React, { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { apiRequest } from '../utils/apiClient';

export function PasswordRecoveryForm({ initialEmail, onBack, onComplete }: {
  initialEmail: string;
  onBack: () => void;
  onComplete: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [stage, setStage] = useState<'request' | 'reset' | 'done'>('request');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const emailInput = useRef<HTMLInputElement>(null);
  const normalizedEmail = email.trim().toLowerCase();
  const inputClass = 'mt-1.5 w-full px-4 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-slate-50/50';
  const buttonClass = 'w-full py-3 px-4 rounded-xl bg-emerald-800 hover:bg-emerald-900 text-white font-bold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50';

  useEffect(() => {
    if (!seconds) return;
    const timer = setTimeout(() => setSeconds(seconds - 1), 1000);
    return () => clearTimeout(timer);
  }, [seconds]);

  const sendCode = async () => {
    if (busy) return;
    setBusy(true); setError(null); setMessage(null);
    try {
      const data = await apiRequest('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: normalizedEmail }) });
      if (!data.success) throw new Error('El servidor no confirmó la solicitud.');
      setEmail(normalizedEmail); setCode(''); setMessage(data.message);
      setSeconds(60); setStage('reset');
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo solicitar el código.');
    } finally { setBusy(false); }
  };

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    if (password !== confirmation) return setError('Las contraseñas no coinciden.');
    setBusy(true); setError(null);
    try {
      const data = await apiRequest('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: normalizedEmail, code, newPassword: password }) });
      if (!data.success) throw new Error('El servidor no confirmó el cambio de contraseña.');
      setPassword(''); setConfirmation(''); setCode(''); setStage('done'); setMessage(null);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cambiar la contraseña.');
    } finally { setBusy(false); }
  };

  return <div className="space-y-4 text-sm text-slate-700">
    {error && <p role="alert" className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800">{error}</p>}
    {message && <p role="status" className="p-3.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900">{message}</p>}
    {stage === 'done' ? <>
      <p role="status" className="flex gap-2 text-emerald-800"><CheckCircle2 className="w-5 h-5 shrink-0" />Tu contraseña se actualizó. Las sesiones anteriores se cerraron.</p>
      <button type="button" onClick={() => onComplete(normalizedEmail)} className={buttonClass}>Iniciar sesión</button>
    </> : stage === 'request' ? <form onSubmit={event => { event.preventDefault(); void sendCode(); }} className="space-y-4">
      <label className="block text-xs font-bold uppercase tracking-wide">Correo registrado
        <input ref={emailInput} type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className={inputClass} placeholder="inversor@ejemplo.com" />
      </label>
      <button type="submit" disabled={busy} className={buttonClass}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Enviar código</button>
      <button type="button" disabled={busy} onClick={() => {
        if (emailInput.current?.reportValidity()) { setEmail(normalizedEmail); setStage('reset'); setError(null); }
      }} className="w-full text-emerald-800 font-semibold cursor-pointer">Ya tengo un código</button>
      <button type="button" onClick={onBack} className="w-full text-slate-500 font-semibold cursor-pointer">Volver al inicio de sesión</button>
    </form> : <>
      <p className="font-semibold break-words">{normalizedEmail}</p>
      <form onSubmit={resetPassword} className="space-y-4">
        <label className="block font-semibold">Código de 6 dígitos
          <input type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} className={inputClass + ' tracking-[0.4em] text-center text-lg'} placeholder="000000" />
        </label>
        <label className="block font-semibold">Nueva contraseña
          <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} className={inputClass} />
        </label>
        <label className="block font-semibold">Repetir contraseña
          <input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className={inputClass} />
        </label>
        <button type="submit" disabled={busy} className={buttonClass}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Verificar código y cambiar contraseña</button>
      </form>
      <p className="text-xs text-slate-500">El código vence en 10 minutos y admite hasta cinco intentos. Cada reenvío reemplaza el código anterior.</p>
      <button type="button" disabled={busy || seconds > 0} onClick={() => void sendCode()} className="w-full font-semibold text-emerald-800 cursor-pointer disabled:opacity-50">{seconds ? `Reenviar código (${seconds}s)` : 'Reenviar código'}</button>
      <button type="button" disabled={busy} onClick={() => {
        setStage('request'); setCode(''); setPassword(''); setConfirmation(''); setError(null); setMessage(null); setSeconds(0);
      }} className="w-full font-semibold text-slate-500 cursor-pointer">Usar otro correo</button>
      <button type="button" onClick={onBack} className="w-full font-semibold text-slate-500 cursor-pointer">Volver al inicio de sesión</button>
    </>}
  </div>;
}
