import { useEffect, useId } from 'react';
const pending = new Set<string>();
export const hasPendingChanges = () => pending.size > 0;
export function usePendingChanges(active: boolean) {
  const id = useId();
  useEffect(() => {
    if (!active) return;
    pending.add(id);
    const beforeUnload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', beforeUnload);
    return () => { pending.delete(id); window.removeEventListener('beforeunload', beforeUnload); };
  }, [active, id]);
}
