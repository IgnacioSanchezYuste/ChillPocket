import { useCallback, useRef } from 'react';
import type { View } from 'react-native';
import { useOnboardingStore } from '../store/useOnboardingStore';

/**
 * Registra un elemento como objetivo de "spotlight" del onboarding.
 * Devuelve un ref y un onLayout que miden la posición en ventana y la
 * guardan en el store. Es no-op a efectos visuales si el onboarding no
 * está activo (solo guarda coordenadas, muy barato).
 *
 * Uso:
 *   const sp = useSpotlightTarget('fab');
 *   <Pressable ref={sp.ref} onLayout={sp.onLayout} ... />
 */
export function useSpotlightTarget(id: string) {
  const ref = useRef<View>(null);
  const setTarget = useOnboardingStore((s) => s.setTarget);

  const measure = useCallback(() => {
    const node = ref.current;
    if (!node || typeof node.measureInWindow !== 'function') return;
    // requestAnimationFrame: asegura que el layout ya está pintado.
    requestAnimationFrame(() => {
      node.measureInWindow((x, y, width, height) => {
        if (width > 0 && height > 0) setTarget(id, { x, y, width, height });
      });
    });
  }, [id, setTarget]);

  return { ref, onLayout: measure, remeasure: measure };
}
