import React, { useEffect } from 'react';
import { View, StyleSheet, ScrollView, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { BrandLogo } from '../components/BrandLogo';
import { SpotlightOverlay } from './SpotlightOverlay';
import { TransactionSheet } from '../screens/modals/TransactionSheet';
import { RecurringSheet } from '../screens/modals/RecurringSheet';
import { useOnboardingStore, TOUR_STEPS } from '../store/useOnboardingStore';
import type { FinanceGoal, IncomeFrequency } from '../store/useOnboardingStore';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { authApi } from '../api/endpoints';
import { navigateToTab } from '../navigation/navigationRef';
import { formatMoney } from '../utils/format';

const CURRENCIES = [
  { code: 'EUR', symbol: '€', label: 'Euro' },
  { code: 'USD', symbol: '$', label: 'Dólar' },
  { code: 'GBP', symbol: '£', label: 'Libra' },
  { code: 'MXN', symbol: '$', label: 'Peso mexicano' },
];
const GOALS: { key: FinanceGoal; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'save', icon: 'trending-up', label: 'Ahorrar más' },
  { key: 'control', icon: 'wallet', label: 'Controlar gastos' },
  { key: 'invest', icon: 'stats-chart', label: 'Gestionar inversiones' },
  { key: 'subscriptions', icon: 'repeat', label: 'Organizar suscripciones' },
  { key: 'debt', icon: 'trending-down', label: 'Salir de deudas' },
];
const FREQS: { key: IncomeFrequency; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'monthly', icon: 'calendar', label: 'Mensual' },
  { key: 'weekly', icon: 'calendar-outline', label: 'Semanal' },
  { key: 'variable', icon: 'shuffle', label: 'Variable' },
];
const THEMES: { key: 'light' | 'dark' | 'system'; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { key: 'light', icon: 'sunny', label: 'Claro' },
  { key: 'dark', icon: 'moon', label: 'Oscuro' },
  { key: 'system', icon: 'phone-portrait', label: 'Automático' },
];
const PERSONALIZE_TOTAL = 5;
const goalLabel = (g: FinanceGoal | null) => GOALS.find((x) => x.key === g)?.label ?? '—';

export const OnboardingHost: React.FC = () => {
  const { palette } = useTheme();
  const { setPreference } = useTheme();
  const setUser = useAuthStore((s) => s.setUser);
  const setProfilePrefs = usePreferencesStore((s) => s.setProfilePrefs);
  const { transactions, recurring, projection } = useDataStore();

  const {
    active,
    phase,
    personalizeStep,
    tourIndex,
    draft,
    targets,
    openSheet,
    setDraft,
    setPersonalizeStep,
    setPhase,
    setOpenSheet,
    nextTour,
    prevTour,
    finish,
    skipAll,
  } = useOnboardingStore();

  // Al entrar en el paso del primer gasto, asegúrate de estar en Inicio (FAB).
  useEffect(() => {
    if (phase === 'createExpense' || phase === 'success') navigateToTab('Home');
  }, [phase]);

  // Durante el tour, navega a la pestaña que se está resaltando.
  useEffect(() => {
    if (phase === 'tour') {
      const step = TOUR_STEPS[tourIndex];
      navigateToTab(step.target.replace('tab-', ''));
    }
  }, [phase, tourIndex]);

  if (!active) return null;

  const applyPersonalization = async () => {
    try {
      const updated = await authApi.updateMe({
        name: draft.name.trim() || undefined,
        currency: draft.currency,
      } as any);
      if (updated) setUser(updated);
    } catch {
      /* sin red: seguimos igual */
    }
    try {
      await setPreference(draft.theme);
    } catch {
      /* ignore */
    }
    setProfilePrefs({ goal: draft.goal, incomeFrequency: draft.incomeFrequency });
    setPhase('createExpense');
  };

  // ---- Fases a pantalla completa ----
  if (phase === 'welcome') {
    return (
      <FullScreen>
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: spacing.lg }}>
          <BrandLogo size={96} />
          <View style={{ alignItems: 'center', gap: spacing.sm, paddingHorizontal: spacing.lg }}>
            <Text variant="display" align="center" style={{ fontSize: 30, lineHeight: 38 }}>
              Tus finanzas, finalmente bajo control.
            </Text>
            <Text variant="body" tone="secondary" align="center">
              Gestiona gastos, ingresos, presupuestos e inversiones desde una sola app.
            </Text>
          </View>
        </View>
        <View style={{ gap: spacing.sm }}>
          <Button title="Comenzar" size="lg" onPress={() => setPhase('personalize')} />
          <Button title="Explorar por mi cuenta" variant="ghost" onPress={() => skipAll()} />
        </View>
      </FullScreen>
    );
  }

  if (phase === 'personalize') {
    const canNext =
      personalizeStep === 0
        ? true
        : personalizeStep === 2
        ? !!draft.goal
        : personalizeStep === 3
        ? !!draft.incomeFrequency
        : true;
    const isLast = personalizeStep === PERSONALIZE_TOTAL - 1;
    return (
      <FullScreen>
        {/* Barra de progreso */}
        <View style={[styles.progressTrack, { backgroundColor: palette.bgElevated }]}>
          <View
            style={[
              styles.progressFill,
              { backgroundColor: palette.accent, width: `${((personalizeStep + 1) / PERSONALIZE_TOTAL) * 100}%` },
            ]}
          />
        </View>

        <ScrollView contentContainerStyle={{ paddingVertical: spacing.xl, gap: spacing.lg }} showsVerticalScrollIndicator={false}>
          {personalizeStep === 0 && (
            <Step title="¿Cómo te llamas?" subtitle="Para personalizar tu experiencia.">
              <Input label="Tu nombre" value={draft.name} onChangeText={(t) => setDraft({ name: t })} placeholder="Tu nombre" />
            </Step>
          )}
          {personalizeStep === 1 && (
            <Step title="Tu moneda principal" subtitle="La usaremos en todos tus movimientos.">
              <View style={styles.grid}>
                {CURRENCIES.map((c) => (
                  <OptionCard
                    key={c.code}
                    label={`${c.symbol}  ${c.code}`}
                    sub={c.label}
                    selected={draft.currency === c.code}
                    onPress={() => setDraft({ currency: c.code })}
                  />
                ))}
              </View>
            </Step>
          )}
          {personalizeStep === 2 && (
            <Step title="¿Cuál es tu objetivo principal?" subtitle="Adaptaremos la app a ti.">
              <View style={{ gap: spacing.sm }}>
                {GOALS.map((g) => (
                  <OptionRow key={g.key} icon={g.icon} label={g.label} selected={draft.goal === g.key} onPress={() => setDraft({ goal: g.key })} />
                ))}
              </View>
            </Step>
          )}
          {personalizeStep === 3 && (
            <Step title="¿Cada cuánto ingresas dinero?" subtitle="Para proyectar tu balance.">
              <View style={{ gap: spacing.sm }}>
                {FREQS.map((f) => (
                  <OptionRow key={f.key} icon={f.icon} label={f.label} selected={draft.incomeFrequency === f.key} onPress={() => setDraft({ incomeFrequency: f.key })} />
                ))}
              </View>
            </Step>
          )}
          {personalizeStep === 4 && (
            <Step title="Elige tu tema" subtitle="Puedes cambiarlo cuando quieras en Ajustes.">
              <View style={styles.grid}>
                {THEMES.map((t) => (
                  <OptionCard key={t.key} icon={t.icon} label={t.label} selected={draft.theme === t.key} onPress={() => setDraft({ theme: t.key })} />
                ))}
              </View>
            </Step>
          )}
        </ScrollView>

        <View style={{ flexDirection: 'row', gap: spacing.sm }}>
          {personalizeStep > 0 && (
            <View style={{ flex: 1 }}>
              <Button title="Atrás" variant="secondary" onPress={() => setPersonalizeStep(personalizeStep - 1)} />
            </View>
          )}
          <View style={{ flex: 2 }}>
            <Button
              title={isLast ? 'Continuar' : 'Siguiente'}
              size="lg"
              disabled={!canNext}
              onPress={() => (isLast ? applyPersonalization() : setPersonalizeStep(personalizeStep + 1))}
            />
          </View>
        </View>
      </FullScreen>
    );
  }

  if (phase === 'success') {
    const firstExpense = transactions.some((t) => t.type === 'expense');
    const projNet = projection?.projected_monthly_net ?? 0;
    return (
      <FullScreen>
        <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }}>
          <View style={{ alignItems: 'center', gap: spacing.sm }}>
            <Text variant="display" align="center">Todo listo 🚀</Text>
            <Text variant="body" tone="secondary" align="center">
              Ya puedes empezar a controlar tus finanzas como un profesional.
            </Text>
          </View>
          <View style={{ gap: spacing.sm }}>
            <SummaryRow icon="receipt-outline" label="Primer gasto" value={firstExpense ? 'Creado' : 'Pendiente'} ok={firstExpense} />
            <SummaryRow icon="repeat-outline" label="Gastos fijos" value={`${recurring.length}`} ok={recurring.length > 0} />
            <SummaryRow icon="flag-outline" label="Tu objetivo" value={goalLabel(draft.goal)} ok={!!draft.goal} />
            {projection && (
              <SummaryRow
                icon="trending-up-outline"
                label="Balance proyectado"
                value={formatMoney(projNet, draft.currency)}
                ok={projNet >= 0}
              />
            )}
          </View>
        </View>
        <Button title="Ir a mi dashboard" size="lg" onPress={() => { finish(); navigateToTab('Home'); }} />
      </FullScreen>
    );
  }

  // ---- Fases con spotlight ----
  let overlayProps: React.ComponentProps<typeof SpotlightOverlay> | null = null;

  if (phase === 'createExpense') {
    overlayProps = {
      rect: targets['fab'] ?? null,
      icon: 'add',
      title: 'Crea tu primer gasto',
      body: 'Pulsa el botón + para registrar un movimiento. Te dejamos un ejemplo listo: 13,99 € · Ocio · Cena.',
      nextLabel: 'Abrir formulario',
      onNext: () => setOpenSheet('expense'),
      onSkip: () => skipAll(),
      stepKey: 'expense',
    };
  } else if (phase === 'createRecurringExpense') {
    overlayProps = {
      rect: null,
      icon: 'repeat',
      title: 'Automatiza un gasto fijo',
      body: 'La app lo añade solo cada mes, lo incluye en analítica y presupuestos, y detecta tus suscripciones. Ejemplo: Netflix · 12,99 € · mensual.',
      nextLabel: 'Añadir ejemplo',
      onNext: () => setOpenSheet('recExpense'),
      secondaryLabel: 'Ahora no',
      onSecondary: () => setPhase('createIncome'),
      onSkip: () => skipAll(),
      stepKey: 'recExpense',
    };
  } else if (phase === 'createIncome') {
    overlayProps = {
      rect: null,
      icon: 'cash',
      title: 'Configura tu ingreso principal',
      body: 'Tu nómina activa la proyección de balance, las comparativas mes a mes y objetivos de ahorro inteligentes. Ejemplo: Nómina · 2.100 € · mensual.',
      nextLabel: 'Añadir ingreso',
      onNext: () => setOpenSheet('recIncome'),
      secondaryLabel: 'Ahora no',
      onSecondary: () => setPhase('tour'),
      onSkip: () => skipAll(),
      stepKey: 'recIncome',
    };
  } else if (phase === 'tour') {
    const step = TOUR_STEPS[tourIndex];
    const last = tourIndex === TOUR_STEPS.length - 1;
    overlayProps = {
      rect: targets[step.target] ?? null,
      icon: step.icon,
      title: step.title,
      body: step.body,
      progress: { index: tourIndex, total: TOUR_STEPS.length },
      nextLabel: last ? 'Finalizar' : 'Siguiente',
      onNext: () => nextTour(),
      secondaryLabel: tourIndex > 0 ? 'Atrás' : undefined,
      onSecondary: tourIndex > 0 ? () => prevTour() : undefined,
      onSkip: () => skipAll(),
      stepKey: `tour-${tourIndex}`,
    };
  }

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {overlayProps && openSheet === null && <SpotlightOverlay {...overlayProps} />}

      <TransactionSheet
        visible={openSheet === 'expense'}
        prefill={{ amount: '13,99', description: 'Cena', type: 'expense', paymentMethod: 'debit_card', categoryName: 'Ocio' }}
        onClose={() => setOpenSheet(null)}
        onSaved={() => { setOpenSheet(null); setPhase('createRecurringExpense'); }}
      />
      <RecurringSheet
        visible={openSheet === 'recExpense'}
        prefill={{ name: 'Netflix', amount: '12,99', type: 'expense', frequency: 'monthly', categoryName: 'Suscripciones' }}
        onClose={() => setOpenSheet(null)}
        onSaved={() => { setOpenSheet(null); setPhase('createIncome'); }}
      />
      <RecurringSheet
        visible={openSheet === 'recIncome'}
        prefill={{ name: 'Nómina', amount: '2100', type: 'income', frequency: 'monthly', categoryName: 'Salario' }}
        onClose={() => setOpenSheet(null)}
        onSaved={() => { setOpenSheet(null); setPhase('tour'); }}
      />
    </View>
  );
};

// ---- Subcomponentes ----

const FullScreen: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { palette } = useTheme();
  return (
    <View style={[StyleSheet.absoluteFill, styles.full, { backgroundColor: palette.bgBase }]}>
      <LinearGradient colors={palette.gradientApp as any} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={{ flex: 1, padding: spacing.lg }}>{children}</View>
      </SafeAreaView>
    </View>
  );
};

const Step: React.FC<{ title: string; subtitle?: string; children: React.ReactNode }> = ({ title, subtitle, children }) => (
  <View style={{ gap: spacing.md }}>
    <View style={{ gap: spacing.xs }}>
      <Text variant="h1">{title}</Text>
      {subtitle && <Text variant="body" tone="secondary">{subtitle}</Text>}
    </View>
    {children}
  </View>
);

const OptionCard: React.FC<{
  label: string;
  sub?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  selected: boolean;
  onPress: () => void;
}> = ({ label, sub, icon, selected, onPress }) => {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.optCard,
        {
          backgroundColor: selected ? palette.accentSoft : palette.bgSurface,
          borderColor: selected ? palette.accent : palette.borderSubtle,
        },
      ]}
    >
      {icon && <Ionicons name={icon} size={24} color={selected ? palette.accent : palette.textSecondary} />}
      <Text variant="body" weight="semibold" tone={selected ? 'accent' : 'primary'}>{label}</Text>
      {sub && <Text variant="caption" tone="muted">{sub}</Text>}
    </Pressable>
  );
};

const OptionRow: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  selected: boolean;
  onPress: () => void;
}> = ({ icon, label, selected, onPress }) => {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.optRow,
        {
          backgroundColor: selected ? palette.accentSoft : palette.bgSurface,
          borderColor: selected ? palette.accent : palette.borderSubtle,
        },
      ]}
    >
      <View style={[styles.optRowIcon, { backgroundColor: selected ? palette.accent : palette.bgElevated }]}>
        <Ionicons name={icon} size={18} color={selected ? '#fff' : palette.textSecondary} />
      </View>
      <Text variant="body" weight="medium" style={{ flex: 1 }}>{label}</Text>
      {selected && <Ionicons name="checkmark-circle" size={22} color={palette.accent} />}
    </Pressable>
  );
};

const SummaryRow: React.FC<{ icon: keyof typeof Ionicons.glyphMap; label: string; value: string; ok?: boolean }> = ({
  icon,
  label,
  value,
  ok,
}) => {
  const { palette } = useTheme();
  return (
    <View style={[styles.summaryRow, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}>
      <View style={[styles.optRowIcon, { backgroundColor: palette.accentSoft }]}>
        <Ionicons name={icon} size={18} color={palette.accent} />
      </View>
      <Text variant="body" weight="medium" style={{ flex: 1 }}>{label}</Text>
      <Text variant="body" weight="semibold" tone={ok ? 'success' : 'muted'}>{value}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  full: { zIndex: 1000, elevation: 1000 },
  progressTrack: { height: 6, borderRadius: radius.pill, overflow: 'hidden', marginTop: spacing.sm },
  progressFill: { height: '100%', borderRadius: radius.pill },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  optCard: {
    flexBasis: '47%',
    flexGrow: 1,
    gap: 4,
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'flex-start',
  },
  optRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1.5,
  },
  optRowIcon: { width: 34, height: 34, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
});
