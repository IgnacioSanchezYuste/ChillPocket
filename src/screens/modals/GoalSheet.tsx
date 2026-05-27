import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from '../../components/Sheet';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { Text } from '../../components/Text';
import { useToast } from '../../components/Toast';
import { goalsApi } from '../../api/endpoints';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { apiError } from '../../api/http';
import { confirmDelete } from '../../utils/confirm';
import { formatMoney } from '../../utils/format';
import type { SavingsGoal } from '../../api/types';

type Props = {
  visible: boolean;
  onClose: () => void;
  editing?: SavingsGoal | null;
  onSaved?: () => void;
};

type Mode = 'form' | 'move';
type Direction = 'in' | 'out';
type Scope = 'month' | 'historical';

export const GoalSheet: React.FC<Props> = ({ visible, onClose, editing, onSaved }) => {
  const { fetchGoals, refreshAll, availableBalance, summary } = useDataStore();
  const { user } = useAuthStore();
  const { palette } = useTheme();
  const toast = useToast();
  const currency = user?.currency || 'EUR';
  // Fase 4: descomposición de availableBalance en los dos pools.
  //   availableBalance = saldo del mes en curso + "Mis ahorros"
  // (ver currentPeriodAvailable / historicalAvailable en backend/index.php).
  // Calculamos en cliente la parte del mes restando "Mis ahorros" para no
  // añadir otra petición — el backend mantiene esa invariante.
  const historicalAvailable = Number(summary?.net_total_historical ?? 0);
  const monthAvailable = Math.max(0, availableBalance - historicalAvailable);

  const [mode, setMode] = useState<Mode>('form');
  const [name, setName] = useState('');
  const [target, setTarget] = useState('');
  const [date, setDate] = useState('');
  const [saving, setSaving] = useState(false);
  // Move mode
  const [direction, setDirection] = useState<Direction>('in');
  const [moveAmount, setMoveAmount] = useState('');
  const [scope, setScope] = useState<Scope>('month');

  useEffect(() => {
    if (visible) {
      if (editing) {
        setName(editing.name);
        setTarget(String(editing.target_amount));
        setDate(editing.target_date || '');
        setMode('move'); // Si ya existe, abrimos directamente la vista de aportar/retirar
      } else {
        setName('');
        setTarget('');
        setDate('');
        setMode('form');
      }
      setDirection('in');
      setMoveAmount('');
      setScope('month');
    }
  }, [visible, editing]);

  const onSaveMeta = async () => {
    const t = parseFloat(target.replace(',', '.'));
    if (!name.trim()) return toast.error('Añade un nombre');
    if (!Number.isFinite(t) || t <= 0) return toast.error('Objetivo inválido');
    setSaving(true);
    try {
      if (editing) {
        await goalsApi.update(editing.id, {
          name: name.trim(),
          target_amount: t,
          target_date: date || null,
        });
        toast.success('Meta actualizada');
      } else {
        await goalsApi.create({
          name: name.trim(),
          target_amount: t,
          target_date: date || undefined,
        });
        toast.success('Meta creada');
      }
      await fetchGoals();
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const onMove = async () => {
    if (!editing) return;
    const amt = parseFloat(moveAmount.replace(',', '.'));
    if (!Number.isFinite(amt) || amt <= 0) return toast.error('Importe inválido');
    // Validaciones cliente (las definitivas las hace el backend).
    if (direction === 'in') {
      const limit = scope === 'historical' ? historicalAvailable : monthAvailable;
      if (amt > limit + 0.001) {
        const poolName = scope === 'historical' ? 'Mis ahorros' : 'Saldo del mes';
        return toast.error(`Solo tienes ${formatMoney(limit, currency)} en ${poolName}`);
      }
    }
    if (direction === 'out' && amt > Number(editing.current_amount)) {
      return toast.error(`La meta solo tiene ${formatMoney(Number(editing.current_amount), currency)}`);
    }
    setSaving(true);
    try {
      const signed = direction === 'in' ? amt : -amt;
      await goalsApi.contribute(editing.id, signed, scope);
      await refreshAll(true);
      toast.success(direction === 'in' ? 'Aportación registrada' : 'Retirada registrada');
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
    const ok = await confirmDelete(
      'meta',
      `Se eliminará "${editing.name}". Las transacciones ligadas se conservan pero perderán el enlace a la meta.`
    );
    if (!ok) return;
    setSaving(true);
    try {
      await goalsApi.remove(editing.id);
      await refreshAll(true);
      toast.success('Eliminada');
      onSaved?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const isEditing = !!editing;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={
        isEditing
          ? mode === 'move'
            ? `Mover dinero · ${editing!.name}`
            : `Editar ${editing!.name}`
          : 'Nueva meta de ahorro'
      }
      footer={
        <View style={{ gap: spacing.sm }}>
          {mode === 'form' ? (
            <Button title={isEditing ? 'Guardar cambios' : 'Crear meta'} loading={saving} onPress={onSaveMeta} size="lg" />
          ) : (
            <Button
              title={direction === 'in' ? 'Aportar a la meta' : 'Retirar de la meta'}
              loading={saving}
              onPress={onMove}
              size="lg"
            />
          )}
          {isEditing && (
            <View style={{ flexDirection: 'row', gap: spacing.sm }}>
              <View style={{ flex: 1 }}>
                <Button
                  title={mode === 'move' ? 'Editar datos' : 'Mover dinero'}
                  variant="secondary"
                  onPress={() => setMode(mode === 'move' ? 'form' : 'move')}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Button title="Eliminar" variant="ghost" onPress={onDelete} />
              </View>
            </View>
          )}
        </View>
      }
    >
      {isEditing && mode === 'move' && (
        <>
          <View style={[styles.balanceCard, { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle }]}>
            <View style={styles.balanceRow}>
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">Saldo del mes</Text>
                <Text variant="h2" weight="semibold" tabular tone={monthAvailable > 0 ? 'success' : 'danger'}>
                  {formatMoney(monthAvailable, currency)}
                </Text>
              </View>
              <View style={[styles.balanceDivider, { backgroundColor: palette.borderSubtle }]} />
              <View style={{ flex: 1 }}>
                <Text variant="caption" tone="muted">Mis ahorros</Text>
                <Text variant="h2" weight="semibold" tabular tone={historicalAvailable >= 0 ? 'success' : 'danger'}>
                  {formatMoney(historicalAvailable, currency)}
                </Text>
              </View>
            </View>
            <View style={[styles.balanceFooter, { borderTopColor: palette.borderSubtle }]}>
              <Text variant="caption" tone="muted">
                En esta meta: {formatMoney(Number(editing!.current_amount), currency)} de{' '}
                {formatMoney(Number(editing!.target_amount), currency)}
              </Text>
            </View>
          </View>

          <View style={styles.dirRow}>
            <DirectionButton
              active={direction === 'in'}
              icon="arrow-down-circle"
              label="Aportar"
              description="del saldo a la meta"
              color={palette.accent}
              onPress={() => setDirection('in')}
            />
            <DirectionButton
              active={direction === 'out'}
              icon="arrow-up-circle"
              label="Retirar"
              description="de la meta al saldo"
              color={palette.warning}
              onPress={() => setDirection('out')}
            />
          </View>

          <View style={{ gap: spacing.xs }}>
            <Text variant="label" tone="secondary">
              {direction === 'in' ? 'Aportar desde' : 'Devolver a'}
            </Text>
            <SegmentedControl
              options={[
                { value: 'month', label: 'Saldo del mes' },
                { value: 'historical', label: 'Mis ahorros' },
              ]}
              value={scope}
              onChange={setScope}
            />
          </View>

          <Input
            label="Importe"
            keyboardType="decimal-pad"
            placeholder="0.00"
            value={moveAmount}
            onChangeText={setMoveAmount}
            helper={
              direction === 'in'
                ? `Máximo ${formatMoney(
                    scope === 'historical' ? historicalAvailable : monthAvailable,
                    currency,
                  )}`
                : `Máximo ${formatMoney(Number(editing!.current_amount), currency)}`
            }
          />

          <View style={styles.quickRow}>
            {[25, 50, 100, 250].map((q) => (
              <Pressable
                key={q}
                onPress={() => setMoveAmount(String(q))}
                style={[styles.quickChip, { borderColor: palette.borderSubtle, backgroundColor: palette.bgElevated }]}
              >
                <Text variant="label" weight="medium">{formatMoney(q, currency)}</Text>
              </Pressable>
            ))}
          </View>

          <View style={[styles.note, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
            <Ionicons name="information-circle-outline" size={14} color={palette.accent} />
            <Text variant="caption" tone="accent" style={{ flex: 1 }}>
              Aportar genera un gasto en la categoría "Ahorro", retirar un ingreso. Tu saldo total se ajusta en consecuencia.
            </Text>
          </View>
        </>
      )}

      {mode === 'form' && (
        <>
          <Input label="Nombre" placeholder="p.ej. Viaje a Japón" value={name} onChangeText={setName} />
          <Input
            label="Objetivo total"
            keyboardType="decimal-pad"
            placeholder="0.00"
            value={target}
            onChangeText={setTarget}
          />
          <Input
            label="Fecha objetivo (opcional)"
            placeholder="YYYY-MM-DD"
            value={date}
            onChangeText={setDate}
            autoCapitalize="none"
          />
          {!isEditing && (
            <View style={[styles.note, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
              <Ionicons name="information-circle-outline" size={14} color={palette.accent} />
              <Text variant="caption" tone="accent" style={{ flex: 1 }}>
                La meta arranca a 0. Después podrás aportar dinero desde tu saldo, y aparecerá como movimiento en la categoría "Ahorro".
              </Text>
            </View>
          )}
        </>
      )}
    </Sheet>
  );
};

const DirectionButton: React.FC<{
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description: string;
  color: string;
  onPress: () => void;
}> = ({ active, icon, label, description, color, onPress }) => {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.dirBtn,
        {
          backgroundColor: active ? color + '15' : palette.bgElevated,
          borderColor: active ? color : palette.borderSubtle,
        },
      ]}
    >
      <Ionicons name={icon} size={22} color={active ? color : palette.textSecondary} />
      <View style={{ flex: 1 }}>
        <Text variant="body" weight="semibold" tone={active ? 'primary' : 'secondary'}>
          {label}
        </Text>
        <Text variant="caption" tone="muted">{description}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  balanceCard: {
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  balanceDivider: { width: 1, height: 36 },
  balanceFooter: {
    marginTop: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: 1,
  },
  dirRow: { flexDirection: 'row', gap: spacing.sm },
  dirBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  quickRow: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  quickChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  note: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
});
