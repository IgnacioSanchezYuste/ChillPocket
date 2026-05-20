import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';

export type DonutSegment = { value: number; color: string };

type Props = {
  segments: DonutSegment[];
  size?: number;
  strokeWidth?: number;
  /** Contenido centrado (total + etiqueta). */
  children?: React.ReactNode;
  trackColor?: string;
};

// Donut moderno hecho con react-native-svg: cada segmento es un arco
// dibujado con strokeDasharray/strokeDashoffset sobre un círculo.
export const DonutChart: React.FC<Props> = ({
  segments,
  size = 140,
  strokeWidth = 22,
  children,
  trackColor = 'transparent',
}) => {
  const radius = (size - strokeWidth) / 2;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, seg) => s + seg.value, 0) || 1;
  const GAP = segments.length > 1 ? 0.012 * circumference : 0; // separación sutil

  let offset = 0;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <G rotation={-90} origin={`${cx}, ${cy}`}>
          {trackColor !== 'transparent' && (
            <Circle cx={cx} cy={cy} r={radius} stroke={trackColor} strokeWidth={strokeWidth} fill="none" />
          )}
          {segments.map((seg, i) => {
            const frac = seg.value / total;
            const len = Math.max(0, frac * circumference - GAP);
            const dasharray = `${len} ${circumference - len}`;
            const circle = (
              <Circle
                key={i}
                cx={cx}
                cy={cy}
                r={radius}
                stroke={seg.color}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                strokeDasharray={dasharray}
                strokeDashoffset={-offset}
                fill="none"
              />
            );
            offset += frac * circumference;
            return circle;
          })}
        </G>
      </Svg>
      {children && <View style={[StyleSheet.absoluteFill, styles.center]}>{children}</View>}
    </View>
  );
};

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center' },
});
