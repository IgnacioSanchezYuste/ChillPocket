import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, useWindowDimensions, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing, radius } from '../theme/spacing';
import { Text } from '../components/Text';
import { Button } from '../components/Button';
import type { Rect } from '../store/useOnboardingStore';

type Props = {
  rect: Rect | null;
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  progress?: { index: number; total: number };
  nextLabel?: string;
  onNext: () => void;
  onSkip: () => void;
  secondaryLabel?: string;
  onSecondary?: () => void;
  /** Cambia para reanimar la entrada del tooltip. */
  stepKey?: string | number;
};

const DIM = 'rgba(10,10,20,0.72)';
const PAD = 8;

export const SpotlightOverlay: React.FC<Props> = ({
  rect,
  icon,
  title,
  body,
  progress,
  nextLabel = 'Siguiente',
  onNext,
  onSkip,
  secondaryLabel,
  onSecondary,
  stepKey,
}) => {
  const { palette } = useTheme();
  const { width: W, height: H } = useWindowDimensions();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    anim.setValue(0);
    Animated.timing(anim, { toValue: 1, duration: 260, useNativeDriver: true }).start();
  }, [stepKey]);

  // Hueco con padding (clamp dentro de pantalla).
  const hole = rect
    ? {
        x: Math.max(0, rect.x - PAD),
        y: Math.max(0, rect.y - PAD),
        w: rect.width + PAD * 2,
        h: rect.height + PAD * 2,
      }
    : null;

  // Coloca el tooltip arriba o abajo del hueco según haya más espacio.
  const placeBelow = hole ? hole.y + hole.h < H * 0.55 : true;

  const tooltipStyle = anim
    ? {
        opacity: anim,
        transform: [
          { translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) },
          { scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.98, 1] }) },
        ],
      }
    : {};

  const tooltip = (
    <Animated.View
      style={[
        styles.tooltip,
        { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle },
        tooltipStyle,
      ]}
    >
      <View style={styles.tipHead}>
        {icon && (
          <View style={[styles.tipIcon, { backgroundColor: palette.accentSoft }]}>
            <Ionicons name={icon} size={18} color={palette.accent} />
          </View>
        )}
        <Text variant="h2" style={{ flex: 1 }}>{title}</Text>
        {progress && (
          <Text variant="caption" tone="muted" tabular>
            {progress.index + 1}/{progress.total}
          </Text>
        )}
      </View>
      <Text variant="body" tone="secondary" style={{ marginTop: spacing.sm }}>
        {body}
      </Text>
      <View style={{ marginTop: spacing.lg, gap: spacing.sm }}>
        <Button title={nextLabel} onPress={onNext} size="lg" />
        {secondaryLabel && onSecondary && (
          <Button title={secondaryLabel} variant="ghost" onPress={onSecondary} />
        )}
        <Text variant="label" tone="muted" align="center" onPress={onSkip} style={{ paddingVertical: 6 }}>
          Saltar tutorial
        </Text>
      </View>
    </Animated.View>
  );

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {hole ? (
        <>
          {/* 4 paneles oscuros alrededor del hueco */}
          <View style={[styles.dim, { top: 0, left: 0, right: 0, height: hole.y }]} />
          <View style={[styles.dim, { top: hole.y, left: 0, width: hole.x, height: hole.h }]} />
          <View
            style={[styles.dim, { top: hole.y, left: hole.x + hole.w, right: 0, height: hole.h }]}
          />
          <View style={[styles.dim, { top: hole.y + hole.h, left: 0, right: 0, bottom: 0 }]} />
          {/* Halo del elemento resaltado */}
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              top: hole.y,
              left: hole.x,
              width: hole.w,
              height: hole.h,
              borderRadius: radius.lg,
              borderWidth: 2,
              borderColor: palette.accent,
            }}
          />
        </>
      ) : (
        <View style={[StyleSheet.absoluteFill, { backgroundColor: DIM }]} />
      )}

      {/* Tooltip */}
      <View
        pointerEvents="box-none"
        style={[
          styles.tipWrap,
          hole
            ? placeBelow
              ? { top: hole.y + hole.h + spacing.md }
              : { bottom: H - hole.y + spacing.md }
            : { top: 0, bottom: 0, justifyContent: 'center' },
          { width: Math.min(W - spacing.lg * 2, 420), left: '50%', marginLeft: -Math.min(W - spacing.lg * 2, 420) / 2 },
        ]}
      >
        {tooltip}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  dim: { position: 'absolute', backgroundColor: DIM },
  tipWrap: { position: 'absolute' },
  tooltip: {
    borderRadius: radius.xl,
    borderWidth: 1,
    padding: spacing.xl,
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 12 },
    elevation: 16,
  },
  tipHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  tipIcon: { width: 32, height: 32, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center' },
});
