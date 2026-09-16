import type { Recurring } from '../api/types';

/**
 * Lógica pura del periodo financiero y de los gastos fijos pendientes.
 * Sin dependencias de React Native para poder testearla (ver __tests__).
 */

/**
 * Calcula el siguiente periodo a partir del actual, respetando el payday del
 * usuario (LAST_DAY normaliza si el mes destino no tiene ese día). Espejo del
 * `nextPeriodStart` del backend.
 */
export function nextPeriodStartFrom(periodStart: string, payday: number | null): Date {
  const dt = new Date(`${periodStart}T00:00:00`);
  const year = dt.getFullYear();
  const month = dt.getMonth(); // 0-11
  let nextMonth = month + 1;
  let nextYear = year;
  if (nextMonth > 11) {
    nextMonth = 0;
    nextYear += 1;
  }
  if (payday === null || payday < 1 || payday > 31) {
    return new Date(nextYear, nextMonth, 1);
  }
  const lastDay = new Date(nextYear, nextMonth + 1, 0).getDate();
  const day = Math.min(payday, lastDay);
  return new Date(nextYear, nextMonth, day);
}

export function daysBetween(from: Date, to: Date): number {
  const dayMs = 86400000;
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / dayMs);
}

/**
 * k-ésima fecha de cobro de un recurrente, preservando el día ancla del
 * `start_date` cuando el mes destino es más corto (espejo de `addMonthSafely`
 * y `nextRecurringDate` del backend). k=0 es el propio start_date.
 */
export function nthRecurringDate(start: Date, frequency: Recurring['frequency'], k: number): Date {
  if (frequency === 'weekly') {
    const d = new Date(start);
    d.setDate(d.getDate() + 7 * k);
    return d;
  }
  if (frequency === 'yearly') {
    const year = start.getFullYear() + k;
    const lastDay = new Date(year, start.getMonth() + 1, 0).getDate();
    return new Date(year, start.getMonth(), Math.min(start.getDate(), lastDay));
  }
  // monthly (default)
  const totalMonth = start.getMonth() + k;
  const year = start.getFullYear() + Math.floor(totalMonth / 12);
  const month = ((totalMonth % 12) + 12) % 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  return new Date(year, month, Math.min(start.getDate(), lastDay));
}

/** Índice de cobro próximo a `from` para no iterar desde el origen del recurrente. */
function recurringStartIndex(start: Date, frequency: Recurring['frequency'], from: Date): number {
  if (frequency === 'weekly') {
    const weeks = Math.floor((from.getTime() - start.getTime()) / (7 * 86400000));
    return Math.max(0, weeks - 1);
  }
  if (frequency === 'yearly') {
    return Math.max(0, from.getFullYear() - start.getFullYear() - 1);
  }
  const months = (from.getFullYear() - start.getFullYear()) * 12 + (from.getMonth() - start.getMonth());
  return Math.max(0, months - 1);
}

type RecurringCharge = Pick<Recurring, 'is_active' | 'type' | 'start_date' | 'end_date' | 'amount' | 'frequency'>;

/**
 * Suma de los cargos de gastos fijos (recurrentes tipo expense) que se cobrarán
 * en la ventana (from, to): aún NO materializados como transacción (el backend
 * solo expande hasta hoy) y por tanto no descontados del saldo. Reservarlos
 * mantiene el presupuesto diario estable cuando llega el cargo.
 */
export function pendingRecurringExpense(recurring: RecurringCharge[], from: Date, to: Date): number {
  let total = 0;
  for (const r of recurring) {
    if (!r.is_active || r.type !== 'expense') continue;
    const start = new Date(`${r.start_date}T00:00:00`);
    if (Number.isNaN(start.getTime())) continue;
    const end = r.end_date ? new Date(`${r.end_date}T00:00:00`) : null;
    const amount = Number(r.amount) || 0;
    if (amount <= 0) continue;
    let k = recurringStartIndex(start, r.frequency, from);
    for (let i = 0; i < 120; i++, k++) {
      const occ = nthRecurringDate(start, r.frequency, k);
      if (occ >= to) break;            // futuras fuera de la ventana
      if (end && occ > end) break;     // recurrente ya terminado
      if (occ > from) total += amount; // pendiente dentro de la ventana
    }
  }
  return total;
}
