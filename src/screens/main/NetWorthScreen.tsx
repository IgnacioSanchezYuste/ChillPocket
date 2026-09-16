import React, { useCallback, useMemo, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { useFocusEffect } from '@react-navigation/native';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { useContentWidth } from '../../theme/layout';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton, SkeletonChart } from '../../components/Skeleton';
import { PremiumLock } from '../../components/PremiumLock';
import { useBilling } from '../../store/useBillingStore';
import { useCountUp } from '../../hooks/useCountUp';
import { formatMoney } from '../../utils/format';
import type { MonthlyPoint } from '../../api/types';

// ---------------------------------------------------------------------------
// Helpers de formato
// ---------------------------------------------------------------------------

function rgba(hex: string, alpha: number): string {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Abrevia un importe en formato compacto: €1.2k, €-3.4k, €400 */
function compactMoney(value: number, currency: string): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  const symbol = currency === 'EUR' ? '€' : currency;
  if (abs >= 1_000_000) return `${sign}${symbol}${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}k`;
  return `${sign}${symbol}${abs.toFixed(0)}`;
}

/** Etiqueta corta de mes: "ene 25", "feb 25"... */
function shortMonthLabel(monthYear: string): string {
  const [y, m] = monthYear.split('-').map(Number);
  if (!y || !m) return monthYear;
  const d = new Date(y, m - 1, 1);
  const mon = d.toLocaleDateString('es-ES', { month: 'short' }).replace('.', '');
  const yr = String(y).slice(2);
  return `${mon} ${yr}`;
}

// ---------------------------------------------------------------------------
// Cálculo de serie cumulativa
// ---------------------------------------------------------------------------

type CumulativePoint = {
  monthYear: string;
  surplus: number;
  cumulative: number;
};

function buildCumulativeSeries(monthly: MonthlyPoint[]): CumulativePoint[] {
  if (!monthly || monthly.length === 0) return [];
  // Ordenar cronológico (el backend devuelve desc a veces)
  const sorted = [...monthly].sort((a, b) => a.month_year.localeCompare(b.month_year));
  let acc = 0;
  return sorted.map((p) => {
    const surplus = Number(p.income || 0) - Number(p.expense || 0);
    acc += surplus;
    return { monthYear: p.month_year, surplus, cumulative: acc };
  });
}

// ---------------------------------------------------------------------------
// Pantalla principal
// ---------------------------------------------------------------------------

export const NetWorthScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const billing = useBilling();
  const canAdvanced = billing.hasFeature('advanced_analytics');
  const {
    summary,
    monthly,
    analyticsLoading,
    analyticsError,
    fetchAnalytics,
  } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const { width: screenW, columnStyle } = useContentWidth();
  const currency = user?.currency || 'EUR';

  useFocusEffect(
    useCallback(() => {
      // Solicita datos con ventana de 24 meses. El store usa throttle 30s;
      // solo hace HTTP si los datos son stale o es la primera vez.
      fetchAnalytics(undefined, false);
    }, [])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAnalytics(undefined, true);
    setRefreshing(false);
  };

  // Serie cumulativa
  const series = useMemo(() => buildCumulativeSeries(monthly), [monthly]);

  // Valor actual del patrimonio (último punto de la serie cumulativa)
  const currentNetWorth = summary?.net_total_historical ?? 0;

  // Delta vs mes anterior (diferencia del penúltimo al último en la serie)
  const lastDelta = useMemo(() => {
    if (series.length < 2) return null;
    return series[series.length - 1].surplus;
  }, [series]);

  // Stat cards
  const growth6m = useMemo(() => {
    if (series.length < 2) return null;
    const last = series[series.length - 1].cumulative;
    const sixAgo = series.length >= 7 ? series[series.length - 7].cumulative : series[0].cumulative;
    if (sixAgo === 0) return null;
    return ((last - sixAgo) / Math.abs(sixAgo)) * 100;
  }, [series]);

  const bestMonth = useMemo(() => {
    if (series.length === 0) return null;
    return series.reduce((best, p) => (p.surplus > best.surplus ? p : best), series[0]);
  }, [series]);

  const worstMonth = useMemo(() => {
    if (series.length === 0) return null;
    return series.reduce((worst, p) => (p.surplus < worst.surplus ? p : worst), series[0]);
  }, [series]);

  const avgMonthly = useMemo(() => {
    if (series.length === 0) return 0;
    const total = series.reduce((sum, p) => sum + p.surplus, 0);
    return total / series.length;
  }, [series]);

  // Datos para chart-kit
  const chartData = useMemo(() => {
    if (series.length === 0) return null;
    // Reducir labels para no sobrecargar el eje X (mostrar cada N meses)
    const step = series.length > 12 ? 3 : series.length > 6 ? 2 : 1;
    const labels = series.map((p, i) =>
      i % step === 0 ? shortMonthLabel(p.monthYear) : ''
    );
    const data = series.map((p) => p.cumulative);
    return { labels, datasets: [{ data, color: () => palette.accent, strokeWidth: 2.5 }] };
  }, [series, palette.accent]);

  // Ancho de la gráfica (sin padding de card)
  const chartW = screenW - spacing.lg * 2 - spacing.md * 2;

  // -------------------------------------------------------------------------
  // Estados de UI
  // -------------------------------------------------------------------------
  const hasData = summary !== null || monthly.length > 0;

  if (analyticsLoading && !hasData) {
    return <NetWorthSkeleton />;
  }

  if (analyticsError && !hasData) {
    return (
      <View style={{ flex: 1, backgroundColor: palette.bgBase }}>
        <SafeAreaView style={{ flex: 1 }} edges={['top']}>
          <ScreenHeader
            title="Patrimonio neto"
            subtitle="Evolución de tus ahorros"
            showBack
          />
          <View style={{ flex: 1, justifyContent: 'center' }}>
            <ErrorState
              title="No pudimos cargar tus datos"
              description={analyticsError}
              onRetry={() => fetchAnalytics(undefined, true)}
            />
          </View>
        </SafeAreaView>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: palette.bgBase }}>
      <LinearGradient colors={palette.gradientApp as any} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={palette.accent}
            />
          }
        >
          <View style={columnStyle}>
            <ScreenHeader
              title="Patrimonio neto"
              subtitle="Evolución de tus ahorros"
              showBack
            />

            {/* Gate Plus */}
            {!canAdvanced ? (
              <View style={{ paddingHorizontal: spacing.lg }}>
                <PremiumLock label="Patrimonio neto" feature="advanced_analytics" />
              </View>
            ) : (
              <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>

                {/* Hero card */}
                <NetWorthHero
                  value={currentNetWorth}
                  delta={lastDelta}
                  currency={currency}
                  palette={palette}
                />

                {/* Empty state (usuario sin serie) */}
                {series.length === 0 ? (
                  <EmptyState
                    icon="trending-up-outline"
                    title="Aún no hay evolución"
                    description="Cuando registres movimientos, verás tu patrimonio crecer."
                  />
                ) : (
                  <>
                    {/* Gráfica de evolución */}
                    {chartData && (
                      <Card padding="md">
                        <Text variant="h2">Evolución del patrimonio</Text>
                        <Text variant="caption" tone="muted">
                          {series.length} {series.length === 1 ? 'mes' : 'meses'} con actividad
                        </Text>
                        <LineChart
                          data={chartData}
                          width={chartW}
                          height={220}
                          withShadow={false}
                          withDots={series.length <= 12}
                          bezier
                          fromZero={false}
                          formatYLabel={(v) => compactMoney(Number(v), currency)}
                          chartConfig={{
                            backgroundGradientFrom: palette.bgSurface,
                            backgroundGradientTo: palette.bgSurface,
                            decimalPlaces: 0,
                            color: (opacity = 1) => rgba(palette.accent, opacity),
                            labelColor: () => palette.textMuted,
                            propsForBackgroundLines: {
                              stroke: palette.borderSubtle,
                              strokeDasharray: '4 6',
                            },
                            propsForDots: {
                              r: '3.5',
                              strokeWidth: '2',
                              stroke: palette.bgSurface,
                            },
                          }}
                          style={{ marginTop: spacing.sm, marginLeft: -8 }}
                        />
                        <Text variant="caption" tone="muted" style={styles.chartDisclaimer}>
                          El último valor puede diferir del actual si el mes en curso aún no ha cerrado.
                        </Text>
                      </Card>
                    )}

                    {/* Stat cards 2x2 */}
                    <View style={styles.statsGrid}>
                      <StatCard
                        icon="trending-up-outline"
                        label="Crecimiento 6 meses"
                        palette={palette}
                      >
                        {growth6m === null ? (
                          <Text variant="body" tone="muted">Sin datos</Text>
                        ) : (
                          <Text
                            variant="h2"
                            tabular
                            weight="bold"
                            style={{
                              color: growth6m >= 0 ? palette.success : palette.danger,
                            }}
                          >
                            {growth6m >= 0 ? '+' : ''}
                            {growth6m.toFixed(1)}%
                          </Text>
                        )}
                      </StatCard>

                      <StatCard
                        icon="stats-chart-outline"
                        label="Promedio mensual"
                        palette={palette}
                      >
                        <Text
                          variant="h2"
                          tabular
                          weight="bold"
                          style={{
                            color: avgMonthly >= 0 ? palette.success : palette.danger,
                          }}
                        >
                          {formatMoney(avgMonthly, currency)}
                        </Text>
                      </StatCard>

                      <StatCard
                        icon="rocket-outline"
                        label="Mejor mes"
                        palette={palette}
                      >
                        {bestMonth ? (
                          <>
                            <Text variant="caption" tone="muted">
                              {shortMonthLabel(bestMonth.monthYear)}
                            </Text>
                            <Text
                              variant="h2"
                              tabular
                              weight="bold"
                              style={{ color: palette.success }}
                            >
                              {formatMoney(bestMonth.surplus, currency)}
                            </Text>
                          </>
                        ) : (
                          <Text variant="body" tone="muted">Sin datos</Text>
                        )}
                      </StatCard>

                      <StatCard
                        icon="arrow-down-circle-outline"
                        label="Mes más bajo"
                        palette={palette}
                      >
                        {worstMonth ? (
                          worstMonth.surplus >= 0 ? (
                            <Text variant="caption" tone="muted" style={{ color: palette.success }}>
                              Sin meses negativos
                            </Text>
                          ) : (
                            <>
                              <Text variant="caption" tone="muted">
                                {shortMonthLabel(worstMonth.monthYear)}
                              </Text>
                              <Text
                                variant="h2"
                                tabular
                                weight="bold"
                                style={{ color: palette.danger }}
                              >
                                {formatMoney(worstMonth.surplus, currency)}
                              </Text>
                            </>
                          )
                        ) : (
                          <Text variant="body" tone="muted">Sin datos</Text>
                        )}
                      </StatCard>
                    </View>

                    {/* Footer informativo */}
                    <Text variant="caption" tone="muted" align="center" style={styles.footer}>
                      Datos basados en los últimos {series.length}{' '}
                      {series.length === 1 ? 'mes' : 'meses'} con actividad.
                      Cuanto más uses ChillPocket, más precisa será tu evolución.
                    </Text>
                  </>
                )}
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

const NetWorthHero: React.FC<{
  value: number;
  delta: number | null;
  currency: string;
  palette: ReturnType<typeof useTheme>['palette'];
}> = ({ value, delta, currency, palette }) => {
  const animated = useCountUp(value, 800);
  const isPositive = value >= 0;
  const deltaColor =
    delta === null
      ? palette.textMuted
      : delta > 0
      ? palette.success
      : delta < 0
      ? palette.danger
      : palette.textMuted;
  const deltaArrow = delta === null ? '' : delta > 0 ? '▲ ' : delta < 0 ? '▼ ' : '— ';

  return (
    <LinearGradient
      colors={palette.gradientHero as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.heroCard, { borderColor: palette.borderSubtle }]}
    >
      <View style={[styles.heroIcon, { backgroundColor: rgba(palette.accent, 0.16) }]}>
        <Ionicons name="diamond-outline" size={20} color={palette.accent} />
      </View>
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
        Patrimonio acumulado
      </Text>
      <Text
        variant="display"
        tabular
        weight="bold"
        style={{ color: isPositive ? palette.textPrimary : palette.danger, marginTop: 4 }}
      >
        {formatMoney(animated, currency)}
      </Text>
      {delta !== null && (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: spacing.xs }}>
          <Text variant="label" tabular weight="semibold" style={{ color: deltaColor }}>
            {deltaArrow}
            {formatMoney(Math.abs(delta), currency)}
          </Text>
          <Text variant="caption" tone="muted">vs mes anterior</Text>
        </View>
      )}
    </LinearGradient>
  );
};

const StatCard: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  palette: ReturnType<typeof useTheme>['palette'];
  children: React.ReactNode;
}> = ({ icon, label, palette, children }) => (
  <View style={[styles.statCard, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}>
    <View style={[styles.statIcon, { backgroundColor: palette.accentSoft }]}>
      <Ionicons name={icon} size={16} color={palette.accent} />
    </View>
    <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
      {label}
    </Text>
    <View style={{ marginTop: spacing.xs }}>{children}</View>
  </View>
);

// ---------------------------------------------------------------------------
// Skeleton
// ---------------------------------------------------------------------------

const NetWorthSkeleton: React.FC = () => {
  const { palette } = useTheme();
  return (
    <View style={{ flex: 1, backgroundColor: palette.bgBase }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl }} showsVerticalScrollIndicator={false}>
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.md, paddingBottom: spacing.lg, gap: spacing.sm }}>
            <Skeleton width={200} height={28} borderRadius={8} />
            <Skeleton width={160} height={16} borderRadius={6} />
          </View>
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            {/* Hero skeleton */}
            <Skeleton height={110} borderRadius={radius.xl} />
            {/* Chart skeleton */}
            <SkeletonChart height={220} />
            {/* Stat cards skeleton */}
            <View style={styles.statsGrid}>
              <Skeleton height={100} style={{ flex: 1 }} borderRadius={radius.lg} />
              <Skeleton height={100} style={{ flex: 1 }} borderRadius={radius.lg} />
              <Skeleton height={100} style={{ flex: 1 }} borderRadius={radius.lg} />
              <Skeleton height={100} style={{ flex: 1 }} borderRadius={radius.lg} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  heroCard: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
  },
  heroIcon: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
  },
  statCard: {
    flexBasis: '47%',
    flexGrow: 1,
    borderRadius: radius.lg,
    borderWidth: 1,
    padding: spacing.md,
    minHeight: 90,
  },
  statIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chartDisclaimer: {
    marginTop: spacing.sm,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  footer: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.sm,
  },
});
