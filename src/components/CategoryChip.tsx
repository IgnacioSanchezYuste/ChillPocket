import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { Text } from './Text';
import type { Category } from '../api/types';

type Props = {
  category: Category;
  selected?: boolean;
  onPress?: () => void;
};

export const CategoryChip: React.FC<Props> = ({ category, selected, onPress }) => {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.chip,
        {
          backgroundColor: selected ? palette.accentSoft : palette.bgElevated,
          borderColor: selected ? palette.accent : palette.borderSubtle,
        },
      ]}
    >
      <View style={[styles.dot, { backgroundColor: category.color }]} />
      <Text variant="label" weight={selected ? 'semibold' : 'medium'}>
        {category.name}
      </Text>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: spacing.md,
    paddingVertical: 8,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
