import { useEffect } from 'react';
import { authApi } from '../api/endpoints';
import { useAuthStore } from '../store/useAuthStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { useDataStore } from '../store/useDataStore';
import { reconcileLocalProfile, serverFinancialProfile } from '../utils/financialPeriod';

// Una subida por usuario y arranque: nunca genera ráfagas de peticiones.
const uploadAttempted = new Set<number>();

/**
 * Mantiene alineado el perfil financiero (ingreso, día de cobro, objetivo)
 * entre el dispositivo y el servidor, que es quien manda:
 * - Antes el tutorial solo lo guardaba en el dispositivo. Si el servidor no
 *   tiene nada y el dispositivo sí, lo sube (1 petición, una vez por arranque).
 * - En cualquier otro caso, cada vez que cambia `user` se ajusta el perfil local
 *   al del servidor (dispositivo nuevo, cambios hechos en otro dispositivo…).
 *   Esto no hace peticiones.
 */
export function useFinancialProfileSync() {
  const user = useAuthStore((s) => s.user);
  const prefsHydrated = usePreferencesStore((s) => s.hydrated);

  useEffect(() => {
    if (!user || !prefsHydrated) return;
    // Un backend sin la migración no devuelve estos campos: no hay dónde guardar.
    if (!('income_payday' in user)) return;

    const prefs = usePreferencesStore.getState();
    const serverEmpty =
      user.income_reference == null && user.income_payday == null && user.savings_goal_monthly == null;
    const localHasData = prefs.incomeAmount != null || prefs.savingsGoalMonthly != null;

    if (serverEmpty && localHasData) {
      if (uploadAttempted.has(user.id)) return; // si falló, se reintenta en el próximo arranque
      uploadAttempted.add(user.id);
      authApi
        .updateMe(serverFinancialProfile(prefs))
        .then((updated) => {
          useAuthStore.getState().setUser(updated);
          // El periodo del saldo puede cambiar con el día de cobro.
          useDataStore.getState().refreshAll(true);
        })
        .catch(() => {});
      return;
    }

    const next = reconcileLocalProfile(prefs, user);
    if (next) prefs.setProfilePrefs(next);
  }, [user, prefsHydrated]);
}
