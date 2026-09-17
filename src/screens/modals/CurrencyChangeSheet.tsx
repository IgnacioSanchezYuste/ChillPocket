import React, { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import type { AxiosError } from 'axios';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { currencyApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { useAuthStore } from '../../store/useAuthStore';
import { useDataStore } from '../../store/useDataStore';
import { usePreferencesStore } from '../../store/usePreferencesStore';
import { formatMoney } from '../../utils/format';
import { convertLocalProfile } from '../../utils/financialPeriod';
import type { ExchangeRate, SupportedCurrency } from '../../api/types';

type Props = {
  visible: boolean;
  target: SupportedCurrency | null;
  onClose: () => void;
};

const formatRate = (rate: number) =>
  new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 6 }).format(rate);

const formatDay = (iso: string) => {
  const [y, m, d] = iso.split('-');
  return y && m && d ? `${d}/${m}/${y}` : iso;
};

/**
 * Cambio de moneda de la cuenta: enseña el cambio del BCE y, al confirmar,
 * convierte en el servidor todos los importes (movimientos, fijos, presupuestos,
 * metas y perfil de ingresos).
 */
export const CurrencyChangeSheet: React.FC<Props> = ({ visible, target, onClose }) => {
  const { palette } = useTheme();
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const savings = useDataStore((s) => s.summary?.net_total_historical ?? null);

  const [rate, setRate] = useState<ExchangeRate | null>(null);
  const [loading, setLoading] = useState(false);
  const [converting, setConverting] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const from = user?.currency ?? 'EUR';

  const loadRate = useCallback(async () => {
    if (!target) return;
    setLoading(true);
    setError('');
    try {
      setRate(await currencyApi.rate(target));
    } catch (e) {
      setRate(null);
      setError(apiError(e, 'No se pudo obtener el cambio de moneda'));
    } finally {
      setLoading(false);
    }
  }, [target]);

  useEffect(() => {
    if (!visible) return;
    setNotice('');
    setRate(null);
    loadRate();
  }, [visible, loadRate]);

  const convert = async () => {
    if (!target || !rate) return;
    setConverting(true);
    setError('');
    setNotice('');
    try {
      const res = await currencyApi.convert(target, rate.rate);
      // El perfil local va en la moneda anterior: se ajusta con el mismo cambio
      // antes de publicar el usuario nuevo (useFinancialProfileSync los compara).
      const prefs = usePreferencesStore.getState();
      prefs.setProfilePrefs(convertLocalProfile(prefs, res.rate, res.user));
      setUser(res.user);
      useDataStore.getState().refreshAll(true);
      onClose();
      toast.success(`Moneda cambiada a ${target}. ${res.converted.transactions} movimientos convertidos.`);
    } catch (e) {
      const data = (e as AxiosError<any>)?.response?.data;
      if (data?.code === 'rate_changed' && typeof data.rate === 'number') {
        setRate((r) => (r ? { ...r, rate: data.rate, date: data.date ?? r.date } : r));
        setNotice('El cambio se acaba de actualizar. Revísalo y confirma de nuevo.');
      } else {
        setError(apiError(e, 'No se pudo cambiar la moneda'));
      }
    } finally {
      setConverting(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={converting ? () => {} : onClose}
      title={target ? `Cambiar moneda a ${target}` : 'Cambiar moneda'}
      footer={
        <Button
          title={target ? `Convertir a ${target}` : 'Convertir'}
          size="lg"
          onPress={convert}
          loading={converting}
          disabled={!rate || loading}
        />
      }
    >
      <View style={{ gap: spacing.lg }}>
        {loading && (
          <View style={styles.center}>
            <ActivityIndicator color={palette.accent} />
            <Text variant="caption" tone="muted">Consultando el cambio del día…</Text>
          </View>
        )}

        {!loading && rate && target && (
          <View style={[styles.rateCard, { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle }]}>
            <Text variant="caption" tone="secondary">Cambio aplicado</Text>
            <Text variant="h2" weight="bold">
              1 {from} = {formatRate(rate.rate)} {target}
            </Text>
            <Text variant="caption" tone="muted">
              {rate.source} · {formatDay(rate.date)}
            </Text>
            {savings !== null && savings !== 0 && (
              <Text variant="label" tone="secondary" style={{ marginTop: spacing.xs }}>
                Ejemplo: tus ahorros {formatMoney(savings, from)} → {formatMoney(savings * rate.rate, target)}
              </Text>
            )}
          </View>
        )}

        <View style={[styles.notice, { backgroundColor: palette.warningSoft, borderColor: palette.warning }]}>
          <Ionicons name="swap-horizontal" size={18} color={palette.warning} />
          <Text variant="caption" style={{ flex: 1, color: palette.textPrimary }}>
            Se convertirán todos tus importes: movimientos, gastos fijos, presupuestos, metas y tu ingreso y objetivo
            de ahorro. Puedes volver a cambiarla cuando quieras (con el cambio de ese día), hasta 5 veces al día.
          </Text>
        </View>

        {!!notice && (
          <Text variant="caption" tone="accent" accessibilityLiveRegion="polite">{notice}</Text>
        )}
        {!!error && (
          <View style={{ gap: spacing.sm }}>
            <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">{error}</Text>
            {!rate && <Button title="Reintentar" variant="secondary" onPress={loadRate} />}
          </View>
        )}
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.lg },
  rateCard: { padding: spacing.lg, borderRadius: radius.lg, borderWidth: 1, gap: spacing.xs },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
});
