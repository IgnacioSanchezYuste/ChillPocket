import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';

type Props = {
  value: number; // 0..100
  color?: string;
  height?: number;
};

export const ProgressBar: React.FC<Props> = ({ value, color, height = 6 }) => {
  const { palette } = useTheme();
  const pct = Math.max(0, Math.min(100, value));
  return (
    <View style={[styles.track, { backgroundColor: palette.bgElevated, height, borderRadius: height / 2 }]}>
      <View
        style={{
          width: `${pct}%`,
          height: '100%',
          backgroundColor: color || palette.accent,
          borderRadius: height / 2,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  track: { width: '100%', overflow: 'hidden' },
});
