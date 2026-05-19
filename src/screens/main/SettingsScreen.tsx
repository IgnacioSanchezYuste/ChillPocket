import React from 'react';
import { View, ScrollView, Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/Button';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useToast } from '../../components/Toast';
import { authApi } from '../../api/endpoints';
import { apiError } from '../../api/http';

export const SettingsScreen: React.FC = () => {
  const { palette, preference, setPreference } = useTheme();
  const navigation = useNavigation<any>();
  const { user, logout, setUser } = useAuthStore();
  const toast = useToast();

  const onCurrencyChange = async (currency: 'EUR' | 'USD' | 'GBP') => {
    try {
      const updated = await authApi.updateMe({ currency });
      if (updated) setUser(updated);
      toast.success('Moneda actualizada');
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl * 2, gap: spacing.lg }}>
        <ScreenHeader title="Ajustes" subtitle={user?.email} showBack />

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Section title="Cuenta">
            <Row label="Nombre" value={user?.name || ''} />
            <Row label="Email" value={user?.email || ''} />
          </Section>

          <Section title="Preferencias">
            <View style={{ gap: spacing.sm }}>
              <Text variant="label" tone="secondary">Moneda</Text>
              <SegmentedControl
                options={[
                  { value: 'EUR', label: '€ EUR' },
                  { value: 'USD', label: '$ USD' },
                  { value: 'GBP', label: '£ GBP' },
                ]}
                value={(user?.currency as any) || 'EUR'}
                onChange={onCurrencyChange}
              />
            </View>
            <View style={{ gap: spacing.sm }}>
              <Text variant="label" tone="secondary">Tema</Text>
              <SegmentedControl
                options={[
                  { value: 'light', label: 'Claro' },
                  { value: 'dark', label: 'Oscuro' },
                  { value: 'system', label: 'Sistema' },
                ]}
                value={preference}
                onChange={(v) => setPreference(v)}
              />
            </View>
          </Section>

          <Section title="Datos">
            <Pressable onPress={() => navigation.navigate('Categories')}>
              <Card padding="md">
                <View style={styles.row}>
                  <Ionicons name="pricetags-outline" size={20} color={palette.textSecondary} />
                  <Text variant="body" weight="medium" style={{ flex: 1 }}>Categorías</Text>
                  <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
                </View>
              </Card>
            </Pressable>
          </Section>

          <View style={{ marginTop: spacing.xl }}>
            <Button title="Cerrar sesión" variant="secondary" onPress={logout} />
          </View>
          <Text variant="caption" tone="muted" align="center">Finanzas v1.1.0</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <View style={{ gap: spacing.sm }}>
    <Text variant="label" tone="secondary" style={{ textTransform: 'uppercase' }}>
      {title}
    </Text>
    <Card>
      <View style={{ gap: spacing.lg }}>{children}</View>
    </Card>
  </View>
);

const Row: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={styles.kv}>
    <Text variant="body" tone="secondary">{label}</Text>
    <Text variant="body" weight="medium" numberOfLines={1} style={{ flex: 1, textAlign: 'right' }}>
      {value}
    </Text>
  </View>
);

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  kv: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, justifyContent: 'space-between' },
});
