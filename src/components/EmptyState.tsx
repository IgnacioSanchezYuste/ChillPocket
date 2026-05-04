import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import { Text } from './Text';
import { Button } from './Button';

type Props = {
  icon?: keyof typeof Ionicons.glyphMap;
  title: string;
  description?: string;
  ctaLabel?: string;
  onCta?: () => void;
};

export const EmptyState: React.FC<Props> = ({ icon = 'document-text-outline', title, description, ctaLabel, onCta }) => {
  const { palette } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle }]}>
        <Ionicons name={icon} size={28} color={palette.textMuted} />
      </View>
      <Text variant="h2" align="center">{title}</Text>
      {description && (
        <Text variant="body" tone="secondary" align="center" style={{ maxWidth: 280 }}>
          {description}
        </Text>
      )}
      {ctaLabel && onCta && (
        <View style={{ marginTop: spacing.sm, alignSelf: 'stretch' }}>
          <Button title={ctaLabel} onPress={onCta} />
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
  },
  iconWrap: {
    width: 64,
    height: 64,
    borderRadius: 32,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
});
