import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

type Props = ViewProps & {
  padding?: keyof typeof spacing;
  variant?: 'surface' | 'elevated';
};

export const Card: React.FC<Props> = ({
  padding = 'lg',
  variant = 'surface',
  style,
  children,
  ...rest
}) => {
  const { palette } = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: variant === 'elevated' ? palette.bgElevated : palette.bgSurface,
          borderColor: palette.borderSubtle,
          padding: spacing[padding],
        },
        style,
      ]}
      {...rest}
    >
      {children}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
  },
});
