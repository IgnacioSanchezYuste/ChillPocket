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

type DataState = {
  // Categories
  categories: Category[];
  categoriesLoading: boolean;
  fetchCategories: () => Promise<void>;

  // Transactions
  transactions: Transaction[];
  transactionsLoading: boolean;
  fetchTransactions: (filter?: Parameters<typeof transactionsApi.list>[0]) => Promise<void>;

  // Recurring
  recurring: Recurring[];
  recurringProjection: RecurringResponse['projection'] | null;
  recurringLoading: boolean;
  fetchRecurring: () => Promise<void>;

  // Goals
  goals: SavingsGoal[];
  goalsLoading: boolean;
  fetchGoals: () => Promise<void>;

  // Budgets
  budgets: Budget[];
  budgetsMonth: string;
  budgetsLoading: boolean;
  fetchBudgets: (month?: string) => Promise<void>;

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
  fetchAnalytics: (month?: string) => Promise<void>;

  // Cross-cutting
  refreshAll: () => Promise<void>;
  reset: () => void;
};

const empty = {
  categories: [],
  transactions: [],
  recurring: [],
  recurringProjection: null,
  goals: [],
  budgets: [],
  budgetsMonth: currentMonthYear(),
  summary: null,
  monthly: [],
  categoryStats: [],
  categoryComparison: [],
  paymentMethodStats: [],
  trends: [],
  projection: null,
  analyticsMonth: currentMonthYear(),
};

export const useDataStore = create<DataState>((set, get) => ({
  ...empty,
  categoriesLoading: false,
  transactionsLoading: false,
  recurringLoading: false,
  goalsLoading: false,
  budgetsLoading: false,
  analyticsLoading: false,

  fetchCategories: async () => {
    set({ categoriesLoading: true });
    try {
      const categories = await categoriesApi.list();
      set({ categories });
    } finally {
      set({ categoriesLoading: false });
    }
  },

  fetchTransactions: async (filter) => {
    set({ transactionsLoading: true });
    try {
      const transactions = await transactionsApi.list(filter ?? { limit: 100 });
      set({ transactions });
    } finally {
      set({ transactionsLoading: false });
    }
  },

  fetchRecurring: async () => {
    set({ recurringLoading: true });
    try {
      const res = await recurringApi.list();
      set({ recurring: res.recurring, recurringProjection: res.projection });
    } finally {
      set({ recurringLoading: false });
    }
  },

  fetchGoals: async () => {
    set({ goalsLoading: true });
    try {
      const goals = await goalsApi.list();
      set({ goals });
    } finally {
      set({ goalsLoading: false });
    }
  },

  fetchBudgets: async (month) => {
    const m = month ?? get().budgetsMonth;
    set({ budgetsLoading: true, budgetsMonth: m });
    try {
      const budgets = await budgetsApi.list(m);
      set({ budgets });
    } finally {
      set({ budgetsLoading: false });
    }
  },

  fetchAnalytics: async (month) => {
    const m = month ?? get().analyticsMonth ?? currentMonthYear();
    set({ analyticsLoading: true, analyticsMonth: m });
    try {
      const [summary, monthly, categoriesRes, comparison, paymentMethodStats, trends, projection] =
        await Promise.all([
          analyticsApi.summary(m),
          analyticsApi.monthly(6),
          analyticsApi.categories(m),
          analyticsApi.categoryComparison(6),
          analyticsApi.paymentMethods(m),
          analyticsApi.trends(30),
          analyticsApi.projection(),
        ]);
      set({
        summary,
        monthly,
        categoryStats: categoriesRes.categories,
        categoryComparison: comparison,
        paymentMethodStats,
        trends,
        projection,
      });
    } finally {
      set({ analyticsLoading: false });
    }
  },

  refreshAll: async () => {
    await Promise.all([
      get().fetchCategories(),
      get().fetchTransactions(),
      get().fetchRecurring(),
      get().fetchGoals(),
      get().fetchAnalytics(),
      get().fetchBudgets(),
    ]);
  },

  reset: () => set({ ...empty }),
}));
