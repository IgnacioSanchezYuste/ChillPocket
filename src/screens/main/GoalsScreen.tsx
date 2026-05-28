import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton } from '../../components/Skeleton';
import { FAB } from '../../components/FAB';
import { Confetti } from '../../components/Confetti';
import { useToast } from '../../components/Toast';
import { GoalSheet } from '../modals/GoalSheet';
import { formatMoney } from '../../utils/format';
import type { SavingsGoal } from '../../api/types';

export const GoalsScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const { goals, fetchGoals, availableBalance, goalsLoading, goalsError } = useDataStore();
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);
  const [showConfetti, setShowConfetti] = useState(false);

  // Detección de "meta cumplida ahora mismo":
  // - previousCompletion: snapshot del estado de completitud por id antes del último refresh.
  // - celebrated: ids ya celebradas en esta sesión (no celebrar dos veces).
  const previousCompletion = useRef<Map<number, boolean>>(new Map());
  const celebrated = useRef<Set<number>>(new Set());

  useEffect(() => {
    for (const g of goals) {
      const isComplete = Number(g.current_amount) >= Number(g.target_amount);
      const wasComplete = previousCompletion.current.get(g.id) ?? null;
      // Solo disparar si: estaba en false antes (no null = primera vez vista) y ahora es true,
      // y no la habíamos celebrado ya en esta sesión.
      if (wasComplete === false && isComplete && !celebrated.current.has(g.id)) {
        celebrated.current.add(g.id);
        setShowConfetti(true);
        toast.success(`¡Meta "${g.name}" cumplida! 🎉`);
        // Auto-ocultar tras la animación.
        setTimeout(() => setShowConfetti(false), 2400);
      }
      previousCompletion.current.set(g.id, isComplete);
    }
  }, [goals, toast]);

  useFocusEffect(useCallback(() => { fetchGoals(); }, []));

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGoals(true);
    setRefreshing(false);
  };

  const currency = user?.currency || 'EUR';

  // Primera carga sin datos: skeleton de 3 tarjetas de meta.
  if (goalsLoading && goals.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
        <ScreenHeader title="Metas de ahorro" subtitle="Cargando…" showBack />
        <GoalsSkeleton />
      </SafeAreaView>
    );
  }

  // Error de red sin datos previos: cartel con botón Reintentar.
  if (goalsError && goals.length === 0) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
        <ScreenHeader title="Metas de ahorro" showBack />
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <ErrorState
            title="No pudimos cargar tus metas"
            description={goalsError}
            onRetry={() => fetchGoals(true)}
          />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
      >
        <ScreenHeader title="Metas de ahorro" subtitle={`${goals.length} ${goals.length === 1 ? 'meta' : 'metas'}`} showBack />
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <View style={[styles.balanceCard, { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle }]}>
            <View style={{ flex: 1 }}>
              <Text variant="caption" tone="muted">Saldo disponible para aportar</Text>
              <Text
                variant="h1"
                weight="bold"
                tabular
                tone={availableBalance > 0 ? 'success' : availableBalance < 0 ? 'danger' : 'primary'}
                style={{ marginTop: 2 }}
              >
                {formatMoney(availableBalance, currency)}
              </Text>
            </View>
            <View style={[styles.balanceIcon, { backgroundColor: palette.accentSoft }]}>
              <Ionicons name="wallet" size={22} color={palette.accent} />
            </View>
          </View>

          {/* Sin datos reales: empty state (usuario sin metas creadas) */}
          {goals.length === 0 ? (
            <EmptyState
              icon="flag-outline"
              title="Aún sin metas"
              description="Define tu primer objetivo de ahorro y visualiza tu progreso."
              ctaLabel="Crear meta"
              onCta={() => {
                setEditing(null);
                setSheetOpen(true);
              }}
            />
          ) : (
            goals.map((g) => (
              <Pressable
                key={g.id}
                onPress={() => {
                  setEditing(g);
                  setSheetOpen(true);
                }}
              >
                <Card>
                  <View style={styles.row}>
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="body" weight="semibold">{g.name}</Text>
                      <Text variant="caption" tone="muted">
                        {formatMoney(Number(g.current_amount), currency)} de {formatMoney(Number(g.target_amount), currency)}
                      </Text>
                    </View>
                    <Text variant="h2" tabular tone={g.is_completed ? 'success' : 'primary'}>
                      {Math.round(g.progress_pct)}%
                    </Text>
                  </View>
                  <View style={{ marginTop: spacing.md }}>
                    <ProgressBar value={g.progress_pct} color={g.color || palette.accent} height={8} />
                  </View>
                  {g.target_date && (
                    <View style={styles.metaRow}>
                      <Ionicons name="calendar-outline" size={14} color={palette.textMuted} />
                      <Text variant="caption" tone="muted">
                        {g.days_remaining !== null && g.days_remaining > 0
                          ? `${g.days_remaining} días restantes`
                          : g.days_remaining === 0
                          ? 'Hoy es la fecha objetivo'
                          : 'Plazo vencido'}
                      </Text>
                    </View>
                  )}
                </Card>
              </Pressable>
            ))
          )}
        </View>
      </ScrollView>

      <FAB
        onPress={() => {
          setEditing(null);
          setSheetOpen(true);
        }}
      />

      <GoalSheet
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
        editing={editing}
        onSaved={fetchGoals}
      />

      {/* Confetti se posiciona absoluto sobre todo el SafeAreaView; pointerEvents=none
          en el componente para no bloquear interacción. Solo se renderiza mientras
          showConfetti=true (auto-oculta a los ~2.4s tras "meta cumplida"). */}
      <Confetti visible={showConfetti} />
    </SafeAreaView>
  );
};

// Skeleton de 3 tarjetas de meta para la primera carga.
const GoalsSkeleton: React.FC = () => (
  <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md, marginTop: spacing.md }}>
    {/* Card de saldo disponible */}
    <Skeleton height={72} borderRadius={radius.md} />
    {/* 3 tarjetas de meta */}
    {[0, 1, 2].map((i) => (
      <View key={i} style={{ gap: spacing.sm }}>
        <Skeleton width="55%" height={16} />
        <Skeleton width="40%" height={12} />
        <Skeleton height={8} borderRadius={radius.pill} style={{ marginTop: 4 }} />
      </View>
    ))}
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 },
  balanceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  balanceIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
