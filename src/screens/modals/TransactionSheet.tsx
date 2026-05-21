import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../../components/Sheet';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { CategoryChip } from '../../components/CategoryChip';
import { Text } from '../../components/Text';
import { useDataStore } from '../../store/useDataStore';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { useToast } from '../../components/Toast';
import { transactionsApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { confirmDelete } from '../../utils/confirm';
import { todayISO } from '../../utils/format';
import { spacing, radius } from '../../theme/spacing';
import { useTheme } from '../../theme/ThemeProvider';
import { PAYMENT_METHODS } from '../../utils/paymentMethods';
import type { PaymentMethod, Transaction } from '../../api/types';

export type TransactionPrefill = {
  amount?: string;
  description?: string;
  type?: 'expense' | 'income';
  paymentMethod?: PaymentMethod | null;
  categoryName?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: Transaction | null;
  onSaved?: () => void;
  prefill?: TransactionPrefill | null;
};

export const TransactionSheet: React.FC<Props> = ({ visible, onClose, editing, onSaved, prefill }) => {
  const { categories, fetchCategories, refreshAll } = useDataStore();
  const { lastCategoryId, lastPaymentMethod, setLastCategory, setLastPaymentMethod } =
    usePreferencesStore();
  const toast = useToast();
  const { palette } = useTheme();

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && categories.length === 0) fetchCategories();
  }, [visible]);

  useEffect(() => {
    if (visible) {
      if (editing) {
        setType(editing.type);
        setAmount(String(editing.amount));
        setDescription(editing.description);
        setCategoryId(editing.category_id);
        setDate(editing.transaction_date);
        setNotes(editing.notes || '');
        setPaymentMethod(editing.payment_method ?? null);
      } else if (prefill) {
        // Onboarding: formulario precargado con un ejemplo.
        const t = prefill.type ?? 'expense';
        setType(t);
        setAmount(prefill.amount ?? '');
        setDescription(prefill.description ?? '');
        setCategoryId(null); // se resuelve por nombre en el efecto de categorías
        setDate(todayISO());
        setNotes('');
        setPaymentMethod(prefill.paymentMethod ?? null);
      } else {
        // Nueva transacción: pre-rellenar con las últimas elecciones del usuario.
        const initialType: 'expense' | 'income' = 'expense';
        setType(initialType);
        setAmount('');
        setDescription('');
        setCategoryId(lastCategoryId[initialType] ?? null);
        setDate(todayISO());
        setNotes('');
        setPaymentMethod(lastPaymentMethod);
      }
    }
  }, [visible, editing]);

  // Al cambiar el tipo (gasto/ingreso) en modo creación, intentar pre-seleccionar
  // la última categoría usada para ese tipo. En edición se mantiene la actual.
  useEffect(() => {
    if (visible && !editing && !prefill) {
      setCategoryId(lastCategoryId[type] ?? null);
    }
  }, [type, visible, editing, lastCategoryId]);

  // Onboarding: resolver la categoría del ejemplo por su nombre cuando carguen.
  useEffect(() => {
    if (visible && !editing && prefill?.categoryName && categories.length > 0) {
      const wanted = prefill.categoryName.toLowerCase();
      const match = categories.find(
        (c) => c.type === (prefill.type ?? 'expense') && c.name.toLowerCase() === wanted
      );
      if (match) setCategoryId(match.id);
    }
  }, [categories, visible, editing]);

  const filtered = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);
  const generatedFromRecurring = !!editing?.recurring_id;

  const onSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('El importe debe ser mayor que 0');
    if (!description.trim()) return toast.error('Añade una descripción');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return toast.error('Fecha YYYY-MM-DD');

    setSaving(true);
    try {
      if (editing) {
        await transactionsApi.update(editing.id, {
          amount: amt,
          description: description.trim(),
          type,
          transaction_date: date,
          category_id: categoryId,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
        });
        toast.success('Transacción actualizada');
      } else {
        await transactionsApi.create({
          amount: amt,
          description: description.trim(),
          type,
          transaction_date: date,
          category_id: categoryId,
          payment_method: paymentMethod,
          notes: notes.trim() || null,
        });
        // Persistir últimas elecciones (solo al crear, no al editar)
        setLastCategory(type, categoryId);
        if (type === 'expense') setLastPaymentMethod(paymentMethod);
        toast.success('Transacción creada');
      }
      await refreshAll(true);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    const ok = await confirmDelete('transacción', `"${editing.description}" se eliminará permanentemente.`);
    if (!ok) return;
    setSaving(true);
    try {
      await transactionsApi.remove(editing.id);
      toast.success('Eliminada');
      await refreshAll(true);
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e, 'No se pudo eliminar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Editar transacción' : 'Nueva transacción'}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button title={editing ? 'Guardar cambios' : 'Crear transacción'} onPress={onSave} loading={saving} size="lg" />
          {editing && <Button title="Eliminar" variant="ghost" onPress={onDelete} />}
        </View>
      }
    >
      {generatedFromRecurring && (
        <View style={[styles.infoBanner, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
          <Ionicons name="repeat" size={16} color={palette.accent} />
          <Text variant="caption" tone="accent" style={{ flex: 1 }}>
            Generada desde un gasto fijo. Puedes editarla pero seguirá ligada al recurrente.
          </Text>
        </View>
      )}

      <SegmentedControl
        options={[
          { value: 'expense', label: 'Gasto' },
          { value: 'income', label: 'Ingreso' },
        ]}
        value={type}
        onChange={(v) => {
          setType(v);
          setCategoryId(null);
        }}
      />

      <Input
        label="Importe"
        keyboardType="decimal-pad"
        placeholder="0.00"
        value={amount}
        onChangeText={setAmount}
      />
      <Input
        label="Descripción"
        placeholder="¿En qué fue?"
        value={description}
        onChangeText={setDescription}
      />
      <Input
        label="Fecha"
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        autoCapitalize="none"
      />

      <View style={{ gap: spacing.sm }}>
        <Text variant="label" tone="secondary">Categoría</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          {filtered.length === 0 && (
            <Text variant="caption" tone="muted">Crea categorías desde Ajustes</Text>
          )}
          {filtered.map((c) => (
            <CategoryChip
              key={c.id}
              category={c}
              selected={categoryId === c.id}
              onPress={() => setCategoryId(categoryId === c.id ? null : c.id)}
            />
          ))}
        </ScrollView>
      </View>

      {type === 'expense' && (
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" tone="secondary">Tipo de pago</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
            {PAYMENT_METHODS.map((pm) => {
              const active = paymentMethod === pm.value;
              return (
                <Pressable
                  key={pm.value}
                  onPress={() => setPaymentMethod(active ? null : pm.value)}
                  style={[
                    styles.pmChip,
                    {
                      backgroundColor: active ? palette.accentSoft : palette.bgElevated,
                      borderColor: active ? palette.accent : palette.borderSubtle,
                    },
                  ]}
                >
                  <Ionicons
                    name={pm.icon}
                    size={14}
                    color={active ? palette.accent : palette.textSecondary}
                  />
                  <Text variant="label" weight={active ? 'semibold' : 'medium'}>
                    {pm.label}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      <Input
        label="Notas (opcional)"
        placeholder="Añade detalles si quieres"
        value={notes}
        onChangeText={setNotes}
        multiline
      />
    </Sheet>
  );
};

const styles = StyleSheet.create({
  chips: { gap: spacing.sm, paddingVertical: 4 },
  pmChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
