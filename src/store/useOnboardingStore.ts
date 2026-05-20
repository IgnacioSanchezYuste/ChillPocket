import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DONE_KEY = '@chillpocket:onboarding_done_v1';

export type OnboardingPhase =
  | 'welcome'
  | 'personalize'
  | 'createExpense'
  | 'createRecurringExpense'
  | 'createIncome'
  | 'tour'
  | 'success';

export type Rect = { x: number; y: number; width: number; height: number };

export type FinanceGoal = 'save' | 'control' | 'invest' | 'subscriptions' | 'debt';
export type IncomeFrequency = 'monthly' | 'weekly' | 'variable';

export type OnboardingDraft = {
  name: string;
  currency: string;
  goal: FinanceGoal | null;
  incomeFrequency: IncomeFrequency | null;
  theme: 'light' | 'dark' | 'system';
};

// Pasos del tour con spotlight sobre la barra de pestañas (siempre montada).
export const TOUR_STEPS = [
  {
    target: 'tab-Home',
    title: 'Inicio',
    body: 'Tu visión rápida: saldo del mes, balance libre, gráficas y últimos movimientos.',
    icon: 'home' as const,
  },
  {
    target: 'tab-Movimientos',
    title: 'Movimientos',
    body: 'Busca, filtra por categoría y edita cualquier movimiento. Tu historial completo.',
    icon: 'list' as const,
  },
  {
    target: 'tab-Analítica',
    title: 'Analítica',
    body: 'Descubre en qué se va tu dinero: donut por categoría, métodos de pago y forecast mensual.',
    icon: 'pie-chart' as const,
  },
  {
    target: 'tab-Más',
    title: 'Más',
    body: 'Tu hub avanzado: presupuestos, inversiones, gastos fijos, metas de ahorro y ajustes.',
    icon: 'apps' as const,
  },
];

type State = {
  active: boolean;
  phase: OnboardingPhase;
  personalizeStep: number; // 0..4
  tourIndex: number;
  draft: OnboardingDraft;
  targets: Record<string, Rect>;
  /** Qué formulario abrir (lo renderiza OnboardingHost). */
  openSheet: null | 'expense' | 'recExpense' | 'recIncome';

  start: (initial?: Partial<OnboardingDraft>) => void;
  setDraft: (patch: Partial<OnboardingDraft>) => void;
  setPersonalizeStep: (n: number) => void;
  setPhase: (p: OnboardingPhase) => void;
  setTarget: (id: string, rect: Rect) => void;
  setOpenSheet: (s: State['openSheet']) => void;
  nextTour: () => void;
  prevTour: () => void;
  finish: () => Promise<void>;
  /** Marca completado y cierra sin más pasos. */
  skipAll: () => Promise<void>;
  /** Para relanzar desde Ajustes. */
  restart: () => void;
};

const emptyDraft: OnboardingDraft = {
  name: '',
  currency: 'EUR',
  goal: null,
  incomeFrequency: null,
  theme: 'system',
};

export async function isOnboardingDone(): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(DONE_KEY)) === '1';
  } catch {
    return true; // ante error, no molestamos con el tutorial
  }
}

export const useOnboardingStore = create<State>((set, get) => ({
  active: false,
  phase: 'welcome',
  personalizeStep: 0,
  tourIndex: 0,
  draft: emptyDraft,
  targets: {},
  openSheet: null,

  start: (initial) =>
    set({
      active: true,
      phase: 'welcome',
      personalizeStep: 0,
      tourIndex: 0,
      openSheet: null,
      draft: { ...emptyDraft, ...initial },
    }),

  setDraft: (patch) => set({ draft: { ...get().draft, ...patch } }),
  setPersonalizeStep: (n) => set({ personalizeStep: n }),
  setPhase: (p) => set({ phase: p }),
  setTarget: (id, rect) => set({ targets: { ...get().targets, [id]: rect } }),
  setOpenSheet: (s) => set({ openSheet: s }),

  nextTour: () => {
    const next = get().tourIndex + 1;
    if (next >= TOUR_STEPS.length) {
      set({ phase: 'success' });
    } else {
      set({ tourIndex: next });
    }
  },
  prevTour: () => set({ tourIndex: Math.max(0, get().tourIndex - 1) }),

  finish: async () => {
    try {
      await AsyncStorage.setItem(DONE_KEY, '1');
    } catch {
      /* ignore */
    }
    set({ active: false });
  },

  skipAll: async () => {
    try {
      await AsyncStorage.setItem(DONE_KEY, '1');
    } catch {
      /* ignore */
    }
    set({ active: false, openSheet: null });
  },

  restart: () => set({ active: true, phase: 'welcome', personalizeStep: 0, tourIndex: 0, openSheet: null }),
}));
