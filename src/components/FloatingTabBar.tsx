import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { useTheme } from '../theme/ThemeProvider';
import { radius, spacing } from '../theme/spacing';
import { Text } from './Text';
import { useSpotlightTarget } from '../onboarding/useSpotlightTarget';

type TabButtonProps = {
  routeName: string;
  label: string;
  focused: boolean;
  color: string;
  onPress: () => void;
  renderIcon?: (opts: { focused: boolean; color: string; size: number }) => React.ReactNode;
};

const TabButton: React.FC<TabButtonProps> = ({ routeName, label, focused, color, onPress, renderIcon }) => {
  const { palette } = useTheme();
  const sp = useSpotlightTarget(`tab-${routeName}`);
  return (
    <Pressable
      ref={sp.ref}
      onLayout={sp.onLayout}
      onPress={onPress}
      android_ripple={{ color: palette.bgElevated, borderless: true, radius: 36 }}
      style={styles.tab}
      accessibilityRole="button"
      accessibilityState={focused ? { selected: true } : {}}
      accessibilityLabel={label}
    >
      <View style={[styles.indicator, { backgroundColor: focused ? palette.accent : 'transparent' }]} />
      {renderIcon?.({ focused, color, size: 23 })}
      <Text variant="caption" weight={focused ? 'semibold' : 'medium'} style={{ color, marginTop: 2 }}>
        {label}
      </Text>
    </Pressable>
  );
};

// Barra inferior premium: superficie con esquinas superiores muy
// redondeadas, sombra elegante e indicador de pestaña activa.
export const FloatingTabBar: React.FC<BottomTabBarProps> = ({
  state,
  descriptors,
  navigation,
}) => {
  const { palette, mode } = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: palette.bgSurface,
          borderColor: palette.borderSubtle,
          paddingBottom: insets.bottom > 0 ? insets.bottom : spacing.sm,
          shadowColor: mode === 'dark' ? '#000' : '#1B1B2F',
        },
      ]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        const focused = state.index === index;
        const color = focused ? palette.accent : palette.textMuted;
        const label =
          typeof options.tabBarLabel === 'string'
            ? options.tabBarLabel
            : typeof options.title === 'string'
            ? options.title
            : route.name;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name as never);
          }
        };

        return (
          <TabButton
            key={route.key}
            routeName={route.name}
            label={label}
            focused={focused}
            color={color}
            onPress={onPress}
            renderIcon={options.tabBarIcon}
          />
        );
      })}
    </View>
  );
};

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: 1,
    paddingTop: spacing.sm + 2,
    paddingHorizontal: spacing.sm,
    shadowOpacity: 0.1,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: -4 },
    elevation: 16,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 1,
  },
  indicator: {
    width: 22,
    height: 3,
    borderRadius: radius.pill,
    marginBottom: 5,
  },
});
