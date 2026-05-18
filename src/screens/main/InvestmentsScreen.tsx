import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Dimensions, Pressable } from 'react-native';
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
  rate: number;
  color: string;
  enabled: boolean;
};

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

  // Punto inicial
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
  const [scenarios, setScenarios] = useState<Scenario[]>([
    { id: 'invest', name: 'Mi inversión', rate: 7, color: '#6366F1', enabled: true },
    { id: 'remunerated', name: 'Cuenta remunerada', rate: 2.5, color: '#10B981', enabled: true },
    { id: 'savings', name: 'Cuenta ahorro', rate: 0.5, color: '#F59E0B', enabled: true },
  ]);
  const [computed, setComputed] = useState(false);

  const updateScenario = (id: string, patch: Partial<Scenario>) => {
    setScenarios((arr) => arr.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  };

  const onCompute = () => {
    const r = parseFloat(rate.replace(',', '.'));
    if (Number.isFinite(r)) updateScenario('invest', { rate: r });
    setComputed(true);
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
  }, [scenarios, initial, recurring, frequency, years, computed]);

  const labels = useMemo(() => {
    if (!data[0]) return [];
    return data[0].points.map((p) => (p.year === 0 ? '0' : `${p.year}a`));
  }, [data]);

  // Reducimos número de labels para que no se solapen
  const labelStep = Math.max(1, Math.ceil(labels.length / 8));
  const sparseLabels = labels.map((l, i) => (i % labelStep === 0 ? l : ''));

  const datasets = useMemo(
    () =>
      data.map((d) => ({
        data: d.points.map((p) => Math.round(p.total)),
        color: () => d.scenario.color,
        strokeWidth: 2,
      })),
    [data]
  );

  const primary = data.find((d) => d.scenario.id === 'invest');
  const primaryFinal = primary?.points[primary.points.length - 1];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}>
        <ScreenHeader title="Inversiones" subtitle="Calculadora de interés compuesto" showBack />

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Card>
            <Text variant="h2">Parámetros</Text>
            <View style={{ marginTop: spacing.md, gap: spacing.md }}>
              <View style={styles.twoCol}>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Inversión inicial"
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={initial}
                    onChangeText={setInitial}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Aportación periódica"
                    keyboardType="decimal-pad"
                    placeholder="0.00"
                    value={recurring}
                    onChangeText={setRecurring}
                  />
                </View>
              </View>

              <View style={{ gap: 6 }}>
                <Text variant="label" tone="secondary">Frecuencia de aportación</Text>
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
                    label="Rentabilidad anual %"
                    keyboardType="decimal-pad"
                    placeholder="7"
                    value={rate}
                    onChangeText={setRate}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Input
                    label="Años a proyectar"
                    keyboardType="number-pad"
                    placeholder="20"
                    value={years}
                    onChangeText={setYears}
                  />
                </View>
              </View>

              <Button title="Calcular" onPress={onCompute} size="lg" />
            </View>
          </Card>

          {primaryFinal && (
            <View style={styles.kpiRow}>
              <Card padding="md" style={{ flex: 1 }}>
                <Text variant="label" tone="secondary">Valor final</Text>
                <Text variant="h1" tabular tone="success" style={{ marginTop: spacing.xs }}>
                  {formatMoney(primaryFinal.total, currency)}
                </Text>
              </Card>
              <Card padding="md" style={{ flex: 1 }}>
                <Text variant="label" tone="secondary">Intereses</Text>
                <Text variant="h1" tabular tone="primary" style={{ marginTop: spacing.xs }}>
                  {formatMoney(primaryFinal.interest, currency)}
                </Text>
              </Card>
              <Card padding="md" style={{ flex: 1 }}>
                <Text variant="label" tone="secondary">Aportado</Text>
                <Text variant="h1" tabular style={{ marginTop: spacing.xs }}>
                  {formatMoney(primaryFinal.contributed, currency)}
                </Text>
              </Card>
            </View>
          )}

          {datasets.length > 0 && labels.length > 1 && (
            <Card padding="md">
              <Text variant="h2">Crecimiento del capital</Text>
              <Text variant="caption" tone="muted">Cada punto representa el saldo al finalizar ese año</Text>
              <LineChart
                data={{
                  labels: sparseLabels,
                  datasets,
                  legend: data.map((d) => d.scenario.name),
                }}
                width={screenW - spacing.lg * 2 - spacing.md * 2}
                height={240}
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
            </Card>
          )}

          <Card>
            <Text variant="h2">Escenarios de comparación</Text>
            <Text variant="caption" tone="muted">Activa/desactiva escenarios y ajusta su rentabilidad</Text>
            <View style={{ marginTop: spacing.md, gap: spacing.sm }}>
              {scenarios.map((s) => (
                <View
                  key={s.id}
                  style={[styles.scenarioRow, { borderColor: palette.borderSubtle, backgroundColor: palette.bgElevated }]}
                >
                  <Pressable onPress={() => updateScenario(s.id, { enabled: !s.enabled })} hitSlop={6}>
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
                    <Text variant="caption" tone="muted">Color: {s.color}</Text>
                  </View>
                  <View style={{ width: 80 }}>
                    <Input
                      keyboardType="decimal-pad"
                      value={String(s.rate)}
                      onChangeText={(t) => {
                        const v = parseFloat(t.replace(',', '.'));
                        updateScenario(s.id, { rate: Number.isFinite(v) ? v : 0 });
                      }}
                      placeholder="%"
                      style={{ textAlign: 'right' }}
                    />
                  </View>
                </View>
              ))}
            </View>
          </Card>

          {data.length > 0 && data[0].points.length > 0 && (
            <Card>
              <Text variant="h2">Tabla por años</Text>
              <View style={{ marginTop: spacing.sm }}>
                <View style={[styles.tableHeader, { borderBottomColor: palette.borderSubtle }]}>
                  <Text variant="caption" tone="muted" style={{ flex: 0.6 }}>Año</Text>
                  {data.map((d) => (
                    <Text
                      key={d.scenario.id}
                      variant="caption"
                      tone="muted"
                      style={{ flex: 1, textAlign: 'right' }}
                      numberOfLines={1}
                    >
                      {d.scenario.name}
                    </Text>
                  ))}
                </View>
                {data[0].points.map((_, idx) => (
                  <View key={idx} style={[styles.tableRow, { borderBottomColor: palette.borderSubtle }]}>
                    <Text variant="label" weight="medium" style={{ flex: 0.6 }}>
                      {data[0].points[idx].year}
                    </Text>
                    {data.map((d) => (
                      <Text
                        key={d.scenario.id}
                        variant="label"
                        tabular
                        style={{ flex: 1, textAlign: 'right' }}
                        numberOfLines={1}
                      >
                        {formatMoney(d.points[idx]?.total ?? 0, currency)}
                      </Text>
                    ))}
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
  kpiRow: { flexDirection: 'row', gap: spacing.sm },
  scenarioRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableHeader: {
    flexDirection: 'row',
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    gap: spacing.sm,
  },
});
