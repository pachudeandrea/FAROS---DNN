type SessionSource = 'registration' | 'login' | 'restore';
type OnboardingStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const pendingKey = (userId: string) => `faros_welcome_onboarding_pending:${userId}`;

function sessionStorageOrUndefined(): OnboardingStorage | undefined {
  try { return window.sessionStorage; } catch { return undefined; }
}

// Only signup starts onboarding. A reload may resume that same pending welcome;
// signing in to an existing account never starts or resumes it.
export function prepareWelcomeOnboarding(userId: string, source: SessionSource, storage = sessionStorageOrUndefined()): boolean {
  try {
    if (source === 'registration') storage?.setItem(pendingKey(userId), 'true');
    else if (source === 'restore') return storage?.getItem(pendingKey(userId)) === 'true';
    else storage?.removeItem(pendingKey(userId));
  } catch {}
  return source === 'registration';
}

export function completeWelcomeOnboarding(userId: string, storage = sessionStorageOrUndefined()) {
  try { storage?.removeItem(pendingKey(userId)); } catch {}
}
