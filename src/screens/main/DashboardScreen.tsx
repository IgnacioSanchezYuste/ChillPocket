import React, { useCallback, useMemo, useState } from 'react';
import {
  ScrollView,
  View,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { useContentWidth, useBreakpoint } from '../../theme/layout';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { KPICard } from '../../components/KPICard';
import { BalanceHero } from '../../components/BalanceHero';
import { InsightBanner } from '../../components/InsightBanner';
import { BrandLogo } from '../../components/BrandLogo';
import { TransactionRow } from '../../components/TransactionRow';
import { FAB } from '../../components/FAB';
import { SkeletonTransactionRow } from '../../components/Skeleton';
import { MonthPickerModal } from '../../components/MonthPickerModal';
import { TransactionSheet } from '../modals/TransactionSheet';
import { monthLabel, currentMonthYear } from '../../utils/format';
import type { Transaction } from '../../api/types';

type ChartMode = 'both' | 'income' | 'expense';

export const DashboardScreen: React.FC = () => {
  const { palette, mode } = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const {
    summary,
    trends,
    daily,
    transactions,
    transactionsLoading,
    transactionsLoadedAt,
    analyticsMonth,
    refreshAll,
    fetchAnalytics,
  } = useDataStore();
  const showRecentSkeleton = transactionsLoading && transactionsLoadedAt === 0;
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [monthPickerOpen, setMonthPickerOpen] = useState(false);
  const [chartMode, setChartMode] = useState<ChartMode>('both');

  // Refresca al recibir el foco (con throttle de 30s del store). Sin polling:
  // un setInterval consumiría conexiones MySQL (cuota de Hostinger) sin valor real.
  useFocusEffect(useCallback(() => { refreshAll(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll(true);
    setRefreshing(false);
  };

  const currency = user?.currency || 'EUR';
  const recent = transactions.slice(0, 5);
  const selectedMonth = summary?.month_year || analyticsMonth || currentMonthYear();

  const selectMonth = (m: string) => {
    setMonthPickerOpen(false);
    fetchAnalytics(m, true);
  };

  const { width: contentW, columnStyle } = useContentWidth();
  const { isLg } = useBreakpoint();
  const rowGap = spacing.lg;
  const rowAvail = contentW - spacing.lg * 2;
  const chartColW = isLg ? Math.floor((rowAvail - rowGap) * 0.56) : rowAvail;
  const chartInner = Math.max(160, (isLg ? chartColW : rowAvail) - spacing.md * 2);
  const chartData = useMemo(() => {
    const last = trends.slice(-7);
    const labels = last.map((p) => p.transaction_date.slice(5));
    const expenses = last.map((p) => Number(p.expense || 0));
    const incomes = last.map((p) => Number(p.income || 0));
    return { labels, expenses, incomes };
  }, [trends]);

  // Sparklines decorativas para las KPI.
  const sparks = useMemo(() => {
    const last = trends.slice(-14);
    let acc = 0;
    const balance = last.map((p) => (acc += Number(p.income || 0) - Number(p.expense || 0)));
    const expense = last.map((p) => Number(p.expense || 0));
    return { balance, expense };
  }, [trends]);

  const datasets = useMemo(() => {
    const ds: { data: number[]; color: () => string; strokeWidth: number }[] = [];
    if (chartMode !== 'expense')
      ds.push({ data: chartData.incomes, color: () => palette.success, strokeWidth: 2.5 });
    if (chartMode !== 'income')
      ds.push({ data: chartData.expenses, color: () => palette.danger, strokeWidth: 2.5 });
    return ds;
  }, [chartMode, chartData, palette]);

  return (
    <View style={{ flex: 1, backgroundColor: palette.bgBase }}>
      <LinearGradient colors={palette.gradientApp as any} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
          }
        >
         <View style={[columnStyle, { gap: spacing.md }]}>
          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text variant="h1" style={{ fontSize: 26 }}>
                Hola, {user?.name?.split(' ')[0] || ''} 👋
              </Text>
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
              onPress={() => navigation.navigate('Settings')}
              style={[
                styles.headerBtn,
                { backgroundColor: palette.bgSurface, shadowColor: mode === 'dark' ? '#000' : '#1B1B2F' },
              ]}
              accessibilityRole="button"
              accessibilityLabel="Ajustes"
            >
              <BrandLogo size={28} withBackground={false} />
            </Pressable>
          </View>

          {/* Hero saldo */}
          <View style={{ paddingHorizontal: spacing.lg }}>
            <BalanceHero
              balance={summary?.balance ?? 0}
              income={summary?.total_income ?? 0}
              expense={summary?.total_expense ?? 0}
              savingsRatio={summary?.savings_ratio ?? 0}
              savedThisMonth={summary?.saved_this_month ?? 0}
              currency={currency}
            />
          </View>

          {/* Insight accionable */}
          <View style={{ paddingHorizontal: spacing.lg }}>
            <InsightBanner summary={summary} daily={daily} currency={currency} />
          </View>

          {/* KPIs */}
          <View style={styles.kpiRow}>
            <KPICard
              label="Saldo total"
              amount={summary?.net_total_historical ?? 0}
              currency={currency}
              tone={(summary?.net_total_historical ?? 0) >= 0 ? 'success' : 'danger'}
              helper="Histórico total"
              icon="wallet-outline"
              accentColor={palette.success}
              spark={sparks.balance}
            />
            <KPICard
              label="Gastos fijos"
              amount={summary?.recurring_monthly.expense ?? 0}
              currency={currency}
              tone="accent"
              helper="al mes"
              icon="repeat-outline"
              accentColor={palette.accent}
              spark={sparks.expense}
            />
          </View>

          {/* Gráfica + Recientes (lado a lado en desktop) */}
          <View
            style={
              isLg
                ? { flexDirection: 'row', alignItems: 'flex-start', gap: rowGap, paddingHorizontal: spacing.lg, marginTop: spacing.md }
                : undefined
            }
          >
          {chartData.labels.length > 1 && (
            <View style={isLg ? { width: chartColW } : { paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
              <Card padding="md">
                <View style={styles.chartHeader}>
                  <View>
                    <Text variant="h2">Últimos 7 días</Text>
                    <Text variant="caption" tone="muted">Evolución diaria</Text>
                  </View>
                  <View style={[styles.segment, { backgroundColor: palette.bgElevated }]}>
                    {(['both', 'income', 'expense'] as ChartMode[]).map((m) => {
                      const active = chartMode === m;
                      const labelTxt = m === 'both' ? 'Ambos' : m === 'income' ? 'Ingresos' : 'Gastos';
                      return (
                        <Pressable
                          key={m}
                          onPress={() => setChartMode(m)}
                          style={[styles.segmentBtn, active && { backgroundColor: palette.bgSurface }]}
                        >
                          <Text
                            variant="caption"
                            weight={active ? 'semibold' : 'regular'}
                            tone={active ? 'accent' : 'muted'}
                          >
                            {labelTxt}
                          </Text>
                        </Pressable>
                      );
                    })}
                  </View>
                </View>

                <LineChart
                  data={{ labels: chartData.labels, datasets }}
                  width={chartInner}
                  height={170}
                  withShadow={false}
                  withInnerLines
                  withOuterLines={false}
                  withDots
                  bezier
                  segments={3}
                  chartConfig={{
                    backgroundGradientFrom: palette.bgSurface,
                    backgroundGradientTo: palette.bgSurface,
                    decimalPlaces: 0,
                    color: () => palette.textMuted,
                    labelColor: () => palette.textMuted,
                    propsForBackgroundLines: { stroke: palette.borderSubtle, strokeDasharray: '4 6' },
                    propsForDots: { r: '3.5', strokeWidth: '2', stroke: palette.bgSurface },
                  }}
                  style={{ borderRadius: 8, marginLeft: -8 }}
                />

                <View style={styles.legend}>
                  {chartMode !== 'expense' && (
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: palette.success }]} />
                      <Text variant="caption" tone="secondary">Ingresos</Text>
                    </View>
                  )}
                  {chartMode !== 'income' && (
                    <View style={styles.legendItem}>
                      <View style={[styles.legendDot, { backgroundColor: palette.danger }]} />
                      <Text variant="caption" tone="secondary">Gastos</Text>
                    </View>
                  )}
                </View>
              </Card>
            </View>
          )}

          {/* Recientes */}
          <View style={isLg ? { flex: 1, gap: spacing.sm } : { paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm }}>
            <View style={styles.sectionHeader}>
              <Text variant="h2">Recientes</Text>
              {recent.length > 0 && (
                <Pressable onPress={() => navigation.navigate('Movimientos')} hitSlop={8} style={styles.seeAll}>
                  <Text variant="label" tone="accent" weight="semibold">Ver todas</Text>
                  <Ionicons name="chevron-forward" size={14} color={palette.accent} />
                </Pressable>
              )}
            </View>
            <Card padding="xs" style={{ paddingVertical: 0, paddingHorizontal: 0 }}>
              {showRecentSkeleton ? (
                <>
                  <SkeletonTransactionRow />
                  <SkeletonTransactionRow />
                  <SkeletonTransactionRow />
                </>
              ) : recent.length === 0 ? (
                <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                  <Ionicons name="receipt-outline" size={28} color={palette.textMuted} />
                  <Text variant="body" tone="secondary" style={{ marginTop: spacing.sm }}>
                    Aún no hay movimientos
                  </Text>
                </View>
              ) : (
                recent.map((t) => (
                  <TransactionRow
                    key={t.id}
                    tx={t}
                    currency={currency}
                    onPress={() => {
                      setEditing(t);
                      setSheetOpen(true);
                    }}
                  />
                ))
              )}
            </Card>
          </View>
          </View>

          <View style={{ height: spacing.xxxl * 2 }} />
         </View>
        </ScrollView>
      </SafeAreaView>

      <FAB
        onPress={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      />

      <MonthPickerModal
        visible={monthPickerOpen}
        selected={selectedMonth}
        onSelect={selectMonth}
        onClose={() => setMonthPickerOpen(false)}
      />

      <TransactionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={editing}
        onSaved={refreshAll}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
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
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: spacing.md,
  },
  segment: {
    flexDirection: 'row',
    borderRadius: radius.pill,
    padding: 3,
  },
  segmentBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  legend: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: spacing.sm,
    paddingLeft: 4,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 9, height: 9, borderRadius: 5 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  seeAll: { flexDirection: 'row', alignItems: 'center', gap: 2 },
});
