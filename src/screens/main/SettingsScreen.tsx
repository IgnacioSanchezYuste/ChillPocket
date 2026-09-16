import React, { useState } from 'react';
import { View, ScrollView, Pressable, StyleSheet, Platform, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../../store/useAuthStore';
import { useOnboardingStore } from '../../store/useOnboardingStore';
import { useBilling } from '../../store/useBillingStore';
import { useSecurityStore } from '../../store/useSecurityStore';
import { useDataStore } from '../../store/useDataStore';
import { SecuritySetupSheet } from '../modals/SecuritySetupSheet';
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
import { authApi, transactionsApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import { confirm } from '../../utils/confirm';
import { validateName, validatePassword } from '../../utils/validators';
import { buildExportHtml } from '../../utils/exportHtml';

// Las libs nativas de file system / sharing / print no se importan directamente
// en el módulo para no romper el bundler web. Se cargan de forma dinámica dentro
// de las funciones que sólo se ejecutan en plataformas nativas.
// En web usamos APIs DOM estándar (Blob, URL.createObjectURL, Print.printAsync).

export const SettingsScreen: React.FC = () => {
  const { palette, preference, setPreference } = useTheme();
  const navigation = useNavigation<any>();
  const { user, logout, setUser } = useAuthStore();
  const billing = useBilling();
  const security = useSecurityStore();
  const toast = useToast();

  const [securitySheetOpen, setSecuritySheetOpen] = useState(false);
  const [securityMode, setSecurityMode] = useState<'enable' | 'change' | 'disable'>('enable');
  const openSecurity = (mode: 'enable' | 'change' | 'disable') => {
    setSecurityMode(mode);
    setSecuritySheetOpen(true);
  };

  const [nameSheetOpen, setNameSheetOpen] = useState(false);
  const [pwdSheetOpen, setPwdSheetOpen] = useState(false);
  const [name, setName] = useState(user?.name || '');
  const [savingName, setSavingName] = useState(false);

  const [currentPwd, setCurrentPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');
  const [savingPwd, setSavingPwd] = useState(false);

  // Export sheet
  const [exportSheetOpen, setExportSheetOpen] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);

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

  // ──────────────────────────────────────────────────────────────
  // CSV Export
  // ──────────────────────────────────────────────────────────────
  const onExportCsv = async () => {
    if (!billing.hasFeature('export')) {
      setExportSheetOpen(false);
      navigation.navigate('Paywall', { feature: 'export' });
      return;
    }
    setExportingCsv(true);
    try {
      const csv = await transactionsApi.exportCsv();
      const filename = `chillpocket-${new Date().toISOString().slice(0, 10)}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.click();
        URL.revokeObjectURL(url);
        toast.success('Descarga iniciada');
        setExportSheetOpen(false);
      } else {
        // Nativo: escribir archivo real + share sheet.
        // Usamos expo-file-system/legacy (API estable en SDK 54 / v19).
        // El import dinámico es necesario para que Metro no intente
        // resolver el módulo nativo al compilar la versión web.
        const FileSystem = await import('expo-file-system/legacy');
        const Sharing = await import('expo-sharing');

        const uri = (FileSystem.cacheDirectory ?? '') + filename;
        await FileSystem.writeAsStringAsync(uri, csv, {
          encoding: FileSystem.EncodingType.UTF8,
        });

        const available = await Sharing.isAvailableAsync();
        if (available) {
          setExportSheetOpen(false);
          await Sharing.shareAsync(uri, {
            mimeType: 'text/csv',
            dialogTitle: 'Exportar CSV',
            UTI: 'public.comma-separated-values-text',
          });
          toast.success('Exportacion lista');
        } else {
          toast.error('Compartir no esta disponible en este dispositivo');
        }
      }
    } catch (e) {
      toast.error(apiError(e, 'No se pudo exportar el CSV'));
    } finally {
      setExportingCsv(false);
    }
  };

  // ──────────────────────────────────────────────────────────────
  // PDF Export
  // ──────────────────────────────────────────────────────────────
  const onExportPdf = async () => {
    if (!billing.hasFeature('export')) {
      setExportSheetOpen(false);
      navigation.navigate('Paywall', { feature: 'export' });
      return;
    }
    setExportingPdf(true);
    try {
      // Refrescamos datos para tener el snapshot más reciente.
      await useDataStore.getState().refreshAll(true);

      const { transactions, categories } = useDataStore.getState();
      const html = buildExportHtml(transactions, categories, user ?? null);

      if (Platform.OS === 'web') {
        // En web printAsync abre el diálogo del navegador (Imprimir / Guardar PDF).
        // El feedback visual es el propio diálogo del navegador.
        const Print = await import('expo-print');
        setExportSheetOpen(false);
        await Print.printAsync({ html });
      } else {
        // Nativo: genera el PDF como archivo y abre el share sheet.
        const Print = await import('expo-print');
        const Sharing = await import('expo-sharing');

        const { uri } = await Print.printToFileAsync({ html, base64: false });
        setExportSheetOpen(false);
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar PDF',
          UTI: 'com.adobe.pdf',
        });
        toast.success('Exportacion lista');
      }
    } catch (e) {
      // Si el usuario cancela el share sheet en iOS lanza un error silenciado:
      // sólo notificamos si el error no es una cancelación.
      const msg = e instanceof Error ? e.message : '';
      if (!msg.includes('cancel') && !msg.includes('Cancel') && !msg.includes('dismiss')) {
        toast.error(apiError(e, 'No se pudo exportar el PDF'));
      }
    } finally {
      setExportingPdf(false);
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

          <Section title="Seguridad">
            <Pressable onPress={() => openSecurity(security.enabled ? 'disable' : 'enable')}>
              <RowAction
                icon={security.enabled ? 'lock-closed-outline' : 'lock-open-outline'}
                label="Bloqueo con biometría / PIN"
                value={security.enabled ? 'Activado' : 'Desactivado'}
              />
            </Pressable>
            {security.enabled && (
              <Pressable onPress={() => openSecurity('change')}>
                <RowAction icon="keypad-outline" label="Cambiar PIN" />
              </Pressable>
            )}
          </Section>

          <Section title="Suscripción">
            <Pressable onPress={() => navigation.navigate('Paywall')}>
              <RowAction
                icon="sparkles-outline"
                label="Tu plan"
                value={
                  billing.isEarlyAdopter
                    ? `${billing.planName} · Early adopter`
                    : billing.planName
                }
              />
            </Pressable>
          </Section>

          <Section title="Datos">
            <Pressable onPress={() => navigation.navigate('Categories')}>
              <RowAction icon="pricetags-outline" label="Categorías" />
            </Pressable>
            <Pressable onPress={() => setExportSheetOpen(true)}>
              <RowAction
                icon="download-outline"
                label="Exportar mis datos"
                value={billing.hasFeature('export') ? 'CSV / PDF' : 'Plus'}
              />
            </Pressable>
            <Pressable onPress={() => { navigation.navigate('Tabs'); useOnboardingStore.getState().restart(); }}>
              <RowAction icon="sparkles-outline" label="Ver tutorial de nuevo" />
            </Pressable>
          </Section>

          <View style={{ marginTop: spacing.xl }}>
            <Button title="Cerrar sesión" variant="secondary" onPress={onLogout} />
          </View>
          <Text variant="caption" tone="muted" align="center">ChillPocket v1.4.0</Text>
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
          helper="Minimo 6 caracteres"
        />
        <Input
          label="Repetir nueva"
          secureTextEntry
          value={confirmPwd}
          onChangeText={setConfirmPwd}
          autoCapitalize="none"
        />
      </Sheet>

      {/* Sheet de seleccion de formato de exportacion */}
      <Sheet
        visible={exportSheetOpen}
        onClose={() => setExportSheetOpen(false)}
        title="Exportar mis datos"
      >
        <ExportOption
          icon="document-text-outline"
          title="CSV"
          description="Datos crudos para Excel, Google Sheets o tu gestor."
          loading={exportingCsv}
          disabled={exportingCsv || exportingPdf}
          onPress={onExportCsv}
        />
        <ExportOption
          icon="document-outline"
          title="PDF"
          description="Resumen visual con tabla, agrupado por mes. Para guardar o imprimir."
          loading={exportingPdf}
          disabled={exportingCsv || exportingPdf}
          onPress={onExportPdf}
        />
      </Sheet>

      <SecuritySetupSheet
        visible={securitySheetOpen}
        mode={securityMode}
        onClose={() => setSecuritySheetOpen(false)}
      />
    </SafeAreaView>
  );
};

// ──────────────────────────────────────────────────────────────
// Sub-componentes locales
// ──────────────────────────────────────────────────────────────

const ExportOption: React.FC<{
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  description: string;
  loading: boolean;
  disabled: boolean;
  onPress: () => void;
}> = ({ icon, title, description, loading, disabled, onPress }) => {
  const { palette } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.exportOption,
        {
          backgroundColor: palette.bgElevated,
          borderColor: palette.borderSubtle,
          opacity: disabled ? 0.6 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <View style={[styles.exportIconWrap, { backgroundColor: palette.accentSoft }]}>
        {loading ? (
          <ActivityIndicator size="small" color={palette.accent} />
        ) : (
          <Ionicons name={icon} size={22} color={palette.accent} />
        )}
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="body" weight="semibold">{title}</Text>
        <Text variant="caption" tone="secondary">{description}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={palette.textMuted} />
    </Pressable>
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
  exportOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: 12,
    borderWidth: 1,
  },
  exportIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
