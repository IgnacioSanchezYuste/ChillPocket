import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, TextInput, Platform, NativeSyntheticEvent, NativeScrollEvent } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import type { Palette } from '../theme/colors';
import { spacing, radius } from '../theme/spacing';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import { Input } from '../components/Input';
import { BrandLogo } from '../components/BrandLogo';
import { SpotlightOverlay } from './SpotlightOverlay';
import { TransactionSheet } from '../screens/modals/TransactionSheet';
import { RecurringSheet } from '../screens/modals/RecurringSheet';
import { useOnboardingStore, TOUR_STEPS } from '../store/useOnboardingStore';
import type { FinanceGoal, IncomeFrequency, OnboardingDraft } from '../store/useOnboardingStore';
import { useAuthStore } from '../store/useAuthStore';
import { useDataStore } from '../store/useDataStore';
import { usePreferencesStore } from '../store/usePreferencesStore';
import { authApi } from '../api/endpoints';
import { navigateToTab } from '../navigation/navigationRef';
import { formatMoney } from '../utils/format';
import type { Projection, Recurring, Transaction } from '../api/types';

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

/**
 * Sub-pasos de personalización (0-based):
 * 0 — nombre
 * 1 — moneda
 * 2 — objetivo
 * 3 — frecuencia + monto + día
 * 4 — objetivo de ahorro mensual (NUEVO)
 * 5 — tema
 */
const PERSONALIZE_TOTAL = 6;

const goalLabel = (g: FinanceGoal | null) => GOALS.find((x) => x.key === g)?.label ?? '—';

/** Días de la semana para selector semanal (domingo=0). */
const WEEKDAYS = [
  { label: 'L', value: 1 },
  { label: 'M', value: 2 },
  { label: 'X', value: 3 },
  { label: 'J', value: 4 },
  { label: 'V', value: 5 },
  { label: 'S', value: 6 },
  { label: 'D', value: 0 },
];

/** Días del mes: 1-28 + fin de mes (31). */
const MONTH_DAYS = [
  ...Array.from({ length: 28 }, (_, i) => ({ label: String(i + 1), value: i + 1 })),
  { label: 'Fin mes', value: 31 },
];

/**
 * Calcula la start_date del recurrente de ingreso para que caiga en el
 * día de cobro del mes actual. Si ese día ya pasó, usa el mes siguiente.
 * payday: 1-31 mensual (31 = fin de mes).
 */
function computeIncomeStartDate(payday: number | null): string {
  if (payday === null) return todayISO();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth(); // 0-based
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const day = payday === 31 ? daysInMonth : Math.min(payday, daysInMonth);
  const todayDate = new Date(year, month, now.getDate());
  const target = new Date(year, month, day);
  if (target < todayDate) {
    const nextMonthIdx = month + 1;
    const nextYear = nextMonthIdx > 11 ? year + 1 : year;
    const nm = nextMonthIdx > 11 ? 0 : nextMonthIdx;
    const daysNext = new Date(nextYear, nm + 1, 0).getDate();
    const dayNext = payday === 31 ? daysNext : Math.min(payday, daysNext);
    return `${String(nextYear).padStart(4, '0')}-${String(nm + 1).padStart(2, '0')}-${String(dayNext).padStart(2, '0')}`;
  }
  return `${String(year).padStart(4, '0')}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function todayISO(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Días que quedan en el mes actual (incluyendo hoy). */
function daysRemainingInMonth(): number {
  const now = new Date();
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return lastDay - now.getDate() + 1;
}

/** Equivalente mensual de un recurrente (semanal × 4.345, anual / 12). */
function monthlyEquivalent(amount: number, frequency: 'weekly' | 'monthly' | 'yearly'): number {
  if (frequency === 'weekly') return amount * 4.345;
  if (frequency === 'yearly') return amount / 12;
  return amount;
}

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
    skipCreationPhases,
    setDraft,
    setPersonalizeStep,
    setPhase,
    setOpenSheet,
    nextTour,
    prevTour,
    finish,
    skipAll,
    addDemoTransactionId,
    addDemoRecurringId,
    demoRecurringIds,
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

  // Si hay datos reales al hacer restart(), omitir las fases de creación.
  useEffect(() => {
    if (active && skipCreationPhases) {
      if (
        phase === 'createExpense' ||
        phase === 'createRecurringExpense' ||
        phase === 'createIncome'
      ) {
        setPhase('tour');
      }
    }
  }, [active, phase, skipCreationPhases, setPhase]);

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
    setProfilePrefs({
      goal: draft.goal,
      incomeFrequency: draft.incomeFrequency,
      incomeAmount: draft.incomeAmount,
      incomePayday: draft.incomePayday,
      savingsGoalMonthly: draft.savingsGoalMonthly,
    });
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
    return (
      <PersonalizePhase
        palette={palette}
        draft={draft}
        personalizeStep={personalizeStep}
        setDraft={setDraft}
        setPersonalizeStep={setPersonalizeStep}
        onFinish={applyPersonalization}
      />
    );
  }

  if (phase === 'success') {
    return (
      <SuccessPhase
        palette={palette}
        draft={draft}
        transactions={transactions}
        recurring={recurring}
        demoRecurringIds={demoRecurringIds}
        projection={projection}
        onFinish={() => { finish(); navigateToTab('Home'); }}
      />
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
      onNext: () => {
        if (skipCreationPhases) { setPhase('tour'); return; }
        setOpenSheet('expense');
      },
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
      onNext: () => {
        if (skipCreationPhases) { setPhase('tour'); return; }
        setOpenSheet('recExpense');
      },
      secondaryLabel: 'Ahora no',
      onSecondary: () => {
        if (skipCreationPhases || draft.incomeFrequency === 'variable') {
          setPhase('tour');
        } else {
          setPhase('createIncome');
        }
      },
      onSkip: () => skipAll(),
      stepKey: 'recExpense',
    };
  } else if (phase === 'createIncome') {
    overlayProps = {
      rect: null,
      icon: 'cash',
      title: 'Configura tu ingreso principal',
      body: draft.incomeAmount
        ? `Tu nómina de ${formatMoney(draft.incomeAmount, draft.currency)} activa proyecciones y objetivos de ahorro inteligentes.`
        : 'Tu nómina activa la proyección de balance, las comparativas mes a mes y objetivos de ahorro inteligentes. Ejemplo: Nómina · 2.100 € · mensual.',
      nextLabel: 'Añadir ingreso',
      onNext: () => {
        if (skipCreationPhases) { setPhase('tour'); return; }
        setOpenSheet('recIncome');
      },
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

  // Calcula la start_date del recurrente de ingreso basándose en el payday del draft.
  const incomeStartDate = computeIncomeStartDate(draft.incomePayday);
  // Frequency para el RecurringSheet de ingreso: semanal → weekly, resto → monthly.
  const incomeFreqForSheet: 'weekly' | 'monthly' = draft.incomeFrequency === 'weekly' ? 'weekly' : 'monthly';

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {overlayProps && openSheet === null && <SpotlightOverlay {...overlayProps} />}

      <TransactionSheet
        visible={openSheet === 'expense'}
        prefill={{ amount: '13,99', description: 'Cena', type: 'expense', paymentMethod: 'debit_card', categoryName: 'Ocio' }}
        onClose={() => setOpenSheet(null)}
        onSaved={(created) => {
          // Guardar ID demo para borrado al finalizar el tutorial.
          if (created?.id) addDemoTransactionId(created.id);
          setOpenSheet(null);
          setPhase('createRecurringExpense');
        }}
      />
      <RecurringSheet
        visible={openSheet === 'recExpense'}
        prefill={{ name: 'Netflix', amount: '12,99', type: 'expense', frequency: 'monthly', categoryName: 'Suscripciones' }}
        onClose={() => setOpenSheet(null)}
        onSaved={(createdId) => {
          if (typeof createdId === 'number') addDemoRecurringId(createdId);
          setOpenSheet(null);
          // Si frecuencia variable, omitir createIncome y saltar al tour.
          setPhase(draft.incomeFrequency === 'variable' ? 'tour' : 'createIncome');
        }}
      />
      <RecurringSheet
        visible={openSheet === 'recIncome'}
        prefill={{
          name: 'Nómina',
          amount: String(draft.incomeAmount ?? 2100),
          type: 'income',
          frequency: incomeFreqForSheet,
          categoryName: 'Salario',
        }}
        forcedStartDate={draft.incomePayday !== null ? incomeStartDate : undefined}
        onClose={() => setOpenSheet(null)}
        onSaved={() => {
          // El salario (Nómina) NO es demo: queremos que persista tras el tuto
          // como ingreso recurrente real del usuario. No se captura para borrado.
          setOpenSheet(null);
          setPhase('tour');
        }}
      />
    </View>
  );
};

// ---- Sub-componente: fase personalize ----

type PersonalizePhaseProps = {
  palette: Palette;
  draft: OnboardingDraft;
  personalizeStep: number;
  setDraft: (patch: Partial<OnboardingDraft>) => void;
  setPersonalizeStep: (n: number) => void;
  onFinish: () => void;
};

const PersonalizePhase: React.FC<PersonalizePhaseProps> = ({
  palette,
  draft,
  personalizeStep,
  setDraft,
  setPersonalizeStep,
  onFinish,
}) => {
  // Estados locales para el paso de frecuencia (step 3)
  const [amountText, setAmountText] = useState('');
  // Estado local para objetivo de ahorro (step 4)
  const [savingsText, setSavingsText] = useState('');
  const [savingsError, setSavingsError] = useState('');

  // Sincronizar texto de importe y ahorro con el draft al cambiar de paso
  useEffect(() => {
    if (personalizeStep === 3) {
      setAmountText(draft.incomeAmount !== null ? String(draft.incomeAmount) : '');
    }
    if (personalizeStep === 4) {
      setSavingsText(draft.savingsGoalMonthly !== null ? String(draft.savingsGoalMonthly) : '');
      setSavingsError('');
    }
  }, [personalizeStep]);

  const canNext = useMemo((): boolean => {
    if (personalizeStep === 0) return true;
    if (personalizeStep === 2) return !!draft.goal;
    if (personalizeStep === 3) {
      if (draft.incomeFrequency === 'variable') return true;
      if (!draft.incomeFrequency) return false;
      const amt = parseFloat(amountText.replace(',', '.'));
      return Number.isFinite(amt) && amt > 0;
    }
    if (personalizeStep === 4) {
      const rawText = savingsText.trim();
      // Permitir vacío (equivale a 0, sin objetivo)
      if (rawText === '') return true;
      const savings = parseFloat(rawText.replace(',', '.'));
      if (!Number.isFinite(savings) || savings < 0) return false;
      if (draft.incomeAmount !== null && savings >= draft.incomeAmount) return false;
      return true;
    }
    return true;
  }, [personalizeStep, draft.goal, draft.incomeFrequency, draft.incomeAmount, amountText, savingsText]);

  const isLast = personalizeStep === PERSONALIZE_TOTAL - 1;

  const handleNext = () => {
    if (personalizeStep === 3 && draft.incomeFrequency !== 'variable') {
      const amt = parseFloat(amountText.replace(',', '.'));
      if (Number.isFinite(amt) && amt > 0) {
        setDraft({ incomeAmount: amt });
      }
    }
    if (personalizeStep === 4) {
      const rawText = savingsText.trim();
      if (rawText === '') {
        setDraft({ savingsGoalMonthly: null });
      } else {
        const savings = parseFloat(rawText.replace(',', '.'));
        if (Number.isFinite(savings) && savings >= 0) {
          setDraft({ savingsGoalMonthly: savings > 0 ? savings : null });
        }
      }
    }
    if (isLast) {
      onFinish();
    } else {
      setPersonalizeStep(personalizeStep + 1);
    }
  };

  const handleSavingsChange = (text: string) => {
    setSavingsText(text);
    const rawText = text.trim();
    if (rawText === '') {
      setSavingsError('');
      return;
    }
    const savings = parseFloat(rawText.replace(',', '.'));
    if (!Number.isFinite(savings)) {
      setSavingsError('');
      return;
    }
    if (savings < 0) {
      setSavingsError('El objetivo no puede ser negativo');
    } else if (draft.incomeAmount !== null && savings >= draft.incomeAmount) {
      setSavingsError('El objetivo debe ser menor que el ingreso');
    } else {
      setSavingsError('');
    }
  };

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
          <FrequencyStep
            palette={palette}
            draft={draft}
            amountText={amountText}
            setAmountText={setAmountText}
            setDraft={setDraft}
          />
        )}
        {personalizeStep === 4 && (
          <SavingsGoalStep
            palette={palette}
            draft={draft}
            savingsText={savingsText}
            onSavingsChange={handleSavingsChange}
            onSelectChip={(pct) => {
              if (draft.incomeAmount === null) return;
              const goal = Math.round(draft.incomeAmount * pct);
              setSavingsText(String(goal));
              setSavingsError('');
            }}
            savingsError={savingsError}
          />
        )}
        {personalizeStep === 5 && (
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
            onPress={handleNext}
          />
        </View>
      </View>
    </FullScreen>
  );
};

// ---- Sub-componente: paso de frecuencia + monto + día ----

type FrequencyStepProps = {
  palette: Palette;
  draft: OnboardingDraft;
  amountText: string;
  setAmountText: (t: string) => void;
  setDraft: (patch: Partial<OnboardingDraft>) => void;
};

const FrequencyStep: React.FC<FrequencyStepProps> = ({ palette, draft, amountText, setAmountText, setDraft }) => {
  const freq = draft.incomeFrequency;

  // Garantiza que al entrar en modo mensual con payday=null, se inicialice a 1.
  // Así el usuario puede avanzar sin tocar el wheel.
  useEffect(() => {
    if (freq === 'monthly' && draft.incomePayday === null) {
      setDraft({ incomePayday: 1 });
    }
  }, [freq]);

  const amountLabel =
    freq === 'weekly' ? 'Tu salario semanal' :
    freq === 'monthly' ? 'Tu salario neto mensual' : '';

  return (
    <Step title="¿Cada cuánto ingresas dinero?" subtitle="Para proyectar tu balance.">
      <View style={{ gap: spacing.sm }}>
        {FREQS.map((f) => (
          <OptionRow
            key={f.key}
            icon={f.icon}
            label={f.label}
            selected={freq === f.key}
            onPress={() => {
              setDraft({ incomeFrequency: f.key, incomePayday: null });
            }}
          />
        ))}
      </View>

      {/* Input adaptativo según la frecuencia */}
      {freq === 'monthly' && (
        <View style={{ gap: spacing.md, marginTop: spacing.md }}>
          <MoneyInput
            label={amountLabel}
            value={amountText}
            onChangeText={setAmountText}
            palette={palette}
          />
          <View style={{ gap: spacing.sm }}>
            <Text variant="label" tone="secondary">Día del mes que cobras</Text>
            <WheelPicker
              items={MONTH_DAYS}
              value={draft.incomePayday ?? 1}
              onChange={(v) => setDraft({ incomePayday: v })}
              palette={palette}
            />
          </View>
        </View>
      )}

      {freq === 'weekly' && (
        <View style={{ gap: spacing.md, marginTop: spacing.md }}>
          <MoneyInput
            label={amountLabel}
            value={amountText}
            onChangeText={setAmountText}
            palette={palette}
          />
          <View style={{ gap: spacing.sm }}>
            <Text variant="label" tone="secondary">Día de la semana que cobras</Text>
            <View style={{ flexDirection: 'row', gap: spacing.xs, flexWrap: 'wrap' }}>
              {WEEKDAYS.map((d) => (
                <DayChip
                  key={d.value}
                  label={d.label}
                  selected={draft.incomePayday === d.value}
                  onPress={() => setDraft({ incomePayday: d.value })}
                  palette={palette}
                />
              ))}
            </View>
          </View>
        </View>
      )}

      {freq === 'variable' && (
        <View style={[styles.infoBox, { backgroundColor: palette.accentSoft, borderColor: palette.accent, marginTop: spacing.md }]}>
          <Ionicons name="information-circle-outline" size={18} color={palette.accent} />
          <Text variant="caption" tone="accent" style={{ flex: 1 }}>
            Con ingresos variables usaremos el mes natural (del 1 al último día) para tus cálculos.
          </Text>
        </View>
      )}
    </Step>
  );
};

// ---- Sub-componente: paso de objetivo de ahorro ----

type SavingsGoalStepProps = {
  palette: Palette;
  draft: OnboardingDraft;
  savingsText: string;
  onSavingsChange: (t: string) => void;
  onSelectChip: (pct: number) => void;
  savingsError: string;
};

const SAVINGS_CHIPS = [
  { label: '10%', pct: 0.1 },
  { label: '20%', pct: 0.2 },
  { label: '30%', pct: 0.3 },
];

const SavingsGoalStep: React.FC<SavingsGoalStepProps> = ({
  palette,
  draft,
  savingsText,
  onSavingsChange,
  onSelectChip,
  savingsError,
}) => {
  const isVariable = draft.incomeFrequency === 'variable';
  const incomeAmount = draft.incomeAmount;

  return (
    <Step
      title="¿Cuánto quieres ahorrar al mes?"
      subtitle="Cada euro que ahorras hoy es libertad mañana. Ponlo fácil con un objetivo claro."
    >
      <MoneyInput
        label="Objetivo de ahorro mensual"
        value={savingsText}
        onChangeText={onSavingsChange}
        palette={palette}
      />
      {savingsError !== '' && (
        <Text variant="caption" style={{ color: palette.danger }}>{savingsError}</Text>
      )}

      {/* Chips de sugerencia: solo si hay ingreso declarado y no es variable */}
      {!isVariable && incomeAmount !== null && incomeAmount > 0 && (
        <View style={{ gap: spacing.xs }}>
          <Text variant="label" tone="secondary">Sugerencias</Text>
          <View style={{ flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' }}>
            {SAVINGS_CHIPS.map((chip) => {
              const goal = Math.round(incomeAmount * chip.pct);
              const isSelected = savingsText === String(goal);
              return (
                <Pressable
                  key={chip.label}
                  onPress={() => onSelectChip(chip.pct)}
                  style={[
                    styles.suggestionChip,
                    {
                      backgroundColor: isSelected ? palette.accentSoft : palette.bgElevated,
                      borderColor: isSelected ? palette.accent : palette.borderSubtle,
                    },
                  ]}
                >
                  <Text variant="label" weight={isSelected ? 'semibold' : 'medium'} tone={isSelected ? 'accent' : 'primary'}>
                    {chip.label}
                  </Text>
                  <Text variant="caption" tone="muted">
                    {goal} {draft.currency}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      )}

      <View style={[styles.infoBox, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
        <Ionicons name="information-circle-outline" size={18} color={palette.accent} />
        <Text variant="caption" tone="accent" style={{ flex: 1 }}>
          Puedes cambiar este objetivo en cualquier momento desde Ajustes.
        </Text>
      </View>
    </Step>
  );
};

// ---- Sub-componente: fase success ----

type SuccessPhaseProps = {
  palette: Palette;
  draft: OnboardingDraft;
  transactions: Transaction[];
  recurring: Recurring[];
  demoRecurringIds: number[];
  projection: Projection | null;
  onFinish: () => void;
};

const SuccessPhase: React.FC<SuccessPhaseProps> = ({
  draft,
  transactions,
  recurring,
  demoRecurringIds,
  projection,
  onFinish,
}) => {
  const firstExpense = transactions.some((t) => t.type === 'expense');
  const projNet = projection?.projected_monthly_net ?? 0;

  // Mensaje personalizado si hay datos suficientes y la frecuencia no es variable.
  // Misma lógica que el InsightBanner del dashboard: reservamos los gastos fijos
  // (excluyendo los recurrentes demo del tuto, que se borran al finalizar) además
  // del objetivo de ahorro, para que el número cuadre con lo que verá luego.
  const personalizedMsg = useMemo((): string | null => {
    if (draft.incomeFrequency === 'variable') return null;
    if (!draft.incomeAmount || draft.savingsGoalMonthly === null) return null;
    const realFixedMonthly = recurring
      .filter((r) => r.type === 'expense' && r.is_active === 1 && !demoRecurringIds.includes(r.id))
      .reduce((sum, r) => sum + monthlyEquivalent(r.amount, r.frequency), 0);
    const spendable = draft.incomeAmount - draft.savingsGoalMonthly - realFixedMonthly;
    if (spendable <= 0) return null;
    const daysLeft = daysRemainingInMonth();
    const dailyBudget = spendable / daysLeft;
    const name = draft.name.trim() || 'tú';
    return `Hola ${name}, hoy puedes gastar ${formatMoney(dailyBudget, draft.currency)} y seguir ahorrando ${formatMoney(draft.savingsGoalMonthly, draft.currency)} este mes 🎯`;
  }, [draft, recurring, demoRecurringIds]);

  return (
    <FullScreen>
      <View style={{ flex: 1, justifyContent: 'center', gap: spacing.lg }}>
        <View style={{ alignItems: 'center', gap: spacing.sm }}>
          <Text variant="display" align="center">Todo listo 🚀</Text>
          <Text variant="body" tone="secondary" align="center">
            Ya puedes empezar a controlar tus finanzas como un profesional.
          </Text>
        </View>

        {/* Mensaje personalizado con presupuesto diario */}
        {personalizedMsg && (
          <PersonalizedMsgBox message={personalizedMsg} />
        )}

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
      <Button title="Ir a mi dashboard" size="lg" onPress={onFinish} />
    </FullScreen>
  );
};

/** Caja de mensaje personalizado (extrae el palette del contexto). */
const PersonalizedMsgBox: React.FC<{ message: string }> = ({ message }) => {
  const { palette } = useTheme();
  return (
    <View style={[styles.personalizedBox, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
      <Text variant="body" weight="semibold" tone="accent" align="center">
        {message}
      </Text>
    </View>
  );
};

// ---- Subcomponentes de UI ----

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

/** Input numérico simple para importes dentro del onboarding. */
const MoneyInput: React.FC<{
  label: string;
  value: string;
  onChangeText: (t: string) => void;
  palette: Palette;
}> = ({ label, value, onChangeText, palette }) => (
  <View style={{ gap: 6 }}>
    <Text variant="label" tone="secondary">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      keyboardType="decimal-pad"
      placeholder="0"
      placeholderTextColor={palette.textSecondary}
      style={[
        styles.moneyInput,
        {
          backgroundColor: palette.bgSurface,
          borderColor: palette.borderSubtle,
          color: palette.textPrimary,
        },
      ]}
    />
  </View>
);

// ---- Wheel Picker ----

const WHEEL_ITEM_HEIGHT = 44;
const WHEEL_VISIBLE_HEIGHT = 198; // 44 * 4.5 — se ven el central + 2 arriba + 2 abajo
const WHEEL_PADDING = (WHEEL_VISIBLE_HEIGHT - WHEEL_ITEM_HEIGHT) / 2;

type WheelPickerItem = { label: string; value: number };

type WheelPickerProps = {
  items: WheelPickerItem[];
  value: number;
  onChange: (v: number) => void;
  palette: Palette;
};

/**
 * Wheel picker vertical tipo iOS.
 * Implementación pura con ScrollView + snapToInterval.
 * Compatible web (react-native-web soporta ScrollView con rueda del ratón).
 */
const WheelPicker: React.FC<WheelPickerProps> = ({ items, value, onChange, palette }) => {
  const scrollRef = useRef<ScrollView>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(() => {
    const idx = items.findIndex((it) => it.value === value);
    return idx >= 0 ? idx : 0;
  });

  // Sincronizar posición del scroll cuando el valor cambia externamente (ej. primer render).
  useEffect(() => {
    const idx = items.findIndex((it) => it.value === value);
    const target = idx >= 0 ? idx : 0;
    setCurrentIndex(target);
    // Usamos requestAnimationFrame para asegurar que el ScrollView está montado.
    const handle = setTimeout(() => {
      scrollRef.current?.scrollTo({ y: target * WHEEL_ITEM_HEIGHT, animated: false });
    }, 0);
    return () => clearTimeout(handle);
  }, [value, items]);

  const handleMomentumScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const offsetY = e.nativeEvent.contentOffset.y;
      const idx = Math.round(offsetY / WHEEL_ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      setCurrentIndex(clamped);
      onChange(items[clamped].value);
    },
    [items, onChange],
  );

  // En web, onMomentumScrollEnd no siempre dispara; usamos onScrollEndDrag también.
  const handleScrollEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      if (Platform.OS !== 'web') return;
      const offsetY = e.nativeEvent.contentOffset.y;
      const idx = Math.round(offsetY / WHEEL_ITEM_HEIGHT);
      const clamped = Math.max(0, Math.min(idx, items.length - 1));
      setCurrentIndex(clamped);
      onChange(items[clamped].value);
    },
    [items, onChange],
  );

  return (
    <View style={[styles.wheelContainer, { borderColor: palette.borderSubtle }]}>
      {/* Líneas indicadoras del carril central */}
      <View
        pointerEvents="none"
        style={[
          styles.wheelRailTop,
          { top: WHEEL_PADDING, borderColor: palette.borderSubtle },
        ]}
      />
      <View
        pointerEvents="none"
        style={[
          styles.wheelRailBottom,
          { top: WHEEL_PADDING + WHEEL_ITEM_HEIGHT, borderColor: palette.borderSubtle },
        ]}
      />

      {/* Degradado superior */}
      <LinearGradient
        pointerEvents="none"
        colors={[palette.bgBase, 'transparent'] as [string, string]}
        style={[styles.wheelFadeTop]}
      />

      <ScrollView
        ref={scrollRef}
        accessibilityLabel="Día de cobro"
        showsVerticalScrollIndicator={false}
        snapToInterval={WHEEL_ITEM_HEIGHT}
        decelerationRate="fast"
        onMomentumScrollEnd={handleMomentumScrollEnd}
        onScrollEndDrag={handleScrollEnd}
        contentContainerStyle={{
          paddingTop: WHEEL_PADDING,
          paddingBottom: WHEEL_PADDING,
        }}
        style={{ height: WHEEL_VISIBLE_HEIGHT }}
      >
        {items.map((item, idx) => {
          const isSelected = idx === currentIndex;
          return (
            <View
              key={item.value}
              style={[styles.wheelItem, { height: WHEEL_ITEM_HEIGHT }]}
            >
              <Text
                variant={isSelected ? 'h2' : 'body'}
                weight={isSelected ? 'bold' : 'regular'}
                style={{
                  color: isSelected ? palette.accent : palette.textSecondary,
                  opacity: isSelected ? 1 : 0.45,
                }}
              >
                {item.label}
              </Text>
            </View>
          );
        })}
      </ScrollView>

      {/* Degradado inferior */}
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', palette.bgBase] as [string, string]}
        style={[styles.wheelFadeBottom]}
      />
    </View>
  );
};

/** Chip de día (mes o semana) para el selector inline. */
const DayChip: React.FC<{
  label: string;
  selected: boolean;
  onPress: () => void;
  palette: Palette;
}> = ({ label, selected, onPress, palette }) => (
  <Pressable
    onPress={onPress}
    style={[
      styles.dayChip,
      {
        backgroundColor: selected ? palette.accent : palette.bgElevated,
        borderColor: selected ? palette.accent : palette.borderSubtle,
      },
    ]}
  >
    <Text variant="label" weight={selected ? 'semibold' : 'medium'} style={{ color: selected ? '#fff' : palette.textPrimary }}>
      {label}
    </Text>
  </Pressable>
);

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
  moneyInput: {
    borderWidth: 1.5,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: Platform.OS === 'ios' ? spacing.md : spacing.sm,
    fontSize: 16,
  },
  dayChip: {
    minWidth: 40,
    paddingHorizontal: spacing.sm,
    paddingVertical: 8,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionChip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    alignItems: 'center',
    gap: 2,
  },
  infoBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.sm,
    borderWidth: 1,
  },
  // Wheel Picker
  wheelContainer: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  wheelItem: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelRailTop: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    zIndex: 2,
  },
  wheelRailBottom: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    zIndex: 2,
  },
  wheelFadeTop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: WHEEL_PADDING,
    zIndex: 3,
    pointerEvents: 'none',
  },
  wheelFadeBottom: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: WHEEL_PADDING,
    zIndex: 3,
    pointerEvents: 'none',
  },
  personalizedBox: {
    padding: spacing.lg,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    alignItems: 'center',
  },
});
