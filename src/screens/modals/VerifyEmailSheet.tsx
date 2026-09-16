import React, { useEffect, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Sheet } from '../../components/Sheet';
import { Text } from '../../components/Text';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { useToast } from '../../components/Toast';
import { authApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { useAuthStore } from '../../store/useAuthStore';
import { useCooldown } from '../../hooks/useCooldown';
import { track } from '../../utils/analytics';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Por qué se pide ahora (p. ej. antes de mejorar el plan). */
  reason?: string;
  onVerified?: () => void;
};

const RESEND_SECONDS = 60;

/**
 * Confirmación del email con un código de 6 dígitos. No bloquea la app: solo se
 * exige para mejorar de plan. Al registrarse ya se envía un código, así que el
 * campo está visible desde el principio.
 */
export const VerifyEmailSheet: React.FC<Props> = ({ visible, onClose, reason, onVerified }) => {
  const { palette } = useTheme();
  const toast = useToast();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const refreshUser = useAuthStore((s) => s.refreshUser);
  const cooldown = useCooldown(RESEND_SECONDS);

  const [code, setCode] = useState('');
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!visible) return;
    setCode('');
    setError('');
  }, [visible]);

  const finish = () => {
    onClose();
    toast.success('Email verificado');
    onVerified?.();
  };

  const sendCode = async () => {
    setError('');
    setSending(true);
    try {
      const res = await authApi.sendEmailVerification();
      if (res.already_verified) {
        await refreshUser();
        finish();
        return;
      }
      setSent(true);
      cooldown.start();
    } catch (e) {
      setError(apiError(e, 'No se pudo enviar el código'));
    } finally {
      setSending(false);
    }
  };

  const verify = async () => {
    if (!/^\d{6}$/.test(code)) return setError('El código tiene 6 dígitos');
    setError('');
    setVerifying(true);
    try {
      const updated = await authApi.verifyEmail(code);
      track('email_verified');
      setUser(updated);
      finish();
    } catch (e) {
      setError(apiError(e, 'No se pudo verificar el código'));
    } finally {
      setVerifying(false);
    }
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Verifica tu email"
      footer={<Button title="Verificar" size="lg" onPress={verify} loading={verifying} />}
    >
      <View style={{ gap: spacing.lg }}>
        {!!reason && (
          <View style={[styles.notice, { backgroundColor: palette.accentSoft, borderColor: palette.accent }]}>
            <Ionicons name="shield-checkmark-outline" size={18} color={palette.accent} />
            <Text variant="caption" tone="accent" style={{ flex: 1 }}>{reason}</Text>
          </View>
        )}
        <Text variant="body" tone="secondary">
          {sent
            ? `Te hemos enviado un código a ${user?.email ?? 'tu email'}. Revisa también el spam.`
            : `Introduce el código que te enviamos a ${user?.email ?? 'tu email'} o pide uno nuevo.`}
        </Text>
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
          error={error || undefined}
        />
        <Pressable
          onPress={sendCode}
          disabled={sending || cooldown.remaining > 0}
          hitSlop={8}
          style={styles.resend}
          accessibilityRole="button"
        >
          <Ionicons
            name="refresh"
            size={16}
            color={cooldown.remaining > 0 ? palette.textMuted : palette.accent}
          />
          <Text variant="label" weight="semibold" tone={cooldown.remaining > 0 ? 'muted' : 'accent'}>
            {sending
              ? 'Enviando…'
              : cooldown.remaining > 0
              ? `Reenviar código (${cooldown.remaining} s)`
              : sent
              ? 'Reenviar código'
              : 'Enviarme un código nuevo'}
          </Text>
        </Pressable>
      </View>
    </Sheet>
  );
};

const styles = StyleSheet.create({
  notice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
  },
  code: { fontSize: 22, letterSpacing: 8, fontWeight: '700' },
  resend: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, alignSelf: 'flex-start', minHeight: 32 },
});
