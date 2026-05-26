import 'react-native-gesture-handler';
import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { ThemeProvider, useTheme } from './src/theme/ThemeProvider';
import { ToastProvider } from './src/components/Toast';
import { ErrorBoundary } from './src/components/ErrorBoundary';
import { RootNavigator } from './src/navigation/RootNavigator';
import { usePreferencesStore } from './src/store/usePreferencesStore';
import { useSecurityStore, LOCK_BACKGROUND_GRACE_MS } from './src/store/useSecurityStore';
import { initPurchases } from './src/billing/purchases';

const Inner: React.FC = () => {
  const { mode } = useTheme();
  const hydratePrefs = usePreferencesStore((s) => s.hydrate);
  const hydrateSecurity = useSecurityStore((s) => s.hydrate);
  useEffect(() => {
    hydratePrefs();
    // Carga el estado de bloqueo desde el almacén seguro. Si está activo,
    // la app arranca "locked" → el RootNavigator muestra el LockScreen.
    hydrateSecurity();
    // Inicializa RevenueCat lo antes posible. No bloquea el arranque: el
    // wrapper es no-op si el SDK no está disponible (Expo Go, web, sin API key).
    initPurchases();
  }, [hydratePrefs, hydrateSecurity]);

  // Auto-lock cuando la app vuelve a foreground tras > LOCK_BACKGROUND_GRACE_MS.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      const sec = useSecurityStore.getState();
      if (!sec.enabled) return;
      if (state === 'background' || state === 'inactive') {
        sec.markBackground();
      } else if (state === 'active') {
        const bg = sec.lastBackgroundAt;
        if (bg && Date.now() - bg > LOCK_BACKGROUND_GRACE_MS) sec.lock();
      }
    });
    return () => sub.remove();
  }, []);
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
