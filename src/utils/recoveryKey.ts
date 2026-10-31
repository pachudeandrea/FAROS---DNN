export function getRecoveryKeyError(value: unknown, password?: string, allowLegacy = false): string | null {
  // Existing long keys remain usable only when proving recovery ownership.
  // Registration and settings always require a new four-digit code.
  const legacy = allowLegacy && typeof value === 'string' && value.length >= 12 && new TextEncoder().encode(value).length <= 72;
  if (typeof value !== 'string' || (!/^[0-9]{4}$/.test(value) && !legacy)) return 'El código de recuperación debe tener exactamente 4 dígitos.';
  if (value === password) return 'El dato de recuperación debe ser distinto de tu contraseña.';
  return null;
}
