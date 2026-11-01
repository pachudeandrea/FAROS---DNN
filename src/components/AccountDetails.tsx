import React, { useState } from 'react';
import type { UserAccount } from '../types';
import { apiRequest } from '../utils/apiClient';
import { usePendingChanges } from '../hooks/usePendingChanges';
export function AccountDetails({ user, onSaved }: { user: UserAccount; onSaved?: (user: UserAccount) => void }) {
  const [broker, setBroker] = useState(user.alyc || '');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  usePendingChanges(broker !== (user.alyc || '') || busy);
  return <form className="space-y-3 rounded-xl border border-ink-200 p-4" onSubmit={async event => {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const data = await apiRequest('/api/auth/user', { method: 'PUT', body: JSON.stringify({ alyc: broker.trim() }) });
      if (!data.user) throw new Error('No se confirmó el guardado.');
      setBroker(data.user.alyc || ''); onSaved?.(data.user); setMessage('Datos guardados en tu cuenta.');
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'No se pudieron guardar los datos.'); }
    finally { setBusy(false); }
  }}>
    <label className="block text-sm font-semibold text-ink-800">Tu ALyC / broker (opcional)<input value={broker} onChange={event => setBroker(event.target.value)} maxLength={200} autoComplete="organization" className="mt-2 w-full rounded-xl border border-ink-300 p-3 text-base" /></label>
    <p className="text-sm text-muted">Podés completar este dato cuando quieras. Tu perfil y tus intereses están en Preferencias.</p>
    {error && <p role="alert" className="text-danger-800 text-sm">{error}</p>}{message && <p role="status" className="text-brand-800 text-sm">{message}</p>}
    <div className="flex flex-wrap gap-2"><button disabled={busy || broker === (user.alyc || '')} className="px-4 py-2 bg-brand-950 text-paper rounded-xl text-sm disabled:opacity-50">{busy ? 'Guardando…' : 'Guardar datos opcionales'}</button><button type="button" disabled={busy} className="px-4 py-2 text-muted rounded-xl text-sm" onClick={() => { setBroker(user.alyc || ''); setError(''); }}>Cancelar cambios</button></div>
  </form>;
}
