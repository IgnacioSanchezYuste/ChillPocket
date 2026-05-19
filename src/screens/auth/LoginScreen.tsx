import React, { useState } from 'react';
import { View, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Input } from '../../components/Input';
import { Button } from '../../components/Button';
import { BrandLogo } from '../../components/BrandLogo';
import { useToast } from '../../components/Toast';
import { apiError, API_URL } from '../../api/http';

type Props = { onGoToRegister: () => void };

export const LoginScreen: React.FC<Props> = ({ onGoToRegister }) => {
  const { palette } = useTheme();
  const { login, loading } = useAuthStore();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);

  const onSubmit = async () => {
    if (!email.trim() || !password) {
      toast.error('Completa todos los campos');
      return;
    }
    try {
      await login(email.trim(), password);
    } catch (e) {
      toast.error(apiError(e, 'No se pudo iniciar sesión'));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={{ marginBottom: spacing.xxl, gap: spacing.sm }}>
            <BrandLogo size={80} style={styles.logo} />
            <Text variant="h1">Bienvenido de nuevo</Text>
            <Text variant="body" tone="secondary">
              Inicia sesión para continuar gestionando tus finanzas.
            </Text>
          </View>

          <View style={{ gap: spacing.lg }}>
            <Input
              label="Email"
              placeholder="tu@email.com"
              autoCapitalize="none"
              keyboardType="email-address"
              autoComplete="email"
              value={email}
              onChangeText={setEmail}
            />
            <Input
              label="Contraseña"
              placeholder="••••••••"
              secureTextEntry={!showPwd}
              value={password}
              onChangeText={setPassword}
              trailing={
                <Pressable onPress={() => setShowPwd((v) => !v)} hitSlop={8}>
                  <Ionicons
                    name={showPwd ? 'eye-off-outline' : 'eye-outline'}
                    size={18}
                    color={palette.textSecondary}
                  />
                </Pressable>
              }
            />
            <Button title="Iniciar sesión" loading={loading} onPress={onSubmit} size="lg" />
          </View>

          <View style={styles.footer}>
            <Text variant="body" tone="secondary">¿No tienes cuenta?</Text>
            <Pressable onPress={onGoToRegister}>
              <Text variant="body" tone="accent" weight="semibold">Regístrate</Text>
            </Pressable>
          </View>
          <Text variant="caption" tone="muted" align="center" style={{ marginTop: spacing.lg }}>
            API · {API_URL}
          </Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    paddingTop: spacing.xxxl,
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
