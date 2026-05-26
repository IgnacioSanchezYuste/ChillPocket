import { http } from './http';
import type {
  AuthResponse,
  Budget,
  Category,
  CategoryStat,
  CategoryComparisonRow,
  AnalyticsSummary,
  DailyPoint,
  MonthlyPoint,
  PaymentMethod,
  PaymentMethodStat,
  Projection,
  Recurring,
  RecurringResponse,
  SavingsGoal,
  Transaction,
  TrendPoint,
  User,
} from './types';

// -------- AUTH --------
export const authApi = {
  register: (data: { name: string; email: string; password: string; currency?: string }) =>
    http.post<AuthResponse>('/auth/register', data).then((r) => r.data),
  login: (data: { email: string; password: string }) =>
    http.post<AuthResponse>('/auth/login', data).then((r) => r.data),
  me: () => http.get<{ user: User }>('/me').then((r) => r.data.user),
  updateMe: (data: Partial<Pick<User, 'name' | 'currency' | 'timezone' | 'theme' | 'avatar_url'>>) =>
    http.put<{ success: true; user: User }>('/me', data).then((r) => r.data.user),
  changePassword: (current_password: string, new_password: string) =>
    http.put('/me/password', { current_password, new_password }).then((r) => r.data),
  /** Intercambia un id_token de Google por nuestro JWT + user. */
  google: (id_token: string) =>
    http.post<AuthResponse>('/auth/google', { id_token }).then((r) => r.data),
};

// -------- CATEGORIES --------
export const categoriesApi = {
  list: (type?: 'expense' | 'income') =>
    http
      .get<{ categories: Category[] }>('/categories', { params: type ? { type } : {} })
      .then((r) => r.data.categories),
  create: (data: { name: string; type: 'expense' | 'income'; color?: string; icon?: string }) =>
    http.post<{ success: true; category: Category }>('/categories', data).then((r) => r.data.category),
  update: (id: number, data: Partial<Category>) =>
    http.put(`/categories/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/categories/${id}`).then((r) => r.data),
};

// -------- TRANSACTIONS --------
export type TransactionFilter = {
  from?: string;
  to?: string;
  type?: 'expense' | 'income';
  category_id?: number;
  payment_method?: PaymentMethod;
  /** Importe mínimo inclusive. */
  amount_min?: number;
  /** Importe máximo inclusive. */
  amount_max?: number;
  search?: string;
  limit?: number;
  offset?: number;
};

export const transactionsApi = {
  list: (filter: TransactionFilter = {}) =>
    http
      .get<{ transactions: Transaction[] }>('/transactions', { params: filter })
      .then((r) => r.data.transactions),
  create: (data: {
    amount: number;
    description: string;
    type: 'expense' | 'income';
    transaction_date: string;
    category_id?: number | null;
    payment_method?: PaymentMethod | null;
    notes?: string | null;
  }) =>
    http
      .post<{ success: true; transaction: Transaction }>('/transactions', data)
      .then((r) => r.data.transaction),
  update: (id: number, data: Partial<Transaction>) =>
    http.put(`/transactions/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/transactions/${id}`).then((r) => r.data),
};

// -------- RECURRING --------
export const recurringApi = {
  list: () => http.get<RecurringResponse>('/recurring').then((r) => r.data),
  create: (data: Partial<Recurring> & { name: string; amount: number; frequency: string; start_date: string }) =>
    http.post('/recurring', data).then((r) => r.data),
  update: (id: number, data: Partial<Recurring>) =>
    http.put(`/recurring/${id}`, data).then((r) => r.data),
  // Algunos proxys (mod_security en hostings compartidos) bloquean PATCH
  // sin un OPTIONS válido. Si falla, reintentamos con POST al mismo path,
  // que el backend acepta como alias.
  toggle: (id: number) =>
    http
      .patch(`/recurring/${id}/toggle`)
      .catch(() => http.post(`/recurring/${id}/toggle`))
      .then((r) => r.data),
  remove: (id: number) => http.delete(`/recurring/${id}`).then((r) => r.data),
  run: () => http.post('/recurring/run').then((r) => r.data),
};

// -------- GOALS --------
export type GoalsListResponse = {
  goals: SavingsGoal[];
  available_balance: number;
};

export type GoalContributeResponse = {
  success: true;
  goal: { id: number; current_amount: number; target_amount: number };
  available_balance: number;
};

export const goalsApi = {
  list: () => http.get<GoalsListResponse>('/savings-goals').then((r) => r.data),
  create: (data: Partial<SavingsGoal> & { name: string; target_amount: number }) =>
    http.post('/savings-goals', data).then((r) => r.data),
  update: (id: number, data: Partial<SavingsGoal>) =>
    http.put(`/savings-goals/${id}`, data).then((r) => r.data),
  contribute: (id: number, amount: number) =>
    http.post<GoalContributeResponse>(`/savings-goals/${id}/contribute`, { amount }).then((r) => r.data),
  remove: (id: number) => http.delete(`/savings-goals/${id}`).then((r) => r.data),
};

// -------- BUDGETS --------
export const budgetsApi = {
  list: (month_year: string) =>
    http
      .get<{ budgets: Budget[]; month_year: string }>('/budgets', { params: { month_year } })
      .then((r) => r.data.budgets),
  upsert: (data: { amount: number; month_year: string; category_id?: number | null; reset_day?: number }) =>
    http.post('/budgets', data).then((r) => r.data),
  update: (id: number, data: { amount?: number; reset_day?: number }) =>
    http.put(`/budgets/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/budgets/${id}`).then((r) => r.data),
};

// -------- ANALYTICS --------
export type AnalyticsBundle = {
  summary: AnalyticsSummary;
  monthly: MonthlyPoint[];
  categories: CategoryStat[];
  category_comparison: CategoryComparisonRow[];
  payment_methods: PaymentMethodStat[];
  trends: TrendPoint[];
  projection: Projection;
  daily: DailyPoint[];
};

export const analyticsApi = {
  // Combinado: 1 petición HTTP en vez de 7. Ahorra muchísimas conexiones MySQL
  // en hostings con cuota como Hostinger (500 conex/hora).
  all: (params?: { month_year?: string; months?: number; days?: number }) =>
    http.get<AnalyticsBundle>('/analytics/all', { params: params ?? {} }).then((r) => r.data),

  // Endpoints individuales (los mantenemos por compatibilidad / casos puntuales).
  summary: (month_year?: string) =>
    http
      .get<AnalyticsSummary>('/analytics/summary', { params: month_year ? { month_year } : {} })
      .then((r) => r.data),
  monthly: (months = 6) =>
    http
      .get<{ monthly: MonthlyPoint[] }>('/analytics/monthly', { params: { months } })
      .then((r) => r.data.monthly),
  categories: (month_year?: string) =>
    http
      .get<{ month_year: string; categories: CategoryStat[] }>('/analytics/categories', {
        params: month_year ? { month_year } : {},
      })
      .then((r) => r.data),
  categoryComparison: (months = 6) =>
    http
      .get<{ rows: CategoryComparisonRow[] }>('/analytics/category-comparison', { params: { months } })
      .then((r) => r.data.rows),
  paymentMethods: (month_year?: string) =>
    http
      .get<{ payment_methods: PaymentMethodStat[] }>('/analytics/payment-methods', {
        params: month_year ? { month_year } : {},
      })
      .then((r) => r.data.payment_methods),
  trends: (days = 30) =>
    http
      .get<{ trends: TrendPoint[] }>('/analytics/trends', { params: { days } })
      .then((r) => r.data.trends),
  projection: () => http.get<Projection>('/analytics/projection').then((r) => r.data),
};
