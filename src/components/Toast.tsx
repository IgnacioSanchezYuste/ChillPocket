import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { Animated, Platform, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { Text } from './Text';

type ToastKind = 'info' | 'success' | 'error';
type Toast = { id: number; message: string; kind: ToastKind };

type Ctx = {
  show: (message: string, kind?: ToastKind) => void;
  success: (m: string) => void;
  error: (m: string) => void;
};

const ToastContext = createContext<Ctx>({ show: () => {}, success: () => {}, error: () => {} });

// useNativeDriver no está soportado en web (rompe con un warning ruidoso)
const NATIVE_DRIVER = Platform.OS !== 'web';

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [toast, setToast] = useState<Toast | null>(null);
  const opacity = useRef(new Animated.Value(0)).current;
  const idRef = useRef(0);

  const show = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      const id = ++idRef.current;
      setToast({ id, message, kind });
      Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: NATIVE_DRIVER }).start();
      setTimeout(() => {
        Animated.timing(opacity, { toValue: 0, duration: 180, useNativeDriver: NATIVE_DRIVER }).start(() => {
          setToast((curr) => (curr?.id === id ? null : curr));
        });
      }, 3500);
    },
    [opacity]
  );

  const value: Ctx = {
    show,
    success: (m) => show(m, 'success'),
    error: (m) => show(m, 'error'),
  };

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastView toast={toast} opacity={opacity} />
    </ToastContext.Provider>
  );
};

const ToastView: React.FC<{ toast: Toast | null; opacity: Animated.Value }> = ({ toast, opacity }) => {
  const { palette } = useTheme();
  const insets = useSafeAreaInsets();
  if (!toast) return null;
  const bg =
    toast.kind === 'success' ? palette.success : toast.kind === 'error' ? palette.danger : palette.textPrimary;
  return (
    <Animated.View
      style={[styles.wrap, { opacity, top: insets.top + spacing.sm, pointerEvents: 'none' }]}
    >
      <View style={[styles.toast, { backgroundColor: bg }]}>
        <Text variant="label" weight="semibold" tone="inverted" numberOfLines={3}>
          {toast.message}
        </Text>
      </View>
    </Animated.View>
  );
};

export const useToast = () => useContext(ToastContext);

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 9999,
    elevation: 12,
  },
  toast: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    borderRadius: radius.md,
    minHeight: 44,
    justifyContent: 'center',
    maxWidth: '92%',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
});
