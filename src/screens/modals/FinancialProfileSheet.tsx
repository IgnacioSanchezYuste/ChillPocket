import React, { useEffect, useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { WheelPicker } from '../../components/WheelPicker';
import { useToast } from '../../components/Toast';
import { authApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { useAuthStore } from '../../store/useAuthStore';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { useDataStore } from '../../store/useDataStore';
import { formatMoney } from '../../utils/format';
import { monthlyIncome, serverFinancialProfile } from '../../utils/financialPeriod';
import { MONTH_DAYS, WEEKDAYS } from '../../utils/paydayOptions';
import { track } from '../../utils/analytics';

type Frequency = 'monthly' | 'weekly' | 'variable';
type Props = { visible: boolean; onClose: () => void };

const parseAmount = (text: string): number | null => {
  const t = text.trim();
  if (t === '') return null;
  const n = parseFloat(t.replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

/**
 * Edición del perfil financiero tras el tutorial: ingreso, día de cobro y
 * objetivo de ahorro. Se guarda en el dispositivo y en el servidor, que usa el
 * día de cobro para el periodo de "Saldo del mes".
 */
export const FinancialProfileSheet: React.FC<Props> = ({ visible, onClose }) => {
  const { palette } = useTheme();
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setProfilePrefs = usePreferencesStore((s) => s.setProfilePrefs);

  const [frequency, setFrequency] = useState<Frequency>('monthly');
  const [amountText, setAmountText] = useState('');
  const [payday, setPayday] = useState<number | null>(1);
  const [goalText, setGoalText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Al abrir, parte de lo guardado en el dispositivo o, si no hay, del servidor.
  useEffect(() => {
    if (!visible) return;
    const prefs = usePreferencesStore.getState();
    const user = useAuthStore.getState().user;
    const freq = (prefs.incomeFrequency as Frequency | null)
      ?? (user?.income_reference != null ? 'monthly' : 'variable');
    const amount = prefs.incomeAmount ?? user?.income_reference ?? null;
    const goal = prefs.savingsGoalMonthly ?? user?.savings_goal_monthly ?? null;
    setFrequency(freq);
    setAmountText(amount !== null ? String(amount) : '');
    setPayday(
      freq === 'monthly'
        ? prefs.incomePayday ?? user?.income_payday ?? 1
        : freq === 'weekly'
        ? prefs.incomePayday
        : null,
    );
    setGoalText(goal !== null ? String(goal) : '');
    setError('');
  }, [visible]);

  const amount = parseAmount(amountText);
  const perMonth = frequency === 'variable' ? null : monthlyIncome(frequency, amount !== null && !Number.isNaN(amount) ? amount : null);
  const currency = user?.currency ?? 'EUR';

  // Cobrar el día 1 equivale a ir por meses naturales: no hay nada que recalcular.
  const paydayChanged = useMemo(() => {
    const norm = (p: number | null) => (p === 1 ? null : p);
    return norm(user?.income_payday ?? null) !== norm(frequency === 'monthly' ? payday : null);
  }, [user?.income_payday, frequency, payday]);

  const changeFrequency = (f: Frequency) => {
    if (f === frequency) return;
    setFrequency(f);
    setPayday(f === 'monthly' ? 1 : null);
  };

  const save = async () => {
    const goal = parseAmount(goalText);
    if (frequency !== 'variable' && (amount === null || Number.isNaN(amount) || amount <= 0)) {
      return setError('Indica un ingreso mayor que 0');
    }
    if (goal !== null && (Number.isNaN(goal) || goal < 0)) return setError('El objetivo no es válido');
    if (goal !== null && perMonth !== null && goal >= perMonth) {
      return setError('El objetivo debe ser menor que tu ingreso mensual');
    }
    setError('');

    const profile = {
      incomeFrequency: frequency,
      incomeAmount: frequency === 'variable' ? null : amount,
      incomePayday: frequency === 'variable' ? null : payday,
      savingsGoalMonthly: goal && goal > 0 ? goal : null,
    };
    setSaving(true);
    try {
      const updated = await authApi.updateMe(serverFinancialProfile(profile));
      track('financial_profile_saved');
      setProfilePrefs(profile);
      setUser(updated);
      // El periodo del saldo puede haber cambiado: recarga una sola vez.
      useDataStore.getState().refreshAll(true);
      onClose();
      toast.success('Perfil financiero guardado');
    } catch (e) {
      setError(apiError(e, 'No se pudo guardar'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Ingresos y ahorro"
      footer={<Button title="Guardar" size="lg" onPress={save} loading={saving} />}
    >
      <View style={{ gap: spacing.lg }}>
        <View style={{ gap: spacing.sm }}>
          <Text variant="label" tone="secondary">¿Cada cuánto cobras?</Text>
          <SegmentedControl<Frequency>
            options={[
              { value: 'monthly', label: 'Mensual' },
              { value: 'weekly', label: 'Semanal' },
              { value: 'variable', label: 'Variable' },
            ]}
            value={frequency}
            onChange={changeFrequency}
          />
        </View>

        {frequency !== 'variable' && (
          <Input
            label={frequency === 'weekly' ? 'Salario semanal' : 'Salario neto mensual'}
            placeholder="0,00"
            keyboardType="decimal-pad"
            value={amountText}
            onChangeText={setAmountText}
            helper={
              frequency === 'weekly' && perMonth
                ? `Unos ${formatMoney(perMonth, currency)} al mes`
                : undefined
            }
          />
        )}

        {frequency === 'monthly' && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="label" tone="secondary">Día del mes que cobras</Text>
            <WheelPicker
              items={MONTH_DAYS}
              value={payday ?? 1}
              onChange={setPayday}
              accessibilityLabel="Día del mes que cobras"
              fadeColor={palette.bgSurface}
            />
          </View>
        )}

        {frequency === 'weekly' && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="label" tone="secondary">Día de la semana que cobras</Text>
            <View style={styles.weekdays}>
              {WEEKDAYS.map((d) => {
                const selected = payday === d.value;
                return (
                  <Pressable
                    key={d.value}
                    onPress={() => setPayday(d.value)}
                    style={[
                      styles.weekday,
                      {
                        backgroundColor: selected ? palette.accent : palette.bgElevated,
                        borderColor: selected ? palette.accent : palette.borderSubtle,
                      },
                    ]}
                    accessibilityRole="button"
                    aria-selected={selected}
                  >
                    <Text variant="label" weight="semibold" tone={selected ? 'inverted' : 'primary'}>
                      {d.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        )}

        <Input
          label="Ahorro automático mensual"
          placeholder="Sin ahorro automático"
          keyboardType="decimal-pad"
          value={goalText}
          onChangeText={setGoalText}
          helper={
            'Cada día de cobro pasa solo del saldo del mes a Mis ahorros. Un cambio se aplica desde el próximo cobro.' +
            (perMonth ? ` Debe ser menor que ${formatMoney(perMonth, currency)}.` : '')
          }
        />

        {paydayChanged && (
          <View style={[styles.notice, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
            <Ionicons name="information-circle-outline" size={18} color={palette.accent} />
            <Text variant="caption" tone="accent" style={{ flex: 1 }}>
              {frequency === 'monthly'
                ? 'Tu "Saldo del mes" empezará cada mes el día de cobro. Recalcularemos tus meses cerrados y "Mis ahorros".'
                : 'Tu "Saldo del mes" irá por meses naturales. Recalcularemos tus meses cerrados y "Mis ahorros".'}
            </Text>
          </View>
        )}

        {!!error && (
          <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">{error}</Text>
        )}
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  weekdays: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  weekday: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
