import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import { Text } from './Text';

type Props = {
  title: string;
  subtitle?: string;
  right?: React.ReactNode;
  showBack?: boolean;
};

export const ScreenHeader: React.FC<Props> = ({ title, subtitle, right, showBack }) => {
  const { palette } = useTheme();
  const navigation = useNavigation<any>();
  const canGoBack = showBack && navigation.canGoBack?.();

  return (
    <View style={styles.wrap}>
      {canGoBack && (
        <Pressable onPress={() => navigation.goBack()} hitSlop={10} style={styles.back}>
          <Ionicons name="chevron-back" size={22} color={palette.textPrimary} />
        </Pressable>
      )}
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="h1">{title}</Text>
        {subtitle && (
          <Text variant="label" tone="secondary">
            {subtitle}
          </Text>
        )}
      </View>
      {right}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.lg,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.md,
  },
  back: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: -2,
  },
});
