import React, { useState } from 'react';

export function RecoveryKeyFields({ idPrefix, value, confirmation, onChange, onConfirmationChange }: {
  idPrefix: string;
  value: string;
  confirmation: string;
  onChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
}) {
  const [visible, setVisible] = useState(false);
  const inputClass = 'mt-1.5 w-full px-3.5 py-2.5 text-sm rounded-xl border border-slate-300 focus:outline-none focus:border-emerald-800 bg-white';
  return <div className="p-4 rounded-2xl bg-emerald-50/60 border border-emerald-200 space-y-3">
    <label htmlFor={`${idPrefix}-key`} className="block text-xs font-bold text-slate-700">Código de recuperación de 4 dígitos
      <input id={`${idPrefix}-key`} name="recoveryKey" type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4}" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={4} maxLength={4} required value={value} onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 4))} className={inputClass} placeholder="4 dígitos" />
    </label>
    <label htmlFor={`${idPrefix}-confirmation`} className="block text-xs font-bold text-slate-700">Repetir código de recuperación
      <input id={`${idPrefix}-confirmation`} type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4}" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={4} maxLength={4} required value={confirmation} onChange={event => onConfirmationChange(event.target.value.replace(/\D/g, '').slice(0, 4))} className={inputClass} />
    </label>
    <button type="button" aria-pressed={visible} onClick={() => setVisible(!visible)} className="text-xs font-semibold text-emerald-800 cursor-pointer">{visible ? 'Ocultar código de recuperación' : 'Mostrar código de recuperación'}</button>
    <p className="text-xs text-emerald-950 leading-relaxed">Elegí un código de 4 dígitos y guardalo en un lugar seguro. Lo vas a necesitar para recuperar tu cuenta si olvidás la contraseña.</p>
  </div>;
}
