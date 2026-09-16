import React, { useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import type { RouteProp } from '@react-navigation/native';
import { useRoute } from '@react-navigation/native';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TransactionRow } from '../../components/TransactionRow';
import { DonutChart } from '../../components/DonutChart';
import { EmptyState } from '../../components/EmptyState';
import { TransactionSheet } from '../modals/TransactionSheet';
import { formatMoney } from '../../utils/format';
import type { AppStackParamList } from '../../navigation/AppNavigator';
import type { Transaction } from '../../api/types';

type CategoryAgg = {
  category_id: number | null;
  name: string;
  color: string;
  icon: string | null;
  total: number;
  count: number;
};

function prettyDate(iso: string): string {
  // Construimos manualmente para evitar problemas de TZ con `new Date('YYYY-MM-DD')`,
  // que en algunas plataformas se interpreta como UTC y "salta" un día.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return iso;
  const txt = dt.toLocaleDateString('es-ES', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return txt.charAt(0).toUpperCase() + txt.slice(1);
}

function relativeLabel(iso: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  const now = new Date();
  const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const diffDays = Math.round((startToday - dt.getTime()) / 86400000);
  if (diffDays === 0) return 'Hoy';
  if (diffDays === 1) return 'Ayer';
  if (diffDays === -1) return 'Mañana';
  if (diffDays > 0 && diffDays < 7) return `Hace ${diffDays} días`;
  return '';
}

export const DayDetailScreen: React.FC = () => {
  const { palette } = useTheme();
  const route = useRoute<RouteProp<AppStackParamList, 'DayDetail'>>();
  const date = route.params?.date ?? '';

  const { transactions, refreshAll, transactionsLoading } = useDataStore();
  const { user } = useAuthStore();
  const currency = user?.currency || 'EUR';

  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  // Las transacciones del día se obtienen del store que ya está poblado.
  // Si el rango cargado por defecto no incluye este día, refreshAll() lo trae.
  const dayTxs = useMemo(
    () => transactions.filter((t) => t.transaction_date?.startsWith(date)),
    [transactions, date],
  );

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of dayTxs) {
      const a = Number(t.amount) || 0;
      if (t.type === 'income') income += a;
      else expense += a;
    }
    return { income, expense, balance: income - expense, count: dayTxs.length };
  }, [dayTxs]);

  // Agrega gastos por categoría (los ingresos los dejamos fuera del donut para
  // no mezclar dos magnitudes en el mismo gráfico; la lista de tx ya los muestra).
  const expensesByCategory = useMemo(() => {
    const acc = new Map<string, CategoryAgg>();
    for (const t of dayTxs) {
      if (t.type !== 'expense') continue;
      const key = String(t.category_id ?? 'none');
      const prev = acc.get(key);
      const amount = Number(t.amount) || 0;
      if (prev) {
        prev.total += amount;
        prev.count += 1;
      } else {
        acc.set(key, {
          category_id: t.category_id,
          name: t.category_name || 'Sin categoría',
          color: t.category_color || palette.textMuted,
          icon: t.category_icon,
          total: amount,
          count: 1,
        });
      }
    }
    return Array.from(acc.values()).sort((a, b) => b.total - a.total);
  }, [dayTxs, palette.textMuted]);

  const donutSegments = useMemo(
    () => expensesByCategory.map((c) => ({ value: c.total, color: c.color })),
    [expensesByCategory],
  );
  const expenseTotal = totals.expense;

  const rel = relativeLabel(date);

  const onRefresh = async () => {
    setRefreshing(true);
    await refreshAll(true);
    setRefreshing(false);
  };

  const openTx = (t: Transaction) => {
    setEditing(t);
    setSheetOpen(true);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
        }
      >
        <ScreenHeader title={prettyDate(date)} subtitle={rel || `${totals.count} mov.`} showBack />

        {/* Totales del día */}
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Card padding="lg">
            <View style={styles.totalsRow}>
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">Ingresos</Text>
                <Text variant="h2" weight="semibold" tabular tone="success">
                  {formatMoney(totals.income, currency)}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: palette.borderSubtle }]} />
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">Gastos</Text>
                <Text variant="h2" weight="semibold" tabular tone="danger">
                  {formatMoney(totals.expense, currency)}
                </Text>
              </View>
              <View style={[styles.divider, { backgroundColor: palette.borderSubtle }]} />
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">Neto</Text>
                <Text
                  variant="h2"
                  weight="semibold"
                  tabular
                  tone={totals.balance >= 0 ? 'success' : 'danger'}
                >
                  {formatMoney(totals.balance, currency)}
                </Text>
              </View>
            </View>
          </Card>

          {/* Gastos por categoría */}
          {expensesByCategory.length > 0 && (
            <Card padding="lg">
              <Text variant="h2">Gastos por categoría</Text>
              <Text variant="caption" tone="muted">Cómo se reparte tu gasto del día</Text>

              <View style={styles.donutRow}>
                <DonutChart segments={donutSegments} size={130} strokeWidth={20}>
                  <Text variant="caption" tone="muted">Total</Text>
                  <Text variant="body" weight="bold" tabular>
                    {formatMoney(expenseTotal, currency)}
                  </Text>
                </DonutChart>

                <View style={styles.legendCol}>
                  {expensesByCategory.slice(0, 5).map((c) => {
                    const pct = expenseTotal > 0 ? (c.total / expenseTotal) * 100 : 0;
                    return (
                      <View key={c.category_id ?? 'none'} style={styles.legendRow}>
                        <View style={[styles.legendDot, { backgroundColor: c.color }]} />
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text variant="caption" weight="semibold" numberOfLines={1}>
                            {c.name}
                          </Text>
                          <Text variant="caption" tone="muted" tabular>
                            {formatMoney(c.total, currency)} · {pct.toFixed(0)}%
                          </Text>
                        </View>
                      </View>
                    );
                  })}
                  {expensesByCategory.length > 5 && (
                    <Text variant="caption" tone="muted">
                      +{expensesByCategory.length - 5} más
                    </Text>
                  )}
                </View>
              </View>
            </Card>
          )}

          {/* Movimientos */}
          <View style={{ gap: spacing.sm }}>
            <Text variant="h2">Movimientos</Text>
            <Card padding="xs" style={{ paddingVertical: 0, paddingHorizontal: 0 }}>
              {dayTxs.length === 0 ? (
                <View style={{ padding: spacing.xl, alignItems: 'center' }}>
                  <Ionicons name="receipt-outline" size={28} color={palette.textMuted} />
                  <Text variant="body" tone="secondary" style={{ marginTop: spacing.sm }}>
                    {transactionsLoading
                      ? 'Cargando movimientos…'
                      : 'No hay movimientos en este día'}
                  </Text>
                </View>
              ) : (
                dayTxs.map((t) => (
                  <TransactionRow key={t.id} tx={t} currency={currency} onPress={() => openTx(t)} />
                ))
              )}
            </Card>
          </View>
        </View>
      </ScrollView>

      <TransactionSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={editing}
        onSaved={() => {
          // El store ya hace refreshAll en el sheet; nada que añadir aquí.
        }}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  totalsRow: { flexDirection: 'row', alignItems: 'center' },
  divider: { width: 1, height: 36, marginHorizontal: spacing.sm },
  donutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.md,
  },
  legendCol: { flex: 1, gap: spacing.sm, minWidth: 0 },
  legendRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  legendDot: { width: 10, height: 10, borderRadius: 5 },
});

export default DayDetailScreen;
