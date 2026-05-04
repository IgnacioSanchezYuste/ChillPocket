import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import { Text } from './Text';
import { formatMoneySigned, formatRelative } from '../utils/format';
import type { Transaction } from '../api/types';

type Props = {
  tx: Transaction;
  currency: string;
  onPress?: () => void;
};

export const TransactionRow: React.FC<Props> = ({ tx, currency, onPress }) => {
  const { palette } = useTheme();
  const isIncome = tx.type === 'income';
  const dotColor = tx.category_color || (isIncome ? palette.success : palette.textMuted);

  return (
    <Pressable
      onPress={onPress}
      android_ripple={{ color: palette.bgElevated }}
      style={({ pressed }) => [
        styles.row,
        { borderBottomColor: palette.borderSubtle, opacity: pressed ? 0.7 : 1 },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: dotColor }]} />
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="medium" numberOfLines={1}>
          {tx.description}
        </Text>
        <Text variant="caption" tone="muted">
          {tx.category_name || 'Sin categoría'} · {formatRelative(tx.transaction_date)}
        </Text>
      </View>
      <Text
        variant="body"
        weight="semibold"
        tabular
        tone={isIncome ? 'success' : 'primary'}
      >
        {formatMoneySigned(Number(tx.amount), tx.type, currency)}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 2,
  },
});
