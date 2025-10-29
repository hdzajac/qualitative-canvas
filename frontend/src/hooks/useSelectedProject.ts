import { useCallback, useEffect, useState } from 'react';

const KEY = 'selectedProjectId';
const EVENT = 'selected-project-changed' as const;

export function useSelectedProject(): [string | undefined, (id: string | undefined) => void] {
  const [id, setId] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const v = window.localStorage.getItem(KEY);
    return v || undefined;
  });

  // Sync updates across components, tabs, and after navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const sync = () => {
      const v = window.localStorage.getItem(KEY);
      setId(v || undefined);
    };
    window.addEventListener('storage', sync);
    window.addEventListener(EVENT, sync as unknown as EventListener);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener(EVENT, sync as unknown as EventListener);
    };
  }, []);

  const set = useCallback((next: string | undefined) => {
    setId(next);
    if (typeof window !== 'undefined') {
      if (next) window.localStorage.setItem(KEY, next);
      else window.localStorage.removeItem(KEY);
      // Immediately notify other hook instances in this tab
      window.dispatchEvent(new Event(EVENT));
    }
  }, []);

  return [id, set];
}
