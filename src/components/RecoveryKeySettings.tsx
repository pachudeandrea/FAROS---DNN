import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import type { UserAccount } from '../types';
import { apiRequest } from '../utils/apiClient';
import { getRecoveryKeyError } from '../utils/recoveryKey';
import { RecoveryKeyFields } from './RecoveryKeyFields';

export function RecoveryKeySettings({ user, onSaved }: { user: UserAccount; onSaved: (user: UserAccount) => void }) {
  const [editing, setEditing] = useState(false);
  const [currentPassword, setCurrentPassword] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const clearSecrets = () => { setCurrentPassword(''); setRecoveryKey(''); setConfirmation(''); };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (busy) return;
    const invalid = getRecoveryKeyError(recoveryKey, currentPassword);
    if (invalid) return setError(invalid);
    if (recoveryKey !== confirmation) return setError('Las claves de recuperación no coinciden.');
    setBusy(true); setError(null); setMessage(null);
    try {
      const data = await apiRequest('/api/auth/recovery-key', { method: 'PUT', body: JSON.stringify({ currentPassword, recoveryKey }) });
      if (!data.success || !data.user?.hasRecoveryKey) throw new Error('El servidor no confirmó la clave de recuperación.');
      onSaved(data.user); clearSecrets(); setEditing(false); setMessage(data.message);
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudo guardar la clave de recuperación.'); }
    finally { setBusy(false); }
  };

  return <div className="p-4 rounded-2xl border border-slate-200 space-y-3 text-sm text-slate-700">
    <h4 className="font-bold text-emerald-950">Recuperación de cuenta</h4>
    <p className="text-xs">{user.hasRecoveryKey ? 'Tenés una clave de recuperación configurada. Podés reemplazarla con tu contraseña actual.' : 'Configurá tu clave de recuperación para poder volver a entrar si olvidás la contraseña.'}</p>
    {error && <p role="alert" className="p-3 rounded-xl bg-rose-50 text-rose-800 text-xs">{error}</p>}
    {message && <p role="status" className="p-3 rounded-xl bg-emerald-50 text-emerald-900 text-xs">{message}</p>}
    {editing ? <form onSubmit={save} className="space-y-3">
      <label className="block text-xs font-bold">Contraseña actual
        <input type="password" autoComplete="current-password" required value={currentPassword} onChange={event => setCurrentPassword(event.target.value)} className="mt-1.5 w-full p-3 rounded-xl border border-slate-300" />
      </label>
      <RecoveryKeyFields idPrefix="account-recovery" value={recoveryKey} confirmation={confirmation} onChange={setRecoveryKey} onConfirmationChange={setConfirmation} />
      <button type="submit" disabled={busy} className="w-full p-3 rounded-xl bg-emerald-800 text-white font-bold text-xs flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50">{busy && <Loader2 className="w-4 h-4 animate-spin" />}Guardar clave de recuperación</button>
      <button type="button" disabled={busy} onClick={() => { clearSecrets(); setEditing(false); setError(null); }} className="w-full text-xs font-semibold text-slate-500 cursor-pointer">Cancelar</button>
    </form> : <button type="button" onClick={() => { setEditing(true); setError(null); setMessage(null); }} className="px-4 py-2 rounded-xl bg-emerald-800 text-white text-xs font-bold cursor-pointer">{user.hasRecoveryKey ? 'Cambiar clave de recuperación' : 'Crear clave de recuperación'}</button>}
  </div>;
}
