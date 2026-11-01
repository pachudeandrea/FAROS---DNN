import { usePendingChanges } from '../hooks/usePendingChanges';
import React, { useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { apiRequest } from '../utils/apiClient';
import { getRecoveryKeyError } from '../utils/recoveryKey';

export function PasswordRecoveryForm({ initialEmail, onBack, onComplete }: {
  initialEmail: string;
  onBack: () => void;
  onComplete: (email: string) => void;
}) {
  const [email, setEmail] = useState(initialEmail);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [useLegacyKey, setUseLegacyKey] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  usePendingChanges(!done && (!!recoveryKey || !!password || !!confirmation || busy));
  const normalizedEmail = email.trim().toLowerCase();
  const inputClass = 'mt-1.5 w-full px-4 py-2.5 text-sm rounded-xl border border-ink-300 focus:outline-none focus:border-brand-800 bg-ink-50/50';
  const buttonClass = 'w-full py-3 px-4 rounded-xl bg-brand-800 hover:bg-brand-900 text-paper font-bold text-sm shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50';

  const resetPassword = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const invalid = getRecoveryKeyError(recoveryKey, password, useLegacyKey);
    if (invalid) return setError(invalid);
    if (password !== confirmation) return setError('Las contraseñas no coinciden.');
    setBusy(true); setError(null);
    try {
      const data = await apiRequest('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ email: normalizedEmail, recoveryKey, newPassword: password }) });
      if (!data.success) throw new Error('El servidor no confirmó el cambio de contraseña.');
      setPassword(''); setConfirmation(''); setRecoveryKey(''); setDone(true);
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'No se pudo cambiar la contraseña.');
    } finally { setBusy(false); }
  };

  return <div className="space-y-4 text-sm text-muted">
    {error && <p role="alert" className="p-3.5 rounded-xl bg-danger-50 border border-danger-200 text-danger-800">{error}</p>}
    {done ? <>
      <p role="status" className="flex gap-2 text-brand-800"><CheckCircle2 className="w-5 h-5 shrink-0" />Tu contraseña se actualizó. Las sesiones anteriores se cerraron.</p>
      <button type="button" onClick={() => onComplete(normalizedEmail)} className={buttonClass}>Iniciar sesión</button>
    </> : <>
      <p className="text-xs">{useLegacyKey ? 'Ingresá la clave de recuperación anterior que guardaste.' : 'Ingresá el código de 4 dígitos que elegiste al registrarte o desde Cuenta y Privacidad.'}</p>
      <form onSubmit={resetPassword} className="space-y-4">
        <label className="block font-semibold">Correo registrado
          <input type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} className={inputClass} placeholder="inversor@ejemplo.com" />
        </label>
        <label className="block font-semibold">{useLegacyKey ? 'Clave de recuperación anterior' : 'Código de recuperación de 4 dígitos'}
          <input type="password" inputMode={useLegacyKey ? undefined : 'numeric'} pattern={useLegacyKey ? undefined : '[0-9]{4}'} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={useLegacyKey ? 12 : 4} maxLength={useLegacyKey ? undefined : 4} required value={recoveryKey} onChange={event => setRecoveryKey(useLegacyKey ? event.target.value : event.target.value.replace(/\D/g, '').slice(0, 4))} className={inputClass} placeholder={useLegacyKey ? 'La clave anterior que guardaste' : '4 dígitos'} />
        </label>
        <label className="block font-semibold">Nueva contraseña
          <input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={event => setPassword(event.target.value)} className={inputClass} />
        </label>
        <label className="block font-semibold">Repetir contraseña
          <input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={event => setConfirmation(event.target.value)} className={inputClass} />
        </label>
        <button type="submit" disabled={busy} className={buttonClass}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}Cambiar contraseña</button>
      </form>
      <p className="text-xs text-muted">Si todavía no configuraste un código de recuperación, podés crearlo desde Cuenta y Privacidad con tu sesión y contraseña actuales.</p>
      <button type="button" onClick={() => { setUseLegacyKey(!useLegacyKey); setRecoveryKey(''); setError(null); }} className="w-full text-xs font-semibold text-brand-800 cursor-pointer">{useLegacyKey ? 'Usar un código de 4 dígitos' : 'Usar una clave de recuperación anterior'}</button>
      <button type="button" onClick={onBack} className="w-full font-semibold text-muted cursor-pointer">Volver al inicio de sesión</button>
    </>}
  </div>;
}
