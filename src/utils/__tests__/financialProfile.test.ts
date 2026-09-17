import {
  daysBetween,
  monthlyIncome,
  nextIncomeDate,
  nextPeriodStartFrom,
  periodPayday,
  serverFinancialProfile,
} from '../financialPeriod';
import { MONTH_DAYS, WEEKDAYS } from '../paydayOptions';

/**
 * Casos límite del día de cobro, ahora que el servidor lo usa para cerrar
 * periodos: el cliente (InsightBanner, tutorial) tiene que calcular los mismos
 * límites que `currentPeriodStart()` / `nextPeriodStart()` de backend/index.php.
 */

const ymd = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const lastDayOf = (year: number, month0: number) => new Date(year, month0 + 1, 0).getDate();
const addDays = (date: Date, n: number) => new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);

/** Réplica literal de currentPeriodStart() del backend (PHP). */
function serverCurrentPeriodStart(today: Date, payday: number | null): string {
  const year = today.getFullYear();
  const month0 = today.getMonth();
  if (payday === null || payday < 1 || payday > 31) return ymd(new Date(year, month0, 1));
  const paydayThisMonth = Math.min(payday, lastDayOf(year, month0));
  if (today.getDate() >= paydayThisMonth) return ymd(new Date(year, month0, paydayThisMonth));
  const prev = new Date(year, month0 - 1, 1);
  const paydayPrev = Math.min(payday, lastDayOf(prev.getFullYear(), prev.getMonth()));
  return ymd(new Date(prev.getFullYear(), prev.getMonth(), paydayPrev));
}

// Inicios de monthly_closures que devolvió la API local para un usuario con
// transacciones desde 2023-11-01, payday 31 y hoy = 2026-09-16.
const SERVER_CHAIN_PAYDAY_31 = (
  '2023-10-31 2023-11-30 2023-12-31 2024-01-31 2024-02-29 2024-03-31 2024-04-30 2024-05-31 ' +
  '2024-06-30 2024-07-31 2024-08-31 2024-09-30 2024-10-31 2024-11-30 2024-12-31 2025-01-31 ' +
  '2025-02-28 2025-03-31 2025-04-30 2025-05-31 2025-06-30 2025-07-31 2025-08-31 2025-09-30 ' +
  '2025-10-31 2025-11-30 2025-12-31 2026-01-31 2026-02-28 2026-03-31 2026-04-30 2026-05-31 ' +
  '2026-06-30 2026-07-31'
).split(' ');

describe('cadena de periodos (espejo del backend)', () => {
  it('payday 31 reproduce los cierres del servidor y el periodo en curso', () => {
    const chain = [SERVER_CHAIN_PAYDAY_31[0]];
    while (chain.length <= SERVER_CHAIN_PAYDAY_31.length) {
      chain.push(ymd(nextPeriodStartFrom(chain[chain.length - 1], 31)));
    }
    expect(chain.slice(0, -1)).toEqual(SERVER_CHAIN_PAYDAY_31);
    expect(chain[chain.length - 1]).toBe(serverCurrentPeriodStart(new Date(2026, 8, 16), 31));
    expect(chain[chain.length - 1]).toBe('2026-08-31');
  });

  it('payday 30 y 29 se normalizan en febrero y se recuperan en marzo', () => {
    expect(ymd(nextPeriodStartFrom('2024-01-30', 30))).toBe('2024-02-29');
    expect(ymd(nextPeriodStartFrom('2024-02-29', 30))).toBe('2024-03-30');
    expect(ymd(nextPeriodStartFrom('2025-01-29', 29))).toBe('2025-02-28');
    expect(ymd(nextPeriodStartFrom('2025-02-28', 29))).toBe('2025-03-29');
  });

  it('todos los periodos duran entre 28 y 31 días, para cualquier payday', () => {
    for (let payday = 1; payday <= 31; payday++) {
      let start = serverCurrentPeriodStart(new Date(2023, 0, 15), payday);
      for (let i = 0; i < 48; i++) {
        const next = nextPeriodStartFrom(start, payday);
        const length = daysBetween(new Date(`${start}T00:00:00`), next);
        expect(length).toBeGreaterThanOrEqual(28);
        expect(length).toBeLessThanOrEqual(31);
        start = ymd(next);
      }
    }
  });

  it('el siguiente inicio calculado en cliente siempre es posterior a hoy (daysLeft ≥ 1)', () => {
    // InsightBanner: endNext = nextPeriodStartFrom(current_period_start, user.income_payday).
    const paydays: (number | null)[] = [null, 1, 15, 28, 29, 30, 31];
    for (const payday of paydays) {
      for (let day = new Date(2027, 11, 1); day < new Date(2028, 3, 1); day = addDays(day, 1)) {
        const start = serverCurrentPeriodStart(day, payday);
        const next = nextPeriodStartFrom(start, payday);
        expect(start <= ymd(day)).toBe(true);
        expect(daysBetween(day, next)).toBeGreaterThanOrEqual(1);
        // El día siguiente al fin del periodo es exactamente el nuevo inicio del servidor.
        expect(serverCurrentPeriodStart(next, payday)).toBe(ymd(next));
      }
    }
  });
});

describe('nextIncomeDate · casos límite', () => {
  it('mensual: días 29-31 en febrero caen en su último día', () => {
    expect(nextIncomeDate('monthly', 30, new Date(2026, 1, 10))).toBe('2026-02-28');
    expect(nextIncomeDate('monthly', 29, new Date(2028, 1, 10))).toBe('2028-02-29');
    expect(nextIncomeDate('monthly', 31, new Date(2026, 1, 28))).toBe('2026-02-28');
  });

  it('mensual: el propio día de cobro cuenta como hoy, también a fin de año', () => {
    expect(nextIncomeDate('monthly', 31, new Date(2026, 11, 31))).toBe('2026-12-31');
    expect(nextIncomeDate('monthly', 1, new Date(2026, 11, 31))).toBe('2027-01-01');
  });

  it('mensual: siempre una fecha válida dentro de los próximos 31 días', () => {
    const bad: string[] = [];
    for (let payday = 1; payday <= 31; payday++) {
      for (let day = new Date(2027, 11, 1); day < new Date(2028, 2, 5); day = addDays(day, 1)) {
        const result = nextIncomeDate('monthly', payday, day) ?? '';
        const date = new Date(`${result}T00:00:00`);
        const diff = daysBetween(day, date);
        const ok =
          /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(result) &&
          ymd(date) === result && // no se desborda al mes siguiente
          diff >= 0 &&
          diff <= 31 &&
          date.getDate() === Math.min(payday, lastDayOf(date.getFullYear(), date.getMonth()));
        if (!ok) bad.push(`${ymd(day)} payday ${payday} → ${result}`);
      }
    }
    expect(bad).toEqual([]);
  });

  it('semanal: el día de la semana coincide y está en los próximos 6 días', () => {
    for (const { value } of WEEKDAYS) {
      for (let day = new Date(2026, 9, 20); day < new Date(2026, 10, 5); day = addDays(day, 1)) {
        const result = nextIncomeDate('weekly', value, day)!;
        const date = new Date(`${result}T00:00:00`);
        expect(date.getDay()).toBe(value);
        const diff = daysBetween(day, date);
        expect(diff).toBeGreaterThanOrEqual(0);
        expect(diff).toBeLessThanOrEqual(6);
      }
    }
    // 31/12/2026 es jueves: el viernes siguiente ya es de 2027.
    expect(nextIncomeDate('weekly', 5, new Date(2026, 11, 31))).toBe('2027-01-01');
  });
});

describe('perfil financiero · casos límite', () => {
  it('monthlyIncome descarta importes no finitos y redondea a céntimos', () => {
    expect(monthlyIncome('monthly', Number.NaN)).toBeNull();
    expect(monthlyIncome('weekly', Number.POSITIVE_INFINITY)).toBeNull();
    expect(monthlyIncome('weekly', 333.33)).toBe(1448.32);
    expect(monthlyIncome('weekly', 0)).toBe(0);
  });

  it('periodPayday acepta 29 y 30 en mensual y nada sin frecuencia', () => {
    expect(periodPayday('monthly', 29)).toBe(29);
    expect(periodPayday('monthly', 30)).toBe(30);
    expect(periodPayday(null, 15)).toBeNull();
    expect(periodPayday('monthly', Number.NaN)).toBeNull();
  });

  it('un día de la semana nunca llega al servidor como día del mes', () => {
    for (const { value } of WEEKDAYS) {
      const profile = serverFinancialProfile({
        incomeFrequency: 'weekly',
        incomeAmount: 400,
        incomePayday: value,
        savingsGoalMonthly: null,
      });
      expect(profile.income_payday).toBeNull();
    }
  });

  it('todos los días de la rueda mensual son días de cobro válidos para el servidor', () => {
    const values = MONTH_DAYS.map((d) => d.value);
    expect(new Set(values).size).toBe(values.length);
    for (const v of values) expect(periodPayday('monthly', v)).toBe(v);
    expect(new Set(WEEKDAYS.map((d) => d.value))).toEqual(new Set([0, 1, 2, 3, 4, 5, 6]));
  });

  // Defecto: en el tutorial, si el usuario escribe un salario mensual, avanza,
  // vuelve y elige "Variable", el importe se queda en el borrador y se envía como
  // income_reference (y bloquea objetivos de ahorro mayores sin explicación).
  it('con ingreso variable no se envía un importe residual', () => {
    const profile = serverFinancialProfile({
      incomeFrequency: 'variable',
      incomeAmount: 2000,
      incomePayday: null,
      savingsGoalMonthly: 300,
    });
    expect(profile.income_reference).toBeNull();
  });
});
