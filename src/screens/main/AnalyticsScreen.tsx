import React, { useCallback, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BarChart, LineChart } from 'react-native-chart-kit';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { useContentWidth, useBreakpoint } from '../../theme/layout';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { EmptyState } from '../../components/EmptyState';
import { SpendingHabits } from '../../components/SpendingHabits';
import { DonutChart } from '../../components/DonutChart';
import { Sparkline } from '../../components/Sparkline';
import { MonthPickerModal } from '../../components/MonthPickerModal';
import { formatMoney, monthLabel, currentMonthYear } from '../../utils/format';
import { paymentMethodLabel, paymentMethodMeta } from '../../utils/paymentMethods';
import { categoryIonicon } from '../../utils/categoryIcon';
import type { CategoryStat, PaymentMethod } from '../../api/types';

function rgba(hex: string, alpha: number) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const AnalyticsScreen: React.FC = () => {
  const { palette, mode } = useTheme();
  const { user } = useAuthStore();
  const navigation = useNavigation<any>();
  const {
    summary,
    monthly,
    categoryStats,
    categoryComparison,
    paymentMethodStats,
    daily,
    projection,
    budgets,
    analyticsMonth,
    fetchAnalytics,
    fetchBudgets,
  } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [carouselMonth, setCarouselMonth] = useState<string>(currentMonthYear());
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);

  const carouselCategories: CategoryStat[] = useMemo(() => {
    if (carouselMonth === (summary?.month_year || currentMonthYear())) {
      return categoryStats.filter((c) => c.type === 'expense');
    }
    return categoryComparison
      .filter((r) => r.month_year === carouselMonth)
      .map<CategoryStat>((r) => ({
        category_id: r.category_id,
        category_name: r.category_name,
        category_color: r.category_color,
        category_icon: null,
        type: 'expense',
        total: Number(r.total),
        count: 0,
      }));
  }, [carouselMonth, categoryStats, categoryComparison, summary?.month_year]);

  useFocusEffect(
    useCallback(() => {
      fetchAnalytics();
      fetchBudgets();
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([fetchAnalytics(undefined, true), fetchBudgets(undefined, true)]);
    setRefreshing(false);
  };

  const currency = user?.currency || 'EUR';
  const { width: screenW, columnStyle } = useContentWidth();
  const { isLg } = useBreakpoint();
  // En desktop, comparativa y línea van en 2 columnas → cada gráfica a media anchura.
  const chartWFull = screenW - spacing.lg * 2 - spacing.md * 2;
  const chartWHalf = Math.max(160, (screenW - spacing.lg * 2 - spacing.lg) / 2 - spacing.md * 2);
  const chartW = isLg ? chartWHalf : chartWFull;
  const pmBudgetsRow = isLg && paymentMethodStats.length > 0 && budgets.length > 0;
  const selectedMonth = summary?.month_year || analyticsMonth || currentMonthYear();

  const selectMonth = (m: string) => {
    setMonthPickerOpen(false);
    setCarouselMonth(m);
    fetchAnalytics(m, true);
    fetchBudgets(m, true);
  };

  const monthlyData = useMemo(() => {
    return {
      labels: monthly.map((m) => m.month_year.slice(5)),
      income: monthly.map((m) => Number(m.income || 0)),
      expense: monthly.map((m) => Number(m.expense || 0)),
    };
  }, [monthly]);

  const totalExpenses = carouselCategories.reduce((s, c) => s + Number(c.total), 0);

  // Donut: categorías ordenadas desc.
  const sortedCats = useMemo(
    () => [...carouselCategories].sort((a, b) => Number(b.total) - Number(a.total)),
    [carouselCategories]
  );
  const donutSegments = useMemo(
    () => sortedCats.map((c) => ({ value: Number(c.total), color: c.category_color || palette.accent })),
    [sortedCats, palette.accent]
  );

  // Sparklines de las cards comparativas (serie diaria del mes).
  const incomeSpark = useMemo(() => {
    const d = daily.map((p) => Number(p.income || 0));
    return d.length > 1 ? d : monthlyData.income;
  }, [daily, monthlyData.income]);
  const expenseSpark = useMemo(() => {
    const d = daily.map((p) => Number(p.expense || 0));
    return d.length > 1 ? d : monthlyData.expense;
  }, [daily, monthlyData.expense]);

  // Comparativa con mes anterior
  const prevExpense = summary?.previous?.total_expense ?? 0;
  const currentExpense = summary?.total_expense ?? 0;
  const expenseDelta = prevExpense > 0 ? ((currentExpense - prevExpense) / prevExpense) * 100 : 0;
  const prevIncome = summary?.previous?.total_income ?? 0;
  const currentIncome = summary?.total_income ?? 0;
  const incomeDelta = prevIncome > 0 ? ((currentIncome - prevIncome) / prevIncome) * 100 : 0;

  const shiftCarousel = (delta: number) => {
    const [y, m] = carouselMonth.split('-').map(Number);
    const target = new Date(y, m - 1 + delta, 1);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), 1);
    if (target > today) return;
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

  const projNet = projection?.projected_monthly_net ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: palette.bgBase }}>
      <LinearGradient colors={palette.gradientApp as any} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
        >
         <View style={columnStyle}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text variant="h1" style={{ fontSize: 26 }}>Analítica</Text>
              <Pressable
                onPress={() => setMonthPickerOpen(true)}
                hitSlop={8}
                style={[styles.monthPill, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}
              >
                <Text variant="label" tone="secondary" weight="medium" style={{ textTransform: 'capitalize' }}>
                  {monthLabel(selectedMonth)}
                </Text>
                <Ionicons name="chevron-down" size={14} color={palette.textSecondary} />
              </Pressable>
            </View>
            <Pressable
              onPress={() => setMonthPickerOpen(true)}
              style={[styles.headerBtn, { backgroundColor: palette.bgSurface, shadowColor: mode === 'dark' ? '#000' : '#1B1B2F' }]}
              accessibilityRole="button"
              accessibilityLabel="Cambiar mes"
            >
              <Ionicons name="calendar-outline" size={20} color={palette.accent} />
            </Pressable>
          </View>

          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {/* Cards comparativa con sparkline de fondo */}
            {summary && (
              <View style={styles.kpiRow}>
                <DeltaCard
                  label="Ingresos vs mes anterior"
                  amount={currentIncome}
                  delta={incomeDelta}
                  spark={incomeSpark}
                  color={palette.success}
                  currency={currency}
                />
                <DeltaCard
                  label="Gastos vs mes anterior"
                  amount={currentExpense}
                  delta={expenseDelta}
                  spark={expenseSpark}
                  color={palette.danger}
                  inverted
                  currency={currency}
                />
              </View>
            )}

            {/* Gastos por categoría · donut + leyenda */}
            <Card padding="lg">
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

              {sortedCats.length === 0 ? (
                <Text variant="body" tone="secondary" style={{ marginTop: spacing.md }}>
                  Sin gastos este mes.
                </Text>
              ) : (
                <>
                  <View style={isLg ? { flexDirection: 'row', gap: spacing.xl, alignItems: 'center' } : undefined}>
                  <View style={styles.donutWrap}>
                    <DonutChart
                      segments={donutSegments}
                      size={156}
                      strokeWidth={24}
                      trackColor={palette.bgElevated}
                    >
                      <Text variant="caption" tone="muted">Total</Text>
                      <Text variant="h2" tabular weight="bold">
                        {formatMoney(totalExpenses, currency)}
                      </Text>
                    </DonutChart>
                  </View>

                  <View style={isLg ? { flex: 1, gap: spacing.md } : { gap: spacing.md, marginTop: spacing.lg }}>
                    {sortedCats.slice(0, 6).map((c) => {
                      const color = c.category_color || palette.accent;
                      const pct = totalExpenses > 0 ? (Number(c.total) / totalExpenses) * 100 : 0;
                      return (
                        <View key={`${c.category_id}-${c.type}`} style={styles.legendRow}>
                          <View style={[styles.catIcon, { backgroundColor: rgba(color, 0.16) }]}>
                            <Ionicons name={categoryIonicon(c.category_icon, 'expense')} size={18} color={color} />
                          </View>
                          <View style={{ flex: 1, gap: 6 }}>
                            <View style={styles.rowBetween}>
                              <Text variant="body" weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
                                {c.category_name}
                              </Text>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.sm }}>
                                <Text variant="body" weight="semibold" tabular>
                                  {formatMoney(Number(c.total), currency)}
                                </Text>
                                <View style={[styles.pctBadge, { backgroundColor: rgba(color, 0.16) }]}>
                                  <Text variant="caption" weight="bold" style={{ color }}>
                                    {Math.round(pct)}%
                                  </Text>
                                </View>
                              </View>
                            </View>
                            <ProgressBar value={Math.min(100, pct)} color={color} />
                          </View>
                        </View>
                      );
                    })}
                  </View>
                  </View>

                  <View style={[styles.footerLine, { borderTopColor: palette.borderSubtle }]}>
                    <Text variant="caption" tone="muted">
                      100% del total · {sortedCats.length}{' '}
                      {sortedCats.length === 1 ? 'categoría' : 'categorías'}
                    </Text>
                  </View>
                </>
              )}
            </Card>

            {/* Proyección mensual (forecast) */}
            {projection && (
              <LinearGradient
                colors={palette.gradientHero as any}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.forecast, { borderColor: palette.borderSubtle }]}
              >
                <View style={styles.forecastHead}>
                  <View style={[styles.forecastIcon, { backgroundColor: rgba(palette.accent, 0.18) }]}>
                    <Ionicons name="sparkles" size={16} color={palette.accent} />
                  </View>
                  <Text variant="label" tone="secondary" weight="semibold">Proyección mensual</Text>
                </View>
                <Text variant="body" tone="secondary" style={{ marginTop: spacing.sm }}>
                  {projNet >= 0
                    ? 'Si mantienes este ritmo, este mes ahorrarás'
                    : 'A este ritmo, este mes cerrarás con un saldo de'}
                </Text>
                <Text variant="display" tabular tone={projNet >= 0 ? 'success' : 'danger'} style={{ marginVertical: 2 }}>
                  {formatMoney(projNet, currency)}
                </Text>
                {monthlyData.income.length > 1 && (
                  <View style={{ marginTop: spacing.sm }}>
                    <Sparkline
                      data={monthlyData.income.map((v, i) => v - (monthlyData.expense[i] || 0))}
                      width={screenW - spacing.lg * 2 - spacing.xl * 2}
                      height={44}
                      color={projNet >= 0 ? palette.success : palette.danger}
                    />
                  </View>
                )}
                <View style={styles.projectionGrid}>
                  <ProjectionCell label="Ingreso medio" value={projection.avg_monthly_income} currency={currency} />
                  <ProjectionCell label="Gasto medio" value={projection.avg_monthly_expense} currency={currency} />
                  <ProjectionCell label="A 6 meses" value={projection.projected_6_months} currency={currency} />
                  <ProjectionCell label="A 12 meses" value={projection.projected_12_months} currency={currency} highlight />
                </View>
              </LinearGradient>
            )}

            {/* Comparativa mensual + Ingresos vs gastos (2 columnas en desktop) */}
            {monthlyData.labels.length > 1 && (
            <View style={isLg ? { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' } : { gap: spacing.md }}>
              <View style={isLg ? { flex: 1 } : undefined}>
              <Card padding="md">
                <Text variant="h2">Comparativa mensual</Text>
                <Text variant="caption" tone="muted">
                  Últimos {monthlyData.labels.length} meses · gastos por mes
                </Text>
                <BarChart
                  data={{ labels: monthlyData.labels, datasets: [{ data: monthlyData.expense }] }}
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
                    color: (opacity = 1) => `rgba(108, 99, 241, ${opacity})`,
                    labelColor: () => palette.textMuted,
                    barPercentage: 0.6,
                    propsForBackgroundLines: { stroke: palette.borderSubtle, strokeDasharray: '4 6' },
                  }}
                  style={{ marginTop: spacing.sm, marginLeft: -8 }}
                />
              </Card>
              </View>

              <View style={isLg ? { flex: 1 } : undefined}>
              <Card padding="md">
                <Text variant="h2">Ingresos vs Gastos</Text>
                <Text variant="caption" tone="muted">Tendencia</Text>
                <LineChart
                  data={{
                    labels: monthlyData.labels,
                    datasets: [
                      { data: monthlyData.income, color: () => palette.success, strokeWidth: 2.5 },
                      { data: monthlyData.expense, color: () => palette.danger, strokeWidth: 2.5 },
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
                    propsForBackgroundLines: { stroke: palette.borderSubtle, strokeDasharray: '4 6' },
                    propsForDots: { r: '3.5', strokeWidth: '2', stroke: palette.bgSurface },
                  }}
                  style={{ marginTop: spacing.sm, marginLeft: -8 }}
                />
              </Card>
              </View>
            </View>
            )}

            {/* Hábitos de gasto */}
            {daily.length > 0 && (
              <SpendingHabits monthYear={summary?.month_year || currentMonthYear()} daily={daily} currency={currency} />
            )}

            {/* Por tipo de pago + Presupuestos (2 columnas en desktop) */}
            <View style={pmBudgetsRow ? { flexDirection: 'row', gap: spacing.lg, alignItems: 'flex-start' } : { gap: spacing.md }}>
            {paymentMethodStats.length > 0 && (
              <View style={pmBudgetsRow ? { flex: 1 } : undefined}>
              <Card>
                <Text variant="h2">Por tipo de pago</Text>
                <Text variant="caption" tone="muted">{monthLabel(summary?.month_year || currentMonthYear())}</Text>
                <View style={{ marginTop: spacing.md }}>
                  {paymentMethodStats.map((pm, i) => {
                    const meta = paymentMethodMeta(pm.payment_method as PaymentMethod);
                    const share =
                      currentExpense > 0 ? Math.round((Number(pm.total) / currentExpense) * 100) : 0;
                    return (
                      <View
                        key={pm.payment_method}
                        style={[
                          styles.pmRow,
                          i > 0 && { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: palette.borderSubtle },
                        ]}
                      >
                        <View style={[styles.pmIcon, { backgroundColor: rgba(palette.accent, 0.14) }]}>
                          <Ionicons
                            name={meta?.icon ?? 'ellipsis-horizontal-circle-outline'}
                            size={18}
                            color={palette.accent}
                          />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text variant="body" weight="medium">{paymentMethodLabel(pm.payment_method as any)}</Text>
                          <Text variant="caption" tone="muted">
                            {pm.count} {pm.count === 1 ? 'movimiento' : 'movimientos'} · {share}% del gasto
                          </Text>
                        </View>
                        <Text variant="body" weight="semibold" tabular>
                          {formatMoney(Number(pm.total), currency)}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              </Card>
              </View>
            )}

            {/* Presupuestos */}
            {budgets.length > 0 && (
              <View style={pmBudgetsRow ? { flex: 1 } : undefined}>
              <Card>
                <View style={styles.rowBetween}>
                  <Text variant="h2">Presupuestos</Text>
                  <Pressable onPress={() => navigation.navigate('Budgets')} hitSlop={6} style={styles.seeAll}>
                    <Text variant="label" tone="accent" weight="semibold">Gestionar</Text>
                    <Ionicons name="chevron-forward" size={14} color={palette.accent} />
                  </Pressable>
                </View>
                <View style={{ marginTop: spacing.md, gap: spacing.lg }}>
                  {budgets.slice(0, 5).map((b) => {
                    const limit = Number(b.amount);
                    const spent = Number(b.spent);
                    const pct = limit > 0 ? (spent / limit) * 100 : 0;
                    const state = pct > 100 ? 'over' : pct > 80 ? 'warn' : 'ok';
                    const stateColor =
                      state === 'over' ? palette.danger : state === 'warn' ? palette.warning : palette.success;
                    const barColor = b.category_color || palette.accent;
                    const grad =
                      state === 'over'
                        ? [palette.danger, '#FF8AA0']
                        : state === 'warn'
                        ? [palette.warning, '#FFD27D']
                        : [barColor, rgba(barColor, 0.55)];
                    return (
                      <View key={b.id} style={{ gap: 8 }}>
                        <View style={styles.legendRow}>
                          <View style={[styles.catIcon, { backgroundColor: rgba(barColor, 0.16) }]}>
                            <Ionicons name={categoryIonicon(b.category_icon, 'expense')} size={18} color={barColor} />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text variant="body" weight="medium">{b.category_name || 'Global'}</Text>
                            <Text variant="caption" tone="muted" tabular>
                              {formatMoney(spent, currency)} / {formatMoney(limit, currency)}
                            </Text>
                          </View>
                          <View style={[styles.pctBadge, { backgroundColor: rgba(stateColor, 0.16) }]}>
                            <Text variant="caption" weight="bold" style={{ color: stateColor }}>
                              {Math.round(pct)}%
                            </Text>
                          </View>
                        </View>
                        <View style={[styles.gradTrack, { backgroundColor: palette.bgElevated }]}>
                          <LinearGradient
                            colors={grad as any}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={[styles.gradFill, { width: `${Math.min(100, pct)}%` }]}
                          />
                        </View>
                      </View>
                    );
                  })}
                </View>
              </Card>
              </View>
            )}
            </View>

            {monthlyData.labels.length === 0 && sortedCats.length === 0 && (
              <EmptyState
                icon="bar-chart-outline"
                title="Aún sin datos"
                description="Crea unas cuantas transacciones y vuelve aquí para ver tu analítica."
              />
            )}
          </View>
         </View>
        </ScrollView>
      </SafeAreaView>

      <MonthPickerModal
        visible={monthPickerOpen}
        selected={selectedMonth}
        onSelect={selectMonth}
        onClose={() => setMonthPickerOpen(false)}
      />
    </View>
  );
};

const DeltaCard: React.FC<{
  label: string;
  amount: number;
  delta: number;
  spark: number[];
  color: string;
  currency: string;
  inverted?: boolean;
}> = ({ label, amount, delta, spark, color, currency, inverted }) => {
  const { palette } = useTheme();
  const isGood = inverted ? delta < 0 : delta > 0;
  const isBad = inverted ? delta > 0 : delta < 0;
  const deltaColor = isGood ? palette.success : isBad ? palette.danger : palette.textMuted;
  const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '·';
  return (
    <View style={[styles.deltaCard, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}>
      {spark.length > 1 && (
        <View style={styles.deltaSpark} pointerEvents="none">
          <Sparkline data={spark} width={170} height={48} color={color} showLastDot={false} strokeWidth={2} />
        </View>
      )}
      <Text variant="caption" tone="muted" numberOfLines={2}>{label}</Text>
      <Text variant="h1" tabular weight="bold" style={{ marginTop: spacing.xs, color }}>
        {formatMoney(amount, currency)}
      </Text>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs }}>
        <Text variant="caption" tabular weight="semibold" style={{ color: deltaColor }}>
          {arrow} {Math.abs(delta).toFixed(1)}%
        </Text>
        <Text variant="caption" tone="muted">vs anterior</Text>
      </View>
    </View>
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
          backgroundColor: highlight ? rgba(palette.accent, 0.14) : palette.bgSurface,
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
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  monthPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    alignSelf: 'flex-start',
    marginTop: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 5,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  headerBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  kpiRow: { flexDirection: 'row', gap: spacing.md },
  deltaCard: {
    flex: 1,
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.lg,
    overflow: 'hidden',
    minHeight: 120,
    justifyContent: 'flex-end',
  },
  deltaSpark: { position: 'absolute', right: 0, bottom: 0, opacity: 0.5 },
  rowBetween: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  carouselHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  arrow: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  donutWrap: { alignItems: 'center', marginTop: spacing.lg },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  catIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pctBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    minWidth: 38,
    alignItems: 'center',
  },
  footerLine: { marginTop: spacing.lg, paddingTop: spacing.md, borderTopWidth: 1, alignItems: 'center' },
  forecast: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    overflow: 'hidden',
  },
  forecastHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  forecastIcon: { width: 30, height: 30, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  projectionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  projCell: { flexBasis: '47%', flexGrow: 1, padding: spacing.md, borderRadius: radius.md, borderWidth: 1, gap: 4 },
  pmRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.md },
  pmIcon: { width: 38, height: 38, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  gradTrack: { height: 9, borderRadius: radius.pill, overflow: 'hidden' },
  gradFill: { height: '100%', borderRadius: radius.pill },
});
