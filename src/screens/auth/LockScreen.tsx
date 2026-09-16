import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { BrandLogo } from '../../components/BrandLogo';
import { useSecurityStore } from '../../store/useSecurityStore';
import { useAuthStore } from '../../store/useAuthStore';
import { authenticateWithBiometric, biometricEnrolled } from '../../utils/biometric';
import { confirm } from '../../utils/confirm';

const PIN_MAX = 6;

export const LockScreen: React.FC = () => {
  const { palette } = useTheme();
  const { biometricEnabled, verifyPin, unlock } = useSecurityStore();
  const logout = useAuthStore((s) => s.logout);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  const [bioOk, setBioOk] = useState<boolean | null>(null);
  const shake = useRef(new Animated.Value(0)).current;

  // Intento biométrico automático en cuanto abrimos la pantalla, si está activado.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!biometricEnabled) { setBioOk(false); return; }
      const enrolled = await biometricEnrolled();
      if (!enrolled) { setBioOk(false); return; }
      const ok = await authenticateWithBiometric();
      if (cancelled) return;
      setBioOk(ok);
      if (ok) unlock();
    })();
    return () => { cancelled = true; };
  }, []);

  const tryUnlockWithPin = useCallback(async (current: string) => {
    const ok = await verifyPin(current);
    if (ok) {
      unlock();
    } else {
      setError(true);
      // Animación de shake del PIN.
      Animated.sequence([
        Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: -1, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 1, duration: 60, useNativeDriver: true }),
        Animated.timing(shake, { toValue: 0, duration: 60, useNativeDriver: true }),
      ]).start(() => {
        setPin('');
        setError(false);
      });
    }
  }, [verifyPin, unlock, shake]);

  const onDigit = (d: string) => {
    if (pin.length >= PIN_MAX) return;
    const next = pin + d;
    setPin(next);
    if (next.length >= 4) {
      // En cuanto haya 4 o más dígitos intenta validar (los PINs pueden ser de 4 a 6).
      tryUnlockWithPin(next);
    }
  };

  const onBackspace = () => setPin((p) => p.slice(0, -1));

  const onForgot = async () => {
    const ok = await confirm({
      title: '¿Has olvidado el PIN?',
      message: 'Tendrás que cerrar sesión y volver a iniciar. No perderás ningún dato.',
      confirmLabel: 'Cerrar sesión',
      destructive: true,
    });
    if (ok) {
      // Desactiva el lock para evitar bucle al re-loguear y cierra sesión.
      await useSecurityStore.getState().disable();
      await logout();
    }
  };

  const onTryBiometric = async () => {
    const ok = await authenticateWithBiometric();
    setBioOk(ok);
    if (ok) unlock();
  };

  return (
    <View style={[StyleSheet.absoluteFill, styles.root, { backgroundColor: palette.bgBase }]}>
      <LinearGradient colors={palette.gradientApp as any} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <View style={styles.container}>
          <View style={styles.brand}>
            <BrandLogo size={64} />
            <Text variant="h1" style={{ marginTop: spacing.md }}>Bloqueo de la app</Text>
            <Text variant="body" tone="secondary" align="center" style={{ marginTop: 4 }}>
              Introduce tu PIN para continuar
            </Text>
          </View>

          {/* Bolitas del PIN */}
          <Animated.View
            style={[
              styles.dots,
              { transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-8, 8] }) }] },
            ]}
          >
            {Array.from({ length: PIN_MAX }).map((_, i) => {
              const active = i < pin.length;
              const errColor = error ? palette.danger : palette.accent;
              return (
                <View
                  key={i}
                  style={[
                    styles.dot,
                    {
                      backgroundColor: active ? errColor : 'transparent',
                      borderColor: active ? errColor : palette.borderStrong,
                    },
                  ]}
                />
              );
            })}
          </Animated.View>

          {/* Teclado numérico */}
          <View style={styles.pad}>
            {['1','2','3','4','5','6','7','8','9'].map((d) => (
              <PadButton key={d} label={d} onPress={() => onDigit(d)} />
            ))}
            <View style={styles.padBtn}>
              {biometricEnabled && bioOk === false ? (
                <Pressable onPress={onTryBiometric} hitSlop={8} style={styles.padInner}>
                  <Ionicons name="finger-print" size={26} color={palette.accent} />
                </Pressable>
              ) : null}
            </View>
            <PadButton label="0" onPress={() => onDigit('0')} />
            <View style={styles.padBtn}>
              <Pressable onPress={onBackspace} hitSlop={8} style={styles.padInner}>
                <Ionicons name="backspace-outline" size={26} color={palette.textSecondary} />
              </Pressable>
            </View>
          </View>

          <Pressable onPress={onForgot} hitSlop={8} style={{ paddingVertical: spacing.md }}>
            <Text variant="label" tone="accent" weight="semibold">¿Has olvidado el PIN?</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    </View>
  );
};

const PadButton: React.FC<{ label: string; onPress: () => void }> = ({ label, onPress }) => {
  const { palette } = useTheme();
  return (
    <View style={styles.padBtn}>
      <Pressable
        onPress={onPress}
        android_ripple={{ color: palette.bgElevated, borderless: true, radius: 36 }}
        style={styles.padInner}
      >
        <Text variant="display" tabular>{label}</Text>
      </Pressable>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { zIndex: 2000, elevation: 2000 },
  container: { flex: 1, paddingHorizontal: spacing.xl, alignItems: 'center', justifyContent: 'space-between', paddingVertical: spacing.xl },
  brand: { alignItems: 'center', gap: 2, marginTop: spacing.xl },
  dots: { flexDirection: 'row', gap: 12, marginVertical: spacing.xl },
  dot: { width: 14, height: 14, borderRadius: 7, borderWidth: 2 },
  pad: { flexDirection: 'row', flexWrap: 'wrap', width: 280, justifyContent: 'space-between', rowGap: spacing.md },
  padBtn: { width: 80, height: 64, alignItems: 'center', justifyContent: 'center' },
  padInner: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
