import type { Transaction } from '../api/types';

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
