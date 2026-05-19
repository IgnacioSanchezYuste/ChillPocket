import React, { useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Share, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/useAuthStore';
import { useDataStore } from '../../store/useDataStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing } from '../../theme/spacing';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { ScreenHeader } from '../../components/ScreenHeader';
import { Button } from '../../components/Button';
import { Input } from '../../components/Input';
import { Sheet } from '../../components/Sheet';
import { SegmentedControl } from '../../components/SegmentedControl';
import { useToast } from '../../components/Toast';
import { authApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { confirm } from '../../utils/confirm';
import { validateName, validatePassword } from '../../utils/validators';

export const SettingsScreen: React.FC = () => {
  const { palette, preference, setPreference } = useTheme();
  const navigation = useNavigation<any>();
  const { user, logout, setUser } = useAuthStore();
  const store = useDataStore();
  const toast = useToast();

  const [nameSheetOpen, setNameSheetOpen] = useState(false);
  const [pwdSheetOpen, setPwdSheetOpen] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  const [exporting, setExporting] = useState(false);

  const onCurrencyChange = async (currency: 'EUR' | 'USD' | 'GBP') => {
    try {
      const updated = await authApi.updateMe({ currency });
      if (updated) setUser(updated);
      toast.success('Moneda actualizada');
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const onSaveName = async () => {
    const err = validateName(name);
    if (err) return toast.error(err);
    setSavingName(true);
    try {
      const updated = await authApi.updateMe({ name: name.trim() });
      if (updated) setUser(updated);
      toast.success('Nombre actualizado');
      setNameSheetOpen(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingName(false);
    }
  };

  const onSavePassword = async () => {
    if (!currentPwd) return toast.error('Indica tu contraseña actual');
    const err = validatePassword(newPwd);
    if (err) return toast.error(err);
    if (newPwd !== confirmPwd) return toast.error('La nueva contraseña no coincide');
    if (currentPwd === newPwd) return toast.error('La nueva contraseña debe ser distinta');
    setSavingPwd(true);
    try {
      await authApi.changePassword(currentPwd, newPwd);
      toast.success('Contraseña actualizada');
      setCurrentPwd('');
      setNewPwd('');
      setConfirmPwd('');
      setPwdSheetOpen(false);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSavingPwd(false);
    }
  };

  const onExport = async () => {
    setExporting(true);
    try {
      // Aseguramos que tenemos datos recientes
      await store.refreshAll(true);
      const snap = useDataStore.getState();
      const payload = {
        exported_at: new Date().toISOString(),
        user: { name: user?.name, email: user?.email, currency: user?.currency },
        transactions: snap.transactions,
        recurring: snap.recurring,
        goals: snap.goals,
        budgets: snap.budgets,
        categories: snap.categories,
      };
      const json = JSON.stringify(payload, null, 2);
      if (Platform.OS === 'web') {
        // Descarga directa
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finanzas-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Descarga iniciada');
      } else {
        await Share.share({ message: json, title: 'Backup Finanzas' });
      }
    } catch (e) {
      toast.error(apiError(e, 'No se pudo exportar'));
    } finally {
      setExporting(false);
    }
  };

  const onLogout = async () => {
    const ok = await confirm({
      title: 'Cerrar sesión',
      message: 'Tendrás que iniciar sesión de nuevo para acceder.',
      confirmLabel: 'Cerrar sesión',
      destructive: true,
    });
    if (!ok) return;
    await logout();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: palette.bgBase }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: spacing.xxxl * 2, gap: spacing.lg }}>
        <ScreenHeader title="Ajustes" subtitle={user?.email} showBack />

        <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
          <Section title="Cuenta">
            <Pressable onPress={() => { setName(user?.name || ''); setNameSheetOpen(true); }}>
              <RowAction icon="person-outline" label="Nombre" value={user?.name || ''} />
            </Pressable>
            <Row label="Email" value={user?.email || ''} />
            <Pressable onPress={() => setPwdSheetOpen(true)}>
              <RowAction icon="lock-closed-outline" label="Contraseña" value="••••••••" />
            </Pressable>
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
              <RowAction icon="pricetags-outline" label="Categorías" />
            </Pressable>
            <Pressable onPress={onExport} disabled={exporting}>
              <RowAction
                icon="download-outline"
                label="Exportar mis datos"
                value={exporting ? 'Generando…' : 'JSON'}
              />
            </Pressable>
          </Section>

          <View style={{ marginTop: spacing.xl }}>
            <Button title="Cerrar sesión" variant="secondary" onPress={onLogout} />
          </View>
          <Text variant="caption" tone="muted" align="center">Finanzas v1.1.0</Text>
        </View>
      </ScrollView>

      {/* Sheet editar nombre */}
      <Sheet
        visible={nameSheetOpen}
        onClose={() => setNameSheetOpen(false)}
        title="Editar nombre"
        footer={<Button title="Guardar" onPress={onSaveName} loading={savingName} size="lg" />}
      >
        <Input label="Nombre" value={name} onChangeText={setName} placeholder="Tu nombre" />
      </Sheet>

      {/* Sheet cambiar contraseña */}
      <Sheet
        visible={pwdSheetOpen}
        onClose={() => setPwdSheetOpen(false)}
        title="Cambiar contraseña"
        footer={<Button title="Actualizar" onPress={onSavePassword} loading={savingPwd} size="lg" />}
      >
        <Input
          label="Contraseña actual"
          secureTextEntry
          value={currentPwd}
          onChangeText={setCurrentPwd}
          autoCapitalize="none"
        />
        <Input
          label="Nueva contraseña"
          secureTextEntry
          value={newPwd}
          onChangeText={setNewPwd}
          autoCapitalize="none"
          helper="Mínimo 6 caracteres"
        />
        <Input
          label="Repetir nueva"
          secureTextEntry
          value={confirmPwd}
          onChangeText={setConfirmPwd}
          autoCapitalize="none"
        />
      </Sheet>
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

const RowAction: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value?: string;
}> = ({ icon, label, value }) => {
  const { palette } = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.iconWrap, { backgroundColor: palette.accentSoft }]}>
        <Ionicons name={icon} size={16} color={palette.accent} />
      </View>
      <Text variant="body" weight="medium" style={{ flex: 1 }}>{label}</Text>
      {!!value && (
        <Text variant="caption" tone="muted" numberOfLines={1} style={{ maxWidth: 160 }}>
          {value}
        </Text>
      )}
      <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
    </View>
  );
};

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  iconWrap: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  kv: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, justifyContent: 'space-between' },
});
