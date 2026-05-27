import React, { useMemo, useState } from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from './Text';

type Props = {
  /** YYYY-MM-DD (inicio del rango) o null. */
  from: string | null;
  /** YYYY-MM-DD (fin del rango) o null. */
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
};

const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];
const MONTH_NAMES = [
  'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
  'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
];

function isoFrom(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseISO(s: string | null): { y: number; m: number; d: number } | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  return { y, m, d };
}

function isSameDay(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }) {
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

function compare(a: { y: number; m: number; d: number }, b: { y: number; m: number; d: number }): number {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

export const DateRangePicker: React.FC<Props> = ({ from, to, onChange }) => {
  const { palette } = useTheme();

  const fromParsed = parseISO(from);
  const toParsed = parseISO(to);
  const today = useMemo(() => {
    const t = new Date();
    return { y: t.getFullYear(), m: t.getMonth() + 1, d: t.getDate() };
  }, []);

  // Mes inicialmente visible: el del `from` si existe, si no el del `to`, si no el actual.
  const initialView = fromParsed ?? toParsed ?? today;
  const [viewYear, setViewYear] = useState(initialView.y);
  const [viewMonth, setViewMonth] = useState(initialView.m);

  const goPrev = () => {
    if (viewMonth === 1) { setViewMonth(12); setViewYear((y) => y - 1); }
    else setViewMonth((m) => m - 1);
  };
  const goNext = () => {
    if (viewMonth === 12) { setViewMonth(1); setViewYear((y) => y + 1); }
    else setViewMonth((m) => m + 1);
  };

  const cells = useMemo(() => {
    const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
    // Lunes-primer-día: getDay() devuelve 0=Domingo, lo rotamos.
    const firstWeekday = (new Date(viewYear, viewMonth - 1, 1).getDay() + 6) % 7;
    const out: (number | null)[] = [];
    for (let i = 0; i < firstWeekday; i++) out.push(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    // Rellena al final para múltiplo de 7 (rectángulo limpio).
    while (out.length % 7 !== 0) out.push(null);
    const rows: (number | null)[][] = [];
    for (let i = 0; i < out.length; i += 7) rows.push(out.slice(i, i + 7));
    return rows;
  }, [viewYear, viewMonth]);

  // Estado relativo de cada celda para pintar la sombra continua.
  const cellState = (day: number | null): {
    isFrom: boolean;
    isTo: boolean;
    isSingle: boolean;
    inRange: boolean;
    isToday: boolean;
  } => {
    if (day === null) {
      return { isFrom: false, isTo: false, isSingle: false, inRange: false, isToday: false };
    }
    const cur = { y: viewYear, m: viewMonth, d: day };
    const isToday = isSameDay(cur, today);
    if (!fromParsed && !toParsed) {
      return { isFrom: false, isTo: false, isSingle: false, inRange: false, isToday };
    }
    if (fromParsed && !toParsed) {
      const isF = isSameDay(cur, fromParsed);
      return { isFrom: isF, isTo: false, isSingle: isF, inRange: false, isToday };
    }
    if (fromParsed && toParsed) {
      const isF = isSameDay(cur, fromParsed);
      const isT = isSameDay(cur, toParsed);
      const single = isSameDay(fromParsed, toParsed) && (isF || isT);
      const between = compare(cur, fromParsed) > 0 && compare(cur, toParsed) < 0;
      return { isFrom: isF, isTo: isT, isSingle: single, inRange: between, isToday };
    }
    return { isFrom: false, isTo: false, isSingle: false, inRange: false, isToday };
  };

  const onTapDay = (day: number) => {
    const tapped = { y: viewYear, m: viewMonth, d: day };
    const iso = isoFrom(tapped.y, tapped.m, tapped.d);

    // Sin nada seleccionado o ambos ya están: empezamos rango nuevo.
    if (!fromParsed || (fromParsed && toParsed)) {
      onChange(iso, null);
      return;
    }
    // Hay `from`, falta `to`: el segundo tap completa o reinicia el rango.
    if (fromParsed && !toParsed) {
      const cmp = compare(tapped, fromParsed);
      if (cmp === 0) {
        // Mismo día: rango de 1 día (from=to).
        onChange(iso, iso);
        return;
      }
      if (cmp < 0) {
        // Tap anterior: invertimos — el nuevo from es el día tocado.
        onChange(iso, from);
        return;
      }
      onChange(from, iso);
      return;
    }
  };

  // Etiqueta legible del rango actual (para el footer del picker).
  const summary = useMemo(() => {
    if (!fromParsed && !toParsed) return 'Toca un día para empezar el rango';
    if (fromParsed && !toParsed) return `Inicio: ${from} · toca el día final`;
    if (fromParsed && toParsed && isSameDay(fromParsed, toParsed)) return `${from}`;
    return `${from} → ${to}`;
  }, [fromParsed, toParsed, from, to]);

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle },
      ]}
    >
      {/* Header: mes + flechas */}
      <View style={styles.header}>
        <Pressable
          onPress={goPrev}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Mes anterior"
          style={[styles.arrow, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}
        >
          <Ionicons name="chevron-back" size={16} color={palette.textSecondary} />
        </Pressable>
        <Text variant="body" weight="semibold">
          {MONTH_NAMES[viewMonth - 1]} {viewYear}
        </Text>
        <Pressable
          onPress={goNext}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel="Mes siguiente"
          style={[styles.arrow, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}
        >
          <Ionicons name="chevron-forward" size={16} color={palette.textSecondary} />
        </Pressable>
      </View>

      {/* Cabecera de días de la semana */}
      <View style={styles.weekHeader}>
        {WEEKDAYS.map((w) => (
          <View key={w} style={styles.cell}>
            <Text variant="caption" tone="muted" align="center">{w}</Text>
          </View>
        ))}
      </View>

      {/* Grid del mes */}
      {cells.map((row, ri) => (
        <View key={ri} style={styles.row}>
          {row.map((day, ci) => {
            const st = cellState(day);
            // Calcular si las celdas vecinas también están en el rango/endpoint,
            // para extender la "sombra" continua sin huecos visuales.
            const left = ci > 0 ? cellState(row[ci - 1]) : null;
            const right = ci < 6 ? cellState(row[ci + 1]) : null;
            const isPartOfRange = st.isFrom || st.isTo || st.inRange;
            const isLeftConnected =
              isPartOfRange &&
              !!left &&
              (left.isFrom || left.isTo || left.inRange) &&
              !st.isSingle; // un endpoint único no extiende sombra
            const isRightConnected =
              isPartOfRange &&
              !!right &&
              (right.isFrom || right.isTo || right.inRange) &&
              !st.isSingle;

            return (
              <View key={ci} style={styles.cell}>
                {day !== null && (
                  <>
                    {/* Capa de "sombra" continua: dos mitades independientes
                        para que el rango fluya entre celdas vecinas sin gaps. */}
                    {isLeftConnected && (
                      <View
                        style={[styles.shadeHalf, styles.shadeLeft, { backgroundColor: palette.accentSoft }]}
                        pointerEvents="none"
                      />
                    )}
                    {isRightConnected && (
                      <View
                        style={[styles.shadeHalf, styles.shadeRight, { backgroundColor: palette.accentSoft }]}
                        pointerEvents="none"
                      />
                    )}
                    {/* In-range puro (sin endpoint): cubre toda la celda. */}
                    {st.inRange && !st.isFrom && !st.isTo && (
                      <View
                        style={[StyleSheet.absoluteFill, { backgroundColor: palette.accentSoft }]}
                        pointerEvents="none"
                      />
                    )}
                    {/* Día clicable */}
                    <Pressable
                      onPress={() => onTapDay(day)}
                      style={styles.dayPress}
                      accessibilityRole="button"
                      accessibilityLabel={`${day} de ${MONTH_NAMES[viewMonth - 1]}`}
                    >
                      <View
                        style={[
                          styles.dayCircle,
                          (st.isFrom || st.isTo) && { backgroundColor: palette.accent },
                          st.isToday && !st.isFrom && !st.isTo && {
                            borderWidth: 1,
                            borderColor: palette.accent,
                          },
                        ]}
                      >
                        <Text
                          variant="caption"
                          weight={(st.isFrom || st.isTo) ? 'bold' : 'medium'}
                          style={{
                            color: (st.isFrom || st.isTo) ? '#fff' : palette.textPrimary,
                          }}
                        >
                          {day}
                        </Text>
                      </View>
                    </Pressable>
                  </>
                )}
              </View>
            );
          })}
        </View>
      ))}

      {/* Footer con el resumen del rango actual */}
      <View style={[styles.summary, { borderTopColor: palette.borderSubtle }]}>
        <Ionicons name="calendar-outline" size={14} color={palette.textSecondary} />
        <Text variant="caption" tone="secondary" style={{ flex: 1 }}>
          {summary}
        </Text>
        {(from || to) && (
          <Pressable onPress={() => onChange(null, null)} hitSlop={8}>
            <Text variant="caption" weight="semibold" tone="accent">
              Limpiar
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
};

const CELL_HEIGHT = 36;

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.md,
    borderWidth: 1,
    padding: spacing.md,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.sm,
  },
  arrow: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  weekHeader: {
    flexDirection: 'row',
    marginBottom: 4,
  },
  row: {
    flexDirection: 'row',
  },
  cell: {
    flex: 1,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  shadeHalf: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    width: '50%',
  },
  shadeLeft: { left: 0 },
  shadeRight: { right: 0 },
  dayPress: {
    width: CELL_HEIGHT,
    height: CELL_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayCircle: {
    width: CELL_HEIGHT - 8,
    height: CELL_HEIGHT - 8,
    borderRadius: (CELL_HEIGHT - 8) / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    marginTop: spacing.sm,
    borderTopWidth: 1,
  },
});
