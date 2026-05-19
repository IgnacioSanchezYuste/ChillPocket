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
  recurringLoadedAt: number;
  fetchRecurring: (force?: boolean) => Promise<void>;

  // Goals
  goals: SavingsGoal[];
  availableBalance: number;
  goalsLoading: boolean;
  goalsLoadedAt: number;
  fetchGoals: (force?: boolean) => Promise<void>;

  // Budgets
  budgets: Budget[];
  budgetsMonth: string;
  budgetsLoading: boolean;
  budgetsLoadedAt: number;
  fetchBudgets: (month?: string, force?: boolean) => Promise<void>;

  // Analytics
  summary: AnalyticsSummary | null;
  monthly: MonthlyPoint[];
  categoryStats: CategoryStat[];
  categoryComparison: CategoryComparisonRow[];
  paymentMethodStats: PaymentMethodStat[];
  trends: TrendPoint[];
  projection: Projection | null;
  analyticsLoading: boolean;
  analyticsMonth: string;
  analyticsLoadedAt: number;
  fetchAnalytics: (month?: string, force?: boolean) => Promise<void>;

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
  projection: null,
  analyticsMonth: currentMonthYear(),
  analyticsLoadedAt: 0,
};

const fresh = (loadedAt: number, force?: boolean) =>
  !force && loadedAt > 0 && Date.now() - loadedAt < STALE_MS;

export const useDataStore = create<DataState>((set, get) => ({
  ...empty,
  categoriesLoading: false,
  transactionsLoading: false,
  recurringLoading: false,
  goalsLoading: false,
  budgetsLoading: false,
  analyticsLoading: false,

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
    set({ recurringLoading: true });
    try {
      const res = await recurringApi.list();
      set({ recurring: res.recurring, recurringProjection: res.projection, recurringLoadedAt: Date.now() });
    } finally {
      set({ recurringLoading: false });
    }
  },

  fetchGoals: async (force) => {
    if (fresh(get().goalsLoadedAt, force)) return;
    set({ goalsLoading: true });
    try {
      const res = await goalsApi.list();
      set({ goals: res.goals, availableBalance: res.available_balance, goalsLoadedAt: Date.now() });
    } finally {
      set({ goalsLoading: false });
    }
  },

  fetchBudgets: async (month, force) => {
    const m = month ?? get().budgetsMonth;
    if (m === get().budgetsMonth && fresh(get().budgetsLoadedAt, force)) return;
    set({ budgetsLoading: true, budgetsMonth: m });
    try {
      const budgets = await budgetsApi.list(m);
      set({ budgets, budgetsLoadedAt: Date.now() });
    } finally {
      set({ budgetsLoading: false });
    }
  },

  fetchAnalytics: async (month, force) => {
    const m = month ?? get().analyticsMonth ?? currentMonthYear();
    if (m === get().analyticsMonth && fresh(get().analyticsLoadedAt, force)) return;
    set({ analyticsLoading: true, analyticsMonth: m });
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
        projection: bundle.projection,
        analyticsLoadedAt: Date.now(),
      });
    } finally {
      set({ analyticsLoading: false });
    }
  },

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

  reset: () => set({ ...empty }),
}));
