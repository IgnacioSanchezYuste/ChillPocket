import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type Props = {
  children: React.ReactNode;
  /** Qué degradado de la paleta usar. */
  variant?: 'hero' | 'accent';
  padding?: keyof typeof spacing;
  style?: ViewStyle;
};

// Tarjeta con degradado suave (pastel en claro, sobrio en oscuro).
// Diagonal de arriba-izq a abajo-der para un look moderno.
export const GradientCard: React.FC<Props> = ({
  children,
  variant = 'hero',
  padding = 'lg',
  style,
}) => {
  const { palette } = useTheme();
  const colors = variant === 'accent' ? palette.gradientAccent : palette.gradientHero;
  return (
    <LinearGradient
      colors={colors as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[
        styles.card,
        { borderColor: palette.borderSubtle, padding: spacing[padding] },
        style,
      ]}
    >
      {children}
    </LinearGradient>
  );
};

// Variante con un borde/halo para envolver contenido y que respire.
export const GradientHeaderBackdrop: React.FC<{ children: React.ReactNode; height?: number }> = ({
  children,
}) => {
  const { palette } = useTheme();
  return (
    <View>
      <LinearGradient
        colors={palette.gradientApp as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFill}
      />
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
});
