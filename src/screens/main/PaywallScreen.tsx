import React, { useEffect, useMemo, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { useContentWidth } from '../../theme/layout';
import { Text } from '../../components/Text';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useBilling } from '../../store/useBillingStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useToast } from '../../components/Toast';
import { track } from '../../utils/analytics';
import {
  PACKAGE_ID,
  type Cycle,
  type RCPackage,
  getOfferingPackages,
  purchasePackageById,
  purchasesAvailable,
  restorePurchases,
} from '../../billing/purchases';
import type { PlanCode } from '../../api/types';

type PaidPlan = Exclude<PlanCode, 'free'>;

type PlanDef = {
  code: PlanCode;
  name: string;
  tagline: string;
  highlight?: boolean;
  // Precios fallback (placeholder) si RC no responde con offerings.
  monthly: number;
  annual: number;
  features: string[];
  free?: boolean;
};

// Precios provisionales (Fase 1 / fallback). En cuanto RevenueCat tenga
// offerings creados, los reemplaza por los reales el `loadOfferings()`.
const PLANS: PlanDef[] = [
  {
    code: 'free',
    name: 'Gratis',
    tagline: 'Lo esencial para empezar',
    monthly: 0,
    annual: 0,
    free: true,
    features: [
      '2 presupuestos y 2 metas de ahorro',
      '1 gasto fijo',
      '8 categorías personalizadas',
      'Analítica básica del mes',
      'Historial de los últimos 3 meses',
    ],
  },
  {
    code: 'plus',
    name: 'Plus',
    tagline: 'Todo lo que necesitas, sin límites',
    highlight: true,
    monthly: 3.99,
    annual: 29.99,
    features: [
      'Historial ilimitado',
      'Analítica avanzada (tendencias, métodos de pago, forecast)',
      'Categorías y presupuestos ilimitados',
      'Exportar a CSV y PDF',
      'Acceso desde la web',
      'Backup en la nube',
    ],
  },
  {
    code: 'family',
    name: 'Familia',
    tagline: 'Plus para hasta 5 personas',
    monthly: 6.99,
    annual: 49.99,
    features: [
      'Todo lo de Plus',
      'Hasta 5 perfiles',
      'Modo familia con vista agrupada',
      'Metas y presupuestos compartidos',
    ],
  },
  {
    code: 'pro_freelance',
    name: 'Pro Freelance',
    tagline: 'Tu contabilidad, lista para el gestor',
    monthly: 9.99,
    annual: 79.99,
    features: [
      'Todo lo de Plus',
      'Etiquetas fiscales (IVA, IRPF)',
      'Reportes trimestrales automáticos',
      'Export con columnas fiscales para tu gestor',
    ],
  },
];

const formatEur = (n: number) =>
  `${n.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;

/** Indexa los paquetes RC por id (p.ej. 'plus_monthly') para consulta O(1). */
function indexPackages(pkgs: RCPackage[] | null): Record<string, RCPackage> {
  const out: Record<string, RCPackage> = {};
  (pkgs ?? []).forEach((p) => { out[p.identifier] = p; });
  return out;
}

export const PaywallScreen: React.FC = () => {
  const { palette } = useTheme();
  const navigation = useNavigation<any>();
  const { columnStyle } = useContentWidth();
  const toast = useToast();
  const billing = useBilling();
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const [cycle, setCycle] = useState<Cycle>('annual');
  const [pkgs, setPkgs] = useState<Record<string, RCPackage>>({});
  const [purchasing, setPurchasing] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(false);

  useEffect(() => {
    track('paywall_viewed', { plan: billing.plan });
    // Carga offerings reales (si el SDK está configurado y RC tiene productos).
    (async () => {
      const list = await getOfferingPackages();
      if (list) setPkgs(indexPackages(list));
    })();
  }, []);

  // Precio efectivo (RC > placeholder).
  const priceFor = (plan: PaidPlan, c: Cycle, fallback: number): { label: string; raw: number } => {
    const id = PACKAGE_ID(plan, c);
    const p = pkgs[id];
    if (p?.product?.priceString) return { label: p.product.priceString, raw: p.product.price };
    return { label: formatEur(fallback), raw: fallback };
  };

  const cards = useMemo(
    () =>
      PLANS.map((p) => {
        if (p.free) {
          return { ...p, priceLabel: 'Gratis', monthlyEquiv: 0, yearlySavings: 0, isCurrent: billing.plan === 'free' };
        }
        const paid = p.code as PaidPlan;
        const cur = priceFor(paid, cycle, cycle === 'annual' ? p.annual : p.monthly);
        const monthlyRaw = cycle === 'annual'
          ? priceFor(paid, 'annual', p.annual).raw / 12
          : priceFor(paid, 'monthly', p.monthly).raw;
        const annualRaw = priceFor(paid, 'annual', p.annual).raw;
        const monthRaw = priceFor(paid, 'monthly', p.monthly).raw;
        const savings = monthRaw > 0 ? Math.round((1 - annualRaw / (monthRaw * 12)) * 100) : 0;
        return {
          ...p,
          priceLabel: cur.label,
          monthlyEquiv: monthlyRaw,
          yearlySavings: Math.max(0, savings),
          isCurrent: billing.plan === p.code,
        };
      }),
    [cycle, billing.plan, pkgs]
  );

  const onSubscribe = async (planCode: PaidPlan) => {
    track('upgrade_clicked', { plan: planCode, cycle });
    if (!purchasesAvailable()) {
      toast.show(
        'Las compras estarán disponibles muy pronto. Estamos terminando la configuración con Google.',
        'info'
      );
      return;
    }
    const id = PACKAGE_ID(planCode, cycle);
    setPurchasing(id);
    try {
      track('purchase_started', { plan: planCode, cycle });
      await purchasePackageById(id);
      track('purchase_success', { plan: planCode, cycle });
      // Tras la compra, RC notificará a nuestro backend por webhook (Fase 2.1).
      // Refrescamos el usuario para que el plan_code y entitlements se actualicen.
      await refreshUser();
      toast.success('¡Bienvenido a Plus! 🎉');
      navigation.goBack();
    } catch (e: any) {
      const msg = String(e?.message ?? e ?? '');
      if (msg.includes('PACKAGE_NOT_FOUND')) {
        toast.error('Ese plan aún no está disponible. Estamos preparándolo.');
      } else if (msg.includes('userCancelled') || msg.includes('PURCHASE_CANCELLED') || /cancel/i.test(msg)) {
        // silencio: el usuario canceló
      } else {
        track('purchase_failed', { plan: planCode, cycle, error: msg.slice(0, 200) });
        toast.error('No se pudo completar la compra. Inténtalo de nuevo.');
      }
    } finally {
      setPurchasing(null);
    }
  };

  const onRestore = async () => {
    track('restore_purchases');
    if (!purchasesAvailable()) {
      toast.show('La restauración estará disponible cuando se activen las compras.', 'info');
      return;
    }
    setRestoring(true);
    try {
      await restorePurchases();
      await refreshUser();
      toast.success('Compras restauradas');
    } catch {
      toast.error('No se pudieron restaurar las compras');
    } finally {
      setRestoring(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: palette.bgBase }}>
      <LinearGradient colors={palette.gradientApp as any} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }} showsVerticalScrollIndicator={false}>
          <View style={columnStyle}>
            <ScreenHeader title="Elige tu plan" subtitle="Lleva tu control financiero al siguiente nivel" showBack />

            {billing.isEarlyAdopter && (
              <View style={{ paddingHorizontal: spacing.lg }}>
                <View style={[styles.earlyBanner, { backgroundColor: palette.successSoft, borderColor: palette.success }]}>
                  <Ionicons name="sparkles" size={16} color={palette.success} />
                  <View style={{ flex: 1 }}>
                    <Text variant="label" weight="bold" tone="success">Tienes Plus gratis de por vida</Text>
                    <Text variant="caption" tone="secondary">
                      Como early adopter, ya disfrutas de todas las funcionalidades Plus.
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.md, gap: spacing.xs }}>
              <SegmentedControl
                options={[
                  { value: 'annual', label: 'Anual · ahorra' },
                  { value: 'monthly', label: 'Mensual' },
                ]}
                value={cycle}
                onChange={setCycle}
              />
            </View>

            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, gap: spacing.md }}>
              {cards.map((p) => (
                <PlanCardView
                  key={p.code}
                  plan={p}
                  cycle={cycle}
                  loading={purchasing === PACKAGE_ID(p.code as PaidPlan, cycle)}
                  onSubscribe={() => {
                    if (p.free) {
                      toast.show('Ya estás en el plan Gratis.', 'info');
                    } else {
                      onSubscribe(p.code as PaidPlan);
                    }
                  }}
                />
              ))}
            </View>

            <View style={{ paddingHorizontal: spacing.lg, marginTop: spacing.lg, alignItems: 'center', gap: spacing.sm }}>
              <View style={styles.guaranteeRow}>
                <Ionicons name="checkmark-circle" size={14} color={palette.success} />
                <Text variant="caption" tone="secondary">Cancela cuando quieras</Text>
              </View>
              <Pressable onPress={onRestore} hitSlop={8} style={{ paddingVertical: 8 }} disabled={restoring}>
                <Text variant="label" tone="accent" weight="semibold">
                  {restoring ? 'Restaurando…' : 'Restaurar compras'}
                </Text>
              </Pressable>
              <Text variant="caption" tone="muted" align="center" style={{ paddingHorizontal: spacing.lg }}>
                Al suscribirte aceptas los Términos y la Política de privacidad. Los pagos los gestiona Google Play.
              </Text>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const PlanCardView: React.FC<{
  plan: PlanDef & { priceLabel: string; monthlyEquiv: number; yearlySavings: number; isCurrent: boolean };
  cycle: Cycle;
  loading?: boolean;
  onSubscribe: () => void;
}> = ({ plan, cycle, loading, onSubscribe }) => {
  const { palette } = useTheme();
  const isHero = !!plan.highlight;
  const borderColor = isHero ? palette.accent : palette.borderSubtle;
  const ctaLabel = plan.isCurrent
    ? 'Tu plan actual'
    : plan.free
    ? 'Continuar gratis'
    : `Elegir ${plan.name}`;

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: palette.bgSurface,
          borderColor,
          borderWidth: isHero ? 2 : 1,
        },
      ]}
    >
      {isHero && !plan.isCurrent && (
        <View style={[styles.recommendedTag, { backgroundColor: palette.accent }]}>
          <Text variant="caption" weight="bold" style={{ color: '#fff' }}>RECOMENDADO</Text>
        </View>
      )}
      {plan.isCurrent && (
        <View style={[styles.recommendedTag, { backgroundColor: palette.success }]}>
          <Text variant="caption" weight="bold" style={{ color: '#fff' }}>TU PLAN</Text>
        </View>
      )}

      <Text variant="h1" weight="bold">{plan.name}</Text>
      <Text variant="caption" tone="muted">{plan.tagline}</Text>

      {plan.free ? (
        <View style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
          <Text variant="display" tabular weight="bold">0 €</Text>
          <Text variant="caption" tone="muted">/siempre</Text>
        </View>
      ) : (
        <>
          <View style={{ marginTop: spacing.md, flexDirection: 'row', alignItems: 'baseline', gap: 6 }}>
            <Text variant="display" tabular weight="bold">
              {cycle === 'annual'
                ? `${plan.monthlyEquiv.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
                : plan.priceLabel}
            </Text>
            <Text variant="caption" tone="muted">/mes</Text>
          </View>
          {cycle === 'annual' && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
              <Text variant="caption" tone="secondary" tabular>
                {plan.priceLabel} facturado anualmente
              </Text>
              {plan.yearlySavings > 0 && (
                <View style={[styles.savingsBadge, { backgroundColor: palette.successSoft, borderColor: palette.success }]}>
                  <Text variant="caption" weight="bold" tone="success">
                    Ahorra {plan.yearlySavings}%
                  </Text>
                </View>
              )}
            </View>
          )}
        </>
      )}

      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        {plan.features.map((f) => (
          <View key={f} style={styles.feature}>
            <Ionicons name="checkmark-circle" size={16} color={plan.free ? palette.textMuted : palette.accent} />
            <Text variant="body" style={{ flex: 1 }}>{f}</Text>
          </View>
        ))}
      </View>

      <View style={{ marginTop: spacing.lg }}>
        <Button
          title={ctaLabel}
          onPress={onSubscribe}
          variant={isHero ? 'primary' : plan.free ? 'ghost' : 'secondary'}
          disabled={plan.isCurrent || loading}
          loading={loading}
          size="lg"
        />
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  earlyBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    marginBottom: spacing.sm,
  },
  card: {
    borderRadius: radius.xl,
    padding: spacing.xl,
    position: 'relative',
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 6 },
    elevation: 3,
  },
  recommendedTag: {
    position: 'absolute',
    top: -10,
    right: spacing.lg,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
  },
  savingsBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  feature: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  guaranteeRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
});
