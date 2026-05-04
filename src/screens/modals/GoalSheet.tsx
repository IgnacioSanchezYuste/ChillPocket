import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Sheet } from '../../components/Sheet';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { goalsApi } from '../../api/endpoints';
import { useDataStore } from '../../store/useDataStore';
import { spacing } from '../../theme/spacing';
import { apiError } from '../../api/http';
import type { SavingsGoal } from '../../api/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: SavingsGoal | null;
  onSaved?: () => void;
};

export const GoalSheet: React.FC<Props> = ({ visible, onClose, editing, onSaved }) => {
  const { fetchGoals } = useDataStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [current, setCurrent] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (visible) {
      if (editing) {
        setName(editing.name);
        setTarget(String(editing.target_amount));
        setCurrent(String(editing.current_amount));
        setDate(editing.target_date || '');
      } else {
        setName('');
        setTarget('');
        setCurrent('0');
        setDate('');
      }
    }
  }, [visible, editing]);

  const onSave = async () => {
    const t = parseFloat(target.replace(',', '.'));
    const c = parseFloat(current.replace(',', '.')) || 0;
    if (!name.trim()) return toast.error('Añade un nombre');
    if (!Number.isFinite(t) || t <= 0) return toast.error('Objetivo inválido');
    setSaving(true);
    try {
      if (editing) {
        await goalsApi.update(editing.id, {
          name: name.trim(),
          target_amount: t,
          current_amount: c,
          target_date: date || null,
        });
      } else {
        await goalsApi.create({
          name: name.trim(),
          target_amount: t,
          current_amount: c,
          target_date: date || undefined,
        });
      }
      await fetchGoals();
      toast.success('Guardado');
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const onDelete = async () => {
    if (!editing) return;
    setSaving(true);
    try {
      await goalsApi.remove(editing.id);
      await fetchGoals();
      toast.success('Eliminada');
      onSaved?.();
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
      title={editing ? 'Editar meta' : 'Nueva meta de ahorro'}
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button title={editing ? 'Guardar' : 'Crear'} loading={saving} onPress={onSave} size="lg" />
          {editing && <Button title="Eliminar" variant="ghost" onPress={onDelete} />}
        </View>
      }
    >
      <Input label="Nombre" placeholder="p.ej. Viaje a Japón" value={name} onChangeText={setName} />
      <Input label="Objetivo" keyboardType="decimal-pad" placeholder="0.00" value={target} onChangeText={setTarget} />
      <Input
        label="Ya ahorrado"
        keyboardType="decimal-pad"
        placeholder="0.00"
        value={current}
        onChangeText={setCurrent}
      />
      <Input
        label="Fecha objetivo (opcional)"
        placeholder="YYYY-MM-DD"
        value={date}
        onChangeText={setDate}
        autoCapitalize="none"
      />
    </Sheet>
  );
};
