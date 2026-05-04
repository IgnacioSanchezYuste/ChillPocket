import React, { useEffect, useMemo, useState } from 'react';
import { ScrollView, View, StyleSheet, Dimensions, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LineChart } from 'react-native-chart-kit';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { ProgressBar } from '../../components/ProgressBar';
import { EmptyState } from '../../components/EmptyState';
import { formatMoney, monthLabel, currentMonthYear } from '../../utils/format';

export const AnalyticsScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const { summary, monthly, categoryStats, projection, fetchAnalytics } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);

  useEffect(() => {
    fetchAnalytics();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics();
    setRefreshing(false);
  };

  const currency = user?.currency || 'EUR';
  const screenW = Dimensions.get('window').width;

  const monthlyData = useMemo(() => {
    return {
      labels: monthly.map((m) => m.month_year.slice(5)),
      income: monthly.map((m) => Number(m.income || 0)),
      expense: monthly.map((m) => Number(m.expense || 0)),
    };
  }, [monthly]);

  const expenseStats = categoryStats.filter((c) => c.type === 'expense');
  const totalExpenses = expenseStats.reduce((s, c) => s + Number(c.total), 0);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
      >
        <ScreenHeader title="Analítica" subtitle={monthLabel(summary?.month_year || currentMonthYear())} />

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {monthlyData.labels.length > 1 && (
            <Card padding="md">
              <Text variant="h2">Ingresos vs Gastos</Text>
              <Text variant="caption" tone="muted">Últimos {monthlyData.labels.length} meses</Text>
              <LineChart
                data={{
                  labels: monthlyData.labels,
                  datasets: [
                    { data: monthlyData.income, color: () => palette.success, strokeWidth: 2 },
                    { data: monthlyData.expense, color: () => palette.danger, strokeWidth: 2 },
                  ],
                  legend: ['Ingresos', 'Gastos'],
                }}
                width={screenW - spacing.lg * 2 - spacing.md * 2}
                height={200}
                withShadow={false}
                withDots
                bezier
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

          <Card>
            <Text variant="h2">Gastos por categoría</Text>
            <Text variant="caption" tone="muted">{monthLabel(summary?.month_year || currentMonthYear())}</Text>
            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              {expenseStats.length === 0 ? (
                <Text variant="body" tone="secondary">Sin gastos este mes.</Text>
              ) : (
                expenseStats.slice(0, 6).map((c) => {
                  const pct = totalExpenses > 0 ? (Number(c.total) / totalExpenses) * 100 : 0;
                  return (
                    <View key={`${c.category_id}-${c.type}`} style={{ gap: 6 }}>
                      <View style={styles.row}>
                        <View style={styles.left}>
                          <View style={[styles.dot, { backgroundColor: c.category_color }]} />
                          <Text variant="body" weight="medium">{c.category_name}</Text>
                        </View>
                        <Text variant="body" weight="semibold" tabular>
                          {formatMoney(Number(c.total), currency)}
                        </Text>
                      </View>
                      <ProgressBar value={pct} color={c.category_color} />
                      <Text variant="caption" tone="muted">{pct.toFixed(1)}% · {c.count} mov.</Text>
                    </View>
                  );
                })
              )}
            </View>
          </Card>

          {projection && (
            <Card>
              <Text variant="h2">Proyección</Text>
              <Text variant="caption" tone="muted">Basado en últimos 3 meses + recurrentes</Text>
              <View style={styles.projectionGrid}>
                <ProjectionCell label="Ingreso medio" value={projection.avg_monthly_income} currency={currency} />
                <ProjectionCell label="Gasto medio" value={projection.avg_monthly_expense} currency={currency} />
                <ProjectionCell label="Recurrente neto" value={projection.recurring_monthly_in - projection.recurring_monthly_out} currency={currency} />
                <ProjectionCell label="Neto mensual" value={projection.projected_monthly_net} currency={currency} highlight />
                <ProjectionCell label="A 6 meses" value={projection.projected_6_months} currency={currency} />
                <ProjectionCell label="A 12 meses" value={projection.projected_12_months} currency={currency} />
              </View>
            </Card>
          )}

          {monthlyData.labels.length === 0 && expenseStats.length === 0 && (
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
  left: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dot: { width: 8, height: 8, borderRadius: 4 },
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
