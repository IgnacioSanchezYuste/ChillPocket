import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../theme/ThemeProvider';
import { spacing } from '../theme/spacing';
import { Text } from './Text';
import { Button } from './Button';

type Props = {
  title: string;
  description?: string;
  onRetry: () => void;
};

// Cartel de error de red con CTA "Reintentar". Diferente de EmptyState (que es
// para cuentas nuevas sin datos), este aparece cuando la petición HTTP falla.
export const ErrorState: React.FC<Props> = ({ title, description, onRetry }) => {
  const { palette } = useTheme();
  return (
    <View style={styles.wrap}>
      <View style={[styles.iconWrap, { backgroundColor: palette.bgElevated, borderColor: palette.borderSubtle }]}>
        <Ionicons name="cloud-offline-outline" size={28} color={palette.danger} />
      </View>
      <Text variant="h2" align="center">{title}</Text>
      {description ? (
        <Text variant="body" tone="secondary" align="center" style={{ maxWidth: 280 }}>
          {description}
        </Text>
      ) : null}
      <View style={{ marginTop: spacing.sm, alignSelf: 'stretch' }}>
        <Button title="Reintentar" onPress={onRetry} variant="secondary" />
      </View>
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
