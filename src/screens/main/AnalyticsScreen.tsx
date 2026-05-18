import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet, Dimensions, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { useNavigation } from '@react-navigation/native';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ProgressBar } from '../../components/ProgressBar';
import { EmptyState } from '../../components/EmptyState';
import { analyticsApi } from '../../api/endpoints';
import { formatMoney, monthLabel, currentMonthYear } from '../../utils/format';
import { paymentMethodLabel, paymentMethodMeta } from '../../utils/paymentMethods';
import type { CategoryStat, PaymentMethod } from '../../api/types';

export const AnalyticsScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const {
    summary,
    monthly,
    categoryComparison,
    paymentMethodStats,
    projection,
    budgets,
    fetchAnalytics,
    fetchBudgets,
  } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [carouselMonth, setCarouselMonth] = useState<string>(currentMonthYear());
  const [carouselCategories, setCarouselCategories] = useState<CategoryStat[]>([]);
  const [carouselLoading, setCarouselLoading] = useState(false);

  useEffect(() => {
    fetchAnalytics();
    fetchBudgets();
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCarouselLoading(true);
      try {
        const res = await analyticsApi.categories(carouselMonth);
        if (!cancelled) setCarouselCategories(res.categories.filter((c) => c.type === 'expense'));
      } finally {
        if (!cancelled) setCarouselLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [carouselMonth]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAnalytics(), fetchBudgets()]);
    setRefreshing(false);
  };

  const currency = user?.currency || 'EUR';
  const screenW = Dimensions.get('window').width;
  const chartW = screenW - spacing.lg * 2 - spacing.md * 2;

  const monthlyData = useMemo(() => {
    return {
      labels: monthly.map((m) => m.month_year.slice(5)),
      income: monthly.map((m) => Number(m.income || 0)),
      expense: monthly.map((m) => Number(m.expense || 0)),
    };
  }, [monthly]);

  const totalExpenses = carouselCategories.reduce((s, c) => s + Number(c.total), 0);

  // Comparativa con mes anterior
  const prevExpense = summary?.previous?.total_expense ?? 0;
  const currentExpense = summary?.total_expense ?? 0;
  const expenseDelta = prevExpense > 0 ? ((currentExpense - prevExpense) / prevExpense) * 100 : 0;
  const prevIncome = summary?.previous?.total_income ?? 0;
  const currentIncome = summary?.total_income ?? 0;
  const incomeDelta = prevIncome > 0 ? ((currentIncome - prevIncome) / prevIncome) * 100 : 0;

  // Categorías agrupadas por mes para el gráfico apilado (top 3 + otros)
  const topCategoriesIds = useMemo(() => {
    const total = new Map<number | null, number>();
    for (const r of categoryComparison) {
      total.set(r.category_id, (total.get(r.category_id) ?? 0) + Number(r.total));
    }
    return Array.from(total.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 4)
      .map(([k]) => k);
  }, [categoryComparison]);

  const shiftCarousel = (delta: number) => {
    const [y, m] = carouselMonth.split('-').map(Number);
    const target = new Date(y, m - 1 + delta, 1);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), 1);
    if (target > today) return; // No permitir ir al futuro
    const next = `${target.getFullYear()}-${String(target.getMonth() + 1).padStart(2, '0')}`;
    setCarouselMonth(next);
  };

  const isCurrentMonth = useMemo(() => {
    const [y, m] = carouselMonth.split('-').map(Number);
    const now = new Date();
    return y === now.getFullYear() && m === now.getMonth() + 1;
  }, [carouselMonth]);

  const budgetByCategory = useMemo(() => {
    const map = new Map<number | null, { limit: number; spent: number; color: string }>();
    for (const b of budgets) {
      map.set(b.category_id, {
        limit: Number(b.amount),
        spent: Number(b.spent),
        color: b.category_color || palette.accent,
      });
    }
    return map;
  }, [budgets, palette.accent]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
      >
        <ScreenHeader title="Analítica" subtitle={monthLabel(summary?.month_year || currentMonthYear())} />

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {/* KPI comparativa */}
          {summary && (
            <View style={styles.kpiRow}>
              <DeltaCard
                label="Gastos vs mes anterior"
                amount={currentExpense}
                delta={expenseDelta}
                inverted
                currency={currency}
              />
              <DeltaCard
                label="Ingresos vs mes anterior"
                amount={currentIncome}
                delta={incomeDelta}
                currency={currency}
              />
            </View>
          )}

          {/* Bar chart comparativo */}
          {monthlyData.labels.length > 1 && (
            <Card padding="md">
              <Text variant="h2">Comparativa mensual</Text>
              <Text variant="caption" tone="muted">Últimos {monthlyData.labels.length} meses · gastos por mes</Text>
              <BarChart
                data={{
                  labels: monthlyData.labels,
                  datasets: [{ data: monthlyData.expense }],
                }}
                width={chartW}
                height={200}
                yAxisLabel=""
                yAxisSuffix=""
                fromZero
                withInnerLines={false}
                withHorizontalLabels
                showBarTops={false}
                chartConfig={{
                  backgroundGradientFrom: palette.bgSurface,
                  backgroundGradientTo: palette.bgSurface,
                  decimalPlaces: 0,
                  color: (opacity = 1) => `rgba(99, 102, 241, ${opacity})`,
                  labelColor: () => palette.textMuted,
                  barPercentage: 0.6,
                  propsForBackgroundLines: { stroke: palette.borderSubtle, strokeDasharray: '' },
                }}
                style={{ marginTop: spacing.sm, marginLeft: -8 }}
              />
            </Card>
          )}

          {/* Line chart ingresos vs gastos */}
          {monthlyData.labels.length > 1 && (
            <Card padding="md">
              <Text variant="h2">Ingresos vs Gastos</Text>
              <Text variant="caption" tone="muted">Tendencia</Text>
              <LineChart
                data={{
                  labels: monthlyData.labels,
                  datasets: [
                    { data: monthlyData.income, color: () => palette.success, strokeWidth: 2 },
                    { data: monthlyData.expense, color: () => palette.danger, strokeWidth: 2 },
                  ],
                  legend: ['Ingresos', 'Gastos'],
                }}
                width={chartW}
                height={200}
                withShadow={false}
                withDots
                bezier
                fromZero
                chartConfig={{
                  backgroundGradientFrom: palette.bgSurface,
                  backgroundGradientTo: palette.bgSurface,
                  decimalPlaces: 0,
                  color: () => palette.textMuted,
                  labelColor: () => palette.textMuted,
                  propsForBackgroundLines: { stroke: palette.borderSubtle, strokeDasharray: '' },
                }}
                style={{ marginTop: spacing.sm, marginLeft: -8 }}
              />
            </Card>
          )}

          {/* Carrusel de meses por categoría */}
          <Card>
            <View style={styles.carouselHeader}>
              <View>
                <Text variant="h2">Gastos por categoría</Text>
                <Text variant="caption" tone="muted" style={{ textTransform: 'capitalize' }}>
                  {monthLabel(carouselMonth)}
                </Text>
              </View>
              <View style={{ flexDirection: 'row', gap: spacing.sm }}>
                <Pressable
                  onPress={() => shiftCarousel(-1)}
                  hitSlop={8}
                  style={[styles.arrow, { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle }]}
                >
                  <Ionicons name="chevron-back" size={18} color={palette.textPrimary} />
                </Pressable>
                <Pressable
                  onPress={() => shiftCarousel(1)}
                  hitSlop={8}
                  disabled={isCurrentMonth}
                  style={[
                    styles.arrow,
                    {
                      backgroundColor: palette.bgElevated,
                      borderColor: palette.borderSubtle,
                      opacity: isCurrentMonth ? 0.4 : 1,
                    },
                  ]}
                >
                  <Ionicons name="chevron-forward" size={18} color={palette.textPrimary} />
                </Pressable>
              </View>
            </View>

            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              {carouselLoading ? (
                <Text variant="body" tone="secondary">Cargando…</Text>
              ) : carouselCategories.length === 0 ? (
                <Text variant="body" tone="secondary">Sin gastos este mes.</Text>
              ) : (
                carouselCategories.slice(0, 8).map((c) => {
                  const budget = budgetByCategory.get(c.category_id);
                  // Si hay presupuesto, mostramos el % respecto al límite,
                  // si no, respecto al total de gastos del mes.
                  const pct = budget && budget.limit > 0
                    ? (Number(c.total) / budget.limit) * 100
                    : totalExpenses > 0
                    ? (Number(c.total) / totalExpenses) * 100
                    : 0;
                  const over = budget && pct > 100;
                  return (
                    <View key={`${c.category_id}-${c.type}`} style={{ gap: 6 }}>
                      <View style={styles.row}>
                        <View style={styles.left}>
                          <View style={[styles.dot, { backgroundColor: c.category_color }]} />
                          <Text variant="body" weight="medium">{c.category_name}</Text>
                          {budget && (
                            <View
                              style={[
                                styles.budgetTag,
                                {
                                  backgroundColor: over ? palette.dangerSoft : palette.accentSoft,
                                  borderColor: over ? palette.danger : palette.accent,
                                },
                              ]}
                            >
                              <Ionicons
                                name="speedometer-outline"
                                size={10}
                                color={over ? palette.danger : palette.accent}
                              />
                              <Text variant="caption" tone={over ? 'danger' : 'accent'} weight="semibold">
                                {Math.round(pct)}%
                              </Text>
                            </View>
                          )}
                        </View>
                        <Text variant="body" weight="semibold" tabular>
                          {formatMoney(Number(c.total), currency)}
                        </Text>
                      </View>
                      <ProgressBar
                        value={Math.min(100, pct)}
                        color={over ? palette.danger : c.category_color}
                      />
                      <Text variant="caption" tone="muted">
                        {budget
                          ? `${formatMoney(Number(c.total), currency)} de ${formatMoney(budget.limit, currency)}`
                          : `${pct.toFixed(1)}% del total · ${c.count} mov.`}
                      </Text>
                    </View>
                  );
                })
              )}
            </View>
          </Card>

          {/* Métodos de pago */}
          {paymentMethodStats.length > 0 && (
            <Card>
              <Text variant="h2">Por tipo de pago</Text>
              <Text variant="caption" tone="muted">
                {monthLabel(summary?.month_year || currentMonthYear())}
              </Text>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {paymentMethodStats.map((pm) => {
                  const meta = paymentMethodMeta(pm.payment_method as PaymentMethod);
                  return (
                    <View key={pm.payment_method} style={styles.pmRow}>
                      <View style={[styles.pmIcon, { backgroundColor: palette.accentSoft }]}>
                        <Ionicons
                          name={meta?.icon ?? 'ellipsis-horizontal-circle-outline'}
                          size={16}
                          color={palette.accent}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text variant="body" weight="medium">{paymentMethodLabel(pm.payment_method as any)}</Text>
                        <Text variant="caption" tone="muted">{pm.count} movimientos</Text>
                      </View>
                      <Text variant="body" weight="semibold" tabular>
                        {formatMoney(Number(pm.total), currency)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            </Card>
          )}

          {/* Presupuestos resumen */}
          {budgets.length > 0 && (
            <Card>
              <View style={styles.cardHeader}>
                <Text variant="h2">Presupuestos</Text>
                <Pressable onPress={() => navigation.navigate('Budgets')} hitSlop={6}>
                  <Text variant="label" tone="accent" weight="semibold">Gestionar</Text>
                </Pressable>
              </View>
              <View style={{ marginTop: spacing.md, gap: spacing.md }}>
                {budgets.slice(0, 4).map((b) => {
                  const pct = Number(b.amount) > 0 ? (Number(b.spent) / Number(b.amount)) * 100 : 0;
                  const over = pct > 100;
                  return (
                    <View key={b.id} style={{ gap: 6 }}>
                      <View style={styles.row}>
                        <Text variant="body" weight="medium">
                          {b.category_name || 'Global'}
                        </Text>
                        <Text variant="caption" tabular tone={over ? 'danger' : 'muted'}>
                          {formatMoney(Number(b.spent), currency)} / {formatMoney(Number(b.amount), currency)}
                        </Text>
                      </View>
                      <ProgressBar
                        value={Math.min(100, pct)}
                        color={over ? palette.danger : pct > 80 ? palette.warning : (b.category_color || palette.accent)}
                      />
                    </View>
                  );
                })}
              </View>
            </Card>
          )}

          {projection && (
            <Card>
              <Text variant="h2">Proyección</Text>
              <Text variant="caption" tone="muted">Basado en últimos 3 meses + recurrentes</Text>
              <View style={styles.projectionGrid}>
                <ProjectionCell label="Ingreso medio" value={projection.avg_monthly_income} currency={currency} />
                <ProjectionCell label="Gasto medio" value={projection.avg_monthly_expense} currency={currency} />
                <ProjectionCell
                  label="Recurrente neto"
                  value={projection.recurring_monthly_in - projection.recurring_monthly_out}
                  currency={currency}
                />
                <ProjectionCell
                  label="Neto mensual"
                  value={projection.projected_monthly_net}
                  currency={currency}
                  highlight
                />
                <ProjectionCell label="A 6 meses" value={projection.projected_6_months} currency={currency} />
                <ProjectionCell label="A 12 meses" value={projection.projected_12_months} currency={currency} />
              </View>
            </Card>
          )}

          {monthlyData.labels.length === 0 && carouselCategories.length === 0 && (
            <EmptyState
              icon="bar-chart-outline"
              title="Aún sin datos"
              description="Crea unas cuantas transacciones y vuelve aquí para ver tu analítica."
            />
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const DeltaCard: React.FC<{
  label: string;
  amount: number;
  delta: number;
  currency: string;
  inverted?: boolean;
}> = ({ label, amount, delta, currency, inverted }) => {
  const { palette } = useTheme();
  // Para gastos, subir es malo (delta positivo = rojo). Para ingresos, lo contrario.
  const isGood = inverted ? delta < 0 : delta > 0;
  const isBad = inverted ? delta > 0 : delta < 0;
  const tone = isGood ? 'success' : isBad ? 'danger' : 'muted';
  const color = isGood ? palette.success : isBad ? palette.danger : palette.textMuted;
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '·';
  return (
    <Card padding="md" style={{ flex: 1 }}>
      <Text variant="caption" tone="muted">{label}</Text>
      <Text variant="h1" tabular weight="semibold" style={{ marginTop: spacing.xs }}>
        {formatMoney(amount, currency)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs }}>
        <Text variant="caption" tabular weight="semibold" style={{ color }}>
          {arrow} {Math.abs(delta).toFixed(1)}%
        </Text>
        <Text variant="caption" tone="muted">vs anterior</Text>
      </View>
    </Card>
  );
};

const ProjectionCell: React.FC<{ label: string; value: number; currency: string; highlight?: boolean }> = ({
  label,
  value,
  currency,
  highlight,
}) => {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.projCell,
        {
          backgroundColor: highlight ? palette.accentSoft : palette.bgElevated,
          borderColor: highlight ? palette.accent : palette.borderSubtle,
        },
      ]}
    >
      <Text variant="caption" tone="muted">{label}</Text>
      <Text variant="h2" tabular weight="semibold" tone={value >= 0 ? 'primary' : 'danger'}>
        {formatMoney(value, currency)}
      </Text>
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flex: 1 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  kpiRow: { flexDirection: 'row', gap: spacing.sm },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carouselHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  budgetTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  pmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  pmIcon: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  projectionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  projCell: {
    flexBasis: '48%',
    flexGrow: 1,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
});
