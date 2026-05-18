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
  category_id: number | null;
  category_name: string | null;
  category_color: string | null;
  category_icon: string | null;
  created_at: string;
  updated_at: string;
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
};

export type MonthlyPoint = { month_year: string; income: number; expense: number };
export type TrendPoint = { transaction_date: string; income: number; expense: number };
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

export type User = {
  id: number;
  name: string;
  email: string;
  currency: string;
  timezone: string;
  avatar_url: string | null;
  theme: 'light' | 'dark' | 'system';
  created_at: string;
};

export type AuthResponse = { success: true; token: string; user: User };
