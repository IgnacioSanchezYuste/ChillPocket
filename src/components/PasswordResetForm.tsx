import React, { useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from './Text';
import { Input } from './Input';
import { Button } from './Button';
import { authApi } from '../api/endpoints';
import { apiError } from '../api/http';
import { useAuthStore } from '../store/useAuthStore';
import { useCooldown } from '../hooks/useCooldown';
import { validateEmail, validatePassword } from '../utils/validators';
import { track } from '../utils/analytics';

type Props = {
  initialEmail?: string;
  /** Con la sesión iniciada el email es el de la cuenta y no se edita. */
  lockEmail?: boolean;
  /** Se llama con la sesión ya iniciada con la nueva contraseña. */
  onDone: () => void;
};

const RESEND_SECONDS = 60;

/**
 * Recuperación de contraseña en dos pasos: pedir código por email y fijar la
 * nueva contraseña con ese código. Al terminar, el usuario queda con sesión.
 */
export const PasswordResetForm: React.FC<Props> = ({ initialEmail = '', lockEmail = false, onDone }) => {
  const { palette } = useTheme();
  const resetPassword = useAuthStore((s) => s.resetPassword);
  const cooldown = useCooldown(RESEND_SECONDS);

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sendCode = async () => {
    const emailErr = validateEmail(email);
    if (emailErr) return setError(emailErr);
    setError('');
    setSending(true);
    try {
      await authApi.forgotPassword(email.trim());
      cooldown.start();
      setStep('code');
    } catch (e) {
      setError(apiError(e, 'No se pudo enviar el código'));
    } finally {
      setSending(false);
    }
  };

  const submit = async () => {
    if (!/^\d{6}$/.test(code.trim())) return setError('El código tiene 6 dígitos');
    const pwdErr = validatePassword(password);
    if (pwdErr) return setError(pwdErr);
    if (password !== confirmPassword) return setError('Las contraseñas no coinciden');
    setError('');
    setSaving(true);
    try {
      await resetPassword({ email, code, newPassword: password });
      track('password_reset');
      onDone();
    } catch (e) {
      setError(apiError(e, 'No se pudo cambiar la contraseña'));
    } finally {
      setSaving(false);
    }
  };

  if (step === 'email') {
    return (
      <View style={styles.form}>
        <Text variant="body" tone="secondary">
          Te enviaremos un código de 6 dígitos para elegir una contraseña nueva.
        </Text>
        <Input
          label="Email"
          placeholder="tu@email.com"
          autoCapitalize="none"
          keyboardType="email-address"
          autoComplete="email"
          value={email}
          onChangeText={setEmail}
          editable={!lockEmail}
          error={error || undefined}
        />
        <Button title="Enviarme un código" size="lg" onPress={sendCode} loading={sending} />
      </View>
    );
  }

  return (
    <View style={styles.form}>
      <View style={[styles.notice, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
        <Ionicons name="mail-outline" size={18} color={palette.accent} />
        <Text variant="caption" tone="accent" style={{ flex: 1 }}>
          Si {email.trim()} tiene cuenta, te llegará un código en unos minutos. Revisa también el spam.
        </Text>
      </View>

      <Input
        label="Código"
        placeholder="000000"
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="one-time-code"
        maxLength={6}
        value={code}
        onChangeText={(t) => setCode(t.replace(/\D/g, ''))}
        style={styles.code}
      />
      <Input
        label="Nueva contraseña"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        autoComplete="new-password"
        value={password}
        onChangeText={setPassword}
        helper="Mínimo 6 caracteres"
        trailing={
          <Pressable
            onPress={() => setShowPassword((v) => !v)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
          >
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={palette.textMuted} />
          </Pressable>
        }
      />
      <Input
        label="Repite la contraseña"
        secureTextEntry={!showPassword}
        autoCapitalize="none"
        value={confirmPassword}
        onChangeText={setConfirmPassword}
      />

      {!!error && (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {error}
        </Text>
      )}

      <Button title="Cambiar contraseña" size="lg" onPress={submit} loading={saving} />

      <View style={styles.links}>
        <Pressable
          onPress={sendCode}
          disabled={cooldown.remaining > 0 || sending}
          hitSlop={8}
          accessibilityRole="button"
        >
          <Text variant="label" tone={cooldown.remaining > 0 ? 'muted' : 'accent'} weight="semibold">
            {cooldown.remaining > 0 ? `Reenviar código (${cooldown.remaining} s)` : 'Reenviar código'}
          </Text>
        </Pressable>
        {!lockEmail && (
          <Pressable
            onPress={() => {
              setStep('email');
              setCode('');
              setError('');
            }}
            hitSlop={8}
            accessibilityRole="button"
          >
            <Text variant="label" tone="secondary">Cambiar email</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  form: { gap: spacing.lg },
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  code: { fontSize: 22, letterSpacing: 8, fontWeight: '700' },
  links: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
});
