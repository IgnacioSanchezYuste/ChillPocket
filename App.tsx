import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { ToastProvider } from './src/components/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { RootNavigator } from './src/navigation/RootNavigator';
import { usePreferencesStore } from './src/store/usePreferencesStore';
import { initPurchases } from './src/billing/purchases';

const Inner: React.FC = () => {
  const { mode } = useTheme();
  const hydratePrefs = usePreferencesStore((s) => s.hydrate);
  useEffect(() => {
    hydratePrefs();
    // Inicializa RevenueCat lo antes posible. No bloquea el arranque: el
    // wrapper es no-op si el SDK no está disponible (Expo Go, web, sin API key).
    initPurchases();
  }, [hydratePrefs]);
  return (
    <>
      <StatusBar style={mode === 'dark' ? 'light' : 'dark'} />
      <RootNavigator />
    </>
  );
};

export default function App() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ThemeProvider>
          <ToastProvider>
            <ErrorBoundary label="root">
              <Inner />
            </ErrorBoundary>
          </ToastProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
