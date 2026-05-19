import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { CategoryType, PaymentMethod } from '../api/types';

const STORAGE_KEY = '@finanzas:prefs';

/**
 * Preferencias del cliente persistidas en disco. NO sustituye al store
 * de datos: aquí solo guardamos elecciones del usuario que conviene
 * recordar entre sesiones (última categoría usada, último método de pago,
 * etc.). Se cargan en el bootstrap de la app.
 */
type Prefs = {
  lastCategoryId: Record<CategoryType, number | null>;
  lastPaymentMethod: PaymentMethod | null;
};

const defaults: Prefs = {
  lastCategoryId: { expense: null, income: null },
  lastPaymentMethod: null,
};

type State = Prefs & {
  hydrated: boolean;
  hydrate: () => Promise<void>;
  setLastCategory: (type: CategoryType, id: number | null) => void;
  setLastPaymentMethod: (pm: PaymentMethod | null) => void;
};

async function persist(snapshot: Prefs) {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    /* sin red/permisos: no rompemos UX */
  }
}

export const usePreferencesStore = create<State>((set, get) => ({
  ...defaults,
  hydrated: false,

  hydrate: async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw && raw !== 'undefined' && raw !== 'null') {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          set({
            lastCategoryId: { ...defaults.lastCategoryId, ...(parsed.lastCategoryId || {}) },
            lastPaymentMethod: parsed.lastPaymentMethod ?? null,
          });
        }
      }
    } catch {
      /* basura en storage: ignoramos */
    } finally {
      set({ hydrated: true });
    }
  },

  setLastCategory: (type, id) => {
    const next = { ...get().lastCategoryId, [type]: id };
    set({ lastCategoryId: next });
    persist({ lastCategoryId: next, lastPaymentMethod: get().lastPaymentMethod });
  },

  setLastPaymentMethod: (pm) => {
    set({ lastPaymentMethod: pm });
    persist({ lastCategoryId: get().lastCategoryId, lastPaymentMethod: pm });
  },
}));
