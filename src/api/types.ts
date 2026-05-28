export type CategoryType = 'expense' | 'income';

export type PaymentMethod =
  | 'cash'
  | 'debit_card'
  | 'credit_card'
  | 'bizum'
  | 'transfer'
  | 'other';

export type Category = {
  id: number;
  name: string;
  color: string;
  icon: string | null;
  type: CategoryType;
  created_at: string;
};

export type Transaction = {
  id: number;
  amount: number;
  description: string;
  type: CategoryType;
  transaction_date: string;
  notes: string | null;
  payment_method: PaymentMethod | null;
  recurring_id: number | null;
  goal_id: number | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  created_at: string;
  updated_at: string;
  /** Fase 2: determina si la transacción afecta al saldo del mes o a "Mis ahorros". */
  scope?: 'month' | 'historical';
  /** Recibos (Ola 2): ruta del justificante en el servidor; null si no se ha adjuntado foto. */
  receipt_path?: string | null;
};

export type Recurring = {
  id: number;
  name: string;
  amount: number;
  type: CategoryType;
  frequency: 'weekly' | 'monthly' | 'yearly';
  start_date: string;
  end_date: string | null;
  is_active: 0 | 1;
  notes: string | null;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
};

export type RecurringResponse = {
  recurring: Recurring[];
  projection: {
    monthly_expense: number;
    monthly_income: number;
    yearly_expense: number;
    yearly_income: number;
  };
};

export type SavingsGoal = {
  id: number;
  name: string;
  target_amount: number;
  current_amount: number;
  target_date: string | null;
  description: string | null;
  color: string;
  icon: string | null;
  is_completed: 0 | 1;
  progress_pct: number;
  days_remaining: number | null;
};

export type Budget = {
  id: number;
  amount: number;
  month_year: string;
  reset_day: number;
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  spent: number;
  auto_renew?: 0 | 1 | boolean;
};

/**
 * Stats de la meta de ahorro mensual del usuario (Ola 2).
 * Se añade a `AnalyticsSummary.savings_goal_stats` en `/analytics/all`.
 * Puede llegar `null` entero si el backend falla o el usuario no tiene cierres
 * → trátalo siempre como opcional en la UI.
 */
export type SavingsGoalStats = {
  /** Objetivo mensual en divisa del usuario; null si no tiene meta configurada. */
  goal: number | null;
  /** Meses en los que surplus >= goal (y goal > 0). null si no aplica. */
  months_met: number | null;
  /** Meses en los que surplus > goal. null si no aplica. */
  months_exceeded: number | null;
  /** Meses consecutivos recientes cumpliendo la meta. null si no aplica. */
  current_streak: number | null;
  /** Mejor racha histórica. null si no aplica. */
  best_streak: number | null;
  /** Suma de todos los surplus (incluye negativos). null si no hay cierres. */
  total_saved: number | null;
  /** Media mensual del surplus. null si no hay cierres. */
  avg_monthly_surplus: number | null;
  /** Porcentaje de meses en los que se cumplió la meta. null si no aplica. */
  pct_months_met: number | null;
  /** Serie cronológica de cierres mensuales. */
  series: Array<{
    period_start: string;
    surplus: number;
    goal: number | null;
    met: boolean | null;
  }>;
};

export type AnalyticsSummary = {
  month_year: string;
  total_income: number;
  total_expense: number;
  balance: number;
  savings_ratio: number;
  total_transactions: number;
  net_total_historical: number;
  total_saved_in_goals: number;
  recurring_monthly: { expense: number; income: number; net: number };
  previous: { total_income: number; total_expense: number };
  /** Suma neta de movimientos de metas en el mes: aportes - retiradas. */
  saved_this_month: number;
  /** Fase 2: inicio del periodo financiero actual ('YYYY-MM-DD'). Opcional para no romper el frontend de Fase 1. */
  current_period_start?: string;
  /** Ola 2: estadísticas de la meta de ahorro mensual. Puede ser null si el backend falla. */
  savings_goal_stats?: SavingsGoalStats | null;
};

export type MonthlyPoint = { month_year: string; income: number; expense: number };
export type TrendPoint = { transaction_date: string; income: number; expense: number };
export type DailyPoint = {
  transaction_date: string;
  day: number;
  income: number;
  expense: number;
};
export type CategoryStat = {
  category_id: number | null;
  category_name: string;
  category_color: string;
  category_icon: string | null;
  type: CategoryType;
  total: number;
  count: number;
};
export type CategoryComparisonRow = {
  month_year: string;
  category_id: number | null;
  category_name: string;
  category_color: string;
  total: number;
};
export type PaymentMethodStat = {
  payment_method: PaymentMethod | 'other';
  total: number;
  count: number;
};
export type Projection = {
  avg_monthly_income: number;
  avg_monthly_expense: number;
  recurring_monthly_in: number;
  recurring_monthly_out: number;
  projected_monthly_net: number;
  projected_6_months: number;
  projected_12_months: number;
};

export type PlanCode = 'free' | 'plus' | 'family' | 'pro_freelance';

export type PlanLimits = Partial<{
  budgets: number | null;
  goals: number | null;
  recurring: number | null;
  custom_categories: number | null;
  history_months: number | null;
  family_members: number | null;
}>;

export type PlanFeatures = Partial<{
  advanced_analytics: boolean;
  export: boolean;
  web_access: boolean;
  cloud_backup: boolean;
  family_mode: boolean;
  fiscal_reports: boolean;
  /** Ola 2: adjuntar fotos de justificante a transacciones. Disponible en Plus + Lifetime. */
  receipt_photos: boolean;
}>;

export type User = {
  id: number;
  name: string;
  email: string;
  currency: string;
  timezone: string;
  avatar_url: string | null;
  theme: 'light' | 'dark' | 'system';
  created_at: string;
  // Billing (Fase 1: el backend siempre lo adjunta; existe por compatibilidad).
  plan_code?: PlanCode;
  plan_name?: string;
  plan_source?: string | null;
  plan_expires_at?: string | null;
  limits?: PlanLimits;
  features?: PlanFeatures;
  is_premium?: boolean;
  is_web_allowed?: boolean;
};

export type AuthResponse = { success: true; token: string; user: User; is_new?: boolean };
