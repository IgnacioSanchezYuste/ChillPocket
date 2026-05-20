import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { Text } from './Text';

type Props = {
  label: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
};

// Componente puramente visual del botón de Google. La lógica (web vs nativo)
// vive en GoogleButton.tsx / GoogleButton.native.tsx.
export const GoogleButtonView: React.FC<Props> = ({ label, loading, disabled, onPress }) => {
  const { palette, mode } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.btn,
        {
          backgroundColor: mode === 'dark' ? palette.bgSurface : '#FFFFFF',
          borderColor: palette.borderSubtle,
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={styles.row}>
        {loading ? (
          <ActivityIndicator color={palette.textPrimary} />
        ) : (
          <>
            <Ionicons name="logo-google" size={18} color={palette.textPrimary} />
            <Text variant="body" weight="semibold">{label}</Text>
          </>
        )}
      </View>
    </Pressable>
  );
};

const styles = StyleSheet.create({
  btn: {
    height: 52,
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: spacing.lg,
    justifyContent: 'center',
    alignItems: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
});
