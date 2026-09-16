import React, { useEffect, useRef, useState, useMemo } from 'react';
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
// Entrada radial animada (~900ms ease-out cubic): la aguja barre 0°→360°
// dibujando segmentos en orden. Re-anima cuando cambia el dataset.
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

  // "Huella" de los segmentos: cambia si values o colors cambian → re-animar.
  // Evita re-animar por una nueva referencia con los mismos datos (filtros UI).
  const sig = useMemo(
    () => segments.map((s) => `${s.value}|${s.color}`).join('~'),
    [segments],
  );

  // Animación radial 0→1 con requestAnimationFrame (mismo patrón que useCountUp).
  // Funciona en web y nativo sin reanimated/useNativeDriver.
  const [progress, setProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    setProgress(0);
    const start = Date.now();
    const duration = 900;
    const tick = () => {
      const t = Math.min((Date.now() - start) / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setProgress(eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else rafRef.current = null;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [sig]);

  // Para la animación radial, la "aguja" barre `progress * circumference`.
  // Cada segmento se dibuja desde su offset acumulado, con longitud actual =
  // min(len_final, max(0, swept - offset)).
  const swept = progress * circumference;
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
            const fullLen = Math.max(0, frac * circumference - GAP);
            const currentLen = Math.max(0, Math.min(fullLen, swept - offset));
            const dasharray = `${currentLen} ${circumference - currentLen}`;
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
