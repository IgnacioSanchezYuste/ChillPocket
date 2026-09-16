import React, { useMemo } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from './Text';
import { Card } from './Card';
import { ProgressBar } from './ProgressBar';
import { formatMoney } from '../utils/format';
import type { DailyPoint } from '../api/types';

type Props = {
  monthYear: string; // 'YYYY-MM'
  daily: DailyPoint[];
  currency: string;
  /** Callback al tocar un día del calendario. Si se omite, las celdas no son clicables. */
  onDayPress?: (date: string) => void;
};

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

// Mezcla un color base con blanco/transparencia según intensidad (0..1).
function rgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const SpendingHabits: React.FC<Props> = ({ monthYear, daily, currency, onDayPress }) => {
  const { palette } = useTheme();

  const [year, month] = monthYear.split('-').map(Number);
  const monthStr = String(month).padStart(2, '0');

  const model = useMemo(() => {
    const daysInMonth = new Date(year, month, 0).getDate();
    // Mapa día → gasto
    const spendByDay = new Map<number, number>();
    for (const d of daily) {
      spendByDay.set(d.day, Number(d.expense) || 0);
    }

    // Media diaria solo sobre días con actividad o transcurridos.
    const now = new Date();
    const isCurrentMonth = now.getFullYear() === year && now.getMonth() + 1 === month;
    const elapsedDays = isCurrentMonth ? now.getDate() : daysInMonth;

    let totalSpent = 0;
    for (let d = 1; d <= elapsedDays; d++) totalSpent += spendByDay.get(d) || 0;
    const avgDaily = elapsedDays > 0 ? totalSpent / elapsedDays : 0;

    // Máximo para escalar el heatmap
    let maxDay = 0;
    spendByDay.forEach((v) => { if (v > maxDay) maxDay = v; });

    // Construir celdas del calendario (con offset del primer día; semana L-D)
    const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // 0=Lunes
    const cells: ({ day: number; spent: number; future: boolean } | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) {
      const future = isCurrentMonth && d > now.getDate();
      cells.push({ day: d, spent: spendByDay.get(d) || 0, future });
    }

    // Semanas (filas de 7)
    const weeks: (typeof cells)[] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

    // Gasto por semana (suma de cada fila)
    const weeklyTotals = weeks.map((w) =>
      w.reduce((s, c) => s + (c && !c.future ? c.spent : 0), 0)
    );
    const maxWeek = Math.max(1, ...weeklyTotals);

    // Insights
    let noSpendDays = 0;
    let bestDay = { day: 0, spent: Infinity };
    let worstDay = { day: 0, spent: -1 };
    for (let d = 1; d <= elapsedDays; d++) {
      const s = spendByDay.get(d) || 0;
      if (s === 0) noSpendDays++;
      if (s > worstDay.spent) worstDay = { day: d, spent: s };
      if (s < bestDay.spent) bestDay = { day: d, spent: s };
    }
    // racha actual de días sin gastar (hacia atrás desde hoy/fin)
    let streak = 0;
    for (let d = elapsedDays; d >= 1; d--) {
      if ((spendByDay.get(d) || 0) === 0) streak++;
      else break;
    }

    return {
      weeks,
      weeklyTotals,
      maxWeek,
      maxDay,
      avgDaily,
      totalSpent,
      noSpendDays,
      bestDay: bestDay.spent === Infinity ? null : bestDay,
      worstDay: worstDay.spent <= 0 ? null : worstDay,
      streak,
      elapsedDays,
    };
  }, [daily, year, month]);

  // Color de cada celda según gasto vs media:
  //  - sin gasto → verde suave (buen día)
  //  - <= media → verde/accent tenue
  //  - > media → naranja→rojo según intensidad
  const cellColor = (spent: number, future: boolean): string => {
    if (future) return palette.bgElevated;
    if (spent === 0) return rgba(palette.success, 0.18);
    if (spent <= model.avgDaily) {
      const t = model.avgDaily > 0 ? spent / model.avgDaily : 0;
      return rgba(palette.success, 0.25 + t * 0.4);
    }
    // por encima de la media
    const over = model.maxDay > model.avgDaily
      ? (spent - model.avgDaily) / (model.maxDay - model.avgDaily)
      : 1;
    const base = over > 0.6 ? palette.danger : palette.warning;
    return rgba(base, 0.35 + over * 0.5);
  };

  return (
    <Card>
      <Text variant="h2">Hábitos de gasto</Text>
      <Text variant="caption" tone="muted">Cada día coloreado según tu gasto frente a tu media diaria</Text>

      {/* Calendario heatmap */}
      <View style={{ marginTop: spacing.md }}>
        <View style={styles.weekHeader}>
          {WEEKDAYS.map((w, i) => (
            <View key={i} style={styles.cellWrap}>
              <Text variant="caption" tone="muted" align="center">{w}</Text>
            </View>
          ))}
        </View>
        {model.weeks.map((week, wi) => (
          <View key={wi} style={styles.weekRow}>
            {week.map((cell, ci) => (
              <View key={ci} style={styles.cellWrap}>
                {cell ? (
                  onDayPress && !cell.future ? (
                    // Día clicable: navegamos al detalle del día. Días futuros
                    // permanecen como Views planas (no hay nada que mostrar).
                    <Pressable
                      onPress={() => onDayPress(`${year}-${monthStr}-${String(cell.day).padStart(2, '0')}`)}
                      style={[
                        styles.cell,
                        {
                          backgroundColor: cellColor(cell.spent, cell.future),
                          borderColor: palette.borderSubtle,
                        },
                      ]}
                      accessibilityRole="button"
                      accessibilityLabel={`Día ${cell.day}: ${formatMoney(cell.spent, currency)}`}
                    >
                      <Text
                        variant="caption"
                        align="center"
                        style={{ color: palette.textPrimary, fontSize: 10 }}
                      >
                        {cell.day}
                      </Text>
                    </Pressable>
                  ) : (
                    <View
                      style={[
                        styles.cell,
                        {
                          backgroundColor: cellColor(cell.spent, cell.future),
                          borderColor: palette.borderSubtle,
                        },
                      ]}
                    >
                      <Text
                        variant="caption"
                        align="center"
                        style={{ color: cell.future ? palette.textMuted : palette.textPrimary, fontSize: 10 }}
                      >
                        {cell.day}
                      </Text>
                    </View>
                  )
                ) : (
                  <View style={styles.cell} />
                )}
              </View>
            ))}
          </View>
        ))}

        {/* Leyenda */}
        <View style={styles.legend}>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: rgba(palette.success, 0.18) }]} />
            <Text variant="caption" tone="muted">Sin gasto</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: rgba(palette.success, 0.5) }]} />
            <Text variant="caption" tone="muted">Bajo la media</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: rgba(palette.warning, 0.6) }]} />
            <Text variant="caption" tone="muted">Sobre la media</Text>
          </View>
          <View style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: rgba(palette.danger, 0.7) }]} />
            <Text variant="caption" tone="muted">Día caro</Text>
          </View>
        </View>
      </View>

      {/* Gasto por semana */}
      <View style={[styles.section, { borderTopColor: palette.borderSubtle }]}>
        <Text variant="label" weight="semibold">Gasto por semana</Text>
        <View style={{ marginTop: spacing.sm, gap: spacing.sm }}>
          {model.weeklyTotals.map((total, i) => (
            <View key={i} style={{ gap: 4 }}>
              <View style={styles.weekLine}>
                <Text variant="caption" tone="secondary">Semana {i + 1}</Text>
                <Text variant="caption" weight="semibold" tabular>
                  {formatMoney(total, currency)}
                </Text>
              </View>
              <ProgressBar
                value={(total / model.maxWeek) * 100}
                color={total > model.avgDaily * 7 ? palette.warning : palette.accent}
              />
            </View>
          ))}
        </View>
      </View>

      {/* Insights */}
      <View style={[styles.section, { borderTopColor: palette.borderSubtle }]}>
        <View style={styles.insightGrid}>
          <Insight
            icon="trending-down-outline"
            label="Media diaria"
            value={formatMoney(model.avgDaily, currency)}
            color={palette.accent}
          />
          <Insight
            icon="leaf-outline"
            label="Días sin gastar"
            value={`${model.noSpendDays}`}
            color={palette.success}
          />
          {model.worstDay && (
            <Insight
              icon="flame-outline"
              label={`Día más caro (${model.worstDay.day})`}
              value={formatMoney(model.worstDay.spent, currency)}
              color={palette.danger}
            />
          )}
          {model.streak > 0 && (
            <Insight
              icon="sparkles-outline"
              label="Racha sin gastar"
              value={`${model.streak} ${model.streak === 1 ? 'día' : 'días'}`}
              color={palette.success}
            />
          )}
        </View>
      </View>
    </Card>
  );
};

const Insight: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  color: string;
}> = ({ icon, label, value, color }) => {
  const { palette } = useTheme();
  return (
    <View style={[styles.insight, { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle }]}>
      <View style={[styles.insightIcon, { backgroundColor: rgba(color, 0.15) }]}>
        <Ionicons name={icon} size={15} color={color} />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="caption" tone="muted" numberOfLines={1}>{label}</Text>
        <Text variant="body" weight="semibold" tabular numberOfLines={1}>{value}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  weekHeader: { flexDirection: 'row', marginBottom: 4 },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  cellWrap: { flex: 1, paddingHorizontal: 2 },
  cell: {
    aspectRatio: 1,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  legend: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.md,
    marginTop: spacing.md,
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendDot: { width: 12, height: 12, borderRadius: 4 },
  section: {
    marginTop: spacing.lg,
    paddingTop: spacing.lg,
    borderTopWidth: 1,
  },
  weekLine: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  insightGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  insight: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  insightIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
});
