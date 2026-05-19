import React from 'react';
import { Image, StyleSheet, View, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/spacing';

type Props = {
  size?: number;
  withBackground?: boolean;
  /**
   * Cuánto del recuadro debe ocupar el dibujo visible del icono.
   * 1 = llena el recuadro. Valores típicos: 0.85 (con fondo, deja
   * pequeño margen) o 1.05 (sin fondo, recorta un pelín los bordes
   * del PNG para que el símbolo quede a tope).
   */
  fill?: number;
  style?: ViewStyle;
};

const ICON = require('../../assets/adaptive-icon.png');

// El PNG es un adaptive-icon Android: por especificación deja un
// ~33% de "safe zone" alrededor del símbolo. Si lo pintamos al 100%,
// el dibujo aparece pequeño. Compensamos con este ratio.
const ADAPTIVE_SAFE_RATIO = 0.66;

export const BrandLogo: React.FC<Props> = ({
  size = 32,
  withBackground = true,
  fill,
  style,
}) => {
  const { palette } = useTheme();

  // Por defecto: con fondo deja un poco de margen (0.88), sin fondo
  // ocupa todo (1.0). El usuario puede sobrescribir vía `fill`.
  const fillRatio = fill ?? (withBackground ? 0.88 : 1.0);

  // Para que el SÍMBOLO interior (66% del PNG) ocupe `fillRatio` del
  // recuadro, el PNG entero debe pintarse a `fillRatio / SAFE_RATIO`.
  const imgSize = Math.round((size * fillRatio) / ADAPTIVE_SAFE_RATIO);

  const imageNode = (
    <Image
      source={ICON}
      style={{ width: imgSize, height: imgSize }}
      tintColor={palette.accent}
      resizeMode="contain"
    />
  );

  if (!withBackground) {
    return (
      <View style={[styles.center, { width: size, height: size, overflow: 'hidden' }, style]}>
        {imageNode}
      </View>
    );
  }

  return (
    <View
      style={[
        styles.center,
        {
          width: size,
          height: size,
          borderRadius: Math.min(radius.lg, size / 3),
          backgroundColor: palette.accentSoft,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      {imageNode}
    </View>
  );
};

const styles = StyleSheet.create({
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
