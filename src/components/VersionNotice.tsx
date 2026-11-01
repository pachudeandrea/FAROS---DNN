import React, { useEffect, useState } from 'react';
import { hasPendingChanges } from '../hooks/usePendingChanges';
declare const __FAROS_REVISION__: string;
export function VersionNotice() {
  const [available, setAvailable] = useState(false);
  const [blocked, setBlocked] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    let busy = false;
    async function check() {
      if (busy || document.visibilityState === 'hidden') return;
      busy = true;
      try {
        const response = await fetch('/api/version', { cache: 'no-store', signal: controller.signal });
        if (!response.ok) return;
        const data = await response.json();
        if (/^[a-f0-9]{40}$/i.test(data.revision || '') && __FAROS_REVISION__ && data.revision !== __FAROS_REVISION__) setAvailable(true);
      } catch {} finally { busy = false; }
    }
    check();
    const timer = setInterval(check, 60000);
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', check);
    return () => { controller.abort(); clearInterval(timer); window.removeEventListener('focus', check); document.removeEventListener('visibilitychange', check); };
  }, []);
  if (!available) return null;
  return <aside aria-label="Nueva versión de FAROS" className="bg-brand-50 border-b border-brand-200 p-3">
    <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-2 text-sm text-brand-950">
      <p role="status">Hay una nueva versión de FAROS.{blocked && ' Guardá o cancelá los cambios pendientes antes de actualizar.'}</p>
      <button className="px-4 py-2 rounded-xl bg-brand-950 text-paper font-semibold" onClick={() => {
        if (hasPendingChanges()) return setBlocked(true);
        window.location.reload();
      }}>Actualizar FAROS</button>
    </div>
  </aside>;
}
