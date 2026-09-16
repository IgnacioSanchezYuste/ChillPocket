import type { Recurring } from '../../api/types';
import {
  currentPeriodStartFor,
  daysBetween,
  monthlyIncome,
  nextIncomeDate,
  nextPeriodStartFrom,
  nthRecurringDate,
  pendingRecurringExpense,
  periodLengthDays,
  periodPayday,
  reconcileLocalProfile,
  serverFinancialProfile,
  convertLocalProfile,
  type IncomeProfile,
} from '../financialPeriod';

const d = (y: number, m: number, day: number) => new Date(y, m - 1, day);
const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

describe('nextPeriodStartFrom', () => {
  it('sin payday usa el mes natural', () => {
    expect(ymd(nextPeriodStartFrom('2026-05-01', null))).toBe('2026-06-01');
  });

  it('payday fuera de rango cae al día 1', () => {
    expect(ymd(nextPeriodStartFrom('2026-05-01', 0))).toBe('2026-06-01');
    expect(ymd(nextPeriodStartFrom('2026-05-01', 32))).toBe('2026-06-01');
  });

  it('payday 31 se normaliza al último día de febrero', () => {
    expect(ymd(nextPeriodStartFrom('2026-01-31', 31))).toBe('2026-02-28');
    expect(ymd(nextPeriodStartFrom('2028-01-31', 31))).toBe('2028-02-29');
  });

  it('recupera el día 31 tras un mes corto', () => {
    expect(ymd(nextPeriodStartFrom('2026-02-28', 31))).toBe('2026-03-31');
  });

  it('cruza de año en diciembre', () => {
    expect(ymd(nextPeriodStartFrom('2026-12-15', 15))).toBe('2027-01-15');
  });
});

describe('daysBetween', () => {
  it('ignora la hora del día', () => {
    expect(daysBetween(new Date(2026, 2, 10, 23, 59), new Date(2026, 2, 10, 0, 1))).toBe(0);
  });

  it('cuenta días naturales aunque haya cambio de hora', () => {
    expect(daysBetween(d(2026, 3, 28), d(2026, 4, 2))).toBe(5);
    expect(daysBetween(d(2026, 10, 24), d(2026, 10, 26))).toBe(2);
  });
});

describe('nthRecurringDate', () => {
  it('k=0 es la fecha de inicio', () => {
    expect(ymd(nthRecurringDate(d(2026, 1, 31), 'monthly', 0))).toBe('2026-01-31');
  });

  it('mensual conserva el día ancla tras un mes corto', () => {
    const start = d(2026, 1, 31);
    expect(ymd(nthRecurringDate(start, 'monthly', 1))).toBe('2026-02-28');
    expect(ymd(nthRecurringDate(start, 'monthly', 2))).toBe('2026-03-31');
    expect(ymd(nthRecurringDate(start, 'monthly', 12))).toBe('2027-01-31');
  });

  it('anual respeta el 29 de febrero', () => {
    const start = d(2028, 2, 29);
    expect(ymd(nthRecurringDate(start, 'yearly', 1))).toBe('2029-02-28');
    expect(ymd(nthRecurringDate(start, 'yearly', 4))).toBe('2032-02-29');
  });

  it('semanal suma 7 días por ciclo', () => {
    expect(ymd(nthRecurringDate(d(2026, 1, 1), 'weekly', 2))).toBe('2026-01-15');
  });
});

describe('pendingRecurringExpense', () => {
  const rec = (overrides: Partial<Recurring> = {}): Recurring => ({
    id: 1,
    name: 'Alquiler',
    amount: 700,
    type: 'expense',
    frequency: 'monthly',
    start_date: '2026-01-05',
    end_date: null,
    is_active: 1,
    notes: null,
    category_id: null,
    category_name: null,
    category_color: null,
    category_icon: null,
    ...overrides,
  });

  it('suma el cargo que cae dentro de la ventana', () => {
    expect(pendingRecurringExpense([rec()], d(2026, 3, 1), d(2026, 4, 1))).toBe(700);
  });

  it('excluye el cargo del mismo día de inicio (ya materializado)', () => {
    expect(pendingRecurringExpense([rec()], d(2026, 3, 5), d(2026, 4, 1))).toBe(0);
  });

  it('excluye el cargo que cae justo en el fin de la ventana', () => {
    expect(pendingRecurringExpense([rec()], d(2026, 3, 6), d(2026, 4, 5))).toBe(0);
  });

  it('ignora inactivos, ingresos e importes no positivos', () => {
    const from = d(2026, 3, 1);
    const to = d(2026, 4, 1);
    expect(pendingRecurringExpense([rec({ is_active: 0 })], from, to)).toBe(0);
    expect(pendingRecurringExpense([rec({ type: 'income' })], from, to)).toBe(0);
    expect(pendingRecurringExpense([rec({ amount: 0 })], from, to)).toBe(0);
  });

  it('ignora fechas de inicio inválidas', () => {
    expect(pendingRecurringExpense([rec({ start_date: 'basura' })], d(2026, 3, 1), d(2026, 4, 1))).toBe(0);
  });

  it('respeta end_date', () => {
    expect(pendingRecurringExpense([rec({ end_date: '2026-03-01' })], d(2026, 3, 1), d(2026, 4, 1))).toBe(0);
  });

  it('acepta importes que llegan como string desde MySQL', () => {
    const amount = '700.00' as unknown as number;
    expect(pendingRecurringExpense([rec({ amount })], d(2026, 3, 1), d(2026, 4, 1))).toBe(700);
  });

  it('cuenta cada cargo semanal de la ventana', () => {
    const weekly = rec({ amount: 10, frequency: 'weekly', start_date: '2026-03-02' });
    // 2, 9, 16, 23 y 30 de marzo
    expect(pendingRecurringExpense([weekly], d(2026, 3, 1), d(2026, 4, 1))).toBe(50);
  });

  it('incluye recurrentes que empiezan dentro de la ventana', () => {
    expect(pendingRecurringExpense([rec({ start_date: '2026-03-20' })], d(2026, 3, 1), d(2026, 4, 1))).toBe(700);
  });

  it('suma varios recurrentes', () => {
    const list = [rec(), rec({ id: 2, amount: 12.99, start_date: '2026-01-15' })];
    expect(pendingRecurringExpense(list, d(2026, 3, 1), d(2026, 4, 1))).toBeCloseTo(712.99);
  });
});

describe('perfil de ingresos', () => {
  it('monthlyIncome convierte el salario semanal', () => {
    expect(monthlyIncome('weekly', 500)).toBe(2172.5);
    expect(monthlyIncome('monthly', 2100)).toBe(2100);
    expect(monthlyIncome('variable', null)).toBeNull();
  });

  it('periodPayday solo existe para cobro mensual', () => {
    expect(periodPayday('monthly', 25)).toBe(25);
    expect(periodPayday('monthly', 31)).toBe(31);
    expect(periodPayday('weekly', 5)).toBeNull(); // un viernes no es el día 5 del mes
    expect(periodPayday('variable', null)).toBeNull();
    expect(periodPayday('monthly', 0)).toBeNull();
  });

  it('serverFinancialProfile envía equivalentes mensuales', () => {
    expect(
      serverFinancialProfile({ incomeFrequency: 'weekly', incomeAmount: 500, incomePayday: 5, savingsGoalMonthly: 300 }),
    ).toEqual({ income_reference: 2172.5, income_payday: null, savings_goal_monthly: 300 });
    expect(
      serverFinancialProfile({ incomeFrequency: 'monthly', incomeAmount: 2100, incomePayday: 25, savingsGoalMonthly: null }),
    ).toEqual({ income_reference: 2100, income_payday: 25, savings_goal_monthly: null });
  });
});

describe('nextIncomeDate', () => {
  // 16/09/2026 es miércoles.
  const today = d(2026, 9, 16);

  it('sin día de cobro no hay fecha', () => {
    expect(nextIncomeDate('monthly', null, today)).toBeNull();
  });

  it('mensual: este mes si aún no ha pasado (hoy incluido)', () => {
    expect(nextIncomeDate('monthly', 25, today)).toBe('2026-09-25');
    expect(nextIncomeDate('monthly', 16, today)).toBe('2026-09-16');
  });

  it('mensual: el mes que viene si ya pasó', () => {
    expect(nextIncomeDate('monthly', 1, today)).toBe('2026-10-01');
    expect(nextIncomeDate('monthly', 15, d(2026, 12, 20))).toBe('2027-01-15');
  });

  it('mensual: 31 es el último día del mes', () => {
    expect(nextIncomeDate('monthly', 31, today)).toBe('2026-09-30');
    expect(nextIncomeDate('monthly', 31, d(2026, 2, 10))).toBe('2026-02-28');
  });

  it('semanal: próximo día de la semana, nunca una fecha inválida', () => {
    expect(nextIncomeDate('weekly', 3, today)).toBe('2026-09-16'); // miércoles = hoy
    expect(nextIncomeDate('weekly', 5, today)).toBe('2026-09-18'); // viernes
    expect(nextIncomeDate('weekly', 0, today)).toBe('2026-09-20'); // domingo (antes daba "…-00")
    expect(nextIncomeDate('weekly', 1, today)).toBe('2026-09-21'); // lunes
    expect(nextIncomeDate('weekly', 1, d(2026, 12, 29))).toBe('2027-01-04');
  });

  it('valores fuera de rango devuelven null', () => {
    expect(nextIncomeDate('weekly', 7, today)).toBeNull();
    expect(nextIncomeDate('monthly', 32, today)).toBeNull();
  });
});

describe('currentPeriodStartFor y periodLengthDays', () => {
  it('sin día de cobro: mes natural', () => {
    expect(ymd(currentPeriodStartFor(null, d(2026, 9, 16)))).toBe('2026-09-01');
    expect(periodLengthDays(null, d(2026, 9, 16))).toBe(30);
    expect(periodLengthDays(null, d(2026, 2, 10))).toBe(28);
  });

  it('antes del cobro: el periodo empezó el mes anterior', () => {
    expect(ymd(currentPeriodStartFor(25, d(2026, 9, 16)))).toBe('2026-08-25');
    expect(periodLengthDays(25, d(2026, 9, 16))).toBe(31); // 25/08 → 25/09
  });

  it('el día del cobro empieza el periodo nuevo', () => {
    expect(ymd(currentPeriodStartFor(17, d(2026, 9, 17)))).toBe('2026-09-17');
    expect(ymd(currentPeriodStartFor(17, d(2026, 9, 16)))).toBe('2026-08-17');
  });

  it('fin de mes y enero', () => {
    expect(ymd(currentPeriodStartFor(31, d(2026, 3, 10)))).toBe('2026-02-28');
    expect(periodLengthDays(31, d(2026, 3, 10))).toBe(31); // 28/02 → 31/03
    expect(ymd(currentPeriodStartFor(15, d(2027, 1, 3)))).toBe('2026-12-15');
  });

  it('un cobro mañana no reduce el periodo a 1 día', () => {
    expect(periodLengthDays(17, d(2026, 9, 16))).toBe(31);
  });
});

describe('reconcileLocalProfile', () => {
  const monthly = { incomeFrequency: 'monthly', incomeAmount: 2000, incomePayday: 25, savingsGoalMonthly: 300 };

  it('si coinciden no cambia nada', () => {
    expect(reconcileLocalProfile(monthly, { income_reference: 2000, income_payday: 25, savings_goal_monthly: 300 })).toBeNull();
  });

  it('servidor vacío: no se toca (lo resuelve la subida)', () => {
    expect(reconcileLocalProfile(monthly, { income_reference: null, income_payday: null, savings_goal_monthly: null })).toBeNull();
    expect(reconcileLocalProfile(monthly, {})).toBeNull();
  });

  it('el servidor manda si cambió desde otro dispositivo', () => {
    expect(reconcileLocalProfile(monthly, { income_reference: 2000, income_payday: 28, savings_goal_monthly: 500 }))
      .toEqual({ incomeFrequency: 'monthly', incomeAmount: 2000, incomePayday: 28, savingsGoalMonthly: 500 });
  });

  it('dispositivo vacío: baja el perfil del servidor', () => {
    const empty = { incomeFrequency: null, incomeAmount: null, incomePayday: null, savingsGoalMonthly: null };
    expect(reconcileLocalProfile(empty, { income_reference: 1800, income_payday: 5, savings_goal_monthly: null }))
      .toEqual({ incomeFrequency: 'monthly', incomeAmount: 1800, incomePayday: 5, savingsGoalMonthly: null });
  });

  it('conserva el cobro semanal si el importe sigue cuadrando', () => {
    const weekly = { incomeFrequency: 'weekly', incomeAmount: 500, incomePayday: 5, savingsGoalMonthly: 300 };
    expect(reconcileLocalProfile(weekly, { income_reference: 2172.5, income_payday: null, savings_goal_monthly: 300 })).toBeNull();
    expect(reconcileLocalProfile(weekly, { income_reference: 2172.5, income_payday: null, savings_goal_monthly: 400 }))
      .toEqual({ ...weekly, savingsGoalMonthly: 400 });
  });

  it('sin día de cobro en el servidor, mensual con día 1 (equivalente) no se toca', () => {
    const day1 = { ...monthly, incomePayday: 1 };
    expect(reconcileLocalProfile(day1, { income_reference: 2000, income_payday: null, savings_goal_monthly: 300 })).toBeNull();
  });

  it('usuario semanal en un dispositivo nuevo: mensual con día 1, sin recálculo', () => {
    const empty = { incomeFrequency: null, incomeAmount: null, incomePayday: null, savingsGoalMonthly: null };
    expect(reconcileLocalProfile(empty, { income_reference: 2172.5, income_payday: null, savings_goal_monthly: null }))
      .toEqual({ incomeFrequency: 'monthly', incomeAmount: 2172.5, incomePayday: 1, savingsGoalMonthly: null });
  });

  it('sin ingreso en el servidor: variable', () => {
    expect(reconcileLocalProfile(monthly, { income_reference: null, income_payday: null, savings_goal_monthly: 200 }))
      .toEqual({ incomeFrequency: 'variable', incomeAmount: null, incomePayday: null, savingsGoalMonthly: 200 });
  });

  it('un cambio real de importe semanal (> redondeo) sí se baja del servidor', () => {
    const weekly = { incomeFrequency: 'weekly', incomeAmount: 500, incomePayday: 5, savingsGoalMonthly: 300 };
    expect(reconcileLocalProfile(weekly, { income_reference: 2606.99, income_payday: null, savings_goal_monthly: 300 }))
      .toEqual({ incomeFrequency: 'monthly', incomeAmount: 2606.99, incomePayday: 1, savingsGoalMonthly: 300 });
  });
});

describe('convertLocalProfile (cambio de moneda de la cuenta)', () => {
  // Réplica de `ROUND(x * rate, 2)` de POST /me/currency.
  const sqlRound = (x: number, rate: number) => Number((Math.round(Number((x * rate).toFixed(6)) * 100) / 100).toFixed(2));
  const serverAfter = (p: Parameters<typeof serverFinancialProfile>[0], rate: number) => {
    const before = serverFinancialProfile(p);
    return {
      income_reference: before.income_reference === null ? null : sqlRound(before.income_reference, rate),
      income_payday: before.income_payday,
      savings_goal_monthly: before.savings_goal_monthly === null ? null : sqlRound(before.savings_goal_monthly, rate),
    };
  };

  it.each([
    [333, 19.7723],
    [500, 1.1537],
    [127.35, 0.86678],
    [1, 23.1],
    [45.9, 0.0506],
  ])('el cobro semanal (%p) sigue siendo semanal tras convertir con %p', (amount, rate) => {
    const weekly = { incomeFrequency: 'weekly', incomeAmount: amount, incomePayday: 5, savingsGoalMonthly: 300 };
    const server = serverAfter(weekly, rate);
    const local = { ...weekly, ...convertLocalProfile(weekly, rate, server) };
    expect(local.incomeFrequency).toBe('weekly');
    expect(reconcileLocalProfile(local, server)).toBeNull();
  });

  it('dos conversiones seguidas (EUR → GBP → MXN) tampoco pierden el cobro semanal', () => {
    let local: IncomeProfile = { incomeFrequency: 'weekly', incomeAmount: 12.34, incomePayday: 1, savingsGoalMonthly: null };
    let server = serverAfter(local, 0.8512);
    local = { ...local, ...convertLocalProfile(local, 0.8512, server) };
    expect(reconcileLocalProfile(local, server)).toBeNull();
    const next = {
      income_reference: sqlRound(server.income_reference!, 27.3),
      income_payday: null,
      savings_goal_monthly: null,
    };
    local = { ...local, ...convertLocalProfile(local, 27.3, next) };
    server = next;
    expect(reconcileLocalProfile(local, server)).toBeNull();
  });

  it('mensual: toma el importe del servidor (sin diferencias de redondeo)', () => {
    const p = { incomeFrequency: 'monthly', incomeAmount: 1234.55, incomePayday: 25, savingsGoalMonthly: 100 };
    const server = serverAfter(p, 1.1537);
    const local = { ...p, ...convertLocalProfile(p, 1.1537, server) };
    expect(local.incomeAmount).toBe(server.income_reference);
    expect(local.savingsGoalMonthly).toBe(server.savings_goal_monthly);
    expect(reconcileLocalProfile(local, server)).toBeNull();
  });

  it('si el servidor aún no tiene el objetivo, convierte el local en vez de borrarlo', () => {
    const p = { incomeFrequency: 'variable', incomeAmount: null, incomePayday: null, savingsGoalMonthly: 200 };
    const out = convertLocalProfile(p, 1.5, { income_reference: null, income_payday: null, savings_goal_monthly: null });
    expect(out).toEqual({ incomeAmount: null, savingsGoalMonthly: 300 });
  });
});
