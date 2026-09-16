import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { useAuthStore } from '../store/useAuthStore';
import { setUnauthorizedHandler, setPlanLimitHandler } from '../api/http';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { navigationRef } from './navigationRef';
import { OnboardingHost } from '../onboarding/OnboardingHost';
import { useSecurityStore } from '../store/useSecurityStore';
import { LockScreen } from '../screens/auth/LockScreen';
import { useOnboardingStore } from '../store/useOnboardingStore';

export const RootNavigator: React.FC = () => {
  const { mode, palette } = useTheme();
  const { token, bootstrapped, bootstrap, logout } = useAuthStore();
  const locked = useSecurityStore((s) => s.locked && s.enabled);

  useEffect(() => {
    bootstrap();
    setUnauthorizedHandler(() => {
      logout();
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // §1.4 Limpieza oportunista: si hay IDs demo persistidos de una sesión anterior
  // que crasheó y el onboarding ya está marcado como completado (active=false),
  // borrar esas entidades en silencio. Si falla la red, los IDs sobreviven hasta
  // el próximo arranque gracias a la persistencia en AsyncStorage.
  useEffect(() => {
    if (!bootstrapped || !token) return;
    const onboardingStore = useOnboardingStore.getState();
    onboardingStore.hydrateDemoIds().then(() => {
      const { demoTransactionIds, demoRecurringIds, active } = useOnboardingStore.getState();
      const hasOrphanIds = demoTransactionIds.length > 0 || demoRecurringIds.length > 0;
      if (hasOrphanIds && !active) {
        // Sesión anterior crasheó antes de borrar: limpiar en silencio.
        onboardingStore.deleteDemoData().catch(() => {
          // Sin red: reintentar en próximo arranque (IDs persisten en AsyncStorage).
        });
      }
    });
  }, [bootstrapped, token]);

  useEffect(() => {
    // Cualquier endpoint que responda 403 plan_limit_reached abre el Paywall
    // automáticamente. La pantalla que disparó la petición sigue gestionando
    // el toast/feedback local; nosotros solo presentamos la salida comercial.
    setPlanLimitHandler(() => {
      if (navigationRef.isReady()) {
        try { navigationRef.navigate('Paywall' as never); } catch { /* sin paywall montado */ }
      }
    });
  }, []);

  const navTheme =
    mode === 'dark'
      ? {
          ...DarkTheme,
          colors: {
            ...DarkTheme.colors,
            background: palette.bgBase,
            card: palette.bgSurface,
            border: palette.borderSubtle,
            text: palette.textPrimary,
            primary: palette.accent,
          },
        }
      : {
          ...DefaultTheme,
          colors: {
            ...DefaultTheme.colors,
            background: palette.bgBase,
            card: palette.bgSurface,
            border: palette.borderSubtle,
            text: palette.textPrimary,
            primary: palette.accent,
          },
        };

  if (!bootstrapped) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: palette.bgBase }}>
        <ActivityIndicator color={palette.accent} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme} ref={navigationRef}>
      {token ? <AppNavigator /> : <AuthNavigator />}
      {token && <OnboardingHost />}
      {token && locked && <LockScreen />}
    </NavigationContainer>
  );
};
