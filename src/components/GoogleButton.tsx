import React from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { Text } from './Text';
import { useToast } from './Toast';
import { useGoogleAuth } from '../hooks/useGoogleAuth';

type Props = {
  label?: string;
  /**
   * Cuando no hay Client ID configurado el botón se oculta. En desarrollo
   * puede ser útil mostrarlo igual para depurar; pasa `hideIfUnavailable={false}`.
   */
  hideIfUnavailable?: boolean;
};

export const GoogleButton: React.FC<Props> = ({
  label = 'Continuar con Google',
  hideIfUnavailable = true,
}) => {
  const { palette, mode } = useTheme();
  const toast = useToast();
  const { available, request, signIn, state } = useGoogleAuth();

  React.useEffect(() => {
    if (state.status === 'error') toast.error(state.error);
  }, [state]);

  if (!available && hideIfUnavailable) return null;

  const disabled = !request || state.status === 'pending';
  const loading = state.status === 'pending';

  return (
    <Pressable
      onPress={signIn}
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
