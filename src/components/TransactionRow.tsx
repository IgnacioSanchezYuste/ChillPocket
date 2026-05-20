import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from './Text';
import { formatMoneySigned, formatRelative } from '../utils/format';
import { paymentMethodMeta } from '../utils/paymentMethods';
import { categoryIonicon } from '../utils/categoryIcon';
import type { Transaction } from '../api/types';

type Props = {
  tx: Transaction;
  currency: string;
  onPress?: () => void;
};

function rgba(hex: string, alpha: number) {
  const h = hex.replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export const TransactionRow: React.FC<Props> = ({ tx, currency, onPress }) => {
  const { palette } = useTheme();
  const isIncome = tx.type === 'income';
  const color = tx.category_color || (isIncome ? palette.success : palette.accent);
  const iconName = categoryIonicon(tx.category_icon, tx.type);
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
      <View style={[styles.icon, { backgroundColor: rgba(color, 0.16) }]}>
        <Ionicons name={iconName} size={18} color={color} />
      </View>

      <View style={{ flex: 1, gap: 3 }}>
        <View style={styles.titleRow}>
          <Text variant="body" weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
            {tx.description}
          </Text>
          {tx.recurring_id !== null && <Ionicons name="repeat" size={12} color={palette.textMuted} />}
          {tx.goal_id !== null && <Ionicons name="flag" size={12} color={palette.accent} />}
        </View>
        <View style={styles.metaRow}>
          <Text variant="caption" tone="muted" numberOfLines={1}>
            {tx.category_name || 'Sin categoría'} · {formatRelative(tx.transaction_date)}
          </Text>
          {pm && (
            <View style={styles.pmRow}>
              <Ionicons name={pm.icon} size={11} color={palette.textMuted} />
              <Text variant="caption" tone="muted">
                {pm.label}
              </Text>
            </View>
          )}
        </View>
      </View>

      <Text variant="body" weight="bold" tabular tone={isIncome ? 'success' : 'primary'}>
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
  icon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  pmRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
});
