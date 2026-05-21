import React, { useCallback, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, SectionList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Input } from '../../components/Input';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TransactionRow } from '../../components/TransactionRow';
import { monthLabel } from '../../utils/format';
import { CategoryChip } from '../../components/CategoryChip';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/EmptyState';
import { FAB } from '../../components/FAB';
import { SkeletonTransactionRow } from '../../components/Skeleton';
import { TransactionSheet } from '../modals/TransactionSheet';
import type { Transaction } from '../../api/types';

type Filter = 'all' | 'expense' | 'income';

export const TransactionsScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const {
    transactions,
    transactionsLoading,
    transactionsLoadedAt,
    categories,
    fetchTransactions,
    fetchCategories,
  } = useDataStore();
  const isFirstLoad = transactionsLoading && transactionsLoadedAt === 0;
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  useFocusEffect(
    useCallback(() => {
      fetchTransactions();
      if (categories.length === 0) fetchCategories();
    }, [])
  );

  const filtered = useMemo(() => {
    return transactions.filter((t) => {
      if (filter !== 'all' && t.type !== filter) return false;
      if (categoryId !== null && t.category_id !== categoryId) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        if (!t.description.toLowerCase().includes(q) && !(t.notes || '').toLowerCase().includes(q))
          return false;
      }
      return true;
    });
  }, [transactions, filter, categoryId, search]);

  // Agrupa por fecha relativa: Hoy / Ayer / Esta semana / Este mes / <Mes año>.
  const sections = useMemo(() => {
    const now = new Date();
    const startToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const dayMs = 86400000;
    const buckets = new Map<string, Transaction[]>();
    const order: string[] = [];
    const titleFor = (dateStr: string) => {
      const d = new Date(dateStr);
      const dOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const diff = Math.round((startToday - dOnly) / dayMs);
      if (diff <= 0) return 'Hoy';
      if (diff === 1) return 'Ayer';
      if (diff < 7) return 'Esta semana';
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) return 'Este mes';
      return monthLabel(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    };
    for (const t of filtered) {
      const title = titleFor(t.transaction_date);
      if (!buckets.has(title)) { buckets.set(title, []); order.push(title); }
      buckets.get(title)!.push(t);
    }
    return order.map((title) => ({ title, data: buckets.get(title)! }));
  }, [filtered]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions(undefined, true);
    setRefreshing(false);
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScreenHeader title="Movimientos" subtitle={`${filtered.length} transacciones`} />

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <Input
          placeholder="Buscar"
          value={search}
          onChangeText={setSearch}
          leading={<Ionicons name="search" size={18} color={palette.textMuted} />}
        />
        <SegmentedControl
          options={[
            { value: 'all', label: 'Todo' },
            { value: 'expense', label: 'Gastos' },
            { value: 'income', label: 'Ingresos' },
          ]}
          value={filter}
          onChange={setFilter}
        />
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipRow}
        >
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              category={c}
              selected={categoryId === c.id}
              onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
            />
          ))}
        </ScrollView>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 120 }}
        stickySectionHeadersEnabled={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
        }
        renderSectionHeader={({ section }) => (
          <View style={{ paddingHorizontal: spacing.lg, paddingTop: spacing.sm, paddingBottom: spacing.xs }}>
            <Text variant="label" tone="muted" weight="semibold" style={{ textTransform: 'capitalize' }}>
              {section.title}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          isFirstLoad ? (
            <View style={{ paddingHorizontal: spacing.lg, gap: spacing.sm }}>
              {Array.from({ length: 6 }).map((_, i) => (
                <View
                  key={i}
                  style={[styles.card, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}
                >
                  <SkeletonTransactionRow />
                </View>
              ))}
            </View>
          ) : (
            <EmptyState
              icon="receipt-outline"
              title="Sin transacciones"
              description="Aún no hay movimientos que coincidan con estos filtros."
              ctaLabel="Crear transacción"
              onCta={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            />
          )
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: spacing.lg, marginBottom: spacing.sm }}>
            <View style={[styles.card, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}>
              <TransactionRow
                tx={item}
                currency={user?.currency || 'EUR'}
                onPress={() => {
                  setEditing(item);
                  setSheetOpen(true);
                }}
              />
            </View>
          </View>
        )}
      />

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
        onSaved={fetchTransactions}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  chipRow: { gap: spacing.sm, paddingVertical: 4 },
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
