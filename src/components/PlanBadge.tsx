import React from 'react';
import { Pressable, View, StyleSheet, ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from './Text';
import { useBilling } from '../store/useBillingStore';
import { track } from '../utils/analytics';
import type { PlanCode } from '../api/types';

type Props = {
  style?: ViewStyle;
};

type PlanVisual = {
  icon: keyof typeof Ionicons.glyphMap;
  /** 'gradient': degradado vibrante con texto blanco; 'solid': chip en contraste inverso. */
  style: 'gradient' | 'solid';
  reverse?: boolean;
};

// Plus y Familia usan gradientBalance, el degradado que ya lleva texto blanco en la
// tarjeta de saldo (los pastel no dan contraste suficiente en claro). Pro Freelance
// va en contraste inverso. El nombre del plan termina de distinguirlos.
const PLAN_VISUALS: Record<Exclude<PlanCode, 'free'>, PlanVisual> = {
  plus: { icon: 'sparkles', style: 'gradient' },
  family: { icon: 'people', style: 'gradient', reverse: true },
  pro_freelance: { icon: 'briefcase', style: 'solid' },
};

/**
 * Chip compacto que muestra el plan del usuario y abre el Paywall al pulsarlo.
 * - Gratis: discreto (neutro) con una llamada sutil a mejorar.
 * - Plus / Familia / Pro Freelance: degradado del tema + icono propio, coherentes
 *   entre sí pero distinguibles.
 * - Early adopter: detalle pequeño adicional, sin recargar el chip.
 */
export const PlanBadge: React.FC<Props> = ({ style }) => {
  const { palette } = useTheme();
  const navigation = useNavigation<any>();
  const { plan, planName, isEarlyAdopter } = useBilling();

  const onPress = () => {
    track('upgrade_clicked', { feature: 'plan_badge', plan });
    navigation.navigate('Paywall');
  };

  const isFree = plan === 'free';
  const accessibilityLabel = isFree
    ? 'Plan Gratis. Toca para ver los planes y mejorar.'
    : `Plan ${planName}${isEarlyAdopter ? ', early adopter' : ''}. Toca para gestionar tu suscripción.`;

  if (isFree) {
    return (
      <Pressable
        onPress={onPress}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        style={({ pressed }) => [
          styles.freeChip,
          { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle, opacity: pressed ? 0.7 : 1 },
          style,
        ]}
      >
        <Ionicons name="rocket-outline" size={13} color={palette.textSecondary} />
        <Text variant="label" weight="medium" tone="secondary">Gratis</Text>
        <View style={[styles.freeDot, { backgroundColor: palette.borderStrong }]} />
        <Text variant="label" weight="semibold" tone="accent">Mejorar</Text>
      </Pressable>
    );
  }

  const visual = PLAN_VISUALS[plan as Exclude<PlanCode, 'free'>] ?? PLAN_VISUALS.plus;
  const colors = visual.reverse ? [...palette.gradientBalance].reverse() : palette.gradientBalance;
  const solid = visual.style === 'solid';
  const fg = solid ? palette.textInverted : '#FFFFFF';
  const content = (
    <>
      <Ionicons name={visual.icon} size={13} color={fg} />
      <Text variant="label" weight="bold" style={{ color: fg }}>{planName}</Text>
      {isEarlyAdopter && (
        <>
          <View style={[styles.premiumDivider, { backgroundColor: fg, opacity: 0.4 }]} />
          <Ionicons name="star" size={10} color={fg} />
          <Text variant="caption" weight="semibold" style={{ color: fg, opacity: 0.9 }}>
            Early adopter
          </Text>
        </>
      )}
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1, alignSelf: 'flex-start' }, style]}
    >
      {solid ? (
        <View style={[styles.premiumChip, { backgroundColor: palette.textPrimary, shadowColor: palette.textPrimary }]}>
          {content}
        </View>
      ) : (
        <LinearGradient
          colors={colors as [string, string, ...string[]]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.premiumChip, { shadowColor: colors[0] }]}
        >
          {content}
        </LinearGradient>
      )}
    </Pressable>
  );
};

const styles = StyleSheet.create({
  freeChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignSelf: 'flex-start',
  },
  freeDot: { width: 3, height: 3, borderRadius: 2 },
  premiumChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    shadowOpacity: 0.25,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  premiumDivider: {
    width: 1,
    height: 10,
    marginHorizontal: 1,
  },
});
