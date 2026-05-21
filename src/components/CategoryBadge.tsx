import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/spacing';
import { categoryIonicon } from '../utils/categoryIcon';

type Props = {
  color?: string | null;
  icon?: string | null;
  type?: 'expense' | 'income';
  size?: number;
};

function rgba(hex: string, alpha: number) {
  const h = (hex || '').replace('#', '');
  if (h.length < 6) return hex;
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Badge circular con el color e icono de una categoría. Consistente con TransactionRow. */
export const CategoryBadge: React.FC<Props> = ({ color, icon, type = 'expense', size = 40 }) => {
  const { palette } = useTheme();
  const c = color || (type === 'income' ? palette.success : palette.accent);
  return (
    <View
      style={[
        styles.badge,
        { width: size, height: size, borderRadius: radius.md, backgroundColor: rgba(c, 0.16) },
      ]}
    >
      <Ionicons name={categoryIonicon(icon, type)} size={Math.round(size * 0.45)} color={c} />
    </View>
  );
};

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center' },
});
