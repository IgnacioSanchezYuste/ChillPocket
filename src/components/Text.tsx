import React from 'react';
import { Text as RNText, TextProps, StyleSheet, TextStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { fontSize, fontWeight } from '../theme/spacing';

type Variant = 'display' | 'h1' | 'h2' | 'body' | 'label' | 'caption' | 'mono';
type Tone = 'primary' | 'secondary' | 'muted' | 'accent' | 'success' | 'danger' | 'warning' | 'inverted';

type Props = TextProps & {
  variant?: Variant;
  tone?: Tone;
  weight?: keyof typeof fontWeight;
  align?: TextStyle['textAlign'];
  tabular?: boolean;
};

export const Text: React.FC<Props> = ({
  variant = 'body',
  tone = 'primary',
  weight,
  align,
  tabular,
  style,
  children,
  ...rest
}) => {
  const { palette } = useTheme();

  const colorMap: Record<Tone, string> = {
    primary: palette.textPrimary,
    secondary: palette.textSecondary,
    muted: palette.textMuted,
    accent: palette.accent,
    success: palette.success,
    danger: palette.danger,
    warning: palette.warning,
    inverted: palette.textInverted,
  };

  return (
    <RNText
      style={[
        variantStyles[variant],
        {
          color: colorMap[tone],
          textAlign: align,
          fontVariant: tabular || variant === 'display' ? ['tabular-nums'] : undefined,
        },
        weight ? { fontWeight: fontWeight[weight] } : null,
        style,
      ]}
      {...rest}
    >
      {children}
    </RNText>
  );
};

const variantStyles = StyleSheet.create({
  display: { fontSize: fontSize.display, lineHeight: 40, letterSpacing: -0.6, fontWeight: fontWeight.bold },
  h1: { fontSize: fontSize.h1, lineHeight: 32, letterSpacing: -0.3, fontWeight: fontWeight.semibold },
  h2: { fontSize: fontSize.h2, lineHeight: 28, fontWeight: fontWeight.semibold },
  body: { fontSize: fontSize.body, lineHeight: 22, fontWeight: fontWeight.regular },
  label: { fontSize: fontSize.label, lineHeight: 18, fontWeight: fontWeight.medium },
  caption: { fontSize: fontSize.caption, lineHeight: 16, fontWeight: fontWeight.regular },
  mono: { fontSize: fontSize.label, lineHeight: 18, fontVariant: ['tabular-nums'] },
});
