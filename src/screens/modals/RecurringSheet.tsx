import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { CategoryChip } from '../../components/CategoryChip';
import { Text } from '../../components/Text';
import { useDataStore } from '../../store/useDataStore';
import { useToast } from '../../components/Toast';
import { recurringApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { confirmDelete } from '../../utils/confirm';
import { todayISO } from '../../utils/format';
import { spacing } from '../../theme/spacing';
import type { Recurring } from '../../api/types';

export type RecurringPrefill = {
  name?: string;
  amount?: string;
  type?: 'expense' | 'income';
  frequency?: 'weekly' | 'monthly' | 'yearly';
  categoryName?: string;
};

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: Recurring | null;
  /**
   * Callback tras guardar. En creación recibe el ID del recurrente creado;
   * en edición/borrado recibe null. El parámetro es opcional para no romper
   * los callsites existentes que no capturan el valor.
   */
  onSaved?: (createdId?: number | null) => void;
  prefill?: RecurringPrefill | null;
  /** Fecha de inicio forzada (para el onboarding personalizado). */
  forcedStartDate?: string;
};

export const RecurringSheet: React.FC<Props> = ({ visible, onClose, editing, onSaved, prefill, forcedStartDate }) => {
  const { categories, fetchCategories, fetchRecurring } = useDataStore();
  const toast = useToast();
  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [name, setName] = useState('');
  const [amount, setAmount] = useState('');
  const [frequency, setFrequency] = useState<'weekly' | 'monthly' | 'yearly'>('monthly');
  const [startDate, setStartDate] = useState(todayISO());
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible && categories.length === 0) fetchCategories();
  }, [visible]);

  useEffect(() => {
    if (visible) {
      if (editing) {
        setType(editing.type);
        setName(editing.name);
        setAmount(String(editing.amount));
        setFrequency(editing.frequency);
        setStartDate(editing.start_date);
        setCategoryId(editing.category_id);
      } else if (prefill) {
        setType(prefill.type ?? 'expense');
        setName(prefill.name ?? '');
        setAmount(prefill.amount ?? '');
        setFrequency(prefill.frequency ?? 'monthly');
        // forcedStartDate permite al onboarding ajustar la fecha al día de cobro.
        setStartDate(forcedStartDate ?? todayISO());
        setCategoryId(null);
      } else {
        setType('expense');
        setName('');
        setAmount('');
        setFrequency('monthly');
        setStartDate(todayISO());
        setCategoryId(null);
      }
    }
  }, [visible, editing]);

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

  const onSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!name.trim()) return toast.error('Añade un nombre');
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('El importe debe ser mayor que 0');
    setSaving(true);
    try {
      if (editing) {
        await recurringApi.update(editing.id, {
          name: name.trim(),
          amount: amt,
          type,
          frequency,
          start_date: startDate,
          category_id: categoryId,
        } as any);
        toast.success('Actualizado');
        await fetchRecurring(true);
        onSaved?.(null);
        onClose();
      } else {
        const res = await recurringApi.create({
          name: name.trim(),
          amount: amt,
          type,
          frequency,
          start_date: startDate,
          category_id: categoryId,
        } as any) as { id?: number; recurring?: { id?: number } };
        toast.success('Creado');
        // Intentamos extraer el ID del recurrente recién creado.
        // El backend devuelve { success, id } o { success, recurring: { id } }.
        const createdId: number | null =
          typeof res?.id === 'number' ? res.id :
          typeof res?.recurring?.id === 'number' ? res.recurring.id :
          null;
        await fetchRecurring(true);
        onSaved?.(createdId);
        onClose();
      }
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    const ok = await confirmDelete(
      'gasto fijo',
      `"${editing.name}" dejará de generar transacciones. Las ya creadas se mantienen.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      await recurringApi.remove(editing.id);
      toast.success('Eliminado');
      await fetchRecurring(true);
      onSaved?.(null);
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={editing ? 'Editar gasto fijo' : 'Nuevo gasto fijo'}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button title={editing ? 'Guardar cambios' : 'Crear'} onPress={onSave} loading={saving} size="lg" />
          {editing && <Button title="Eliminar" variant="ghost" onPress={onDelete} />}
        </View>
      }
    >
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
      <Input label="Nombre" placeholder="p.ej. Alquiler, Netflix..." value={name} onChangeText={setName} />
      <Input label="Importe" keyboardType="decimal-pad" placeholder="0.00" value={amount} onChangeText={setAmount} />
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
      <Input label="Fecha de inicio" value={startDate} onChangeText={setStartDate} placeholder="YYYY-MM-DD" autoCapitalize="none" />
      <View style={{ gap: spacing.sm }}>
        <Text variant="label" tone="secondary">Categoría</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
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
    </Sheet>
  );
};

const styles = StyleSheet.create({
  chips: { gap: spacing.sm, paddingVertical: 4 },
});
