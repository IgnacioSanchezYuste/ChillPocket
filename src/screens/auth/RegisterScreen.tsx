import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { BrandLogo } from '../../components/BrandLogo';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useToast } from '../../components/Toast';
import { apiError } from '../../api/http';

type Props = { onGoToLogin: () => void };

export const RegisterScreen: React.FC<Props> = ({ onGoToLogin }) => {
  const { palette } = useTheme();
  const { register, loading } = useAuthStore();
  const toast = useToast();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [currency, setCurrency] = useState<'EUR' | 'USD' | 'GBP'>('EUR');

  const onSubmit = async () => {
    if (!name.trim() || !email.trim() || password.length < 6) {
      toast.error('Revisa los campos. Contraseña mínimo 6 caracteres.');
      return;
    }
    try {
      await register({ name: name.trim(), email: email.trim(), password, currency });
    } catch (e) {
      toast.error(apiError(e, 'No se pudo crear la cuenta'));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={{ marginBottom: spacing.xxl, gap: spacing.sm }}>
            <BrandLogo size={64} style={styles.logo} />
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
            <View style={{ gap: 6 }}>
              <Text variant="label" tone="secondary">Moneda</Text>
              <SegmentedControl
                options={[
                  { value: 'EUR', label: '€ EUR' },
                  { value: 'USD', label: '$ USD' },
                  { value: 'GBP', label: '£ GBP' },
                ]}
                value={currency}
                onChange={setCurrency}
              />
            </View>

            <Button title="Crear cuenta" loading={loading} onPress={onSubmit} size="lg" />
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
});
