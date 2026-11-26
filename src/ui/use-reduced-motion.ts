import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

function matches(): boolean {
  try {
    return globalThis.matchMedia?.(QUERY).matches ?? false;
  } catch {
    return false;
  }
}

/** True while the player's system asks for reduced motion; follows changes live. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(matches);
  useEffect(() => {
    const list = globalThis.matchMedia?.(QUERY);
    if (list === undefined) return;
    const update = (): void => setReduced(list.matches);
    list.addEventListener('change', update);
    return () => list.removeEventListener('change', update);
  }, []);
  return reduced;
}
