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
import { transactionsApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { todayISO } from '../../utils/format';
import { spacing } from '../../theme/spacing';
import type { Transaction } from '../../api/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: Transaction | null;
  onSaved?: () => void;
};

export const TransactionSheet: React.FC<Props> = ({ visible, onClose, editing, onSaved }) => {
  const { categories, fetchCategories, refreshAll } = useDataStore();
  const toast = useToast();

  const [type, setType] = useState<'expense' | 'income'>('expense');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [date, setDate] = useState(todayISO());
  const [notes, setNotes] = useState('');
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
      } else {
        setType('expense');
        setAmount('');
        setDescription('');
        setCategoryId(null);
        setDate(todayISO());
        setNotes('');
      }
    }
  }, [visible, editing]);

  const filtered = useMemo(() => categories.filter((c) => c.type === type), [categories, type]);

  const onSave = async () => {
    const amt = parseFloat(amount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt < 0) return toast.error('Importe inválido');
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
          notes: notes.trim() || null,
        });
        toast.success('Transacción creada');
      }
      await refreshAll();
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
    setSaving(true);
    try {
      await transactionsApi.remove(editing.id);
      toast.success('Eliminada');
      await refreshAll();
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
});
