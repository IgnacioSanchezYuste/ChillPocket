import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Card } from './Card';
import { Text } from './Text';
import { Sparkline } from './Sparkline';
import { spacing, radius } from '../theme/spacing';
import { useTheme } from '../theme/ThemeProvider';
import { formatMoney } from '../utils/format';

type Props = {
  label: string;
  amount: number;
  currency?: string;
  variation?: number; // percentage
  tone?: 'primary' | 'success' | 'danger' | 'accent';
  helper?: string;
  icon?: keyof typeof Ionicons.glyphMap;
  /** Datos para la micrográfica decorativa. */
  spark?: number[];
  /** Color de icono / micrográfica. Por defecto deriva del tono. */
  accentColor?: string;
};

function rgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const KPICard: React.FC<Props> = ({
  label,
  amount,
  currency = 'EUR',
  variation,
  tone = 'primary',
  helper,
  icon,
  spark,
  accentColor,
}) => {
  const { palette } = useTheme();

  const toneColor =
    tone === 'success'
      ? palette.success
      : tone === 'danger'
      ? palette.danger
      : tone === 'accent'
      ? palette.accent
      : palette.textPrimary;
  const accent = accentColor || (tone === 'primary' ? palette.accent : toneColor);

  const variationColor =
    variation === undefined
      ? palette.textMuted
      : variation > 0
      ? palette.success
      : variation < 0
      ? palette.danger
      : palette.textMuted;

  return (
    <Card padding="lg" style={styles.card}>
      <View style={styles.head}>
        {icon && (
          <View style={[styles.iconWrap, { backgroundColor: rgba(accent, 0.14) }]}>
            <Ionicons name={icon} size={16} color={accent} />
          </View>
        )}
        <Text variant="label" tone="secondary" numberOfLines={1} style={{ flex: 1 }}>
          {label}
        </Text>
      </View>

      <Text variant="h1" tone={tone === 'primary' ? 'primary' : tone} tabular style={{ marginTop: spacing.sm }}>
        {formatMoney(amount, currency)}
      </Text>

      <View style={styles.foot}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
          {variation !== undefined && (
            <Text variant="caption" tabular style={{ color: variationColor, fontWeight: '600' }}>
              {variation > 0 ? '↑' : variation < 0 ? '↓' : '·'} {Math.abs(variation).toFixed(1)}%
            </Text>
          )}
          {helper && (
            <Text variant="caption" tone="muted" numberOfLines={1}>
              {helper}
            </Text>
          )}
        </View>
        {spark && spark.length > 1 && (
          <Sparkline data={spark} width={66} height={26} color={accent} strokeWidth={2} />
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { flex: 1, minWidth: 0 },
  head: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  iconWrap: {
    width: 30,
    height: 30,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  foot: {
    marginTop: spacing.sm,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
