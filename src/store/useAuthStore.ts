import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { authApi } from '../api/endpoints';
import { TOKEN_KEY } from '../api/http';
import { clearGoogleSession } from '../utils/googleSession';
import { useOnboardingStore } from './useOnboardingStore';
import { useDataStore } from './useDataStore';
import { identifyPurchases, signOutPurchases } from '../billing/purchases';
import type { User } from '../api/types';

const USER_KEY = '@finanzas:user';

type AuthState = {
  user: User | null;
  token: string | null;
  loading: boolean;
  bootstrapped: boolean;
  bootstrap: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  loginWithGoogle: (idToken: string) => Promise<void>;
  register: (data: { name: string; email: string; password: string; currency?: string }) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
  setUser: (user: User | null | undefined) => void;
};

// Parsea JSON tolerando valores legacy corruptos en storage
// ("undefined", "null", string vacío...).
function safeParseUser(raw: string | null): User | null {
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  try {
    const u = JSON.parse(raw);
    return u && typeof u === 'object' ? (u as User) : null;
  } catch {
    return null;
  }
}

async function clearAuthStorage() {
  try {
    await AsyncStorage.multiRemove([TOKEN_KEY, USER_KEY]);
  } catch {
    /* ignorar */
  }
}

// Lanza un error con detalle de qué viene mal, para depurar despliegues
// con backend antiguo o respuestas contaminadas con HTML/warnings PHP.
function assertAuthResponse(res: any, label: 'login' | 'register'): asserts res is { token: string; user: User } {
  if (res == null) {
    console.error(`[auth/${label}] respuesta vacía`, res);
    throw new Error('El servidor no devolvió datos');
  }
  if (typeof res !== 'object') {
    console.error(`[auth/${label}] respuesta no-JSON`, res);
    throw new Error('La respuesta no es JSON. Revisa logs del servidor (PHP warnings o HTML colándose)');
  }
  if (!res.token || typeof res.token !== 'string') {
    console.error(`[auth/${label}] respuesta sin token`, res);
    throw new Error('Falta "token" en la respuesta. Sube el index.php nuevo al servidor');
  }
  if (!res.user || typeof res.user !== 'object') {
    console.error(`[auth/${label}] respuesta sin user`, res);
    throw new Error('Falta "user" en la respuesta. Sube el index.php nuevo al servidor');
  }
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  token: null,
  loading: false,
  bootstrapped: false,

  bootstrap: async () => {
    try {
      const [token, userJson] = await Promise.all([
        AsyncStorage.getItem(TOKEN_KEY),
        AsyncStorage.getItem(USER_KEY),
      ]);
      const cachedUser = safeParseUser(userJson);

      if (!token) {
        // Sin token útil: limpia por si quedó basura
        if (userJson && !cachedUser) await clearAuthStorage();
        return;
      }

      // Pinta UI con el user en cache mientras refrescamos en background
      if (cachedUser) {
        set({ token, user: cachedUser });
        identifyPurchases(cachedUser.id).catch(() => {});
      }

      try {
        const fresh = await authApi.me();
        if (fresh) {
          set({ token, user: fresh });
          identifyPurchases(fresh.id).catch(() => {});
          await AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
        } else {
          // El backend respondió pero sin datos válidos: trata como inválido
          await clearAuthStorage();
          set({ token: null, user: null });
        }
      } catch {
        // Token inválido/expirado o red caída.
        // Si NO había user en cache, no podemos seguir → forzamos logout.
        // Si SÍ había user en cache, conservamos sesión (queda online cuando vuelva la red).
        if (!cachedUser) {
          await clearAuthStorage();
          set({ token: null, user: null });
        }
      }
    } finally {
      set({ bootstrapped: true });
    }
  },

  login: async (email, password) => {
    set({ loading: true });
    try {
      const res = await authApi.login({ email, password });
      assertAuthResponse(res, 'login');
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.user));
      set({ token: res.token, user: res.user });
      identifyPurchases(res.user.id).catch(() => {});
    } finally {
      set({ loading: false });
    }
  },

  register: async (data) => {
    set({ loading: true });
    try {
      const res = await authApi.register(data);
      assertAuthResponse(res, 'register');
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.user));
      set({ token: res.token, user: res.user });
      identifyPurchases(res.user.id).catch(() => {});
    } finally {
      set({ loading: false });
    }
  },

  loginWithGoogle: async (idToken: string) => {
    set({ loading: true });
    try {
      const res = await authApi.google(idToken);
      assertAuthResponse(res, 'login');
      await AsyncStorage.setItem(TOKEN_KEY, res.token);
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(res.user));
      set({ token: res.token, user: res.user });
      identifyPurchases(res.user.id).catch(() => {});
      // Usuario recién creado vía Google → arrancar presentación/onboarding.
      if (res.is_new) {
        useOnboardingStore.getState().start({ name: res.user.name, currency: res.user.currency });
      }
    } finally {
      set({ loading: false });
    }
  },

  logout: async () => {
    await clearGoogleSession();
    await clearAuthStorage();
    // Limpia los datos financieros en memoria para que otro usuario que inicie
    // sesión en el mismo dispositivo no vea nada del anterior.
    try { useDataStore.getState().reset(); } catch { /* noop */ }
    signOutPurchases().catch(() => {});
    set({ token: null, user: null });
  },

  refreshUser: async () => {
    if (!get().token) return;
    try {
      const fresh = await authApi.me();
      if (!fresh) return;
      await AsyncStorage.setItem(USER_KEY, JSON.stringify(fresh));
      set({ user: fresh });
    } catch {
      /* dejamos el user cacheado */
    }
  },

  setUser: (user) => {
    // Guardia: nunca persistas undefined/null como "undefined"/"null"
    if (!user || typeof user !== 'object') return;
    AsyncStorage.setItem(USER_KEY, JSON.stringify(user)).catch(() => {});
    set({ user });
  },
}));
