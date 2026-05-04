import React from 'react';
import {
  ActivityIndicator,
  Pressable,
  PressableProps,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { Text } from './Text';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md' | 'lg';

type Props = Omit<PressableProps, 'children'> & {
  title: string;
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  fullWidth?: boolean;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

export const Button: React.FC<Props> = ({
  title,
  variant = 'primary',
  size = 'md',
  loading,
  fullWidth = true,
  leading,
  trailing,
  disabled,
  style,
  ...rest
}) => {
  const { palette } = useTheme();

  const heights: Record<Size, number> = { sm: 36, md: 44, lg: 52 };
  const padX: Record<Size, number> = { sm: spacing.md, md: spacing.lg, lg: spacing.xl };

  const styleByVariant: Record<Variant, ViewStyle> = {
    primary: { backgroundColor: palette.accent, borderColor: palette.accent },
    secondary: { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle },
    ghost: { backgroundColor: 'transparent', borderColor: 'transparent' },
    danger: { backgroundColor: palette.danger, borderColor: palette.danger },
  };

  const tone =
    variant === 'primary' || variant === 'danger'
      ? 'inverted'
      : variant === 'ghost'
      ? 'secondary'
      : 'primary';

  return (
    <Pressable
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.btn,
        {
          height: heights[size],
          paddingHorizontal: padX[size],
          opacity: disabled ? 0.5 : pressed ? 0.85 : 1,
          alignSelf: fullWidth ? 'stretch' : 'auto',
        },
        styleByVariant[variant],
        style as any,
      ]}
      {...rest}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={tone === 'inverted' ? palette.textInverted : palette.textPrimary} />
        ) : (
          <>
            {leading}
            <Text variant={size === 'lg' ? 'body' : 'label'} weight="semibold" tone={tone}>
              {title}
            </Text>
            {trailing}
          </>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    borderRadius: radius.md,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
