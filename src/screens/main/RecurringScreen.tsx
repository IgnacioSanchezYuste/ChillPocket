import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { CategoryBadge } from '../../components/CategoryBadge';
import { FAB } from '../../components/FAB';
import { RecurringSheet } from '../modals/RecurringSheet';
import { formatMoney } from '../../utils/format';
import { recurringApi } from '../../api/endpoints';
import { useToast } from '../../components/Toast';
import { apiError } from '../../api/http';
import type { Recurring } from '../../api/types';

const FREQUENCY_LABEL: Record<Recurring['frequency'], string> = {
  weekly: 'Semanal',
  monthly: 'Mensual',
  yearly: 'Anual',
};

export const RecurringScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const {
    recurring,
    recurringProjection,
    fetchRecurring,
    recurringLoading,
    recurringError,
  } = useDataStore();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Recurring | null>(null);

  useEffect(() => {
    fetchRecurring();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchRecurring(true);
    setRefreshing(false);
  };

  const onToggle = async (r: Recurring) => {
    try {
      await recurringApi.toggle(r.id);
      await fetchRecurring(true);
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const currency = user?.currency || 'EUR';

  // Primera carga sin datos: skeleton de 4 filas de recurrente.
  if (recurringLoading && recurring.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
        <ScreenHeader title="Gastos fijos" subtitle="Cargando…" showBack />
        <RecurringSkeleton />
      </SafeAreaView>
    );
  }

  // Error de red sin datos previos: cartel con botón Reintentar.
  if (recurringError && recurring.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
        <ScreenHeader title="Gastos fijos" showBack />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState
            title="No pudimos cargar tus gastos fijos"
            description={recurringError}
            onRetry={() => fetchRecurring(true)}
          />
        </View>
        <FAB onPress={() => { setEditing(null); setSheetOpen(true); }} />
        <RecurringSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          editing={editing}
          onSaved={() => fetchRecurring()}
        />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
      >
        <ScreenHeader title="Gastos fijos" subtitle="Recurrentes activos" showBack />

        {recurringProjection && (
          <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
            <Card>
              <Text variant="label" tone="secondary">Proyección mensual</Text>
              <View style={styles.projection}>
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" tone="muted">Ingresos</Text>
                  <Text variant="h2" tabular tone="success">
                    {formatMoney(recurringProjection.monthly_income, currency)}
                  </Text>
                </View>
                <View style={[styles.divider, { backgroundColor: palette.borderSubtle }]} />
                <View style={{ flex: 1, gap: 2 }}>
                  <Text variant="caption" tone="muted">Gastos</Text>
                  <Text variant="h2" tabular tone="danger">
                    {formatMoney(recurringProjection.monthly_expense, currency)}
                  </Text>
                </View>
              </View>
              <View style={[styles.netRow, { borderTopColor: palette.borderSubtle }]}>
                <Text variant="label" tone="secondary">Neto</Text>
                <Text
                  variant="body"
                  weight="semibold"
                  tabular
                  tone={recurringProjection.monthly_income - recurringProjection.monthly_expense >= 0 ? 'success' : 'danger'}
                >
                  {formatMoney(
                    recurringProjection.monthly_income - recurringProjection.monthly_expense,
                    currency
                  )}
                </Text>
              </View>
            </Card>
          </View>
        )}

        <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.sm }}>
          {/* Sin datos reales: empty state (usuario sin recurrentes creados) */}
          {recurring.length === 0 ? (
            <EmptyState
              icon="repeat-outline"
              title="Sin gastos fijos"
              description="Añade tus suscripciones, alquiler o ingresos recurrentes."
              ctaLabel="Crear gasto fijo"
              onCta={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            />
          ) : (
            recurring.map((r) => (
              <Pressable
                key={r.id}
                onPress={() => {
                  setEditing(r);
                  setSheetOpen(true);
                }}
              >
                <Card>
                  <View style={styles.rowTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md, flex: 1 }}>
                      <CategoryBadge color={r.category_color} icon={r.category_icon} type={r.type} size={38} />
                      <View style={{ flex: 1 }}>
                        <Text variant="body" weight="semibold">{r.name}</Text>
                        <Text variant="caption" tone="muted">
                          {FREQUENCY_LABEL[r.frequency]} · {r.category_name || 'Sin categoría'}
                        </Text>
                      </View>
                    </View>
                    <Text variant="body" weight="semibold" tabular tone={r.type === 'income' ? 'success' : 'primary'}>
                      {formatMoney(Number(r.amount), currency)}
                    </Text>
                  </View>
                  <View style={[styles.toggleRow, { borderTopColor: palette.borderSubtle }]}>
                    <Text variant="caption" tone="muted">
                      {r.is_active ? 'Activo' : 'Pausado'}
                    </Text>
                    <Switch
                      value={!!r.is_active}
                      onValueChange={() => onToggle(r)}
                      thumbColor={palette.bgSurface}
                      trackColor={{ false: palette.borderStrong, true: palette.accent }}
                    />
                  </View>
                </Card>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <FAB
        onPress={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      />

      <RecurringSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={editing}
        onSaved={() => fetchRecurring()}
      />
    </SafeAreaView>
  );
};

// Skeleton de 4 filas de recurrente para la primera carga.
const RecurringSkeleton: React.FC = () => (
  <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md }}>
    {/* Card de proyección mensual */}
    <Skeleton height={100} borderRadius={radius.md} />
    {/* 4 filas de recurrente */}
    {[0, 1, 2, 3].map((i) => (
      <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <Skeleton width={38} height={38} borderRadius={radius.md} />
        <View style={{ flex: 1, gap: 6 }}>
          <Skeleton width="50%" height={14} />
          <Skeleton width="35%" height={11} />
        </View>
        <Skeleton width={60} height={16} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  projection: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  divider: { width: 1, height: 40 },
  netRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  rowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  toggleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
});

