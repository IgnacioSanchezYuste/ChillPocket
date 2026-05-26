import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, SectionList, Pressable, ActivityIndicator } from 'react-native';
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
import { TransactionFiltersSheet, countActiveFilters, type AdvancedFilters } from '../../components/TransactionFiltersSheet';
import { transactionsApi, type TransactionFilter } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { useToast } from '../../components/Toast';
import type { Transaction } from '../../api/types';

type TypeFilter = 'all' | 'expense' | 'income';
const PAGE_SIZE = 50;

export const TransactionsScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const toast = useToast();
  const { categories, fetchCategories } = useDataStore();

  // Filtros básicos (los inline)
  const [filter, setFilter] = useState<TypeFilter>('all');
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  // Filtros avanzados (sheet)
  const [adv, setAdv] = useState<AdvancedFilters>({});
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Lista paginada local (independiente del store; el store sigue alimentando el Dashboard).
  const [items, setItems] = useState<Transaction[]>([]);
  const [offset, setOffset] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [loading, setLoading] = useState(false);   // primera carga / cambio de filtros
  const [appending, setAppending] = useState(false); // siguiente página
  const [refreshing, setRefreshing] = useState(false);
  const reqIdRef = useRef(0); // descarta respuestas obsoletas si el usuario cambia filtros rápido

  // Sheets
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Transaction | null>(null);

  // Debounce de búsqueda: aplica 250ms después de teclear.
  const [searchDebounced, setSearchDebounced] = useState(search);
  useEffect(() => {
    const id = setTimeout(() => setSearchDebounced(search.trim()), 250);
    return () => clearTimeout(id);
  }, [search]);

  // Construye el filtro listo para la API a partir del estado actual.
  const buildFilter = useCallback(
    (nextOffset: number): TransactionFilter => {
      const f: TransactionFilter = { limit: PAGE_SIZE, offset: nextOffset };
      if (filter !== 'all') f.type = filter;
      if (categoryId !== null) f.category_id = categoryId;
      if (searchDebounced) f.search = searchDebounced;
      if (adv.from) f.from = adv.from;
      if (adv.to) f.to = adv.to;
      if (adv.amount_min !== undefined) {
        const n = parseFloat(String(adv.amount_min));
        if (Number.isFinite(n) && n >= 0) f.amount_min = n;
      }
      if (adv.amount_max !== undefined) {
        const n = parseFloat(String(adv.amount_max));
        if (Number.isFinite(n) && n >= 0) f.amount_max = n;
      }
      if (adv.payment_method) f.payment_method = adv.payment_method;
      return f;
    },
    [filter, categoryId, searchDebounced, adv]
  );

  // Carga la primera página (reset). Cancela cualquier carga obsoleta.
  const loadFirstPage = useCallback(async () => {
    const reqId = ++reqIdRef.current;
    setLoading(true);
    try {
      const list = await transactionsApi.list(buildFilter(0));
      if (reqId !== reqIdRef.current) return; // obsoleto
      setItems(list);
      setOffset(list.length);
      setHasMore(list.length === PAGE_SIZE);
    } catch (e) {
      if (reqId === reqIdRef.current) toast.error(apiError(e, 'No se pudieron cargar los movimientos'));
    } finally {
      if (reqId === reqIdRef.current) setLoading(false);
    }
  }, [buildFilter, toast]);

  // Carga la siguiente página (append).
  const loadMore = useCallback(async () => {
    if (loading || appending || !hasMore) return;
    const reqId = reqIdRef.current; // si cambian filtros, esto invalida
    setAppending(true);
    try {
      const list = await transactionsApi.list(buildFilter(offset));
      if (reqId !== reqIdRef.current) return;
      setItems((prev) => [...prev, ...list]);
      setOffset((prev) => prev + list.length);
      setHasMore(list.length === PAGE_SIZE);
    } catch (e) {
      if (reqId === reqIdRef.current) toast.error(apiError(e, 'No se pudo cargar más'));
    } finally {
      if (reqId === reqIdRef.current) setAppending(false);
    }
  }, [appending, loading, hasMore, offset, buildFilter, toast]);

  // Pull-to-refresh: simple reset.
  const onRefresh = async () => {
    setRefreshing(true);
    await loadFirstPage();
    setRefreshing(false);
  };

  // Recarga al cambiar filtros, búsqueda o foco. Las categorías se cargan una vez.
  useEffect(() => {
    loadFirstPage();
  }, [filter, categoryId, searchDebounced, adv]);

  useFocusEffect(
    useCallback(() => {
      if (categories.length === 0) fetchCategories();
      // Refresca por si se ha creado/editado en otro lugar.
      loadFirstPage();
    }, [])
  );

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
    for (const t of items) {
      const title = titleFor(t.transaction_date);
      if (!buckets.has(title)) { buckets.set(title, []); order.push(title); }
      buckets.get(title)!.push(t);
    }
    return order.map((title) => ({ title, data: buckets.get(title)! }));
  }, [items]);

  const activeAdvanced = countActiveFilters(adv);
  const isFirstLoad = loading && items.length === 0;
  const subtitle = `${items.length} mov.${hasMore ? '+' : ''}${activeAdvanced > 0 ? ` · ${activeAdvanced} filtros` : ''}`;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScreenHeader title="Movimientos" subtitle={subtitle} />

      <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Input
              placeholder="Buscar"
              value={search}
              onChangeText={setSearch}
              leading={<Ionicons name="search" size={18} color={palette.textMuted} />}
            />
          </View>
          <Pressable
            onPress={() => setFiltersOpen(true)}
            style={[
              styles.filterBtn,
              {
                backgroundColor: activeAdvanced > 0 ? palette.accentSoft : palette.bgSurface,
                borderColor: activeAdvanced > 0 ? palette.accent : palette.borderSubtle,
              },
            ]}
            accessibilityRole="button"
            accessibilityLabel="Filtros avanzados"
          >
            <Ionicons name="options-outline" size={20} color={activeAdvanced > 0 ? palette.accent : palette.textSecondary} />
            {activeAdvanced > 0 && (
              <View style={[styles.filterBadge, { backgroundColor: palette.accent }]}>
                <Text variant="caption" weight="bold" style={{ color: '#fff', fontSize: 10 }}>
                  {activeAdvanced}
                </Text>
              </View>
            )}
          </Pressable>
        </View>
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
        onEndReachedThreshold={0.4}
        onEndReached={loadMore}
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
        ListFooterComponent={
          appending ? (
            <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
              <ActivityIndicator color={palette.accent} />
            </View>
          ) : !hasMore && items.length > 0 ? (
            <View style={{ paddingVertical: spacing.lg, alignItems: 'center' }}>
              <Text variant="caption" tone="muted">No hay más movimientos</Text>
            </View>
          ) : null
        }
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
        onSaved={loadFirstPage}
      />

      <TransactionFiltersSheet
        visible={filtersOpen}
        initial={adv}
        onClose={() => setFiltersOpen(false)}
        onApply={setAdv}
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
  filterBtn: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    minWidth: 16,
    height: 16,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
