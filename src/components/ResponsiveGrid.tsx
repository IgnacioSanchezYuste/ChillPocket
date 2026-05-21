import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { spacing } from '../theme/spacing';
import { useBreakpoint } from '../theme/layout';

type Cols = { base?: number; md?: number; lg?: number };

type Props = {
  children: React.ReactNode;
  /** Nº de columnas por breakpoint. Por defecto 1 en todos. */
  columns?: Cols;
  /** Separación entre celdas (px). */
  gap?: number;
  style?: ViewStyle;
};

/**
 * Rejilla responsive que REORGANIZA (no estira) sus hijos en N columnas según
 * el breakpoint. Cada hijo ocupa una celda de ancho `100/cols %` con gutter.
 * Usa la técnica de padding en celda + margen negativo en el contenedor para
 * un gutter consistente que funciona en web y nativo.
 */
export const ResponsiveGrid: React.FC<Props> = ({
  children,
  columns = { base: 1 },
  gap = spacing.md,
  style,
}) => {
  const { bp } = useBreakpoint();
  const cols =
    (bp === 'lg' ? columns.lg : bp === 'md' ? columns.md : columns.base) ??
    columns.md ??
    columns.base ??
    1;

  const items = React.Children.toArray(children);
  const half = gap / 2;

  return (
    <View style={[styles.row, { marginHorizontal: -half }, style]}>
      {items.map((child, i) => (
        <View
          key={i}
          style={{
            width: `${100 / cols}%`,
            paddingHorizontal: half,
            marginBottom: gap,
          }}
        >
          {child}
        </View>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap' },
});
