import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Card } from './Card';
import { Text } from './Text';
import { spacing } from '../theme/spacing';
import { useTheme } from '../theme/ThemeProvider';
import { formatMoney } from '../utils/format';

type Props = {
  label: string;
  amount: number;
  currency?: string;
  variation?: number; // percentage
  tone?: 'primary' | 'success' | 'danger' | 'accent';
  helper?: string;
};

export const KPICard: React.FC<Props> = ({ label, amount, currency = 'EUR', variation, tone = 'primary', helper }) => {
  const { palette } = useTheme();
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
      <Text variant="label" tone="secondary">
        {label}
      </Text>
      <Text variant="display" tone={tone} tabular style={{ marginTop: spacing.xs }}>
        {formatMoney(amount, currency)}
      </Text>
      <View style={{ marginTop: spacing.xs, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        {variation !== undefined && (
          <Text variant="caption" tabular style={{ color: variationColor, fontWeight: '600' }}>
            {variation > 0 ? '↑' : variation < 0 ? '↓' : '·'} {Math.abs(variation).toFixed(1)}%
          </Text>
        )}
        {helper && (
          <Text variant="caption" tone="muted">
            {helper}
          </Text>
        )}
      </View>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: { minWidth: 160 },
});
