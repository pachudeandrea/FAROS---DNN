import { useEffect, useRef } from 'react';
export function useModalFocus(onClose: () => void, active = true) {
  const ref = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    if (!active) return;
    const previous = document.activeElement as HTMLElement | null;
    const root = ref.current;
    if (!root) return;
    const controls = () => [...root.querySelectorAll<HTMLElement>('button:not(:disabled), a[href], input:not(:disabled), select, textarea, [tabindex="0"]')].filter(el => el.getClientRects().length);
    (controls()[0] || root).focus();
    function key(event: KeyboardEvent) {
      if (event.key === 'Escape') { event.preventDefault(); close.current(); }
      if (event.key !== 'Tab') return;
      const list = controls(); const first = list[0]; const last = list[list.length - 1];
      if (!first) { event.preventDefault(); root?.focus(); return; }
      if (event.shiftKey && (document.activeElement === first || !root?.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && (document.activeElement === last || !root?.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
    }
    root.addEventListener('keydown', key);
    return () => { root.removeEventListener('keydown', key); previous?.focus(); };
  }, [active]);
  return ref;
}
