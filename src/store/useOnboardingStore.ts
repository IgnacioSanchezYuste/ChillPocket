import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { transactionsApi, recurringApi } from '../api/endpoints';
import { useDataStore } from './useDataStore';

const DONE_KEY = '@chillpocket:onboarding_done_v1';
// Clave separada para los IDs demo: sobrevive crasheos entre creación y borrado.
const DEMO_IDS_KEY = '@chillpocket:onboarding_demo_ids';

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
  /** Salario mensual (o equivalente mensual si semanal). null si variable. */
  incomeAmount: number | null;
  /**
   * Día de cobro:
   * - mensual: 1-31 (31 = fin de mes)
   * - semanal: 0-6 (0 = domingo)
   * - variable: null
   */
  incomePayday: number | null;
  /** Objetivo de ahorro mensual. null si no declarado. */
  savingsGoalMonthly: number | null;
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
  personalizeStep: number; // 0..5 (ahora 6 sub-pasos, 0-5)
  tourIndex: number;
  draft: OnboardingDraft;
  targets: Record<string, Rect>;
  /** Qué formulario abrir (lo renderiza OnboardingHost). */
  openSheet: null | 'expense' | 'recExpense' | 'recIncome';
  /** IDs de transacciones demo creadas durante el tuto. Persiste en AsyncStorage. */
  demoTransactionIds: number[];
  /** IDs de recurrentes demo creados durante el tuto. Persiste en AsyncStorage. */
  demoRecurringIds: number[];
  /**
   * Flag para el replay del tuto: si hay datos reales al hacer restart(),
   * los pasos de creación se omiten para no duplicar datos.
   */
  skipCreationPhases: boolean;

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
  /** Registra el ID de una transacción demo creada durante el tuto. */
  addDemoTransactionId: (id: number) => void;
  /** Registra el ID de un recurrente demo creado durante el tuto. */
  addDemoRecurringId: (id: number) => void;
  /** Limpia los arrays de IDs demo (tras borrarlos del servidor). */
  clearDemoIds: () => void;
  /**
   * Borra las entidades demo del servidor iterando los IDs guardados.
   * Un 404 se ignora (ya borrada). Al final, UNA sola llamada a refreshAll.
   * No lanza: los errores se tragan para no interrumpir el flujo.
   */
  deleteDemoData: () => Promise<void>;
  /**
   * Hidrata demoTransactionIds / demoRecurringIds desde AsyncStorage.
   * Llamar en el bootstrap de la app.
   */
  hydrateDemoIds: () => Promise<void>;
};

/** Parseo tolerante a basura en AsyncStorage (mismo patrón que safeParseUser). */
function safeParseDemoIds(raw: string | null): { transactionIds: number[]; recurringIds: number[] } {
  const empty = { transactionIds: [], recurringIds: [] };
  if (!raw || raw === 'undefined' || raw === 'null') return empty;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return empty;
    return {
      transactionIds: Array.isArray(parsed.transactionIds) ? parsed.transactionIds.filter((x: unknown) => typeof x === 'number') : [],
      recurringIds: Array.isArray(parsed.recurringIds) ? parsed.recurringIds.filter((x: unknown) => typeof x === 'number') : [],
    };
  } catch {
    return empty;
  }
}

async function persistDemoIds(transactionIds: number[], recurringIds: number[]) {
  try {
    await AsyncStorage.setItem(DEMO_IDS_KEY, JSON.stringify({ transactionIds, recurringIds }));
  } catch {
    /* storage no disponible: los IDs quedan en memoria hasta el borrado */
  }
}

const emptyDraft: OnboardingDraft = {
  name: '',
  currency: 'EUR',
  goal: null,
  incomeFrequency: null,
  incomeAmount: null,
  incomePayday: null,
  savingsGoalMonthly: null,
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
  demoTransactionIds: [],
  demoRecurringIds: [],
  skipCreationPhases: false,

  start: (initial) =>
    set({
      active: true,
      phase: 'welcome',
      personalizeStep: 0,
      tourIndex: 0,
      openSheet: null,
      skipCreationPhases: false,
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

  addDemoTransactionId: (id) => {
    const next = [...get().demoTransactionIds, id];
    set({ demoTransactionIds: next });
    persistDemoIds(next, get().demoRecurringIds);
  },

  addDemoRecurringId: (id) => {
    const next = [...get().demoRecurringIds, id];
    set({ demoRecurringIds: next });
    persistDemoIds(get().demoTransactionIds, next);
  },

  clearDemoIds: () => {
    set({ demoTransactionIds: [], demoRecurringIds: [] });
    AsyncStorage.removeItem(DEMO_IDS_KEY).catch(() => {});
  },

  deleteDemoData: async () => {
    const { demoTransactionIds, demoRecurringIds, clearDemoIds } = get();

    // Al crear un recurrente, el backend materializa una transacción (fecha de
    // hoy) ligada por recurring_id. El FK es ON DELETE SET NULL, así que borrar
    // el recurrente NO la elimina (quedaría como gasto suelto, p.ej. el Netflix
    // del tuto). Identificamos esas transacciones generadas ANTES de borrar
    // nada: tras borrar el recurrente, su recurring_id pasa a NULL y ya no se
    // podrían casar.
    let generatedTxIds: number[] = [];
    if (demoRecurringIds.length > 0) {
      try {
        await useDataStore.getState().fetchTransactions(undefined, true);
      } catch {
        /* sin red: se reintenta en el próximo arranque */
      }
      generatedTxIds = useDataStore
        .getState()
        .transactions.filter((t) => t.recurring_id != null && demoRecurringIds.includes(t.recurring_id))
        .map((t) => t.id);
    }

    // Borrar los recurrentes demo PRIMERO. Si borráramos sus transacciones
    // antes, el middleware del backend (expandRecurringTransactions corre en
    // CADA request autenticada) las regeneraría al ver el recurrente sin
    // transacciones. Con el recurrente ya borrado, no se regenera nada.
    for (const id of demoRecurringIds) {
      try {
        await recurringApi.remove(id);
      } catch {
        // 404 u otro error: ignorar
      }
    }

    // Borrar transacciones: las generadas por los recurrentes (ya huérfanas) +
    // las demo sueltas (la del paso createExpense). Set para no repetir borrados.
    const txToDelete = Array.from(new Set([...generatedTxIds, ...demoTransactionIds]));
    for (const id of txToDelete) {
      try {
        await transactionsApi.remove(id);
      } catch {
        // 404 u otro error: ignorar para no interrumpir el flujo
      }
    }

    // Una sola llamada a refreshAll tras borrar todo.
    if (demoTransactionIds.length > 0 || demoRecurringIds.length > 0) {
      try {
        await useDataStore.getState().refreshAll(true);
      } catch {
        /* sin red: los datos se recargarán en el próximo arranque */
      }
    }
    clearDemoIds();
  },

  finish: async () => {
    // Borrar demo data ANTES de marcar done.
    await get().deleteDemoData();
    try {
      await AsyncStorage.setItem(DONE_KEY, '1');
    } catch {
      /* ignore */
    }
    set({ active: false });
  },

  skipAll: async () => {
    // Borrar demo data ANTES de marcar done.
    await get().deleteDemoData();
    try {
      await AsyncStorage.setItem(DONE_KEY, '1');
    } catch {
      /* ignore */
    }
    set({ active: false, openSheet: null });
  },

  restart: () => {
    // Si hay datos reales, omitir las fases de creación para no duplicarlos.
    const { transactions, recurring } = useDataStore.getState();
    const hasRealData = transactions.length > 0 || recurring.length > 0;
    set({
      active: true,
      phase: 'welcome',
      personalizeStep: 0,
      tourIndex: 0,
      openSheet: null,
      skipCreationPhases: hasRealData,
    });
  },

  hydrateDemoIds: async () => {
    try {
      const raw = await AsyncStorage.getItem(DEMO_IDS_KEY);
      const { transactionIds, recurringIds } = safeParseDemoIds(raw);
      set({ demoTransactionIds: transactionIds, demoRecurringIds: recurringIds });
    } catch {
      /* basura en storage: ignoramos, los arrays quedan vacíos */
    }
  },
}));
