import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
  Platform,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { Text } from './Text';
import { formatMoney } from '../utils/format';

type Mode = 'month' | 'historical';

type Props = {
  mode: Mode;
  onModeChange: (mode: Mode) => void;
  currency: string;
  // Modo mes
  balance: number;
  income: number;
  expense: number;
  savingsRatio: number;
  savedThisMonth?: number;
  // Modo histórico (Mis ahorros)
  historicalAmount: number;
  /** Gasto medio mensual (de projection) para calcular runway. */
  avgMonthlyExpense?: number;
  // Tooltip educativo (la primera vez)
  showSwipeHint?: boolean;
  onDismissSwipeHint?: () => void;
};

// Texto claro fijo (la tarjeta siempre tiene fondo vibrante en ambos temas).
const WHITE = '#FFFFFF';
const WHITE_70 = 'rgba(255,255,255,0.72)';
const WHITE_55 = 'rgba(255,255,255,0.55)';
const WHITE_18 = 'rgba(255,255,255,0.18)';
const MINT = '#C8F8DC';
const PINK = '#FFD3DE';
const HIDDEN = '••••••';

export const BalanceHero: React.FC<Props> = ({
  mode,
  onModeChange,
  currency,
  balance,
  income,
  expense,
  savingsRatio,
  savedThisMonth = 0,
  historicalAmount,
  avgMonthlyExpense,
  showSwipeHint,
  onDismissSwipeHint,
}) => {
  const { palette } = useTheme();
  const [hidden, setHidden] = useState(false);

  // Animación cross-fade + ligero desplazamiento horizontal entre modos.
  const fade = useRef(new Animated.Value(mode === 'month' ? 0 : 1)).current;
  useEffect(() => {
    Animated.timing(fade, {
      toValue: mode === 'month' ? 0 : 1,
      duration: 220,
      useNativeDriver: true,
    }).start();
  }, [mode, fade]);

  // Ref del modo actual para que el PanResponder no se quede con valores obsoletos.
  const modeRef = useRef(mode);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  const panResponder = useRef(
    PanResponder.create({
      // Activa solo gestos horizontales claros (no compite con el scroll vertical).
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 12 && Math.abs(gs.dx) > Math.abs(gs.dy) * 1.5,
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -40 && modeRef.current === 'month') onModeChange('historical');
        else if (gs.dx > 40 && modeRef.current === 'historical') onModeChange('month');
      },
    }),
  ).current;

  const money = (v: number) => (hidden ? HIDDEN : formatMoney(v, currency));

  const monthOpacity = fade.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  const histOpacity = fade.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });
  const monthTx = fade.interpolate({ inputRange: [0, 1], outputRange: [0, -16] });
  const histTx = fade.interpolate({ inputRange: [0, 1], outputRange: [16, 0] });

  // Runway: cuántos meses cubre el ahorrado al ritmo del gasto medio.
  const runwayMonths = useMemo(() => {
    if (!avgMonthlyExpense || avgMonthlyExpense <= 0) return null;
    if (historicalAmount <= 0) return null;
    return historicalAmount / avgMonthlyExpense;
  }, [historicalAmount, avgMonthlyExpense]);

  const histSubtitle = useMemo(() => {
    if (historicalAmount > 0) return 'Lo que has ido guardando';
    if (historicalAmount === 0) return 'Aún no tienes ahorros acumulados';
    return 'Llevas más gastado que ahorrado';
  }, [historicalAmount]);

  // Gestos sólo en nativo — en react-native-web los táctiles son inconsistentes
  // y los dots cumplen como control alternativo.
  const handlers = Platform.OS !== 'web' ? panResponder.panHandlers : {};

  return (
    <View>
      <LinearGradient
        colors={palette.gradientBalance as any}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.card, { shadowColor: palette.gradientBalance[1] }]}
        {...handlers}
      >
        {/* Patrón decorativo */}
        <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
          <Circle cx="86%" cy="-6%" r="64" fill="rgba(255,255,255,0.10)" />
          <Circle cx="98%" cy="34%" r="40" fill="rgba(255,255,255,0.07)" />
          <Path
            d="M0,150 C90,120 150,200 280,160 L420,210 L0,260 Z"
            fill="rgba(255,255,255,0.06)"
          />
        </Svg>

        {/* Vista "Saldo del mes" (determina la altura natural) */}
        <Animated.View
          style={{ opacity: monthOpacity, transform: [{ translateX: monthTx }] }}
          pointerEvents={mode === 'month' ? 'auto' : 'none'}
        >
          {/* Cabecera: etiqueta + ojo + badge libre */}
          <View style={styles.topRow}>
            <Pressable
              onPress={() => setHidden((h) => !h)}
              hitSlop={10}
              style={styles.labelRow}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Mostrar saldo' : 'Ocultar saldo'}
            >
              <Text variant="label" style={{ color: WHITE_70 }}>
                Saldo del mes
              </Text>
              <Ionicons
                name={hidden ? 'eye-off-outline' : 'eye-outline'}
                size={15}
                color={WHITE_70}
              />
            </Pressable>

            <View style={[styles.badge, { backgroundColor: WHITE_18 }]}>
              <Ionicons name="sparkles" size={11} color={WHITE} />
              <Text variant="caption" weight="bold" style={{ color: WHITE }}>
                {Math.round(savingsRatio)}% libre
              </Text>
            </View>
          </View>

          {/* Balance principal enorme */}
          <Text variant="display" tabular style={styles.balance}>
            {money(balance)}
          </Text>

          {savedThisMonth !== 0 && (
            <View style={styles.savedRow}>
              <Ionicons name="flag" size={12} color={WHITE_70} />
              <Text variant="caption" style={{ color: WHITE_70 }}>
                {savedThisMonth >= 0 ? 'Ahorrado este mes ' : 'Retirado este mes '}
                {money(Math.abs(savedThisMonth))}
              </Text>
            </View>
          )}

          <View style={styles.cols}>
            <Col
              icon="arrow-up"
              iconColor={MINT}
              label="Ingresos"
              value={money(income)}
              valueColor={MINT}
            />
            <View style={[styles.vDivider, { backgroundColor: WHITE_18 }]} />
            <Col
              icon="arrow-down"
              iconColor={PINK}
              label="Gastos"
              value={money(expense)}
              valueColor={PINK}
            />
            <View style={[styles.vDivider, { backgroundColor: WHITE_18 }]} />
            <Col
              icon="wallet"
              iconColor={WHITE}
              label="Libre"
              value={`${Math.round(savingsRatio)}%`}
              valueColor={WHITE}
            />
          </View>
        </Animated.View>

        {/* Vista "Mis ahorros" (overlay absoluto) */}
        <Animated.View
          style={[
            StyleSheet.absoluteFill,
            styles.histLayer,
            { opacity: histOpacity, transform: [{ translateX: histTx }] },
          ]}
          pointerEvents={mode === 'historical' ? 'auto' : 'none'}
        >
          <View style={styles.topRow}>
            <Pressable
              onPress={() => setHidden((h) => !h)}
              hitSlop={10}
              style={styles.labelRow}
              accessibilityRole="button"
              accessibilityLabel={hidden ? 'Mostrar ahorros' : 'Ocultar ahorros'}
            >
              <Text variant="label" style={{ color: WHITE_70 }}>
                Mis ahorros
              </Text>
              <Ionicons
                name={hidden ? 'eye-off-outline' : 'eye-outline'}
                size={15}
                color={WHITE_70}
              />
            </Pressable>

            <View style={[styles.badge, { backgroundColor: WHITE_18 }]}>
              <Ionicons name="trending-up" size={11} color={WHITE} />
              <Text variant="caption" weight="bold" style={{ color: WHITE }}>
                Acumulado
              </Text>
            </View>
          </View>

          <Text variant="display" tabular style={styles.balance}>
            {money(historicalAmount)}
          </Text>

          <View style={styles.savedRow}>
            <Ionicons name="sparkles" size={12} color={WHITE_70} />
            <Text variant="caption" style={{ color: WHITE_70 }}>
              {histSubtitle}
            </Text>
          </View>

          {runwayMonths !== null && (
            <View style={[styles.runwayCard, { backgroundColor: WHITE_18 }]}>
              <Ionicons name="shield-checkmark" size={16} color={WHITE} />
              <View style={{ flex: 1 }}>
                <Text variant="caption" style={{ color: WHITE_55 }}>
                  Esto cubre
                </Text>
                <Text variant="body" weight="bold" tabular style={{ color: WHITE }}>
                  {runwayMonths >= 12
                    ? `${runwayMonths.toFixed(1)} meses de gastos`
                    : `${runwayMonths.toFixed(1)} meses al ritmo actual`}
                </Text>
              </View>
            </View>
          )}
        </Animated.View>
      </LinearGradient>

      {/* Dots / control alternativo (accesible y web-friendly) */}
      <View style={styles.dotsRow} accessibilityRole="tablist">
        <Dot
          active={mode === 'month'}
          label="Saldo del mes"
          onPress={() => onModeChange('month')}
          color={palette.accent}
          inactiveColor={palette.borderStrong}
        />
        <Dot
          active={mode === 'historical'}
          label="Mis ahorros"
          onPress={() => onModeChange('historical')}
          color={palette.accent}
          inactiveColor={palette.borderStrong}
        />
      </View>

      {showSwipeHint && (
        <View
          style={[
            styles.tooltip,
            { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle },
          ]}
        >
          <Ionicons name="swap-horizontal" size={16} color={palette.accent} />
          <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
            Desliza la tarjeta para ver tus ahorros acumulados
          </Text>
          <Pressable
            onPress={onDismissSwipeHint}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Cerrar pista"
          >
            <Ionicons name="close" size={16} color={palette.textMuted} />
          </Pressable>
        </View>
      )}
    </View>
  );
};

const Col: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  label: string;
  value: string;
  valueColor: string;
}> = ({ icon, iconColor, label, value, valueColor }) => (
  <View style={styles.col}>
    <View style={styles.colHead}>
      <View style={[styles.colIcon, { backgroundColor: WHITE_18 }]}>
        <Ionicons name={icon} size={11} color={iconColor} />
      </View>
      <Text variant="caption" style={{ color: WHITE_55 }} numberOfLines={1}>
        {label}
      </Text>
    </View>
    <Text variant="body" weight="bold" tabular style={{ color: valueColor }} numberOfLines={1}>
      {value}
    </Text>
  </View>
);

const Dot: React.FC<{
  active: boolean;
  label: string;
  onPress: () => void;
  color: string;
  inactiveColor: string;
}> = ({ active, label, onPress, color, inactiveColor }) => (
  <Pressable
    onPress={onPress}
    hitSlop={10}
    accessibilityRole="tab"
    accessibilityState={{ selected: active }}
    accessibilityLabel={label}
    style={[
      styles.dot,
      {
        width: active ? 22 : 8,
        backgroundColor: active ? color : inactiveColor,
      },
    ]}
  />
);

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.xl + 8,
    padding: spacing.xl,
    overflow: 'hidden',
    shadowOpacity: 0.35,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 14 },
    elevation: 12,
  },
  histLayer: {
    padding: spacing.xl,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  labelRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: radius.pill,
  },
  balance: { color: WHITE, fontSize: 38, lineHeight: 46, marginTop: spacing.sm },
  savedRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 2 },
  cols: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: spacing.lg,
  },
  col: { flex: 1, gap: 5 },
  colHead: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  colIcon: {
    width: 20,
    height: 20,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  vDivider: { width: 1, height: 36, marginHorizontal: spacing.md },
  runwayCard: {
    marginTop: spacing.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radius.md,
  },
  dotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: spacing.sm,
  },
  dot: {
    height: 8,
    borderRadius: 4,
  },
  tooltip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
    borderWidth: 1,
    marginTop: spacing.sm,
  },
});
