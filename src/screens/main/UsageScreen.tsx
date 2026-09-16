import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuthStore } from '../../store/useAuthStore';
import { useTheme } from '../../theme/ThemeProvider';
import { spacing, radius } from '../../theme/spacing';
import { useContentWidth } from '../../theme/layout';
import { Text } from '../../components/Text';
import { Card } from '../../components/Card';
import { Button } from '../../components/Button';
import { ScreenHeader } from '../../components/ScreenHeader';
import { SegmentedControl } from '../../components/SegmentedControl';
import { ProgressBar } from '../../components/ProgressBar';
import { Sparkline } from '../../components/Sparkline';
import { ResponsiveGrid } from '../../components/ResponsiveGrid';
import { EmptyState } from '../../components/EmptyState';
import { ErrorState } from '../../components/ErrorState';
import { Skeleton, SkeletonChart } from '../../components/Skeleton';
import { useToast } from '../../components/Toast';
import { adminApi } from '../../api/endpoints';
import { apiError } from '../../api/http';
import type { MailTestResult, UsageReport } from '../../api/types';
import {
  dailyStats,
  formatCount,
  isMailTestResult,
  isUsageReport,
  missingMailConfig,
  planShares,
  platformShares,
  shortDay,
  splitUsageTotals,
  toNumber,
  type UsageRow,
} from '../../utils/usageReport';

type Days = 7 | 30 | 90;
type DaysOption = '7' | '30' | '90';

const PERIOD_OPTIONS: { value: DaysOption; label: string }[] = [
  { value: '7', label: '7 días' },
  { value: '30', label: '30 días' },
  { value: '90', label: '90 días' },
];

const INVALID_RESPONSE = 'Respuesta inesperada del servidor. ¿Está desplegado el backend nuevo?';

type IconName = keyof typeof Ionicons.glyphMap;

/**
 * Panel de administración: uso anónimo y agregado de la app (`GET /admin/usage`)
 * y prueba del correo SMTP (`POST /admin/mail-test`). Una petición al abrir y
 * otra al cambiar de periodo (cada periodo se guarda mientras la pantalla vive);
 * sin polling. Si el usuario no es admin, no pide nada.
 */
export const UsageScreen: React.FC = () => {
  const { palette } = useTheme();
  const toast = useToast();
  const isAdmin = useAuthStore((s) => !!s.user?.is_admin);
  const { columnStyle } = useContentWidth();

  const [days, setDays] = useState<Days>(30);
  // Estado por periodo: cambiar de pestaña no repite peticiones ya hechas.
  const [reports, setReports] = useState<Partial<Record<Days, UsageReport>>>({});
  const [loadingByDays, setLoadingByDays] = useState<Partial<Record<Days, boolean>>>({});
  const [errors, setErrors] = useState<Partial<Record<Days, string>>>({});
  const [refreshing, setRefreshing] = useState(false);
  const reportsRef = useRef(reports);
  reportsRef.current = reports;
  const inFlightRef = useRef(new Set<Days>());
  // El contexto de toasts cambia de identidad en cada render: fuera de las dependencias.
  const toastRef = useRef(toast);
  toastRef.current = toast;

  const load = useCallback(
    async (d: Days, force = false) => {
      if (!isAdmin || inFlightRef.current.has(d)) return;
      if (reportsRef.current[d] && !force) return;
      inFlightRef.current.add(d);
      setLoadingByDays((prev) => ({ ...prev, [d]: true }));
      setErrors((prev) => ({ ...prev, [d]: undefined }));
      try {
        const res = await adminApi.usage(d);
        if (!isUsageReport(res)) throw new Error(INVALID_RESPONSE);
        setReports((prev) => ({ ...prev, [d]: res }));
      } catch (e) {
        const msg = apiError(e, 'No se pudo cargar el uso de la app');
        // Con datos ya pintados, un fallo al refrescar no los tapa.
        if (reportsRef.current[d]) toastRef.current.error(msg);
        else setErrors((prev) => ({ ...prev, [d]: msg }));
      } finally {
        inFlightRef.current.delete(d);
        setLoadingByDays((prev) => ({ ...prev, [d]: false }));
      }
    },
    [isAdmin],
  );

  useEffect(() => {
    load(days);
  }, [days, load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load(days, true);
    setRefreshing(false);
  };

  const report = reports[days];
  const loading = !!loadingByDays[days];
  const error = errors[days];

  return (
    <View style={{ flex: 1, backgroundColor: palette.bgBase }}>
      <LinearGradient colors={palette.gradientApp as any} style={StyleSheet.absoluteFill} />
      <SafeAreaView style={{ flex: 1 }} edges={['top']}>
        <ScrollView
          contentContainerStyle={{ paddingBottom: spacing.xxxl }}
          showsVerticalScrollIndicator={false}
          refreshControl={
            isAdmin ? (
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={palette.accent} />
            ) : undefined
          }
        >
          <View style={columnStyle}>
            <ScreenHeader title="Uso de la app" subtitle="Datos anónimos y agregados" showBack />

            {!isAdmin ? (
              <EmptyState
                icon="lock-closed-outline"
                title="Solo para administradores"
                description="Esta sección muestra estadísticas internas de uso de ChillPocket."
              />
            ) : (
              <View style={{ paddingHorizontal: spacing.lg, gap: spacing.md }}>
                <SegmentedControl
                  options={PERIOD_OPTIONS}
                  value={String(days) as DaysOption}
                  onChange={(v) => setDays(Number(v) as Days)}
                />

                {report ? (
                  <ReportView report={report} />
                ) : loading || !error ? (
                  <UsageSkeleton />
                ) : (
                  <Card padding="md">
                    <ErrorState
                      title="No pudimos cargar el uso"
                      description={error}
                      onRetry={() => load(days, true)}
                    />
                  </Card>
                )}

                <MailTestCard />
              </View>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Informe
// ---------------------------------------------------------------------------

const ReportView: React.FC<{ report: UsageReport }> = ({ report }) => {
  const { palette } = useTheme();
  const { overview } = report;
  const { screens, actions } = useMemo(() => splitUsageTotals(report.totals), [report.totals]);
  const plans = useMemo(() => planShares(overview.plans), [overview.plans]);
  const platforms = useMemo(() => platformShares(report.by_platform), [report.by_platform]);
  const daily = useMemo(() => dailyStats(report.daily), [report.daily]);
  const series = useMemo(() => report.daily.map((d) => toNumber(d.events)), [report.daily]);
  const [chartW, setChartW] = useState(0);
  const hasEvents = screens.length > 0 || actions.length > 0 || daily.totalOpens > 0;

  return (
    <View style={{ gap: spacing.md }}>
      <Text variant="caption" tone="muted">
        Del {shortDay(report.from)} al {shortDay(report.to)} · se actualiza al abrir o al deslizar hacia abajo
      </Text>

      {/* Resumen */}
      <ResponsiveGrid columns={{ base: 2, md: 4 }} gap={spacing.md} style={{ marginBottom: -spacing.md }}>
        <StatTile icon="people-outline" label="Usuarios totales" value={formatCount(overview.users_total)} />
        <StatTile icon="person-add-outline" label="Nuevos" value={formatCount(overview.users_new)} hint="en el periodo" />
        <StatTile icon="pulse-outline" label="Activos" value={formatCount(overview.users_active)} hint="con movimientos" />
        <StatTile
          icon="shield-checkmark-outline"
          label="Verificados"
          value={`${Math.round(toNumber(overview.verified_pct))}%`}
          hint="email confirmado"
        />
      </ResponsiveGrid>

      <Card padding="md" style={{ gap: spacing.sm }}>
        <SectionTitle icon="diamond-outline" title="Usuarios por plan" />
        {plans.length === 0 ? (
          <Text variant="label" tone="muted">Sin datos de planes.</Text>
        ) : (
          plans.map((p) => (
            <BarRow key={p.key} label={p.label} pct={p.pct} detail={`${formatCount(p.value)} · ${p.pct}%`} />
          ))
        )}
      </Card>

      {!hasEvents ? (
        <Card padding="md">
          <EmptyState
            icon="analytics-outline"
            title="Aún no hay eventos"
            description="Los dispositivos envían sus contadores al pasar a segundo plano. Vuelve más tarde."
          />
        </Card>
      ) : (
        <>
          <ResponsiveGrid columns={{ base: 1, lg: 2 }} gap={spacing.md} style={{ marginBottom: -spacing.md }}>
            <RankingCard icon="eye-outline" title="Pantallas más vistas" unit={['vista', 'vistas']} rows={screens} />
            <RankingCard icon="flash-outline" title="Acciones más usadas" unit={['vez', 'veces']} rows={actions} />
          </ResponsiveGrid>

          <ResponsiveGrid columns={{ base: 1, lg: 2 }} gap={spacing.md} style={{ marginBottom: -spacing.md }}>
            <Card padding="md" style={{ gap: spacing.sm }}>
              <SectionTitle icon="phone-portrait-outline" title="Plataformas" />
              {platforms.length === 0 ? (
                <Text variant="label" tone="muted">Sin datos.</Text>
              ) : (
                platforms.map((p) => (
                  <BarRow
                    key={p.key}
                    label={p.label}
                    pct={p.pct}
                    detail={`${formatCount(p.value)} eventos · ${p.pct}%`}
                  />
                ))
              )}
            </Card>

            <Card padding="md" style={{ gap: spacing.sm }}>
              <SectionTitle icon="trending-up-outline" title="Aperturas por día" />
              <View style={styles.dailyStats}>
                <MiniStat label="Aperturas" value={formatCount(daily.totalOpens)} />
                <MiniStat
                  label="Pico"
                  value={daily.peakDay ? `${formatCount(daily.peakOpens)} (${shortDay(daily.peakDay)})` : '—'}
                />
                <MiniStat label="Usuarios/día" value={String(daily.avgUsers).replace('.', ',')} />
              </View>
              <View onLayout={(e) => setChartW(Math.floor(e.nativeEvent.layout.width))} style={{ minHeight: 64 }}>
                {chartW > 0 && series.length >= 2 ? (
                  <Sparkline data={series} width={chartW} height={64} color={palette.accent} />
                ) : (
                  <Text variant="label" tone="muted">Sin serie suficiente.</Text>
                )}
              </View>
              {report.daily.length >= 2 && (
                <View style={styles.axis}>
                  <Text variant="caption" tone="muted">{shortDay(report.daily[0].day)}</Text>
                  <Text variant="caption" tone="muted">
                    {shortDay(report.daily[report.daily.length - 1].day)}
                  </Text>
                </View>
              )}
            </Card>
          </ResponsiveGrid>
        </>
      )}
    </View>
  );
};

const RankingCard: React.FC<{
  icon: IconName;
  title: string;
  /** Singular y plural. */
  unit: [string, string];
  rows: UsageRow[];
}> = ({
  icon,
  title,
  unit,
  rows,
}) => (
  <Card padding="md" style={{ gap: spacing.sm }}>
    <SectionTitle icon={icon} title={title} />
    {rows.length === 0 ? (
      <Text variant="label" tone="muted">Sin datos en este periodo.</Text>
    ) : (
      rows.map((r) => (
        <BarRow
          key={r.key}
          label={r.label}
          pct={r.barPct}
          detail={`${formatCount(r.events)} ${unit[r.events === 1 ? 0 : 1]} · ${formatCount(r.users)} ${r.users === 1 ? 'usuario' : 'usuarios'}`}
        />
      ))
    )}
  </Card>
);

const SectionTitle: React.FC<{ icon: IconName; title: string }> = ({ icon, title }) => {
  const { palette } = useTheme();
  return (
    <View style={styles.sectionTitle}>
      <View style={[styles.sectionIcon, { backgroundColor: palette.accentSoft }]}>
        <Ionicons name={icon} size={16} color={palette.accent} />
      </View>
      <Text variant="h2">{title}</Text>
    </View>
  );
};

const BarRow: React.FC<{ label: string; pct: number; detail: string }> = ({ label, pct, detail }) => (
  <View style={{ gap: 4 }}>
    <View style={styles.barHeader}>
      <Text variant="label" weight="medium" numberOfLines={1} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text variant="caption" tone="muted" tabular>
        {detail}
      </Text>
    </View>
    <ProgressBar value={pct} />
  </View>
);

const StatTile: React.FC<{ icon: IconName; label: string; value: string; hint?: string }> = ({
  icon,
  label,
  value,
  hint,
}) => {
  const { palette } = useTheme();
  return (
    <Card padding="md" style={{ minHeight: 104 }}>
      <View style={[styles.sectionIcon, { backgroundColor: palette.accentSoft }]}>
        <Ionicons name={icon} size={16} color={palette.accent} />
      </View>
      <Text variant="caption" tone="muted" style={{ marginTop: spacing.sm }}>
        {label}
      </Text>
      <Text variant="h2" weight="bold" tabular>
        {value}
      </Text>
      {!!hint && (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      )}
    </Card>
  );
};

const MiniStat: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <View style={{ flex: 1, minWidth: 90 }}>
    <Text variant="caption" tone="muted">{label}</Text>
    <Text variant="body" weight="semibold" tabular>{value}</Text>
  </View>
);

const UsageSkeleton: React.FC = () => (
  <View style={{ gap: spacing.md }}>
    <Skeleton width={220} height={12} />
    <View style={styles.skeletonGrid}>
      {[0, 1, 2, 3].map((i) => (
        <Skeleton key={i} height={104} borderRadius={radius.lg} style={{ flexGrow: 1, flexBasis: '45%' }} />
      ))}
    </View>
    <Skeleton height={120} borderRadius={radius.lg} />
    <SkeletonChart height={160} />
  </View>
);

// ---------------------------------------------------------------------------
// Correo de prueba (diagnóstico SMTP en producción)
// ---------------------------------------------------------------------------

type MailState =
  | { phase: 'idle' }
  | { phase: 'result'; result: MailTestResult }
  | { phase: 'error'; message: string };

const MailTestCard: React.FC = () => {
  const { palette } = useTheme();
  const [sending, setSending] = useState(false);
  const [state, setState] = useState<MailState>({ phase: 'idle' });

  const send = async () => {
    setSending(true);
    try {
      const res = await adminApi.mailTest();
      if (!isMailTestResult(res)) throw new Error(INVALID_RESPONSE);
      setState({ phase: 'result', result: res });
    } catch (e) {
      setState({ phase: 'error', message: apiError(e, 'No se pudo lanzar la prueba') });
    } finally {
      setSending(false);
    }
  };

  const result = state.phase === 'result' ? state.result : null;
  const config = result?.config ?? {};
  const configKeys = Object.keys(config).sort();
  const missing = missingMailConfig(config);
  const ok = !!result?.success;

  return (
    <Card padding="md" style={{ gap: spacing.md }}>
      <SectionTitle icon="mail-outline" title="Correo (SMTP)" />
      <Text variant="label" tone="secondary">
        Envía un correo de prueba a tu email de administrador para comprobar la configuración del servidor.
      </Text>
      <Button
        title="Enviar correo de prueba"
        variant="secondary"
        onPress={send}
        loading={sending}
        leading={<Ionicons name="paper-plane-outline" size={16} color={palette.textPrimary} />}
      />

      {state.phase !== 'idle' && (
        <View
          style={[
            styles.resultBox,
            { backgroundColor: ok ? palette.successSoft : palette.dangerSoft, borderColor: ok ? palette.success : palette.danger },
          ]}
          aria-live="polite"
        >
          <View style={styles.resultHeader}>
            <Ionicons
              name={ok ? 'checkmark-circle' : 'alert-circle'}
              size={20}
              color={ok ? palette.success : palette.danger}
            />
            <Text variant="body" weight="semibold" style={{ flex: 1 }}>
              {ok
                ? result?.to
                  ? `Correo enviado a ${result.to}`
                  : 'Correo enviado'
                : state.phase === 'error'
                  ? 'No se pudo hacer la prueba'
                  : 'El servidor no pudo enviar el correo'}
            </Text>
          </View>

          {ok && (
            <Text variant="label" tone="secondary">
              Revisa la bandeja de entrada (y la carpeta de spam).
            </Text>
          )}
          {state.phase === 'error' && (
            <Text variant="label" tone="secondary" selectable>
              {state.message}
            </Text>
          )}
          {result && !ok && !!result.message && (
            <Text variant="mono" tone="secondary" selectable>
              {result.message}
            </Text>
          )}
          {result && !ok && missing.length > 0 && (
            <Text variant="label" weight="semibold" tone="danger">
              Faltan en el servidor: {missing.join(', ')}
            </Text>
          )}

          {configKeys.length > 0 && (
            <View style={styles.configRow}>
              {configKeys.map((k) => {
                const present = config[k] === true;
                return (
                  <View
                    key={k}
                    style={[styles.configChip, { backgroundColor: palette.bgSurface, borderColor: palette.borderSubtle }]}
                    accessibilityLabel={`${k}: ${present ? 'configurada' : 'falta'}`}
                  >
                    <Ionicons
                      name={present ? 'checkmark' : 'close'}
                      size={12}
                      color={present ? palette.success : palette.danger}
                    />
                    <Text variant="caption" weight="medium">{k}</Text>
                  </View>
                );
              })}
            </View>
          )}
        </View>
      )}
    </Card>
  );
};

const styles = StyleSheet.create({
  sectionTitle: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: 2 },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  barHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  dailyStats: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  axis: { flexDirection: 'row', justifyContent: 'space-between' },
  skeletonGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  resultBox: { borderWidth: 1, borderRadius: radius.md, padding: spacing.md, gap: spacing.sm },
  resultHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  configRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  configChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radius.pill,
    borderWidth: 1,
  },
});
