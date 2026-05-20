import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { BrandLogo } from '../../components/BrandLogo';
import { GoogleButton } from '../../components/GoogleButton';
import { useToast } from '../../components/Toast';
import { apiError } from '../../api/http';
import { validateEmail, validateName, validatePassword } from '../../utils/validators';

type Props = { onGoToLogin: () => void };

export const RegisterScreen: React.FC<Props> = ({ onGoToLogin }) => {
  const { palette } = useTheme();
  const { register, loading } = useAuthStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const onSubmit = async () => {
    const nameErr = validateName(name);
    if (nameErr) return toast.error(nameErr);
    const emailErr = validateEmail(email);
    if (emailErr) return toast.error(emailErr);
    const pwdErr = validatePassword(password);
    if (pwdErr) return toast.error(pwdErr);
    try {
      await register({ name: name.trim(), email: email.trim(), password });
      // Nuevo registro → arranca el onboarding (la moneda se elige allí).
      useOnboardingStore.getState().start({ name: name.trim() });
    } catch (e) {
      toast.error(apiError(e, 'No se pudo crear la cuenta'));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={{ marginBottom: spacing.xxl, gap: spacing.sm }}>
            <BrandLogo size={80} style={styles.logo} />
            <Text variant="h1">Crea tu cuenta</Text>
            <Text variant="body" tone="secondary">
              Empieza a controlar tus gastos en menos de un minuto.
            </Text>
          </View>

          <View style={{ gap: spacing.lg }}>
            <Input label="Nombre" placeholder="Tu nombre" value={name} onChangeText={setName} />
            <Input
              label="Email"
              placeholder="tu@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              label="Contraseña"
              placeholder="Mínimo 6 caracteres"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />

            <Button title="Crear cuenta" loading={loading} onPress={onSubmit} size="lg" />

            <View style={styles.dividerRow}>
              <View style={[styles.dividerLine, { backgroundColor: palette.borderSubtle }]} />
              <Text variant="caption" tone="muted">o</Text>
              <View style={[styles.dividerLine, { backgroundColor: palette.borderSubtle }]} />
            </View>

            <GoogleButton label="Crear cuenta con Google" />
          </View>

          <View style={styles.footer}>
            <Text variant="body" tone="secondary">¿Ya tienes cuenta?</Text>
            <Pressable onPress={onGoToLogin}>
              <Text variant="body" tone="accent" weight="semibold">Inicia sesión</Text>
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxl,
    flexGrow: 1,
  },
  logo: {
    marginBottom: spacing.sm,
  },
  footer: {
    marginTop: spacing.xxl,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginVertical: spacing.sm,
  },
  dividerLine: { flex: 1, height: 1 },
});
