import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { useSpotlightTarget } from '../onboarding/useSpotlightTarget';

type Props = {
  onPress: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
  bottom?: number;
};

export const FAB: React.FC<Props> = ({ onPress, icon = 'add', bottom = 28 }) => {
  const { palette } = useTheme();
  const sp = useSpotlightTarget('fab');
  return (
    <Pressable
      ref={sp.ref}
      onLayout={sp.onLayout}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        { bottom, transform: [{ scale: pressed ? 0.94 : 1 }] },
      ]}
      accessibilityRole="button"
      accessibilityLabel="Añadir"
    >
      {/* Halo/glow suave detrás del botón */}
      <View
        style={[
          styles.glow,
          { backgroundColor: palette.gradientFab[0], shadowColor: palette.gradientFab[0] },
        ]}
      />
      <LinearGradient
        colors={palette.gradientFab as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.fab}
      >
        <Ionicons name={icon} size={30} color="#FFFFFF" />
      </LinearGradient>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    right: 20,
    width: 62,
    height: 62,
    alignItems: 'center',
    justifyContent: 'center',
  },
  glow: {
    position: 'absolute',
    width: 62,
    height: 62,
    borderRadius: 31,
    opacity: 0.45,
    shadowOpacity: 0.6,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 10,
  },
  fab: {
    width: 62,
    height: 62,
    borderRadius: 31,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
