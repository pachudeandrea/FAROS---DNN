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
    <label htmlFor={`${idPrefix}-key`} className="block text-xs font-bold text-slate-700">Clave de recuperación
      <input id={`${idPrefix}-key`} name="recoveryKey" type={visible ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={12} required value={value} onChange={event => onChange(event.target.value)} className={inputClass} placeholder="Una frase de al menos 12 caracteres" />
    </label>
    <label htmlFor={`${idPrefix}-confirmation`} className="block text-xs font-bold text-slate-700">Repetir clave de recuperación
      <input id={`${idPrefix}-confirmation`} type={visible ? 'text' : 'password'} autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={12} required value={confirmation} onChange={event => onConfirmationChange(event.target.value)} className={inputClass} />
    </label>
    <button type="button" aria-pressed={visible} onClick={() => setVisible(!visible)} className="text-xs font-semibold text-emerald-800 cursor-pointer">{visible ? 'Ocultar clave de recuperación' : 'Mostrar clave de recuperación'}</button>
    <p className="text-xs text-emerald-950 leading-relaxed">Elegí una clave distinta de tu contraseña y guardala en un lugar seguro. La vas a necesitar para recuperar tu cuenta si olvidás la contraseña.</p>
  </div>;
}
