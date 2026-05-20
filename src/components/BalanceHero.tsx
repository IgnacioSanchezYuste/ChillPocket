import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Svg, { Circle, Path } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { Text } from './Text';
import { formatMoney } from '../utils/format';

type Props = {
  balance: number;
  income: number;
  expense: number;
  savingsRatio: number;
  savedThisMonth?: number;
  currency: string;
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
  balance,
  income,
  expense,
  savingsRatio,
  savedThisMonth = 0,
  currency,
}) => {
  const { palette } = useTheme();
  const [hidden, setHidden] = useState(false);

  const money = (v: number) => (hidden ? HIDDEN : formatMoney(v, currency));

  return (
    <LinearGradient
      colors={palette.gradientBalance as any}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, { shadowColor: palette.gradientBalance[1] }]}
    >
      {/* Patrón decorativo: blobs translúcidos tipo glow */}
      <Svg width="100%" height="100%" style={StyleSheet.absoluteFill}>
        <Circle cx="86%" cy="-6%" r="64" fill="rgba(255,255,255,0.10)" />
        <Circle cx="98%" cy="34%" r="40" fill="rgba(255,255,255,0.07)" />
        <Path
          d="M0,150 C90,120 150,200 280,160 L420,210 L0,260 Z"
          fill="rgba(255,255,255,0.06)"
        />
      </Svg>

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
          <Ionicons name={hidden ? 'eye-off-outline' : 'eye-outline'} size={15} color={WHITE_70} />
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

      {/* Tres columnas: ingresos / gastos / libre */}
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
    </LinearGradient>
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
});
