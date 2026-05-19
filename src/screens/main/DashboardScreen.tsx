import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet, RefreshControl, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { KPICard } from '../../components/KPICard';
import { TransactionRow } from '../../components/TransactionRow';
import { FAB } from '../../components/FAB';
import { ScreenHeader } from '../../components/ScreenHeader';
import { BrandLogo } from '../../components/BrandLogo';
import { SkeletonTransactionRow } from '../../components/Skeleton';
import { TransactionSheet } from '../modals/TransactionSheet';
import { formatMoney, monthLabel, currentMonthYear } from '../../utils/format';
import type { Transaction } from '../../api/types';

export const DashboardScreen: React.FC = () => {
  const { palette, mode } = useTheme();
  const navigation = useNavigation<any>();
  const { user } = useAuthStore();
  const {
    summary,
    trends,
    transactions,
    transactionsLoading,
    transactionsLoadedAt,
    refreshAll,
    fetchAnalytics,
    fetchTransactions,
  } = useDataStore();
  const showRecentSkeleton = transactionsLoading && transactionsLoadedAt === 0;
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // Refrescar tanto en montaje como cada vez que la pantalla recibe foco
  useFocusEffect(useCallback(() => { refreshAll(); }, []));

  useEffect(() => {
    const id = setInterval(() => {
      fetchAnalytics();
      fetchTransactions();
    }, 60_000);
    return () => clearInterval(id);
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll(true);
    setRefreshing(false);
  };

  const currency = user?.currency || 'EUR';
  const recent = transactions.slice(0, 5);

  const screenW = Dimensions.get('window').width;
  const chartData = useMemo(() => {
    const last = trends.slice(-7);
    const labels = last.map((p) => p.transaction_date.slice(5));
    const expenses = last.map((p) => Number(p.expense || 0));
    const incomes = last.map((p) => Number(p.income || 0));
    return { labels, expenses, incomes };
  }, [trends]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.content}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
      >
        <ScreenHeader
          title={`Hola, ${user?.name?.split(' ')[0] || ''}`}
          subtitle={monthLabel(summary?.month_year || currentMonthYear())}
          right={<BrandLogo size={44} />}
        />

        <View style={{ paddingHorizontal: spacing.lg }}>
          <Card>
            <Text variant="label" tone="secondary">Saldo del mes</Text>
            <Text variant="display" tabular tone={(summary?.balance ?? 0) >= 0 ? 'success' : 'danger'}>
              {formatMoney(summary?.balance ?? 0, currency)}
            </Text>
            <View style={styles.balanceRow}>
              <View style={styles.balanceCol}>
                <Text variant="caption" tone="muted">Ingresos</Text>
                <Text variant="body" weight="semibold" tabular tone="success">
                  {formatMoney(summary?.total_income ?? 0, currency)}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: palette.borderSubtle }]} />
              <View style={styles.balanceCol}>
                <Text variant="caption" tone="muted">Gastos</Text>
                <Text variant="body" weight="semibold" tabular tone="danger">
                  {formatMoney(summary?.total_expense ?? 0, currency)}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: palette.borderSubtle }]} />
              <View style={styles.balanceCol}>
                <Text variant="caption" tone="muted">Ahorrado</Text>
                <Text variant="body" weight="semibold" tabular>
                  {summary?.savings_ratio ?? 0}%
                </Text>
              </View>
            </View>
          </Card>
        </View>

        <View style={[styles.kpiRow]}>
          <KPICard
            label="Saldo total"
            amount={summary?.net_total_historical ?? 0}
            currency={currency}
            tone={(summary?.net_total_historical ?? 0) >= 0 ? 'success' : 'danger'}
            helper="Histórico"
          />
          <KPICard
            label="Gastos fijos"
            amount={summary?.recurring_monthly.expense ?? 0}
            currency={currency}
            tone="primary"
            helper="al mes"
          />
        </View>

        {chartData.labels.length > 1 && (
          <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md }}>
            <Card padding="md">
              <View style={styles.chartHeader}>
                <Text variant="h2">Últimos 7 días</Text>
                <Text variant="caption" tone="muted">Ingresos vs Gastos</Text>
              </View>
              <LineChart
                data={{
                  labels: chartData.labels,
                  datasets: [
                    { data: chartData.incomes, color: () => palette.success, strokeWidth: 2 },
                    { data: chartData.expenses, color: () => palette.danger, strokeWidth: 2 },
                  ],
                }}
                width={screenW - spacing.lg * 2 - spacing.md * 2}
                height={170}
                withShadow={false}
                withInnerLines={false}
                withOuterLines={false}
                withDots={false}
                bezier
                chartConfig={{
                  backgroundGradientFrom: palette.bgSurface,
                  backgroundGradientTo: palette.bgSurface,
                  decimalPlaces: 0,
                  color: () => palette.textMuted,
                  labelColor: () => palette.textMuted,
                  propsForBackgroundLines: { stroke: 'transparent' },
                }}
                style={{ borderRadius: 8, marginLeft: -8 }}
              />
            </Card>
          </View>
        )}

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm }}>
          <View style={styles.sectionHeader}>
            <Text variant="h2">Recientes</Text>
            {recent.length > 0 && (
              <Text variant="label" tone="accent" weight="semibold" onPress={() => navigation.navigate('Movimientos')}>
                Ver todas
              </Text>
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

        <View style={{ height: spacing.xxxl * 2 }} />
      </ScrollView>

      <FAB
        onPress={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      />

      <TransactionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={editing}
        onSaved={refreshAll}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.xl, gap: spacing.md },
  balanceRow: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  balanceCol: { flex: 1, gap: 2 },
  divider: { width: 1, height: 32 },
  kpiRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  chartHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    paddingBottom: spacing.sm,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between' },
});
