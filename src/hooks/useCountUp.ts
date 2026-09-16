import { useEffect, useRef, useState } from 'react';

/**
 * Hook que anima un número desde su valor previo hasta `target` usando
 * requestAnimationFrame. Se eligió esta estrategia (en lugar de reanimated)
 * porque actualiza state de React y permite pasar el número directamente
 * a cualquier <Text> sin wrappers de Reanimated, lo que garantiza
 * compatibilidad total con react-native-web.
 *
 * - En mount: anima desde 0 hasta target.
 * - En cambio de target: anima desde el último valor mostrado hasta el nuevo.
 * - Si el usuario cambia target mientras la animación va a mitad, el
 *   rAF anterior se cancela limpiamente y arranca uno nuevo.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const [displayed, setDisplayed] = useState(0);

  // Guardamos el valor actual en un ref para que el nuevo rAF
  // arranque desde donde quedó, no desde 0.
  const currentRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    // Cancelar animación previa para evitar acumulación.
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }

    const from = currentRef.current;
    const to = target;
    const delta = to - from;

    // Si no hay diferencia, no animar.
    if (Math.abs(delta) < 0.005) {
      currentRef.current = to;
      setDisplayed(to);
      return;
    }

    const startTime = performance.now();

    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / durationMs, 1);
      // Ease-out cúbico: deceleración suave al final.
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = from + delta * eased;

      currentRef.current = value;
      setDisplayed(value);

      if (progress < 1) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        // Asegurar valor exacto al finalizar.
        currentRef.current = to;
        setDisplayed(to);
        rafRef.current = null;
      }
    };

    rafRef.current = requestAnimationFrame(step);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [target, durationMs]);

  return displayed;
}
