import type { Recurring } from '../../api/types';
import {
  daysBetween,
  nextPeriodStartFrom,
  nthRecurringDate,
  pendingRecurringExpense,
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
