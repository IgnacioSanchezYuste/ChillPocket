import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, Pressable, TextInput } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LineChart } from 'react-native-chart-kit';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { formatMoney } from '../../utils/format';

type Frequency = 'weekly' | 'monthly' | 'yearly';

type Scenario = {
  id: string;
  name: string;
  shortName: string;
  rate: number;
  color: string;
  enabled: boolean;
};

const SCENARIO_DEFAULTS: Scenario[] = [
  { id: 'invest',      name: 'Mi inversión',      shortName: 'Inversión',   rate: 7,   color: '#6366F1', enabled: true },
  { id: 'remunerated', name: 'Cuenta remunerada', shortName: 'Remunerada',  rate: 2.5, color: '#10B981', enabled: true },
  { id: 'savings',     name: 'Cuenta ahorro',     shortName: 'Ahorro',      rate: 0.5, color: '#F59E0B', enabled: true },
];

function compoundProjection(
  initial: number,
  recurring: number,
  frequency: Frequency,
  annualRatePct: number,
  years: number
): { year: number; total: number; contributed: number; interest: number }[] {
  const periodsPerYear = frequency === 'weekly' ? 52 : frequency === 'monthly' ? 12 : 1;
  const ratePerPeriod = annualRatePct / 100 / periodsPerYear;
  const totalPeriods = Math.max(1, Math.round(periodsPerYear * years));

  const points: { year: number; total: number; contributed: number; interest: number }[] = [];
  let balance = initial;
  let contributed = initial;

  points.push({ year: 0, total: balance, contributed, interest: 0 });

  for (let i = 1; i <= totalPeriods; i++) {
    balance = balance * (1 + ratePerPeriod) + recurring;
    contributed += recurring;
    if (i % periodsPerYear === 0) {
      const y = i / periodsPerYear;
      points.push({
        year: y,
        total: balance,
        contributed,
        interest: balance - contributed,
      });
    }
  }
  return points;
}

export const InvestmentsScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const currency = user?.currency || 'EUR';
  const screenW = Dimensions.get('window').width;

  const [initial, setInitial] = useState('1000');
  const [recurring, setRecurring] = useState('100');
  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [years, setYears] = useState('20');
  const [rate, setRate] = useState('7');
  const [scenarios, setScenarios] = useState<Scenario[]>(SCENARIO_DEFAULTS);

  const updateScenario = (id: string, patch: Partial<Scenario>) => {
    setScenarios((arr) => arr.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const onCompute = () => {
    const r = parseFloat(rate.replace(',', '.'));
    if (Number.isFinite(r)) updateScenario('invest', { rate: r });
  };

  const data = useMemo(() => {
    const init = parseFloat(initial.replace(',', '.')) || 0;
    const rec = parseFloat(recurring.replace(',', '.')) || 0;
    const yr = Math.max(1, Math.min(60, parseInt(years, 10) || 1));
    return scenarios
      .filter((s) => s.enabled)
      .map((s) => ({
        scenario: s,
        points: compoundProjection(init, rec, frequency, s.rate, yr),
      }));
  }, [scenarios, initial, recurring, frequency, years]);

  const labels = useMemo(() => {
    if (!data[0]) return [];
    return data[0].points.map((p) => (p.year === 0 ? '0' : `${p.year}a`));
  }, [data]);

  const labelStep = Math.max(1, Math.ceil(labels.length / 6));
  const sparseLabels = labels.map((l, i) => (i % labelStep === 0 ? l : ''));

  const datasets = useMemo(
    () =>
      data.map((d) => ({
        data: d.points.map((p) => Math.round(p.total)),
        color: () => d.scenario.color,
        strokeWidth: 2.5,
      })),
    [data]
  );

  const primary = data.find((d) => d.scenario.id === 'invest');
  const primaryFinal = primary?.points[primary.points.length - 1];
  const primaryColor = primary?.scenario.color || palette.accent;

  // Para la sección "por años" mostramos hitos clave: 1, 5, 10, 15, 20...
  const milestoneYears = useMemo(() => {
    const yr = Math.max(1, Math.min(60, parseInt(years, 10) || 1));
    const step = yr <= 10 ? 1 : yr <= 25 ? 5 : 10;
    const list: number[] = [];
    for (let y = step; y <= yr; y += step) list.push(y);
    if (list[list.length - 1] !== yr) list.push(yr);
    return list;
  }, [years]);

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}>
        <ScreenHeader title="Inversiones" subtitle="Calculadora de interés compuesto" showBack />

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {/* Parámetros */}
          <Card>
            <Text variant="h2">Parámetros</Text>
            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              <Input
                label="Inversión inicial"
                keyboardType="decimal-pad"
                placeholder="0.00"
                value={initial}
                onChangeText={setInitial}
                leading={<Ionicons name="cash-outline" size={16} color={palette.textSecondary} />}
              />
              <Input
                label="Aportación periódica"
                keyboardType="decimal-pad"
                placeholder="0.00"
                value={recurring}
                onChangeText={setRecurring}
                leading={<Ionicons name="add-circle-outline" size={16} color={palette.textSecondary} />}
              />
              <View style={{ gap: 6 }}>
                <Text variant="label" tone="secondary">Frecuencia</Text>
                <SegmentedControl
                  options={[
                    { value: 'weekly', label: 'Semanal' },
                    { value: 'monthly', label: 'Mensual' },
                    { value: 'yearly', label: 'Anual' },
                  ]}
                  value={frequency}
                  onChange={setFrequency}
                />
              </View>
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Rentabilidad anual"
                    keyboardType="decimal-pad"
                    placeholder="7"
                    value={rate}
                    onChangeText={setRate}
                    trailing={<Text variant="label" tone="muted">%</Text>}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Años"
                    keyboardType="number-pad"
                    placeholder="20"
                    value={years}
                    onChangeText={setYears}
                    trailing={<Text variant="label" tone="muted">años</Text>}
                  />
                </View>
              </View>
              <Button title="Recalcular" onPress={onCompute} size="lg" />
            </View>
          </Card>

          {/* Resumen final (3 tarjetas verticales en móvil) */}
          {primaryFinal && (
            <View style={{ gap: spacing.sm }}>
              <View
                style={[
                  styles.headlineCard,
                  { backgroundColor: primaryColor + '15', borderColor: primaryColor },
                ]}
              >
                <View style={{ flex: 1 }}>
                  <Text variant="label" tone="secondary">Valor final · {years} años</Text>
                  <Text variant="display" tabular weight="bold" style={{ color: primaryColor, marginTop: 2 }}>
                    {formatMoney(primaryFinal.total, currency)}
                  </Text>
                  <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
                    {primary?.scenario.name} al {primary?.scenario.rate}% anual
                  </Text>
                </View>
                <View style={[styles.headlineIcon, { backgroundColor: primaryColor + '22' }]}>
                  <Ionicons name="trending-up" size={26} color={primaryColor} />
                </View>
              </View>

              <View style={styles.kpiRow}>
                <View
                  style={[
                    styles.kpiSmall,
                    { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="layers-outline" size={14} color={palette.textMuted} />
                    <Text variant="caption" tone="muted">Aportado</Text>
                  </View>
                  <Text variant="h2" tabular weight="semibold" style={{ marginTop: 2 }}>
                    {formatMoney(primaryFinal.contributed, currency)}
                  </Text>
                </View>
                <View
                  style={[
                    styles.kpiSmall,
                    { backgroundColor: palette.successSoft, borderColor: palette.success },
                  ]}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Ionicons name="sparkles-outline" size={14} color={palette.success} />
                    <Text variant="caption" tone="success">Intereses</Text>
                  </View>
                  <Text variant="h2" tabular weight="semibold" tone="success" style={{ marginTop: 2 }}>
                    {formatMoney(primaryFinal.interest, currency)}
                  </Text>
                </View>
              </View>
            </View>
          )}

          {/* Gráfica + leyenda con colores */}
          {datasets.length > 0 && labels.length > 1 && (
            <Card padding="md">
              <Text variant="h2">Crecimiento del capital</Text>
              <Text variant="caption" tone="muted">Saldo al cierre de cada año</Text>

              <LineChart
                data={{
                  labels: sparseLabels,
                  datasets,
                }}
                width={screenW - spacing.lg * 2 - spacing.md * 2}
                height={220}
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
                  propsForDots: { r: '3' },
                }}
                style={{ marginTop: spacing.sm, marginLeft: -8 }}
              />

              <View style={styles.legend}>
                {data.map((d) => (
                  <View key={d.scenario.id} style={styles.legendItem}>
                    <View style={[styles.legendDot, { backgroundColor: d.scenario.color }]} />
                    <Text variant="caption" tone="secondary">
                      {d.scenario.shortName} · {d.scenario.rate}%
                    </Text>
                  </View>
                ))}
              </View>
            </Card>
          )}

          {/* Escenarios configurables */}
          <Card>
            <Text variant="h2">Escenarios</Text>
            <Text variant="caption" tone="muted">Toca el círculo para activar · ajusta la rentabilidad</Text>
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {scenarios.map((s) => (
                <View
                  key={s.id}
                  style={[
                    styles.scenarioCard,
                    {
                      borderColor: s.enabled ? s.color : palette.borderSubtle,
                      backgroundColor: s.enabled ? s.color + '10' : palette.bgElevated,
                    },
                  ]}
                >
                  <View style={styles.scenarioHeader}>
                    <Pressable onPress={() => updateScenario(s.id, { enabled: !s.enabled })} hitSlop={8}>
                      <View
                        style={[
                          styles.checkbox,
                          {
                            borderColor: s.enabled ? s.color : palette.borderStrong,
                            backgroundColor: s.enabled ? s.color : 'transparent',
                          },
                        ]}
                      >
                        {s.enabled && <Ionicons name="checkmark" size={14} color="#fff" />}
                      </View>
                    </Pressable>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="body" weight="semibold">{s.name}</Text>
                      <Text variant="caption" tone="muted">Rentabilidad anual</Text>
                    </View>
                    <Text variant="h2" tabular weight="bold" style={{ color: s.color }}>
                      {s.rate}%
                    </Text>
                  </View>
                  <View style={[styles.rateEditor, { borderColor: palette.borderSubtle, backgroundColor: palette.bgSurface }]}>
                    <Pressable
                      onPress={() =>
                        updateScenario(s.id, { rate: Math.max(0, Number((s.rate - 0.5).toFixed(2))) })
                      }
                      hitSlop={6}
                      style={styles.stepBtn}
                    >
                      <Ionicons name="remove" size={18} color={palette.textPrimary} />
                    </Pressable>
                    <TextInput
                      keyboardType="decimal-pad"
                      value={String(s.rate)}
                      onChangeText={(t) => {
                        const v = parseFloat(t.replace(',', '.'));
                        updateScenario(s.id, { rate: Number.isFinite(v) ? v : 0 });
                      }}
                      style={[styles.rateText, { color: palette.textPrimary }]}
                      placeholder="0"
                      placeholderTextColor={palette.textMuted}
                      selectionColor={s.color}
                    />
                    <Text variant="body" tone="muted">%</Text>
                    <Pressable
                      onPress={() => updateScenario(s.id, { rate: Number((s.rate + 0.5).toFixed(2)) })}
                      hitSlop={6}
                      style={styles.stepBtn}
                    >
                      <Ionicons name="add" size={18} color={palette.textPrimary} />
                    </Pressable>
                  </View>
                </View>
              ))}
            </View>
          </Card>

          {/* Hitos por años */}
          {data.length > 0 && data[0].points.length > 1 && (
            <Card>
              <Text variant="h2">Año a año</Text>
              <Text variant="caption" tone="muted">Saldo al cierre de cada hito</Text>
              <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
                {milestoneYears.map((y) => (
                  <View
                    key={y}
                    style={[styles.yearCard, { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle }]}
                  >
                    <View style={styles.yearHeader}>
                      <Ionicons name="time-outline" size={14} color={palette.textMuted} />
                      <Text variant="label" weight="semibold">Año {y}</Text>
                    </View>
                    <View style={{ marginTop: spacing.sm, gap: 6 }}>
                      {data.map((d) => {
                        const point = d.points.find((p) => p.year === y);
                        if (!point) return null;
                        return (
                          <View key={d.scenario.id} style={styles.scenarioLine}>
                            <View style={[styles.scenarioDot, { backgroundColor: d.scenario.color }]} />
                            <Text variant="label" tone="secondary" style={{ flex: 1 }} numberOfLines={1}>
                              {d.scenario.shortName}
                            </Text>
                            <Text
                              variant="body"
                              weight="semibold"
                              tabular
                              style={{ color: d.scenario.color }}
                            >
                              {formatMoney(point.total, currency)}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </View>
                ))}
              </View>
            </Card>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  twoCol: { flexDirection: 'row', gap: spacing.md },
  headlineCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1,
    gap: spacing.md,
  },
  headlineIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiRow: { flexDirection: 'row', gap: spacing.sm },
  kpiSmall: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
    justifyContent: 'center',
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
  scenarioCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: spacing.sm,
  },
  scenarioHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rateEditor: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
  },
  stepBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.sm,
  },
  rateText: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 6,
  },
  yearCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  yearHeader: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  scenarioLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  scenarioDot: { width: 8, height: 8, borderRadius: 4 },
});
