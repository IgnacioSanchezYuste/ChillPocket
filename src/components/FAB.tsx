import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  bottom?: number;
};

export const FAB: React.FC<Props> = ({ onPress, icon = 'add', bottom = 24 }) => {
  const { palette, mode } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.fab,
        {
          backgroundColor: palette.accent,
          bottom,
          transform: [{ scale: pressed ? 0.96 : 1 }],
          shadowColor: mode === 'dark' ? '#000' : '#0F172A',
        },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Añadir"
    >
      <Ionicons name={icon} size={26} color={palette.textInverted} />
    </Pressable>
  );
};

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
    elevation: 6,
  },
});
