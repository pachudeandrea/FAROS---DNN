import assert from 'node:assert/strict';
import test from 'node:test';
import { prepareWelcomeOnboarding, completeWelcomeOnboarding } from '../src/utils/welcomeOnboarding.ts';

function memoryStorage() {
  const entries = new Map<string, string>();
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
    removeItem: (key: string) => { entries.delete(key); },
  };
}

test('una cuenta nueva ve onboarding y una recarga lo conserva hasta decidir', () => {
  const storage = memoryStorage();
  assert.equal(prepareWelcomeOnboarding('new-account', 'registration', storage), true);
  assert.equal(prepareWelcomeOnboarding('new-account', 'restore', storage), true);
  assert.equal(prepareWelcomeOnboarding('other-account', 'restore', storage), false);
  completeWelcomeOnboarding('new-account', storage);
  assert.equal(prepareWelcomeOnboarding('new-account', 'restore', storage), false);
});

test('iniciar sesión en una cuenta existente nunca inicia onboarding, incluso con marca pendiente', () => {
  const storage = memoryStorage();
  assert.equal(prepareWelcomeOnboarding('existing-account', 'login', storage), false);
  prepareWelcomeOnboarding('existing-account', 'registration', storage);
  assert.equal(prepareWelcomeOnboarding('existing-account', 'login', storage), false);
  assert.equal(prepareWelcomeOnboarding('existing-account', 'restore', storage), false);
});

test('el alta muestra onboarding aunque el navegador bloquee el almacenamiento', () => {
  const storage = {
    getItem: () => { throw new Error('Storage blocked'); },
    setItem: () => { throw new Error('Storage blocked'); },
    removeItem: () => { throw new Error('Storage blocked'); },
  };
  assert.equal(prepareWelcomeOnboarding('new-account', 'registration', storage), true);
  assert.equal(prepareWelcomeOnboarding('new-account', 'restore', storage), false);
  assert.equal(prepareWelcomeOnboarding('new-account', 'login', storage), false);
  assert.doesNotThrow(() => completeWelcomeOnboarding('new-account', storage));
});
