import React from 'react';
import { Image, StyleSheet, View, ImageStyle, ViewStyle } from 'react-native';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/spacing';

type Props = {
  size?: number;
  withBackground?: boolean;
  style?: ViewStyle;
};

const ICON = require('../../assets/wallet-solid.png');

export const BrandLogo: React.FC<Props> = ({ size = 32, withBackground = true, style }) => {
  const { palette } = useTheme();
  const inner = size * 0.6;
  const imageStyle: ImageStyle = { width: inner, height: inner, tintColor: palette.accent };

  if (!withBackground) {
    return <Image source={ICON} style={imageStyle} resizeMode="contain" />;
  }

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          borderRadius: Math.min(radius.lg, size / 3),
          backgroundColor: palette.accentSoft,
        },
        style,
      ]}
    >
      <Image source={ICON} style={imageStyle} resizeMode="contain" />
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
