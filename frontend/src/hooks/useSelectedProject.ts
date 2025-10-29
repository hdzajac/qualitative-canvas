import { useCallback, useEffect, useState } from 'react';

const KEY = 'selectedProjectId';

export function useSelectedProject(): [string | undefined, (id: string | undefined) => void] {
  const [id, setId] = useState<string | undefined>(() => {
    if (typeof window === 'undefined') return undefined;
    const v = window.localStorage.getItem(KEY);
    return v || undefined;
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (id) window.localStorage.setItem(KEY, id);
    else window.localStorage.removeItem(KEY);
  }, [id]);

  const set = useCallback((next: string | undefined) => setId(next), []);
  return [id, set];
}
