import React, { useEffect } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { useAuthStore } from '../store/useAuthStore';
import { setUnauthorizedHandler } from '../api/http';
import { AuthNavigator } from './AuthNavigator';
import { AppNavigator } from './AppNavigator';
import { navigationRef } from './navigationRef';
import { OnboardingHost } from '../onboarding/OnboardingHost';

export const RootNavigator: React.FC = () => {
  const { mode, palette } = useTheme();
  const { token, bootstrapped, bootstrap, logout } = useAuthStore();

  useEffect(() => {
    bootstrap();
    setUnauthorizedHandler(() => {
      logout();
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
    </NavigationContainer>
  );
};
