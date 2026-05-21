import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from './Text';
import { formatMoney } from '../utils/format';
import type { AnalyticsSummary, DailyPoint } from '../api/types';

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

// Genera UN insight accionable a partir de datos que ya están en memoria.
// No hace ninguna petición. Prioriza el mensaje más útil para el usuario.
function buildInsight(summary: AnalyticsSummary, daily: DailyPoint[], currency: string):
  | { icon: keyof typeof Ionicons.glyphMap; text: string; tone: Tone }
  | null {
  const income = Number(summary.total_income) || 0;
  const expense = Number(summary.total_expense) || 0;
  const prevExpense = Number(summary.previous?.total_expense) || 0;
  const saved = Number(summary.saved_this_month) || 0;
  const recExpense = Number(summary.recurring_monthly?.expense) || 0;

  // 1) Comparativa de gasto con el mes anterior (lo más accionable).
  if (prevExpense > 0 && expense > 0) {
    const delta = ((expense - prevExpense) / prevExpense) * 100;
    if (delta >= 8) {
      return { icon: 'trending-up', tone: 'warning', text: `Gastas un ${Math.round(delta)}% más que el mes pasado` };
    }
    if (delta <= -8) {
      return { icon: 'trending-down', tone: 'success', text: `Gastas un ${Math.abs(Math.round(delta))}% menos que el mes pasado 👏` };
    }
  }

  // 2) Racha de días sin gastar (motivacional).
  const streak = noSpendStreak(daily);
  if (streak >= 2) {
    return { icon: 'leaf', tone: 'success', text: `Llevas ${streak} días sin gastar 🔥` };
  }

  // 3) Ahorro real movido a metas este mes.
  if (saved > 0) {
    return { icon: 'flag', tone: 'accent', text: `Has movido ${formatMoney(saved, currency)} a tus metas este mes` };
  }

  // 4) Peso de los gastos fijos sobre los ingresos.
  if (income > 0 && recExpense > 0) {
    const pct = Math.round((recExpense / income) * 100);
    if (pct >= 40) {
      return { icon: 'repeat', tone: 'warning', text: `Tus gastos fijos son el ${pct}% de tus ingresos` };
    }
  }

  // 5) Estado del balance del mes (fallback).
  const balance = Number(summary.balance) || 0;
  if (income > 0 || expense > 0) {
    return balance >= 0
      ? { icon: 'sparkles', tone: 'success', text: `Vas en positivo este mes (+${formatMoney(balance, currency)})` }
      : { icon: 'alert-circle', tone: 'danger', text: `Este mes vas en negativo (${formatMoney(balance, currency)})` };
  }
  return null;
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

export const InsightBanner: React.FC<Props> = ({ summary, daily, currency }) => {
  const { palette } = useTheme();
  const insight = useMemo(
    () => (summary ? buildInsight(summary, daily, currency) : null),
    [summary, daily, currency]
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
