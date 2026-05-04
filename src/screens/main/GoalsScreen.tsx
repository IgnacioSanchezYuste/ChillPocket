import React, { useEffect, useState } from 'react';
import { View, ScrollView, StyleSheet, Pressable, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useDataStore } from '../../store/useDataStore';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ProgressBar } from '../../components/ProgressBar';
import { ScreenHeader } from '../../components/ScreenHeader';
import { EmptyState } from '../../components/EmptyState';
import { FAB } from '../../components/FAB';
import { GoalSheet } from '../modals/GoalSheet';
import { formatMoney } from '../../utils/format';
import type { SavingsGoal } from '../../api/types';

export const GoalsScreen: React.FC = () => {
  const { palette } = useTheme();
  const { user } = useAuthStore();
  const { goals, fetchGoals } = useDataStore();
  const [refreshing, setRefreshing] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<SavingsGoal | null>(null);

  useEffect(() => {
    fetchGoals();
  }, []);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchGoals();
    setRefreshing(false);
  };

  const currency = user?.currency || 'EUR';

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView
        contentContainerStyle={{ paddingBottom: spacing.xxxl * 2 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />}
      >
        <ScreenHeader title="Metas de ahorro" subtitle={`${goals.length} ${goals.length === 1 ? 'meta' : 'metas'}`} showBack />
        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  metaRow: { marginTop: spacing.sm, flexDirection: 'row', alignItems: 'center', gap: 6 },
});
