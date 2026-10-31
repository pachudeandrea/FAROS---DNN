export function getRecoveryKeyError(value: unknown, password?: string): string | null {
  if (typeof value !== 'string' || value.length < 12) return 'La clave de recuperación debe tener al menos 12 caracteres.';
  if (new TextEncoder().encode(value).length > 72) return 'La clave de recuperación es demasiado larga. Usá una frase más corta.';
  if (value === password) return 'La clave de recuperación debe ser distinta de tu contraseña.';
  return null;
}
