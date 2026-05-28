import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Pressable, Switch } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
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
import { ProgressBar } from '../../components/ProgressBar';
import { Sheet } from '../../components/Sheet';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { CategoryChip } from '../../components/CategoryChip';
import { useToast } from '../../components/Toast';
import { budgetsApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { confirmDelete } from '../../utils/confirm';
import { currentMonthYear, formatMoney, monthLabel } from '../../utils/format';
import type { Budget, Category } from '../../api/types';

export const BudgetsScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const {
    budgets,
    fetchBudgets,
    budgetsMonth,
    budgetsLoading,
    budgetsError,
    categories,
    fetchCategories,
  } = useDataStore();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<Budget | null>(null);
  const [amount, setAmount] = useState('');
  const [resetDay, setResetDay] = useState('1');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [autoRenew, setAutoRenew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [activeMonth, setActiveMonth] = useState<string>(budgetsMonth || currentMonthYear());

  const currency = user?.currency || 'EUR';

  useEffect(() => {
    fetchBudgets(activeMonth);
    if (categories.length === 0) fetchCategories();
  }, [activeMonth]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchBudgets(activeMonth, true);
    setRefreshing(false);
  };

  const openCreate = () => {
    setEditing(null);
    setAmount('');
    setResetDay('1');
    setCategoryId(null);
    setAutoRenew(false);
    setSheetOpen(true);
  };

  const openEdit = (b: Budget) => {
    setEditing(b);
    setAmount(String(b.amount));
    setResetDay(String(b.reset_day || 1));
    setCategoryId(b.category_id);
    setAutoRenew(!!b.auto_renew);
    setSheetOpen(true);
  };

  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories]
  );

  const onSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Importe inválido');
    const rd = parseInt(resetDay, 10);
    if (!Number.isFinite(rd) || rd < 1 || rd > 28) return toast.error('Día de reset entre 1 y 28');
    setSaving(true);
    try {
      if (editing) {
        await budgetsApi.update(editing.id, { amount: amt, reset_day: rd, auto_renew: autoRenew });
        toast.success('Presupuesto actualizado');
      } else {
        await budgetsApi.upsert({
          amount: amt,
          month_year: activeMonth,
          category_id: categoryId,
          reset_day: rd,
          auto_renew: autoRenew,
        });
        toast.success('Presupuesto guardado');
      }
      await fetchBudgets(activeMonth, true);
      setSheetOpen(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async (b: Budget) => {
    const ok = await confirmDelete(
      'presupuesto',
      `Se eliminará el límite para ${b.category_name || 'la categoría global'}.`
    );
    if (!ok) return;
    try {
      await budgetsApi.remove(b.id);
      await fetchBudgets(activeMonth, true);
      toast.success('Eliminado');
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const shiftMonth = (delta: number) => {
    const [y, m] = activeMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    const next = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    setActiveMonth(next);
  };

  const totalLimit = budgets.reduce((s, b) => s + Number(b.amount), 0);
  const totalSpent = budgets.reduce((s, b) => s + Number(b.spent), 0);
  const globalPct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

  // Barra de navegación de mes (se reutiliza en estados de carga/error).
  const MonthBar = (
    <View style={[styles.monthBar, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}>
      <Pressable onPress={() => shiftMonth(-1)} hitSlop={8}>
        <Ionicons name="chevron-back" size={20} color={palette.textSecondary} />
      </Pressable>
      <Text variant="body" weight="semibold" style={{ textTransform: 'capitalize' }}>
        {monthLabel(activeMonth)}
      </Text>
      <Pressable onPress={() => shiftMonth(1)} hitSlop={8}>
        <Ionicons name="chevron-forward" size={20} color={palette.textSecondary} />
      </Pressable>
    </View>
  );

  // Primera carga sin datos: skeleton de 3 barras de presupuesto.
  if (budgetsLoading && budgets.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
        <ScreenHeader title="Presupuestos" subtitle="Límites mensuales por categoría" showBack />
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {MonthBar}
          <BudgetsSkeleton />
        </View>
      </SafeAreaView>
    );
  }

  // Error de red sin datos previos: cartel con botón Reintentar.
  if (budgetsError && budgets.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
        <ScreenHeader title="Presupuestos" showBack />
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {MonthBar}
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState
            title="No pudimos cargar tus presupuestos"
            description={budgetsError}
            onRetry={() => fetchBudgets(activeMonth, true)}
          />
        </View>
        <FAB onPress={openCreate} />
        <BudgetSheet
          visible={sheetOpen}
          onClose={() => setSheetOpen(false)}
          editing={editing}
          amount={amount}
          setAmount={setAmount}
          resetDay={resetDay}
          setResetDay={setResetDay}
          categoryId={categoryId}
          setCategoryId={setCategoryId}
          autoRenew={autoRenew}
          setAutoRenew={setAutoRenew}
          expenseCategories={expenseCategories}
          saving={saving}
          onSave={onSave}
          onDelete={onDelete}
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
        <ScreenHeader title="Presupuestos" subtitle="Límites mensuales por categoría" showBack />

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          {MonthBar}

          {budgets.length > 0 && (
            <Card>
              <Text variant="label" tone="secondary">Resumen del mes</Text>
              <Text variant="display" tabular tone={globalPct > 100 ? 'danger' : 'primary'}>
                {formatMoney(totalSpent, currency)}
              </Text>
              <Text variant="caption" tone="muted">
                de {formatMoney(totalLimit, currency)} ({globalPct.toFixed(1)}%)
              </Text>
              <View style={{ marginTop: spacing.md }}>
                <ProgressBar
                  value={Math.min(100, globalPct)}
                  color={globalPct > 100 ? palette.danger : globalPct > 80 ? palette.warning : palette.accent}
                  height={8}
                />
              </View>
            </Card>
          )}

          {/* Sin datos reales: empty state (usuario sin presupuestos creados) */}
          {budgets.length === 0 ? (
            <EmptyState
              icon="wallet-outline"
              title="Sin presupuestos"
              description="Establece un límite mensual por categoría para controlar tus gastos."
              ctaLabel="Crear presupuesto"
              onCta={openCreate}
            />
          ) : (
            budgets.map((b) => {
              const pct = Number(b.amount) > 0 ? (Number(b.spent) / Number(b.amount)) * 100 : 0;
              const over = pct > 100;
              const warn = pct > 80 && !over;
              const color = over ? palette.danger : warn ? palette.warning : (b.category_color || palette.accent);
              return (
                <Pressable key={b.id} onPress={() => openEdit(b)} onLongPress={() => onDelete(b)}>
                  <Card>
                    <View style={styles.row}>
                      <CategoryBadge color={b.category_color} icon={b.category_icon} type="expense" size={38} />
                      <View style={{ flex: 1, gap: 2 }}>
                        <Text variant="body" weight="semibold">
                          {b.category_name || 'Global (todas las categorías)'}
                        </Text>
                        <Text variant="caption" tone="muted">
                          Reinicia el día {b.reset_day || 1}
                        </Text>
                      </View>
                      <Text variant="h2" tabular tone={over ? 'danger' : 'primary'}>
                        {Math.round(pct)}%
                      </Text>
                    </View>
                    <View style={{ marginTop: spacing.md }}>
                      <ProgressBar value={Math.min(100, pct)} color={color} height={8} />
                    </View>
                    <View style={[styles.amounts, { borderTopColor: palette.borderSubtle }]}>
                      <Text variant="caption" tone="muted">
                        {formatMoney(Number(b.spent), currency)} de {formatMoney(Number(b.amount), currency)}
                      </Text>
                      {over && (
                        <Text variant="caption" tone="danger" weight="semibold">
                          Excedido {formatMoney(Number(b.spent) - Number(b.amount), currency)}
                        </Text>
                      )}
                    </View>
                  </Card>
                </Pressable>
              );
            })
          )}
        </View>
      </ScrollView>

      <FAB onPress={openCreate} />

      <BudgetSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={editing}
        amount={amount}
        setAmount={setAmount}
        resetDay={resetDay}
        setResetDay={setResetDay}
        categoryId={categoryId}
        setCategoryId={setCategoryId}
        autoRenew={autoRenew}
        setAutoRenew={setAutoRenew}
        expenseCategories={expenseCategories}
        saving={saving}
        onSave={onSave}
        onDelete={onDelete}
      />
    </SafeAreaView>
  );
};

// Sheet extraída como sub-componente para no duplicarla en los estados de error.
type BudgetSheetProps = {
  visible: boolean;
  onClose: () => void;
  editing: Budget | null;
  amount: string;
  setAmount: (v: string) => void;
  resetDay: string;
  setResetDay: (v: string) => void;
  categoryId: number | null;
  setCategoryId: (v: number | null) => void;
  autoRenew: boolean;
  setAutoRenew: (v: boolean) => void;
  expenseCategories: Category[];
  saving: boolean;
  onSave: () => void;
  onDelete: (b: Budget) => void;
};

const BudgetSheet: React.FC<BudgetSheetProps> = ({
  visible, onClose, editing, amount, setAmount, resetDay, setResetDay,
  categoryId, setCategoryId, autoRenew, setAutoRenew,
  expenseCategories, saving, onSave, onDelete,
}) => {
  const { palette } = useTheme();
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Editar presupuesto' : 'Nuevo presupuesto'}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button title="Guardar" loading={saving} onPress={onSave} size="lg" />
          {editing && (
            <Button
              title="Eliminar"
              variant="ghost"
              onPress={() => { onClose(); onDelete(editing); }}
            />
          )}
        </View>
      }
    >
      <Input
        label="Límite mensual"
        keyboardType="decimal-pad"
        placeholder="0.00"
        value={amount}
        onChangeText={setAmount}
      />
      <Input
        label="Día de reinicio (1-28)"
        keyboardType="number-pad"
        placeholder="1"
        value={resetDay}
        onChangeText={setResetDay}
        helper="Día del mes en que vuelve a empezar el cómputo"
      />
      {!editing && (
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" tone="secondary">Categoría (opcional)</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            <Pressable
              onPress={() => setCategoryId(null)}
              style={[
                styles.allChip,
                {
                  backgroundColor: categoryId === null ? palette.accentSoft : palette.bgElevated,
                  borderColor: categoryId === null ? palette.accent : palette.borderSubtle,
                },
              ]}
            >
              <Ionicons name="grid-outline" size={14} color={palette.textSecondary} />
              <Text variant="label" weight={categoryId === null ? 'semibold' : 'medium'}>
                Todas
              </Text>
            </Pressable>
            {expenseCategories.map((c: Category) => (
              <CategoryChip
                key={c.id}
                category={c}
                selected={categoryId === c.id}
                onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
              />
            ))}
          </ScrollView>
        </View>
      )}
      {/* Toggle de auto-renovación mensual */}
      <View style={styles.autoRenewRow}>
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="body" weight="medium">Renovar automáticamente cada mes</Text>
          <Text variant="caption" tone="muted">
            Si está activo, se creará el mismo presupuesto el mes siguiente con el mismo importe.
          </Text>
        </View>
        <Switch
          value={autoRenew}
          onValueChange={setAutoRenew}
          trackColor={{ false: palette.borderSubtle, true: palette.accent }}
          thumbColor={autoRenew ? palette.bgBase : palette.bgElevated}
        />
      </View>
    </Sheet>
  );
};

// Skeleton de 3 barras de presupuesto para la primera carga.
const BudgetsSkeleton: React.FC = () => (
  <View style={{ gap: spacing.md }}>
    {/* Card resumen */}
    <Skeleton height={90} borderRadius={radius.md} />
    {/* 3 barras de presupuesto */}
    {[0, 1, 2].map((i) => (
      <View key={i} style={{ gap: spacing.sm }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
          <Skeleton width={38} height={38} borderRadius={radius.md} />
          <View style={{ flex: 1, gap: 6 }}>
            <Skeleton width="50%" height={14} />
            <Skeleton width="30%" height={11} />
          </View>
          <Skeleton width={40} height={18} />
        </View>
        <Skeleton height={8} borderRadius={radius.pill} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  autoRenewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
  },
  amounts: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  monthBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  chips: { gap: spacing.sm, paddingVertical: 4 },
  allChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
