import React, { useRef, useState } from 'react';

export interface RecoveryKeyFieldError {
  field: 'key' | 'confirmation';
  message: string;
}

export function RecoveryKeyFields({ idPrefix, value, confirmation, onChange, onConfirmationChange, error }: {
  idPrefix: string;
  value: string;
  confirmation: string;
  onChange: (value: string) => void;
  onConfirmationChange: (value: string) => void;
  error?: RecoveryKeyFieldError | null;
}) {
  const [visible, setVisible] = useState(false);
  const keyRef = useRef<HTMLInputElement>(null);
  const confirmationRef = useRef<HTMLInputElement>(null);
  const inputClass = 'mt-1.5 w-full px-3.5 py-2.5 text-sm rounded-xl border border-ink-300 focus:outline-none focus:border-brand-800 bg-paper';
  return <div className="p-4 rounded-2xl bg-brand-50/60 border border-brand-200 space-y-3">
    <div>
      <label htmlFor={`${idPrefix}-key`} className="block text-xs font-bold text-muted">Código de recuperación de 4 dígitos</label>
      <input ref={keyRef} id={`${idPrefix}-key`} name="recoveryKey" type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4}" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={4} maxLength={4} required value={value} onChange={event => onChange(event.target.value.replace(/\D/g, '').slice(0, 4))} aria-invalid={error?.field === 'key' || undefined} aria-describedby={`${idPrefix}-hint${error?.field === 'key' ? ` ${idPrefix}-error` : ''}`} className={inputClass} placeholder="4 dígitos" />
      {error?.field === 'key' && <p id={`${idPrefix}-error`} role="alert" className="mt-1 text-xs font-semibold text-danger-900">{error.message}</p>}
    </div>
    <div>
      <label htmlFor={`${idPrefix}-confirmation`} className="block text-xs font-bold text-muted">Repetir código de recuperación</label>
      <input ref={confirmationRef} id={`${idPrefix}-confirmation`} name="confirmRecoveryKey" type={visible ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{4}" autoComplete="off" autoCapitalize="none" autoCorrect="off" spellCheck={false} minLength={4} maxLength={4} required value={confirmation} onChange={event => onConfirmationChange(event.target.value.replace(/\D/g, '').slice(0, 4))} aria-invalid={error?.field === 'confirmation' || undefined} aria-describedby={`${idPrefix}-hint${error?.field === 'confirmation' ? ` ${idPrefix}-error` : ''}`} className={inputClass} />
      {error?.field === 'confirmation' && <p id={`${idPrefix}-error`} role="alert" className="mt-1 text-xs font-semibold text-danger-900">{error.message}</p>}
    </div>
    <button type="button" aria-pressed={visible} onClick={() => {
      // Autofill can update the DOM without firing React's change event.
      onChange(keyRef.current?.value ?? value);
      onConfirmationChange(confirmationRef.current?.value ?? confirmation);
      setVisible(!visible);
    }} className="text-xs font-semibold text-brand-800 cursor-pointer">{visible ? 'Ocultar código de recuperación' : 'Mostrar código de recuperación'}</button>
    <p id={`${idPrefix}-hint`} className="text-xs text-brand-950 leading-relaxed">Ingresá el mismo código en los dos campos. Guardalo en un lugar seguro: lo vas a necesitar para recuperar tu cuenta si olvidás la contraseña.</p>
  </div>;
}
