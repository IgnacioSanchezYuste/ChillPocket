import React from 'react';
import { View, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { PasswordResetForm } from '../../components/PasswordResetForm';
import { useToast } from '../../components/Toast';

type Props = { initialEmail?: string; onBack: () => void };

export const ForgotPasswordScreen: React.FC<Props> = ({ initialEmail, onBack }) => {
  const { palette } = useTheme();
  const toast = useToast();

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <Pressable
            onPress={onBack}
            hitSlop={12}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel="Volver a iniciar sesión"
          >
            <Ionicons name="chevron-back" size={22} color={palette.textPrimary} />
            <Text variant="label" weight="semibold">Iniciar sesión</Text>
          </Pressable>

          <View style={{ gap: spacing.sm, marginBottom: spacing.xl }}>
            <Text variant="h1">¿Olvidaste tu contraseña?</Text>
            <Text variant="body" tone="secondary">
              Sin problema: la cambiamos en un minuto.
            </Text>
          </View>

          {/* Al terminar, la sesión ya está iniciada y RootNavigator muestra la app. */}
          <PasswordResetForm
            initialEmail={initialEmail}
            onDone={() => toast.success('Contraseña cambiada. ¡Bienvenido de nuevo!')}
          />
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  content: { flexGrow: 1, padding: spacing.xl, maxWidth: 480, width: '100%', alignSelf: 'center' },
  back: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', marginBottom: spacing.xl },
});
