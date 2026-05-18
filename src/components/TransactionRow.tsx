import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import { Text } from './Text';
import { formatMoneySigned, formatRelative } from '../utils/format';
import { paymentMethodMeta } from '../utils/paymentMethods';
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
  const pm = paymentMethodMeta(tx.payment_method);

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
        <View style={styles.titleRow}>
          <Text variant="body" weight="medium" numberOfLines={1} style={{ flexShrink: 1 }}>
            {tx.description}
          </Text>
          {tx.recurring_id !== null && (
            <Ionicons name="repeat" size={12} color={palette.textMuted} />
          )}
        </View>
        <View style={styles.metaRow}>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {tx.category_name || 'Sin categoría'} · {formatRelative(tx.transaction_date)}
          </Text>
          {pm && (
            <View style={styles.pmRow}>
              <Ionicons name={pm.icon} size={11} color={palette.textMuted} />
              <Text variant="caption" tone="muted">{pm.label}</Text>
            </View>
          )}
        </View>
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
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexWrap: 'wrap',
  },
  pmRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
