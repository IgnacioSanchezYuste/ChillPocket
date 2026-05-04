import React, { useState } from 'react';
import { TextInput, TextInputProps, View, StyleSheet, Platform } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing, fontSize } from '../theme/spacing';
import { Text } from './Text';

type Props = TextInputProps & {
  label?: string;
  helper?: string;
  error?: string;
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
};

export const Input = React.forwardRef<TextInput, Props>(
  ({ label, helper, error, leading, trailing, style, onFocus, onBlur, multiline, ...rest }, ref) => {
    const { palette } = useTheme();
    const [focused, setFocused] = useState(false);

    return (
      <View style={{ gap: 6 }}>
        {label && (
          <Text variant="label" tone="secondary">
            {label}
          </Text>
        )}
        <View
          style={[
            styles.wrap,
            multiline && styles.wrapMultiline,
            {
              backgroundColor: palette.bgElevated,
              borderColor: error
                ? palette.danger
                : focused
                ? palette.accent
                : palette.borderSubtle,
            },
          ]}
        >
          {leading && <View style={styles.leading}>{leading}</View>}
          <TextInput
            ref={ref}
            style={[
              styles.input,
              { color: palette.textPrimary },
              multiline && styles.inputMultiline,
              style,
            ]}
            placeholderTextColor={palette.textMuted}
            selectionColor={palette.accent}
            cursorColor={palette.accent}
            underlineColorAndroid="transparent"
            multiline={multiline}
            onFocus={(e) => {
              setFocused(true);
              onFocus?.(e);
            }}
            onBlur={(e) => {
              setFocused(false);
              onBlur?.(e);
            }}
            {...rest}
          />
          {trailing && <View style={styles.trailing}>{trailing}</View>}
        </View>
        {(helper || error) && (
          <Text variant="caption" tone={error ? 'danger' : 'muted'}>
            {error || helper}
          </Text>
        )}
      </View>
    );
  }
);

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: radius.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  wrapMultiline: {
    alignItems: 'flex-start',
    paddingVertical: 10,
  },
  input: {
    flex: 1,
    fontSize: fontSize.body,
    lineHeight: 20,
    paddingVertical: Platform.OS === 'ios' ? 14 : 10,
    paddingHorizontal: 0,
    margin: 0,
    includeFontPadding: false,
    textAlignVertical: 'center',
    outlineStyle: 'none',
    outlineWidth: 0,
  } as any,
  inputMultiline: {
    minHeight: 80,
    textAlignVertical: 'top',
    paddingVertical: 0,
  },
  leading: { marginRight: spacing.sm, justifyContent: 'center' },
  trailing: { marginLeft: spacing.sm, justifyContent: 'center' },
});
