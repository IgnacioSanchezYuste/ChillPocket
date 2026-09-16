import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, Easing } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

/**
 * Animación de confetti que se dispara al hacer visible=true.
 * Usa Animated clásico de react-native (no reanimated) para garantizar
 * compatibilidad total con react-native-web sin useNativeDriver warnings.
 *
 * Se eligió Animated clásico sobre reanimated porque:
 * - Las piezas de confetti son Views simples, no SVG.
 * - En web, reanimated tiene limitaciones con useNativeDriver=true sobre Views.
 * - Animated con useNativeDriver=false funciona en ambas plataformas sin ajustes.
 *
 * El componente se auto-oculta tras la animación (visible internamente → false).
 */

const PIECE_COUNT = 36;
const DURATION = 2200;

type Piece = {
  x: Animated.Value;
  y: Animated.Value;
  rotation: Animated.Value;
  opacity: Animated.Value;
  scale: Animated.Value;
  color: string;
  size: number;
  shape: 'rect' | 'circle';
  startX: number;
};

type Props = {
  visible: boolean;
};

export const Confetti: React.FC<Props> = ({ visible }) => {
  const { palette } = useTheme();
  const piecesRef = useRef<Piece[] | null>(null);
  const animatingRef = useRef(false);

  // Colores del design system — sin hardcoding ajeno a la paleta.
  const colors = [
    palette.accent,
    palette.success,
    palette.warning,
    palette.danger,
  ];

  // Inicializa las piezas una sola vez; cambian de posición en cada disparo.
  if (!piecesRef.current) {
    piecesRef.current = Array.from({ length: PIECE_COUNT }, (_, i) => ({
      x: new Animated.Value(0),
      y: new Animated.Value(0),
      rotation: new Animated.Value(0),
      opacity: new Animated.Value(0),
      scale: new Animated.Value(0),
      color: colors[i % colors.length],
      size: 6 + (i % 4) * 2, // 6, 8, 10 ó 12 px
      shape: i % 3 === 0 ? 'circle' : 'rect',
      // Posición inicial horizontal aleatoria-ish (determinista por índice).
      startX: ((i * 37 + 13) % 280) - 140, // rango −140 … +140
    }));
  }

  const pieces = piecesRef.current;

  useEffect(() => {
    if (!visible || animatingRef.current) return;
    animatingRef.current = true;

    // Reiniciar valores antes de animar.
    pieces.forEach((p, i) => {
      p.x.setValue(p.startX);
      p.y.setValue(-20);
      p.rotation.setValue(0);
      p.opacity.setValue(0);
      p.scale.setValue(0);
    });

    const animations = pieces.map((p, i) => {
      // Stagger ligero para que no salgan todas a la vez.
      const delay = (i % 8) * 60;

      return Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          // Aparición rápida.
          Animated.timing(p.opacity, {
            toValue: 1,
            duration: 150,
            useNativeDriver: false,
          }),
          Animated.spring(p.scale, {
            toValue: 1,
            friction: 6,
            useNativeDriver: false,
          }),
          // Caída con deriva horizontal.
          Animated.timing(p.x, {
            toValue: p.startX + ((i % 5) - 2) * 30,
            duration: DURATION - delay,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
          }),
          Animated.timing(p.y, {
            toValue: 380 + (i % 5) * 40,
            duration: DURATION - delay,
            easing: Easing.in(Easing.quad), // aceleración de gravedad
            useNativeDriver: false,
          }),
          // Rotación continua.
          Animated.timing(p.rotation, {
            toValue: ((i % 2 === 0 ? 1 : -1) * (2 + (i % 3))),
            duration: DURATION - delay,
            easing: Easing.linear,
            useNativeDriver: false,
          }),
          // Desvanece en la última parte.
          Animated.sequence([
            Animated.delay(DURATION * 0.6),
            Animated.timing(p.opacity, {
              toValue: 0,
              duration: (DURATION - delay) * 0.4,
              useNativeDriver: false,
            }),
          ]),
        ]),
      ]);
    });

    Animated.parallel(animations).start(() => {
      animatingRef.current = false;
    });
  }, [visible]);

  if (!visible && !animatingRef.current) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {pieces.map((p, i) => {
        const rotateDeg = p.rotation.interpolate({
          inputRange: [-4, 0, 4],
          outputRange: ['-720deg', '0deg', '720deg'],
        });

        return (
          <Animated.View
            key={i}
            style={[
              styles.piece,
              {
                width: p.size,
                height: p.shape === 'circle' ? p.size : p.size * 1.6,
                borderRadius: p.shape === 'circle' ? p.size / 2 : 2,
                backgroundColor: p.color,
                opacity: p.opacity,
                transform: [
                  { translateX: p.x },
                  { translateY: p.y },
                  { rotate: rotateDeg },
                  { scale: p.scale },
                ],
              },
            ]}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  piece: {
    position: 'absolute',
    // Centro superior de la pantalla como origen.
    top: '35%',
    left: '50%',
  },
});
