import { http, API_URL } from './http';
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
    /** Fase 4: 'month' (default) afecta al saldo del mes, 'historical' a "Mis ahorros". */
    scope?: 'month' | 'historical';
  }) =>
    http
      .post<{ success: true; transaction: Transaction }>('/transactions', data)
      .then((r) => r.data.transaction),
  update: (id: number, data: Partial<Transaction>) =>
    http.put(`/transactions/${id}`, data).then((r) => r.data),
  remove: (id: number) => http.delete(`/transactions/${id}`).then((r) => r.data),
  /** Exporta las transacciones del usuario como CSV (texto crudo).
   *  Backend devuelve text/csv con BOM UTF-8; el caller decide cómo entregarlo
   *  (Blob+download en web, Share en nativo). Si el plan no incluye `export`,
   *  el backend responde 403 plan_limit_reached y el interceptor abre Paywall. */
  exportCsv: (filter?: { from?: string; to?: string }) =>
    http
      .get<string>('/transactions/export', {
        params: { format: 'csv', ...(filter ?? {}) },
        responseType: 'text',
        transformResponse: [(d) => d], // evita que axios intente JSON.parse el CSV
      })
      .then((r) => r.data),

  // -------- RECIBOS (Ola 2) --------

  /**
   * Sube (o reemplaza) la foto del justificante de una transacción.
   * Gate Plus/Lifetime: el backend devuelve 403 si el plan no lo permite.
   * El campo multipart debe llamarse `receipt`.
   * IMPORTANTE: NO forzamos `application/json`; dejamos que el navegador/RN
   * ponga el boundary correcto del multipart. Axios no añadirá JSON Content-Type
   * si le pasamos FormData.
   */
  uploadReceipt: (id: number, form: FormData): Promise<{ success: boolean; receipt_url: string }> =>
    http
      .post<{ success: boolean; receipt_url: string }>(`/transactions/${id}/receipt`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data),

  /**
   * Elimina la foto de justificante de una transacción.
   * El backend borra el archivo físico y pone receipt_path = NULL en BDD.
   */
  deleteReceipt: (id: number): Promise<void> =>
    http.delete(`/transactions/${id}/receipt`).then(() => undefined),

  /**
   * Construye la URL absoluta del endpoint de stream privado del recibo.
   * NO hace fetch — sólo devuelve la URL para usarla en AuthImage.
   * El token JWT se añade en la cabecera Authorization en AuthImage,
   * porque el backend requiere autenticación para servir la imagen.
   */
  getReceiptUrl: (id: number): string =>
    `${API_URL}/transactions/${id}/receipt`,
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
  /**
   * Aporta (amount > 0) o retira (amount < 0) de una meta.
   * `scope` (Fase 4): contra qué pool valida el saldo (aporte) o a qué pool
   * va el dinero (retirada). Default 'month'.
   */
  contribute: (id: number, amount: number, scope?: 'month' | 'historical') =>
    http.post<GoalContributeResponse>(`/savings-goals/${id}/contribute`,
      scope ? { amount, scope } : { amount }
    ).then((r) => r.data),
  remove: (id: number) => http.delete(`/savings-goals/${id}`).then((r) => r.data),
};

// -------- BUDGETS --------
export const budgetsApi = {
  list: (month_year: string) =>
    http
      .get<{ budgets: Budget[]; month_year: string }>('/budgets', { params: { month_year } })
      .then((r) => r.data.budgets),
  upsert: (data: { amount: number; month_year: string; category_id?: number | null; reset_day?: number; auto_renew?: boolean | 0 | 1 }) =>
    http.post('/budgets', data).then((r) => r.data),
  update: (id: number, data: { amount?: number; reset_day?: number; auto_renew?: boolean | 0 | 1 }) =>
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
