import { useEffect, useState } from 'react';
import { createNavigationContainerRef, CommonActions } from '@react-navigation/native';

export const navigationRef = createNavigationContainerRef();

/** Navega a una pestaña concreta dentro del Tab navigator. */
export function navigateToTab(tab: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(
    CommonActions.navigate({ name: 'Tabs', params: { screen: tab } })
  );
}

/** Navega a una ruta del stack raíz (Budgets, Investments, Settings...). */
export function navigateToRoute(route: string) {
  if (!navigationRef.isReady()) return;
  navigationRef.dispatch(CommonActions.navigate({ name: route }));
}

/**
 * Nombre de la ruta activa más profunda (p.ej. 'Home' en tabs, 'Budgets' en
 * stack). Reactivo: se actualiza al navegar. Lo usa el sidebar para marcar el
 * item activo sin estar dentro de un navigator.
 */
export function useActiveRouteName(): string | undefined {
  const [name, setName] = useState<string | undefined>(undefined);
  useEffect(() => {
    let unsub: (() => void) | undefined;
    const attach = () => {
      if (!navigationRef.isReady()) {
        const t = setTimeout(attach, 50);
        return () => clearTimeout(t);
      }
      const update = () => setName(navigationRef.getCurrentRoute()?.name);
      update();
      unsub = navigationRef.addListener('state', update);
      return undefined;
    };
    const cleanup = attach();
    return () => {
      unsub?.();
      cleanup?.();
    };
  }, []);
  return name;
}
