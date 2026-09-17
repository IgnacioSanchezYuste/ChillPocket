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

/**
 * Inicio del periodo financiero que contiene `today` (espejo de
 * `currentPeriodStart` del backend): el día de cobro de este mes si ya ha
 * llegado; si no, el del mes anterior. Sin día de cobro, el día 1.
 */
export function currentPeriodStartFor(payday: number | null, today: Date = new Date()): Date {
  const y = today.getFullYear();
  const m = today.getMonth();
  if (payday === null || payday < 1 || payday > 31) return new Date(y, m, 1);
  const inMonth = (year: number, month: number) =>
    new Date(year, month, Math.min(payday, new Date(year, month + 1, 0).getDate()));
  const thisMonth = inMonth(y, m);
  return today.getDate() >= thisMonth.getDate() ? thisMonth : inMonth(y, m - 1);
}

/** Días que dura el periodo financiero que contiene `today` (28-31). */
export function periodLengthDays(payday: number | null, today: Date = new Date()): number {
  const start = currentPeriodStartFor(payday, today);
  const iso = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
  return daysBetween(start, nextPeriodStartFrom(iso, payday));
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

const WEEKS_PER_MONTH = 4.345;

export type IncomeProfile = {
  /** 'monthly' | 'weekly' | 'variable' (o null si no se completó el onboarding). */
  incomeFrequency: string | null;
  /** Importe tal cual lo declara el usuario: semanal si la frecuencia es semanal. */
  incomeAmount: number | null;
  /** Mensual: día 1-31 (31 = fin de mes). Semanal: día de la semana 0-6 (0 = domingo). */
  incomePayday: number | null;
  savingsGoalMonthly: number | null;
};

/** Ingreso en equivalente mensual (semanal × 4,345). */
export function monthlyIncome(frequency: string | null, amount: number | null): number | null {
  if (amount === null || !Number.isFinite(amount)) return null;
  return frequency === 'weekly' ? Math.round(amount * WEEKS_PER_MONTH * 100) / 100 : amount;
}

/**
 * Día de cobro que define el periodo financiero. Solo existe para cobros
 * mensuales: con cobro semanal o variable el saldo se reinicia con el mes natural
 * (decisión cerrada en DualBalance). Nunca devuelve un día de la semana.
 */
export function periodPayday(frequency: string | null, payday: number | null): number | null {
  if (frequency !== 'monthly' || payday === null) return null;
  return payday >= 1 && payday <= 31 ? payday : null;
}

/** Perfil financiero en el formato que guarda el servidor (`PUT /me`). */
export function serverFinancialProfile(p: IncomeProfile): {
  income_reference: number | null;
  income_payday: number | null;
  savings_goal_monthly: number | null;
} {
  return {
    // Con ingreso variable no hay importe de referencia (aunque quede uno en el borrador).
    income_reference: p.incomeFrequency === 'variable' ? null : monthlyIncome(p.incomeFrequency, p.incomeAmount),
    income_payday: periodPayday(p.incomeFrequency, p.incomePayday),
    savings_goal_monthly: p.savingsGoalMonthly,
  };
}

export type ServerFinancialProfile = {
  income_reference?: number | null;
  income_payday?: number | null;
  savings_goal_monthly?: number | null;
};

/** Cobrar el día 1 equivale a ir por meses naturales (mismo periodo y mismos cierres). */
const samePeriodPayday = (a: number | null, b: number | null) => (a === 1 ? null : a) === (b === 1 ? null : b);

/**
 * El equivalente mensual de un cobro semanal y el que guarda el servidor pueden
 * diferir en céntimos tras un cambio de moneda (el servidor redondea el mensual y
 * el dispositivo el semanal). Con esta holgura se sigue considerando el mismo.
 */
const sameWeeklyIncome = (mine: number | null, remote: number | null) =>
  mine !== null && remote !== null && Math.abs(mine - remote) <= Math.max(0.5, Math.abs(remote) * 0.002);

/**
 * Perfil local alineado con el del servidor (que manda), o null si ya coinciden
 * o si el servidor aún no tiene nada (eso lo resuelve la subida inicial).
 * Conserva la representación semanal mientras siga cuadrando con el servidor.
 */
export function reconcileLocalProfile(local: IncomeProfile, server: ServerFinancialProfile): IncomeProfile | null {
  const remote = {
    income_reference: server.income_reference ?? null,
    income_payday: server.income_payday ?? null,
    savings_goal_monthly: server.savings_goal_monthly ?? null,
  };
  if (remote.income_reference === null && remote.income_payday === null && remote.savings_goal_monthly === null) {
    return null;
  }
  const mine = serverFinancialProfile(local);
  if (
    mine.income_reference === remote.income_reference &&
    samePeriodPayday(mine.income_payday, remote.income_payday) &&
    mine.savings_goal_monthly === remote.savings_goal_monthly
  ) {
    return null;
  }
  if (
    local.incomeFrequency === 'weekly' &&
    remote.income_payday === null &&
    sameWeeklyIncome(mine.income_reference, remote.income_reference)
  ) {
    if (mine.savings_goal_monthly === remote.savings_goal_monthly) return null;
    return { ...local, savingsGoalMonthly: remote.savings_goal_monthly };
  }
  if (remote.income_reference === null) {
    return { incomeFrequency: 'variable', incomeAmount: null, incomePayday: null, savingsGoalMonthly: remote.savings_goal_monthly };
  }
  return {
    incomeFrequency: 'monthly',
    incomeAmount: remote.income_reference,
    incomePayday: remote.income_payday ?? 1,
    savingsGoalMonthly: remote.savings_goal_monthly,
  };
}

/**
 * Perfil local tras cambiar la moneda de la cuenta (`POST /me/currency`), que ya
 * ha convertido el del servidor con `rate`. El ingreso mensual se toma del
 * servidor (mismo redondeo); el semanal se convierte aquí para no perder la
 * frecuencia (`reconcileLocalProfile` tolera la diferencia de céntimos).
 */
export function convertLocalProfile(
  local: IncomeProfile,
  rate: number,
  server: ServerFinancialProfile,
): Pick<IncomeProfile, 'incomeAmount' | 'savingsGoalMonthly'> {
  const scale = (v: number | null) =>
    v === null || !Number.isFinite(v) || !Number.isFinite(rate) ? v : Math.round(v * rate * 100) / 100;
  return {
    incomeAmount:
      local.incomeFrequency === 'monthly' && server.income_reference != null
        ? server.income_reference
        : scale(local.incomeAmount),
    savingsGoalMonthly: server.savings_goal_monthly ?? scale(local.savingsGoalMonthly),
  };
}

const toISODate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * Próxima fecha de cobro (hoy incluido) en formato YYYY-MM-DD, para programar el
 * ingreso recurrente. Devuelve null si no hay día de cobro.
 * - Mensual: día 1-31; 31 = último día del mes.
 * - Semanal: día de la semana 0-6 (0 = domingo).
 */
export function nextIncomeDate(frequency: string | null, payday: number | null, today: Date = new Date()): string | null {
  if (payday === null) return null;
  const base = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (frequency === 'weekly') {
    if (payday < 0 || payday > 6) return null;
    const diff = (payday - base.getDay() + 7) % 7;
    return toISODate(new Date(base.getFullYear(), base.getMonth(), base.getDate() + diff));
  }

  if (payday < 1 || payday > 31) return null;
  const inMonth = (year: number, month: number) =>
    new Date(year, month, Math.min(payday, new Date(year, month + 1, 0).getDate()));
  const thisMonth = inMonth(base.getFullYear(), base.getMonth());
  return toISODate(thisMonth >= base ? thisMonth : inMonth(base.getFullYear(), base.getMonth() + 1));
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
