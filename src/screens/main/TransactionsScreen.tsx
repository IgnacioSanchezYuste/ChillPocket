import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, FlatList } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Input } from '../../components/Input';
import { ScreenHeader } from '../../components/ScreenHeader';
import { TransactionRow } from '../../components/TransactionRow';
import { CategoryChip } from '../../components/CategoryChip';
import { SegmentedControl } from '../../components/SegmentedControl';
import { EmptyState } from '../../components/EmptyState';
import { FAB } from '../../components/FAB';
import { TransactionSheet } from '../modals/TransactionSheet';
import type { Transaction } from '../../api/types';

type Filter = 'all' | 'expense' | 'income';

export const TransactionsScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const { transactions, categories, fetchTransactions, fetchCategories } = useDataStore();
  const [filter, setFilter] = useState<Filter>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  useEffect(() => {
    fetchTransactions();
    if (categories.length === 0) fetchCategories();
  }, []);

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

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTransactions();
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

      <FlatList
        data={filtered}
        keyExtractor={(t) => String(t.id)}
        contentContainerStyle={{ paddingTop: spacing.md, paddingBottom: 120 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
        }
        
        ListEmptyComponent={
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
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: spacing.lg }}>
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
