import React, { useState, useRef } from 'react';
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
import { VerifyEmailSheet } from '../modals/VerifyEmailSheet';
import { PasswordResetSheet } from '../modals/PasswordResetSheet';
import { FinancialProfileSheet } from '../modals/FinancialProfileSheet';
import { CurrencyChangeSheet } from '../modals/CurrencyChangeSheet';
import { isMissingNativeModule, MISSING_NATIVE_MESSAGE } from '../../utils/nativeModules';
import type { SupportedCurrency } from '../../api/types';
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
import { formatMoney, todayISO } from '../../utils/format';
import { track } from '../../utils/analytics';

// Las libs nativas de file system / sharing / print no se importan directamente
// en el módulo para no romper el bundler web. Se cargan de forma dinámica dentro
// de las funciones que sólo se ejecutan en plataformas nativas.
// En web usamos APIs DOM estándar (Blob, URL.createObjectURL, iframe + print).

/** Tope de `GET /transactions?limit=` en el servidor. */
const PDF_MAX_ROWS = 500;
const PRINT_FRAME_ATTR = 'data-chillpocket-print';

/** Web: abre el diálogo de imprimir / guardar como PDF con un HTML propio. */
function printHtmlOnWeb(html: string): void {
  document.querySelectorAll(`iframe[${PRINT_FRAME_ATTR}]`).forEach((el) => el.remove());
  const iframe = document.createElement('iframe');
  iframe.setAttribute(PRINT_FRAME_ATTR, '');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0;';
  iframe.onload = () => {
    const win = iframe.contentWindow;
    // Algunos navegadores emiten antes un load de about:blank.
    if (!win || win.location.href !== 'about:srcdoc') return;
    win.addEventListener('afterprint', () => setTimeout(() => iframe.remove(), 500), { once: true });
    win.focus();
    win.print();
  };
  iframe.srcdoc = html;
  document.body.appendChild(iframe);
}

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
  const [resetSheetOpen, setResetSheetOpen] = useState(false);
  const [verifySheetOpen, setVerifySheetOpen] = useState(false);
  const [profileSheetOpen, setProfileSheetOpen] = useState(false);

  // Dos Modal a la vez fallan en iOS: se cierra uno antes de abrir el otro.
  const openResetFromPassword = () => {
    setPwdSheetOpen(false);
    setTimeout(() => setResetSheetOpen(true), 350);
  };

  const profileSummary = (() => {
    if (!user) return '';
    const parts: string[] = [];
    if (user.income_payday) parts.push(user.income_payday === 31 ? 'Cobro fin de mes' : `Cobro día ${user.income_payday}`);
    else if (user.income_reference) parts.push(`Ingreso ${formatMoney(user.income_reference, user.currency)}/mes`);
    if (user.savings_goal_monthly) parts.push(`Ahorro ${formatMoney(user.savings_goal_monthly, user.currency)}`);
    return parts.join(' · ') || 'Configurar';
  })();
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
  const [exportError, setExportError] = useState('');
  const exportOpenRef = useRef(false);
  exportOpenRef.current = exportSheetOpen;
  const reportExportError = (e: unknown, fallback: string) => {
    const message = isMissingNativeModule(e) ? MISSING_NATIVE_MESSAGE : apiError(e, fallback);
    if (exportOpenRef.current) setExportError(message);
    else toast.error(message);
  };
  const openExportSheet = () => {
    setExportError('');
    setExportSheetOpen(true);
  };

  // Cambiar la moneda convierte todos los importes (se confirma en la hoja).
  const [currencyTarget, setCurrencyTarget] = useState<SupportedCurrency | null>(null);
  const onCurrencyChange = (currency: SupportedCurrency) => {
    if (currency !== user?.currency) setCurrencyTarget(currency);
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
      const raw = await transactionsApi.exportCsv();
      // El servidor manda BOM, pero al decodificar la respuesta se pierde; sin él,
      // Excel abre los acentos mal.
      const csv = raw.charCodeAt(0) === 0xfeff ? raw : `﻿${raw}`;
      track('export', 'csv');
      const filename = `chillpocket-${todayISO()}.csv`;

      if (Platform.OS === 'web') {
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        a.style.display = 'none';
        // Firefox exige el enlace en el documento, y revocar la URL en el acto
        // puede cancelar la descarga en Safari/Firefox.
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
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
          toast.success('Exportación lista');
        } else {
          setExportError('Compartir no está disponible en este dispositivo');
        }
      }
    } catch (e) {
      reportExportError(e, 'No se pudo exportar el CSV');
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
      // Una sola petición (cuota Hostinger) con el máximo que devuelve la API. El
      // store solo guarda los 100 últimos: el PDF salía recortado sin avisar.
      const transactions = await transactionsApi.list({ limit: PDF_MAX_ROWS });
      const html = buildExportHtml(transactions, useDataStore.getState().categories, user ?? null, {
        truncated: transactions.length >= PDF_MAX_ROWS,
      });
      track('export', 'pdf');

      if (Platform.OS === 'web') {
        // expo-print en web llama a window.print() e ignora `html` (imprimiría la
        // pantalla de Ajustes): el informe se imprime desde un iframe oculto.
        setExportSheetOpen(false);
        printHtmlOnWeb(html);
      } else {
        // Nativo: genera el PDF como archivo y abre el share sheet.
        const Print = await import('expo-print');
        const Sharing = await import('expo-sharing');

        const { uri } = await Print.printToFileAsync({ html, base64: false });
        if (!(await Sharing.isAvailableAsync())) {
          setExportError('Compartir no está disponible en este dispositivo');
          return;
        }
        setExportSheetOpen(false);
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Exportar PDF',
          UTI: 'com.adobe.pdf',
        });
        toast.success('Exportación lista');
      }
    } catch (e) {
      // Si el usuario cancela el share sheet en iOS lanza un error silenciado:
      // sólo notificamos si el error no es una cancelación.
      const msg = e instanceof Error ? e.message : '';
      if (!msg.includes('cancel') && !msg.includes('Cancel') && !msg.includes('dismiss')) {
        reportExportError(e, 'No se pudo exportar el PDF');
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
            {user?.email_verified === false ? (
              <Pressable onPress={() => setVerifySheetOpen(true)} accessibilityRole="button">
                <RowAction icon="mail-unread-outline" label="Verificar email" value={user.email} />
              </Pressable>
            ) : (
              <Row label="Email" value={user?.email || ''} />
            )}
            <Pressable onPress={() => setPwdSheetOpen(true)}>
              <RowAction icon="lock-closed-outline" label="Contraseña" value="••••••••" />
            </Pressable>
          </Section>

          <Section title="Finanzas">
            <Pressable onPress={() => setProfileSheetOpen(true)} accessibilityRole="button">
              <RowAction icon="wallet-outline" label="Ingresos y ahorro" value={profileSummary} />
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
                  { value: 'MXN', label: '$ MXN' },
                ]}
                value={(user?.currency as SupportedCurrency) || 'EUR'}
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

          {user?.is_admin && (
            <Section title="Administración">
              <Pressable onPress={() => navigation.navigate('Usage')} accessibilityRole="button">
                <RowAction icon="stats-chart-outline" label="Panel de uso" value="Uso de la app y correo" />
              </Pressable>
            </Section>
          )}

          <Section title="Datos">
            <Pressable onPress={() => navigation.navigate('Categories')}>
              <RowAction icon="pricetags-outline" label="Categorías" />
            </Pressable>
            <Pressable onPress={openExportSheet}>
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
        <Pressable onPress={openResetFromPassword} hitSlop={8} accessibilityRole="button" style={styles.forgotLink}>
          <Text variant="label" tone="accent" weight="semibold">
            ¿No recuerdas la actual? Cámbiala con un código por email
          </Text>
        </Pressable>
      </Sheet>

      <PasswordResetSheet visible={resetSheetOpen} onClose={() => setResetSheetOpen(false)} />
      <VerifyEmailSheet visible={verifySheetOpen} onClose={() => setVerifySheetOpen(false)} />
      <FinancialProfileSheet visible={profileSheetOpen} onClose={() => setProfileSheetOpen(false)} />

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
        {!!exportError && (
          <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {exportError}
          </Text>
        )}
      </Sheet>

      <CurrencyChangeSheet
        visible={currencyTarget !== null}
        target={currencyTarget}
        onClose={() => setCurrencyTarget(null)}
      />

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
  forgotLink: { alignSelf: 'flex-start', paddingVertical: spacing.xs },
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
