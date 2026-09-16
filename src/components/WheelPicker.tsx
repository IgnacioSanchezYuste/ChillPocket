import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  Pressable,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/spacing';
import { Text } from './Text';

export type WheelPickerItem = { label: string; value: number };

type Props = {
  items: WheelPickerItem[];
  value: number;
  onChange: (value: number) => void;
  accessibilityLabel: string;
  /** Color del fondo sobre el que se pinta (para el degradado de los bordes). */
  fadeColor?: string;
};

const ITEM_HEIGHT = 44;
const VISIBLE_HEIGHT = 198; // el central + 2 arriba + 2 abajo
const PADDING = (VISIBLE_HEIGHT - ITEM_HEIGHT) / 2;
/** Tiempo sin eventos de scroll para dar la rueda por parada. */
const SETTLE_MS = 140;

const clampIndex = (i: number, length: number) => Math.max(0, Math.min(i, length - 1));

/**
 * Selector vertical tipo rueda (iOS) sobre ScrollView.
 *
 * El valor se confirma cuando la rueda se detiene, sea cual sea la causa:
 * fin de la inercia, soltar sin inercia (que no emite onMomentumScrollEnd),
 * rueda del ratón en web (que no emite eventos de arrastre) o pulsar un valor.
 */
export const WheelPicker: React.FC<Props> = ({ items, value, onChange, accessibilityLabel, fadeColor }) => {
  const { palette } = useTheme();
  const fade = fadeColor ?? palette.bgBase;
  const scrollRef = useRef<ScrollView>(null);
  const indexOf = useCallback(
    (v: number) => Math.max(0, items.findIndex((it) => it.value === v)),
    [items],
  );

  const [activeIndex, setActiveIndex] = useState(() => indexOf(value));
  const committed = useRef(value);
  const dragging = useRef(false);
  const lastY = useRef(indexOf(value) * ITEM_HEIGHT);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearSettle = () => {
    if (settleTimer.current) clearTimeout(settleTimer.current);
    settleTimer.current = null;
  };
  useEffect(() => clearSettle, []);

  const scrollToIndex = useCallback((idx: number, animated: boolean) => {
    scrollRef.current?.scrollTo({ y: idx * ITEM_HEIGHT, animated });
  }, []);

  const select = useCallback(
    (idx: number) => {
      const next = items[clampIndex(idx, items.length)];
      if (!next) return;
      setActiveIndex(clampIndex(idx, items.length));
      if (next.value !== committed.current) {
        committed.current = next.value;
        onChange(next.value);
      }
    },
    [items, onChange],
  );

  const commitAt = useCallback(
    (offsetY: number) => {
      clearSettle();
      const idx = clampIndex(Math.round(offsetY / ITEM_HEIGHT), items.length);
      select(idx);
      // Encaja en su sitio: en web snapToInterval no siempre se respeta.
      if (Math.abs(offsetY - idx * ITEM_HEIGHT) > 1) scrollToIndex(idx, true);
    },
    [items.length, select, scrollToIndex],
  );

  // Si el valor cambia desde fuera, recoloca la rueda sin animación.
  useEffect(() => {
    if (value === committed.current) return;
    committed.current = value;
    const idx = indexOf(value);
    setActiveIndex(idx);
    scrollToIndex(idx, false);
  }, [value, indexOf, scrollToIndex]);

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    const y = e.nativeEvent.contentOffset.y;
    lastY.current = y;
    const idx = clampIndex(Math.round(y / ITEM_HEIGHT), items.length);
    setActiveIndex((prev) => (prev === idx ? prev : idx));
    clearSettle();
    settleTimer.current = setTimeout(() => {
      if (!dragging.current) commitAt(y);
    }, SETTLE_MS);
  };

  const onScrollEndDrag = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    dragging.current = false;
    const y = e.nativeEvent.contentOffset.y;
    // Si viene inercia, los siguientes onScroll reprogramarán el temporizador.
    clearSettle();
    settleTimer.current = setTimeout(() => commitAt(y), SETTLE_MS);
  };

  // En web no hay eventos de arrastre: los toques marcan cuándo hay un dedo
  // encima para no confirmar (ni recolocar) el valor a mitad de gesto.
  const onTouchStart = () => {
    dragging.current = true;
    clearSettle();
  };
  const onTouchEnd = () => {
    dragging.current = false;
    clearSettle();
    settleTimer.current = setTimeout(() => commitAt(lastY.current), SETTLE_MS);
  };

  const current = items[activeIndex];

  return (
    <View
      style={[styles.container, { borderColor: palette.borderSubtle }]}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={accessibilityLabel}
      aria-valuetext={current?.label ?? ''}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      onAccessibilityAction={(e) => {
        const idx = activeIndex + (e.nativeEvent.actionName === 'increment' ? 1 : -1);
        select(idx);
        scrollToIndex(clampIndex(idx, items.length), true);
      }}
    >
      <View pointerEvents="none" style={[styles.rail, { top: PADDING, borderColor: palette.borderSubtle }]} />
      <View
        pointerEvents="none"
        style={[styles.rail, { top: PADDING + ITEM_HEIGHT, borderColor: palette.borderSubtle }]}
      />
      <LinearGradient
        pointerEvents="none"
        colors={[fade, 'transparent'] as [string, string]}
        style={[styles.fade, { top: 0 }]}
      />

      <ScrollView
        ref={scrollRef}
        style={{ height: VISIBLE_HEIGHT }}
        contentContainerStyle={{ paddingVertical: PADDING }}
        contentOffset={{ x: 0, y: indexOf(value) * ITEM_HEIGHT }}
        onLayout={() => scrollToIndex(indexOf(committed.current), false)}
        showsVerticalScrollIndicator={false}
        // Va dentro de otro ScrollView vertical: sin esto Android no le pasa el gesto.
        nestedScrollEnabled
        snapToInterval={ITEM_HEIGHT}
        decelerationRate="fast"
        scrollEventThrottle={16}
        onScroll={onScroll}
        onScrollBeginDrag={() => {
          dragging.current = true;
          clearSettle();
        }}
        onScrollEndDrag={onScrollEndDrag}
        onMomentumScrollEnd={(e) => commitAt(e.nativeEvent.contentOffset.y)}
      >
        {items.map((item, idx) => {
          const selected = idx === activeIndex;
          return (
            <Pressable
              key={item.value}
              style={styles.item}
              onPress={() => {
                select(idx);
                scrollToIndex(idx, true);
              }}
              importantForAccessibility="no"
            >
              <Text
                variant={selected ? 'h2' : 'body'}
                weight={selected ? 'bold' : 'regular'}
                style={{
                  color: selected ? palette.accent : palette.textSecondary,
                  opacity: selected ? 1 : 0.45,
                }}
              >
                {item.label}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      <LinearGradient
        pointerEvents="none"
        colors={['transparent', fade] as [string, string]}
        style={[styles.fade, { bottom: 0 }]}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: radius.lg,
    borderWidth: 1,
    overflow: 'hidden',
    position: 'relative',
  },
  item: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rail: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    borderTopWidth: 1,
    zIndex: 2,
  },
  fade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: PADDING,
    zIndex: 3,
  },
});
