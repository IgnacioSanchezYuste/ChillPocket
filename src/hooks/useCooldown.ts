import { useCallback, useEffect, useState } from 'react';

/**
 * Cuenta atrás en segundos (p. ej. para "Reenviar código"). `start()` la
 * reinicia; `remaining` llega a 0 cuando se puede volver a actuar.
 */
export function useCooldown(seconds: number) {
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (remaining <= 0) return;
    const id = setTimeout(() => setRemaining((r) => r - 1), 1000);
    return () => clearTimeout(id);
  }, [remaining]);

  const start = useCallback(() => setRemaining(seconds), [seconds]);
  const reset = useCallback(() => setRemaining(0), []);

  return { remaining, start, reset };
}
