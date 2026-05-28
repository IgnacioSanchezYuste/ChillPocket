import { create } from 'zustand';
import {
  analyticsApi,
  budgetsApi,
  categoriesApi,
  goalsApi,
  recurringApi,
  transactionsApi,
} from '../api/endpoints';
import type {
  AnalyticsSummary,
  Budget,
  Category,
  CategoryComparisonRow,
  CategoryStat,
  DailyPoint,
  MonthlyPoint,
  PaymentMethodStat,
  Projection,
  Recurring,
  RecurringResponse,
  SavingsGoal,
  Transaction,
  TrendPoint,
} from '../api/types';
import { currentMonthYear } from '../utils/format';
import { apiError } from '../api/http';

// Throttle por defecto entre refetches del mismo grupo (ms).
// Evita que cambiar de pestaña dispare 12 peticiones cada vez.
const STALE_MS = 30_000;

type DataState = {
  // Categories
  categories: Category[];
  categoriesLoading: boolean;
  categoriesLoadedAt: number;
  fetchCategories: (force?: boolean) => Promise<void>;

  // Transactions
  transactions: Transaction[];
  transactionsLoading: boolean;
  transactionsLoadedAt: number;
  fetchTransactions: (filter?: Parameters<typeof transactionsApi.list>[0], force?: boolean) => Promise<void>;

  // Recurring
  recurring: Recurring[];
  recurringProjection: RecurringResponse['projection'] | null;
  recurringLoading: boolean;
  recurringError: string | null;
  recurringLoadedAt: number;
  fetchRecurring: (force?: boolean) => Promise<void>;

  // Goals
  goals: SavingsGoal[];
  availableBalance: number;
  goalsLoading: boolean;
  goalsError: string | null;
  goalsLoadedAt: number;
  fetchGoals: (force?: boolean) => Promise<void>;

  // Budgets
  budgets: Budget[];
  budgetsMonth: string;
  budgetsLoading: boolean;
  budgetsError: string | null;
  budgetsLoadedAt: number;
  fetchBudgets: (month?: string, force?: boolean) => Promise<void>;

  // Analytics
  summary: AnalyticsSummary | null;
  monthly: MonthlyPoint[];
  categoryStats: CategoryStat[];
  categoryComparison: CategoryComparisonRow[];
  paymentMethodStats: PaymentMethodStat[];
  trends: TrendPoint[];
  daily: DailyPoint[];
  projection: Projection | null;
  analyticsLoading: boolean;
  analyticsError: string | null;
  analyticsMonth: string;
  analyticsLoadedAt: number;
  fetchAnalytics: (month?: string, force?: boolean) => Promise<void>;

  // Modo dual del BalanceHero / filtros implícitos (Fase 3). Efímero por sesión.
  balanceMode: 'month' | 'historical';
  setBalanceMode: (mode: 'month' | 'historical') => void;

  // Cross-cutting
  refreshAll: (force?: boolean) => Promise<void>;
  reset: () => void;
};

const empty = {
  categories: [],
  categoriesLoadedAt: 0,
  transactions: [],
  transactionsLoadedAt: 0,
  recurring: [],
  recurringProjection: null,
  recurringLoadedAt: 0,
  goals: [],
  availableBalance: 0,
  goalsLoadedAt: 0,
  budgets: [],
  budgetsMonth: currentMonthYear(),
  budgetsLoadedAt: 0,
  summary: null,
  monthly: [],
  categoryStats: [],
  categoryComparison: [],
  paymentMethodStats: [],
  trends: [],
  daily: [],
  projection: null,
  analyticsMonth: currentMonthYear(),
  analyticsLoadedAt: 0,
  balanceMode: 'month' as 'month' | 'historical',
};

const fresh = (loadedAt: number, force?: boolean) =>
  !force && loadedAt > 0 && Date.now() - loadedAt < STALE_MS;

export const useDataStore = create<DataState>((set, get) => ({
  ...empty,
  categoriesLoading: false,
  transactionsLoading: false,
  recurringLoading: false,
  recurringError: null,
  goalsLoading: false,
  goalsError: null,
  budgetsLoading: false,
  budgetsError: null,
  analyticsLoading: false,
  analyticsError: null,

  fetchCategories: async (force) => {
    if (fresh(get().categoriesLoadedAt, force)) return;
    set({ categoriesLoading: true });
    try {
      const categories = await categoriesApi.list();
      set({ categories, categoriesLoadedAt: Date.now() });
    } finally {
      set({ categoriesLoading: false });
    }
  },

  fetchTransactions: async (filter, force) => {
    if (!filter && fresh(get().transactionsLoadedAt, force)) return;
    set({ transactionsLoading: true });
    try {
      const transactions = await transactionsApi.list(filter ?? { limit: 100 });
      set({ transactions, transactionsLoadedAt: Date.now() });
    } finally {
      set({ transactionsLoading: false });
    }
  },

  fetchRecurring: async (force) => {
    if (fresh(get().recurringLoadedAt, force)) return;
    // Solo muestra loading en primera carga (sin datos cacheados), evita parpadeo en refresh.
    const isFirstLoad = get().recurringLoadedAt === 0;
    if (isFirstLoad) set({ recurringLoading: true });
    try {
      const res = await recurringApi.list();
      set({ recurring: res.recurring, recurringProjection: res.projection, recurringLoadedAt: Date.now(), recurringError: null });
    } catch (e) {
      set({ recurringError: apiError(e, 'No se pudo cargar los recurrentes') });
    } finally {
      set({ recurringLoading: false });
    }
  },

  fetchGoals: async (force) => {
    if (fresh(get().goalsLoadedAt, force)) return;
    // Solo muestra loading en primera carga (sin datos cacheados), evita parpadeo en refresh.
    const isFirstLoad = get().goalsLoadedAt === 0;
    if (isFirstLoad) set({ goalsLoading: true });
    try {
      const res = await goalsApi.list();
      set({ goals: res.goals, availableBalance: res.available_balance, goalsLoadedAt: Date.now(), goalsError: null });
    } catch (e) {
      set({ goalsError: apiError(e, 'No se pudo cargar las metas') });
    } finally {
      set({ goalsLoading: false });
    }
  },

  fetchBudgets: async (month, force) => {
    const m = month ?? get().budgetsMonth;
    if (m === get().budgetsMonth && fresh(get().budgetsLoadedAt, force)) return;
    // Solo muestra loading en primera carga (sin datos cacheados), evita parpadeo en refresh.
    const isFirstLoad = get().budgetsLoadedAt === 0;
    if (isFirstLoad) set({ budgetsLoading: true, budgetsMonth: m });
    else set({ budgetsMonth: m });
    try {
      const budgets = await budgetsApi.list(m);
      set({ budgets, budgetsLoadedAt: Date.now(), budgetsError: null });
    } catch (e) {
      set({ budgetsError: apiError(e, 'No se pudo cargar los presupuestos') });
    } finally {
      set({ budgetsLoading: false });
    }
  },

  fetchAnalytics: async (month, force) => {
    const m = month ?? get().analyticsMonth ?? currentMonthYear();
    if (m === get().analyticsMonth && fresh(get().analyticsLoadedAt, force)) return;
    // Solo muestra loading en primera carga (sin datos cacheados), evita parpadeo en refresh.
    const isFirstLoad = get().analyticsLoadedAt === 0;
    if (isFirstLoad) set({ analyticsLoading: true, analyticsMonth: m });
    else set({ analyticsMonth: m });
    try {
      // Una sola petición HTTP para todos los datos de analítica.
      const bundle = await analyticsApi.all({ month_year: m, months: 6, days: 30 });
      set({
        summary: bundle.summary,
        monthly: bundle.monthly,
        categoryStats: bundle.categories,
        categoryComparison: bundle.category_comparison,
        paymentMethodStats: bundle.payment_methods,
        trends: bundle.trends,
        daily: bundle.daily ?? [],
        projection: bundle.projection,
        analyticsLoadedAt: Date.now(),
        analyticsError: null,
      });
    } catch (e) {
      set({ analyticsError: apiError(e, 'No se pudo cargar la analítica') });
    } finally {
      set({ analyticsLoading: false });
    }
  },

  setBalanceMode: (mode) => set({ balanceMode: mode }),

  refreshAll: async (force) => {
    await Promise.all([
      get().fetchCategories(force),
      get().fetchTransactions(undefined, force),
      get().fetchRecurring(force),
      get().fetchGoals(force),
      get().fetchAnalytics(undefined, force),
      get().fetchBudgets(undefined, force),
    ]);
  },

  reset: () =>
    set({
      ...empty,
      categoriesLoading: false,
      transactionsLoading: false,
      recurringLoading: false,
      recurringError: null,
      goalsLoading: false,
      goalsError: null,
      budgetsLoading: false,
      budgetsError: null,
      analyticsLoading: false,
      analyticsError: null,
    }),
}));
