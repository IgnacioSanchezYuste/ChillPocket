import React, { useEffect, useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Sheet } from './Sheet';
import { Input } from './Input';
import { Button } from './Button';
import { Text } from './Text';
import { DateRangePicker } from './DateRangePicker';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { PAYMENT_METHODS } from '../utils/paymentMethods';
import type { PaymentMethod } from '../api/types';

/** Estado de los filtros avanzados de Movimientos. */
export type AdvancedFilters = {
  from?: string;            // YYYY-MM-DD
  to?: string;              // YYYY-MM-DD
  amount_min?: string;      // texto editable; el parent convierte a número
  amount_max?: string;
  payment_method?: PaymentMethod | null;
};

type Props = {
  visible: boolean;
  initial: AdvancedFilters;
  onClose: () => void;
  onApply: (next: AdvancedFilters) => void;
};

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export const TransactionFiltersSheet: React.FC<Props> = ({ visible, initial, onClose, onApply }) => {
  const { palette } = useTheme();
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');
  const [amountMin, setAmountMin] = useState(initial.amount_min ?? '');
  const [amountMax, setAmountMax] = useState(initial.amount_max ?? '');
  const [pm, setPm] = useState<PaymentMethod | null>(initial.payment_method ?? null);

  // Resincroniza cuando se abre con valores cambiados desde fuera.
  useEffect(() => {
    if (visible) {
      setFrom(initial.from ?? '');
      setTo(initial.to ?? '');
      setAmountMin(initial.amount_min ?? '');
      setAmountMax(initial.amount_max ?? '');
      setPm(initial.payment_method ?? null);
    }
  }, [visible]);

  const apply = () => {
    onApply({
      from: ISO_RE.test(from) ? from : undefined,
      to: ISO_RE.test(to) ? to : undefined,
      amount_min: amountMin.trim() === '' ? undefined : amountMin.replace(',', '.'),
      amount_max: amountMax.trim() === '' ? undefined : amountMax.replace(',', '.'),
      payment_method: pm ?? null,
    });
    onClose();
  };

  const clear = () => {
    setFrom('');
    setTo('');
    setAmountMin('');
    setAmountMax('');
    setPm(null);
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Filtros avanzados"
      footer={
        <View style={{ gap: spacing.sm }}>
          <Button title="Aplicar filtros" onPress={apply} size="lg" />
          <Button title="Limpiar todo" variant="ghost" onPress={clear} />
        </View>
      }
    >
      <View style={{ gap: spacing.sm }}>
        <Text variant="label" tone="secondary">Rango de fechas</Text>
        <DateRangePicker
          from={from || null}
          to={to || null}
          onChange={(f, t) => {
            setFrom(f ?? '');
            setTo(t ?? '');
          }}
        />
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text variant="label" tone="secondary">Importe</Text>
        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          <View style={{ flex: 1 }}>
            <Input
              label="Mínimo"
              keyboardType="decimal-pad"
              placeholder="0.00"
              value={amountMin}
              onChangeText={setAmountMin}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Input
              label="Máximo"
              keyboardType="decimal-pad"
              placeholder="0.00"
              value={amountMax}
              onChangeText={setAmountMax}
            />
          </View>
        </View>
      </View>

      <View style={{ gap: spacing.sm }}>
        <Text variant="label" tone="secondary">Método de pago</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Pressable
            onPress={() => setPm(null)}
            style={[
              styles.chip,
              {
                backgroundColor: pm === null ? palette.accentSoft : palette.bgElevated,
                borderColor: pm === null ? palette.accent : palette.borderSubtle,
              },
            ]}
          >
            <Ionicons name="apps-outline" size={14} color={pm === null ? palette.accent : palette.textSecondary} />
            <Text variant="label" weight={pm === null ? 'semibold' : 'medium'} tone={pm === null ? 'accent' : 'primary'}>
              Cualquiera
            </Text>
          </Pressable>
          {PAYMENT_METHODS.map((m) => {
            const active = pm === m.value;
            return (
              <Pressable
                key={m.value}
                onPress={() => setPm(active ? null : m.value)}
                style={[
                  styles.chip,
                  {
                    backgroundColor: active ? palette.accentSoft : palette.bgElevated,
                    borderColor: active ? palette.accent : palette.borderSubtle,
                  },
                ]}
              >
                <Ionicons name={m.icon} size={14} color={active ? palette.accent : palette.textSecondary} />
                <Text variant="label" weight={active ? 'semibold' : 'medium'} tone={active ? 'accent' : 'primary'}>
                  {m.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Sheet>
  );
};

/** Cuenta cuántos filtros avanzados están activos (para el badge del botón). */
export function countActiveFilters(f: AdvancedFilters): number {
  let n = 0;
  if (f.from && ISO_RE.test(f.from)) n++;
  if (f.to && ISO_RE.test(f.to)) n++;
  if (f.amount_min && f.amount_min.trim() !== '') n++;
  if (f.amount_max && f.amount_max.trim() !== '') n++;
  if (f.payment_method) n++;
  return n;
}

const styles = StyleSheet.create({
  chips: { gap: spacing.sm, paddingVertical: 4, paddingRight: spacing.lg },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
