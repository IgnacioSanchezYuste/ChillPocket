import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Platform, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';

const NATIVE_DRIVER = Platform.OS !== 'web';

type SkeletonProps = {
  width?: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
};

// Bloque base con animación de "pulso" suave. Funciona en native y web.
export const Skeleton: React.FC<SkeletonProps> = ({
  width = '100%',
  height = 14,
  borderRadius = 6,
  style,
}) => {
  const { palette } = useTheme();
  const opacity = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(opacity, { toValue: 0.5, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        { width, height, borderRadius, backgroundColor: palette.bgElevated, opacity },
        style,
      ]}
    />
  );
};

// Skeleton tipo "fila de transacción": punto + 2 líneas + importe.
export const SkeletonTransactionRow: React.FC = () => {
  const { palette } = useTheme();
  return (
    <View style={[styles.row, { borderBottomColor: palette.borderSubtle }]}>
      <Skeleton width={8} height={8} borderRadius={4} />
      <View style={{ flex: 1, gap: 6 }}>
        <Skeleton width={'60%'} height={14} />
        <Skeleton width={'40%'} height={11} />
      </View>
      <Skeleton width={70} height={16} />
    </View>
  );
};

// Skeleton para el card de saldo del Dashboard.
export const SkeletonBalanceCard: React.FC = () => (
  <View style={{ gap: spacing.md }}>
    <Skeleton width={120} height={12} />
    <Skeleton width={'70%'} height={32} />
    <View style={{ flexDirection: 'row', gap: spacing.md, marginTop: spacing.sm }}>
      <Skeleton width={'30%'} height={16} />
      <Skeleton width={'30%'} height={16} />
      <Skeleton width={'30%'} height={16} />
    </View>
  </View>
);

// Skeleton genérico para charts (rectángulo + leyendas).
export const SkeletonChart: React.FC<{ height?: number }> = ({ height = 180 }) => (
  <View style={{ gap: spacing.sm }}>
    <Skeleton width={'40%'} height={14} />
    <Skeleton width={'60%'} height={11} />
    <Skeleton height={height} borderRadius={radius.md} style={{ marginTop: spacing.sm }} />
  </View>
);

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
});
