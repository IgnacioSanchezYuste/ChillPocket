import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from './Text';
import { formatMoney } from '../utils/format';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { useBilling } from '../store/useBillingStore';
import { useDataStore } from '../store/useDataStore';
import type { AnalyticsSummary, DailyPoint, Recurring } from '../api/types';

type Props = {
  summary: AnalyticsSummary | null;
  daily: DailyPoint[];
  currency: string;
};

type Tone = 'success' | 'warning' | 'danger' | 'accent';

function rgba(hex: string, alpha: number) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

type PrefsSlice = {
  incomeAmount: number | null;
  incomePayday: number | null;
  savingsGoalMonthly: number | null;
};

type BillingSlice = {
  hasAdvanced: boolean;
};

/**
 * Calcula el siguiente periodo a partir del actual, respetando el payday del
 * usuario (LAST_DAY normaliza si el mes destino no tiene ese día). Espejo del
 * `nextPeriodStart` del backend.
 */
function nextPeriodStartFrom(periodStart: string, payday: number | null): Date {
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

function daysBetween(from: Date, to: Date): number {
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
function nthRecurringDate(start: Date, frequency: Recurring['frequency'], k: number): Date {
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

/**
 * Suma de los cargos de gastos fijos (recurrentes tipo expense) que se cobrarán
 * en la ventana (from, to): aún NO materializados como transacción (el backend
 * solo expande hasta hoy) y por tanto no descontados del saldo. Reservarlos
 * mantiene el presupuesto diario estable cuando llega el cargo.
 */
function pendingRecurringExpense(recurring: Recurring[], from: Date, to: Date): number {
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

function noSpendStreak(daily: DailyPoint[]): number {
  if (!daily.length) return 0;
  const now = new Date();
  const today = now.getDate();
  const map = new Map<number, number>();
  for (const d of daily) map.set(d.day, Number(d.expense) || 0);
  let streak = 0;
  for (let day = today; day >= 1; day--) {
    if ((map.get(day) || 0) === 0) streak++;
    else break;
  }
  return streak;
}

/**
 * Genera UN insight accionable a partir de datos en memoria. Sin peticiones.
 * Prioridad:
 *   1. Presupuesto diario (si el usuario completó el onboarding nuevo).
 *   2. Forecast del cierre del periodo (Plus).
 *   3. % objetivo cumplido (si tiene savingsGoalMonthly).
 *   4. Días hasta el próximo cobro (si quedan ≤ 7 días).
 *   5. Comparativa con mes anterior.
 *   6. Racha sin gastar (motivacional).
 *   7. Ahorro a metas.
 *   8. Peso de gastos fijos.
 *   9. Estado del balance del mes (fallback).
 */
function buildInsight(
  summary: AnalyticsSummary,
  daily: DailyPoint[],
  currency: string,
  prefs: PrefsSlice,
  billing: BillingSlice,
  recurring: Recurring[],
): { icon: keyof typeof Ionicons.glyphMap; text: string; tone: Tone } | null {
  const income = Number(summary.total_income) || 0;
  const expense = Number(summary.total_expense) || 0;
  const balance = Number(summary.balance) || 0;
  const prevExpense = Number(summary.previous?.total_expense) || 0;
  const saved = Number(summary.saved_this_month) || 0;
  const recExpense = Number(summary.recurring_monthly?.expense) || 0;
  const periodStart = summary.current_period_start;

  const hasIncomePlan =
    prefs.incomeAmount !== null &&
    prefs.incomeAmount > 0 &&
    prefs.savingsGoalMonthly !== null &&
    prefs.savingsGoalMonthly >= 0;

  // 1) Presupuesto diario disponible: cuánto puede gastar hoy y aun cumplir
  //    el objetivo mensual de ahorro. Necesita ingreso + objetivo + saber
  //    cuándo termina el periodo en curso.
  if (hasIncomePlan && periodStart) {
    const endNext = nextPeriodStartFrom(periodStart, prefs.incomePayday);
    const today = new Date();
    const daysLeft = Math.max(1, daysBetween(today, endNext)); // hasta inicio del siguiente
    const goal = Number(prefs.savingsGoalMonthly) || 0;
    const todayDate = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const pendingFixed = pendingRecurringExpense(recurring, todayDate, endNext);
    // Sobre el dinero REALMENTE disponible este mes (saldo del mes = ingresos
    // recibidos − gastos), no el salario teórico, y reservando los gastos fijos
    // aún no cobrados de este periodo: así nunca recomienda gastar dinero ya
    // comprometido y el presupuesto no salta cuando llega el recibo del alquiler.
    const dailyBudget = (balance - goal - pendingFixed) / daysLeft;
    if (Number.isFinite(dailyBudget) && dailyBudget > 0) {
      return {
        icon: 'wallet-outline',
        tone: 'accent',
        text: `Hoy puedes gastar ${formatMoney(dailyBudget, currency)} y seguir cumpliendo tu objetivo`,
      };
    }
    if (Number.isFinite(dailyBudget) && dailyBudget <= 0) {
      // Distinguir la causa: ¿no llega ni para los gastos fijos pendientes
      // (vas justo de caja, normalmente porque aún no has cobrado) o sí, pero
      // no para ahorrar además el objetivo completo?
      if (pendingFixed > 0 && balance - pendingFixed < 0) {
        return {
          icon: 'alert-circle',
          tone: 'danger',
          text: `Tus gastos fijos pendientes (${formatMoney(pendingFixed, currency)}) no caben en tu saldo; ojo hasta tu próximo cobro`,
        };
      }
      if (goal > 0) {
        return {
          icon: 'alert-circle',
          tone: 'danger',
          text: `Para llegar a tu objetivo de ${formatMoney(goal, currency)} no deberías gastar más este periodo`,
        };
      }
    }
  }

  // 2) Forecast del cierre del periodo (Plus). Solo si tenemos algo de
  //    actividad y al menos 3 días dentro del periodo para tener señal.
  if (billing.hasAdvanced && periodStart && income > 0) {
    const start = new Date(`${periodStart}T00:00:00`);
    const today = new Date();
    const elapsed = Math.max(1, daysBetween(start, today) + 1);
    const endNext = nextPeriodStartFrom(periodStart, prefs.incomePayday);
    const totalDays = Math.max(elapsed, daysBetween(start, endNext));
    if (elapsed >= 3 && totalDays > elapsed) {
      const avgDaily = expense / elapsed;
      const projectedSpend = avgDaily * totalDays;
      const projectedNet = income - projectedSpend;
      if (projectedNet >= 0) {
        return {
          icon: 'trending-up',
          tone: 'success',
          text: `Si sigues así, cerrarás el mes con +${formatMoney(projectedNet, currency)}`,
        };
      }
      return {
        icon: 'trending-down',
        tone: 'warning',
        text: `Si sigues así, cerrarás el mes con ${formatMoney(projectedNet, currency)}`,
      };
    }
  }

  // 3) % completado del objetivo de ahorro este mes.
  if (hasIncomePlan && prefs.savingsGoalMonthly && prefs.savingsGoalMonthly > 0) {
    const goal = Number(prefs.savingsGoalMonthly);
    if (balance > 0) {
      const pct = Math.min(100, Math.round((balance / goal) * 100));
      return {
        icon: 'flag-outline',
        tone: pct >= 60 ? 'success' : 'accent',
        text: `Llevas ${formatMoney(balance, currency)} ahorrados este mes (${pct}% del objetivo)`,
      };
    }
  }

  // 4) Días hasta el próximo cobro (countdown).
  if (periodStart && prefs.incomePayday) {
    const endNext = nextPeriodStartFrom(periodStart, prefs.incomePayday);
    const today = new Date();
    const daysToPay = daysBetween(today, endNext);
    if (daysToPay >= 0 && daysToPay <= 7) {
      const phrase =
        daysToPay === 0
          ? 'Hoy es tu día de cobro 💸'
          : daysToPay === 1
          ? 'Mañana es tu próximo cobro'
          : `Te quedan ${daysToPay} días hasta tu próximo cobro`;
      return { icon: 'calendar-outline', tone: 'accent', text: phrase };
    }
  }

  // 5) Comparativa con el mes anterior (existente).
  if (prevExpense > 0 && expense > 0) {
    const delta = ((expense - prevExpense) / prevExpense) * 100;
    if (delta >= 8) {
      return { icon: 'trending-up', tone: 'warning', text: `Gastas un ${Math.round(delta)}% más que el mes pasado` };
    }
    if (delta <= -8) {
      return { icon: 'trending-down', tone: 'success', text: `Gastas un ${Math.abs(Math.round(delta))}% menos que el mes pasado 👏` };
    }
  }

  // 6) Racha de días sin gastar.
  const streak = noSpendStreak(daily);
  if (streak >= 2) {
    return { icon: 'leaf', tone: 'success', text: `Llevas ${streak} días sin gastar 🔥` };
  }

  // 7) Ahorro a metas (existente).
  if (saved > 0) {
    return { icon: 'flag', tone: 'accent', text: `Has movido ${formatMoney(saved, currency)} a tus metas este mes` };
  }

  // 8) Peso de los gastos fijos sobre los ingresos.
  if (income > 0 && recExpense > 0) {
    const pct = Math.round((recExpense / income) * 100);
    if (pct >= 40) {
      return { icon: 'repeat', tone: 'warning', text: `Tus gastos fijos son el ${pct}% de tus ingresos` };
    }
  }

  // 9) Estado del balance del mes (fallback).
  if (income > 0 || expense > 0) {
    return balance >= 0
      ? { icon: 'sparkles', tone: 'success', text: `Vas en positivo este mes (+${formatMoney(balance, currency)})` }
      : { icon: 'alert-circle', tone: 'danger', text: `Este mes vas en negativo (${formatMoney(balance, currency)})` };
  }
  return null;
}

export const InsightBanner: React.FC<Props> = ({ summary, daily, currency }) => {
  const { palette } = useTheme();
  const incomeAmount = usePreferencesStore((s) => s.incomeAmount);
  const incomePayday = usePreferencesStore((s) => s.incomePayday);
  const savingsGoalMonthly = usePreferencesStore((s) => s.savingsGoalMonthly);
  const recurring = useDataStore((s) => s.recurring);
  const billing = useBilling();
  const hasAdvanced = billing.hasFeature('advanced_analytics');

  const insight = useMemo(
    () =>
      summary
        ? buildInsight(
            summary,
            daily,
            currency,
            { incomeAmount, incomePayday, savingsGoalMonthly },
            { hasAdvanced },
            recurring,
          )
        : null,
    [summary, daily, currency, incomeAmount, incomePayday, savingsGoalMonthly, hasAdvanced, recurring],
  );
  if (!insight) return null;

  const color =
    insight.tone === 'success'
      ? palette.success
      : insight.tone === 'warning'
      ? palette.warning
      : insight.tone === 'danger'
      ? palette.danger
      : palette.accent;

  return (
    <View style={[styles.banner, { backgroundColor: rgba(color, 0.12), borderColor: rgba(color, 0.32) }]}>
      <View style={[styles.icon, { backgroundColor: rgba(color, 0.18) }]}>
        <Ionicons name={insight.icon} size={16} color={color} />
      </View>
      <Text variant="label" weight="medium" style={{ flex: 1, color: palette.textPrimary }}>
        {insight.text}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  } as any,
  icon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
});
