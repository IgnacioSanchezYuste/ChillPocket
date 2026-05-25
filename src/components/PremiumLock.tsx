import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from './Text';
import { track } from '../utils/analytics';

type Props = {
  /** Texto principal del banner. */
  label?: string;
  /** Plan recomendado (por defecto Plus). */
  planLabel?: string;
  /** Tema visual: 'banner' (full-width) o 'badge' (chip inline). */
  variant?: 'banner' | 'badge';
  /** Origen del lock para analytics (p.ej. 'export', 'advanced_analytics'). */
  feature?: string;
};

/**
 * Lock visual reutilizable: muestra una llamada a actualizar al plan Plus.
 * Pulsable → abre el Paywall. No bloquea acciones por sí mismo (Fase 1).
 */
export const PremiumLock: React.FC<Props> = ({
  label = 'Disponible en Plus',
  planLabel = 'Mejorar',
  variant = 'banner',
  feature,
}) => {
  const { palette } = useTheme();
  const navigation = useNavigation<any>();

  const onPress = () => {
    track('upgrade_clicked', { feature, variant });
    navigation.navigate('Paywall', { feature });
  };

  if (variant === 'badge') {
    return (
      <Pressable
        onPress={onPress}
        style={[styles.badge, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}
      >
        <Ionicons name="lock-closed" size={11} color={palette.accent} />
        <Text variant="caption" weight="bold" tone="accent">Plus</Text>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={onPress}
      style={[styles.banner, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}
    >
      <View style={[styles.icon, { backgroundColor: palette.accent }]}>
        <Ionicons name="sparkles" size={14} color="#FFFFFF" />
      </View>
      <View style={{ flex: 1 }}>
        <Text variant="label" weight="semibold" tone="accent">{label}</Text>
        <Text variant="caption" tone="muted">Desbloquéalo mejorando tu plan</Text>
      </View>
      <View style={[styles.cta, { backgroundColor: palette.accent }]}>
        <Text variant="caption" weight="bold" style={{ color: '#FFFFFF' }}>{planLabel}</Text>
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
  },
  icon: { width: 26, height: 26, borderRadius: 13, alignItems: 'center', justifyContent: 'center' },
  cta: { paddingHorizontal: spacing.md, paddingVertical: 5, borderRadius: radius.pill },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
});
