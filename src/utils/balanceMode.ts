import type { AnalyticsSummary, Transaction } from '../api/types';

export type BalanceMode = 'month' | 'historical';

type Scopeable = Pick<Transaction, 'transaction_date' | 'scope'>;

/**
 * Filtro implícito del modo dual (Fase 3):
 * - `month`: transacciones del periodo financiero en curso (default scope).
 * - `historical`: transacciones de periodos cerrados (anteriores al periodo
 *   actual) o explícitamente marcadas como `scope = 'historical'`.
 *
 * Las fechas se comparan lexicográficamente — válido porque siempre llegan en
 * formato `YYYY-MM-DD[...]`. Si todavía no tenemos `currentPeriodStart`
 * (frontend antiguo + backend nuevo, o backend pre-Fase 2), devolvemos la
 * lista sin filtrar como fallback seguro.
 */
export function filterByBalanceMode<T extends Scopeable>(
  items: T[],
  mode: BalanceMode,
  currentPeriodStart?: string | null,
): T[] {
  if (!currentPeriodStart) return items;
  if (mode === 'month') {
    return items.filter(
      (t) =>
        t.transaction_date >= currentPeriodStart &&
        (t.scope ?? 'month') !== 'historical',
    );
  }
  return items.filter(
    (t) => t.transaction_date < currentPeriodStart || t.scope === 'historical',
  );
}

export type MonthFigures = { income: number; expense: number; balance: number; savingsRatio: number };

type SummaryFigures = Pick<
  AnalyticsSummary,
  'total_income' | 'total_expense' | 'balance' | 'savings_ratio' | 'period_income' | 'period_expense' | 'period_balance'
>;

/**
 * Cifras de "Saldo del mes". En el mes actual son las del periodo financiero en
 * curso (del día de cobro al siguiente, sin lo movido a "Mis ahorros"), que es lo
 * que cuadra con "Mis ahorros" y con lo que valida el servidor al aportar a una
 * meta. Al consultar otro mes, o con un backend sin esos campos, las del mes natural.
 */
export function monthBalanceFigures(summary: SummaryFigures | null | undefined, isCurrentMonth: boolean): MonthFigures {
  if (!summary) return { income: 0, expense: 0, balance: 0, savingsRatio: 0 };
  if (isCurrentMonth && summary.period_balance != null) {
    const income = Number(summary.period_income) || 0;
    const expense = Number(summary.period_expense) || 0;
    const balance = Number(summary.period_balance) || 0;
    const savingsRatio = income > 0 ? Math.round((balance / income) * 10000) / 100 : 0;
    return { income, expense, balance, savingsRatio };
  }
  return {
    income: Number(summary.total_income) || 0,
    expense: Number(summary.total_expense) || 0,
    balance: Number(summary.balance) || 0,
    savingsRatio: Number(summary.savings_ratio) || 0,
  };
}
