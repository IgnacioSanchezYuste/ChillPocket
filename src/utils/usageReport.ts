/**
 * Panel de uso (admin) — lógica pura: nombres legibles de las claves de evento
 * y preparación de los datos de `GET /admin/usage` para pintarlos.
 */
import type { MailTestResult, UsagePlatform, UsageReport } from '../api/types';

/** Claves exactas → nombre legible. Las rutas van normalizadas (`usageKey`). */
export const USAGE_LABELS: Record<string, string> = {
  // Pantallas (nombres de ruta de AppNavigator / AuthNavigator)
  'screen:home': 'Inicio',
  'screen:dashboard': 'Inicio',
  'screen:movimientos': 'Movimientos',
  'screen:transactions': 'Movimientos',
  'screen:analitica': 'Analítica',
  'screen:analytics': 'Analítica',
  'screen:mas': 'Más',
  'screen:more': 'Más',
  'screen:recurring': 'Gastos fijos',
  'screen:goals': 'Metas de ahorro',
  'screen:categories': 'Categorías',
  'screen:settings': 'Ajustes',
  'screen:budgets': 'Presupuestos',
  'screen:investments': 'Inversiones',
  'screen:networth': 'Patrimonio neto',
  'screen:paywall': 'Planes',
  'screen:daydetail': 'Detalle del día',
  'screen:usage': 'Uso de la app',
  'screen:login': 'Inicio de sesión',
  'screen:register': 'Registro',
  'screen:forgotpassword': 'Recuperar contraseña',
  // Acciones
  app_open: 'Aperturas de la app',
  'onboarding:start': 'Tutorial iniciado',
  'onboarding:finish': 'Tutorial completado',
  'onboarding:skip': 'Tutorial omitido',
  'transaction_created:expense': 'Gasto creado',
  'transaction_created:income': 'Ingreso creado',
  transaction_created: 'Movimiento creado',
  'savings_transfer:to_savings': 'Transferencia a ahorro',
  'savings_transfer:to_spending': 'Retirada de ahorro',
  transaction_updated: 'Movimiento editado',
  transaction_deleted: 'Movimiento eliminado',
  transaction_duplicated: 'Movimiento duplicado',
  receipt_uploaded: 'Ticket adjuntado',
  recurring_created: 'Gasto fijo creado',
  goal_created: 'Meta creada',
  goal_contribution: 'Aportación a una meta',
  goal_withdrawal: 'Retirada de una meta',
  budget_created: 'Presupuesto guardado',
  'balance_mode:historical': 'Cambio a "Mis ahorros"',
  filters_applied: 'Filtros avanzados aplicados',
  search_used: 'Búsqueda de movimientos',
  financial_profile_saved: 'Perfil financiero guardado',
  email_verified: 'Email verificado',
  password_reset: 'Contraseña restablecida',
  'export:csv': 'Exportación CSV',
  'export:pdf': 'Exportación PDF',
  export: 'Exportación',
  paywall_viewed: 'Planes vistos',
  upgrade_clicked: 'Clic en mejorar plan',
  purchase_started: 'Compra iniciada',
  purchase_success: 'Compra completada',
  purchase_failed: 'Compra fallida',
  plan_limit_reached: 'Límite del plan alcanzado',
  restore_purchases: 'Restaurar compras',
};

export const PLAN_LABELS: Record<string, string> = {
  free: 'Gratis',
  plus: 'Plus',
  family: 'Familia',
  pro_freelance: 'Pro Freelance',
};

/** Dimensiones conocidas (planes, funciones bloqueadas, origen del clic). */
const DIMENSION_LABELS: Record<string, string> = {
  ...PLAN_LABELS,
  advanced_analytics: 'analítica avanzada',
  export: 'exportar',
  receipt_photos: 'fotos de tickets',
  plan_badge: 'chip del plan',
};

export const PLATFORM_LABELS: Record<UsagePlatform, string> = {
  ios: 'iOS',
  android: 'Android',
  web: 'Web',
};

export const isScreenKey = (key: string) => key.startsWith('screen:');

/**
 * Nombre legible de una clave. Con dimensión desconocida usa el nombre del
 * evento y la dimensión entre paréntesis; si no hay traducción, la clave tal cual.
 */
export function usageLabel(key: string): string {
  const exact = USAGE_LABELS[key];
  if (exact) return exact;
  const sep = key.indexOf(':');
  if (sep > 0) {
    const base = key.slice(0, sep);
    const dim = key.slice(sep + 1);
    if (base === 'screen') return key;
    const baseLabel = USAGE_LABELS[base];
    if (baseLabel && dim) return `${baseLabel} (${DIMENSION_LABELS[dim] ?? dim})`;
  }
  return key;
}

export const planLabel = (code: string) => PLAN_LABELS[code] ?? code;

/** PDO puede devolver los agregados como texto: siempre a número finito. */
export function toNumber(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

export type UsageRow = { key: string; label: string; events: number; users: number; barPct: number };

/** Barras proporcionales al máximo de la lista (0-100). */
function toRows(totals: UsageReport['totals'], limit: number): UsageRow[] {
  const rows = totals
    .map((t) => ({ key: String(t.event), events: toNumber(t.events), users: toNumber(t.users) }))
    .filter((t) => t.events > 0)
    .sort((a, b) => b.events - a.events || a.key.localeCompare(b.key))
    .slice(0, limit);
  const max = rows.reduce((m, r) => Math.max(m, r.events), 0);
  return rows.map((t) => ({
    ...t,
    label: usageLabel(t.key),
    barPct: max > 0 ? Math.round((t.events / max) * 100) : 0,
  }));
}

/**
 * Separa pantallas (`screen:*`) de acciones. `app_open` va aparte (tiene su
 * propia serie diaria y aplastaría al resto de barras).
 */
export function splitUsageTotals(
  totals: UsageReport['totals'],
  limit = 10,
): { screens: UsageRow[]; actions: UsageRow[] } {
  return {
    screens: toRows(totals.filter((t) => isScreenKey(t.event)), limit),
    actions: toRows(totals.filter((t) => !isScreenKey(t.event) && t.event !== 'app_open'), limit),
  };
}

export type ShareRow<K extends string> = { key: K; label: string; value: number; pct: number };

/** Reparto porcentual (sobre el total), de mayor a menor. */
function shares<K extends string>(items: { key: K; value: number }[], label: (k: K) => string): ShareRow<K>[] {
  const clean = items.map((i) => ({ key: i.key, value: toNumber(i.value) }));
  const total = clean.reduce((sum, i) => sum + Math.max(0, i.value), 0);
  return clean
    .filter((i) => i.value > 0)
    .sort((a, b) => b.value - a.value)
    .map((i) => ({
      key: i.key,
      label: label(i.key),
      value: i.value,
      pct: total > 0 ? Math.round((i.value / total) * 100) : 0,
    }));
}

export const platformShares = (byPlatform: UsageReport['by_platform']) =>
  shares(
    byPlatform.map((p) => ({ key: p.platform, value: p.events })),
    (k) => PLATFORM_LABELS[k] ?? k,
  );

export const planShares = (plans: UsageReport['overview']['plans']) =>
  shares(plans.map((p) => ({ key: p.plan_code, value: p.users })), planLabel);

export type DailyStats = {
  totalOpens: number;
  peakOpens: number;
  peakDay: string | null;
  /** Media de usuarios únicos por día (redondeada a 1 decimal). */
  avgUsers: number;
  activeDays: number;
};

export function dailyStats(daily: UsageReport['daily']): DailyStats {
  let totalOpens = 0;
  let peakOpens = 0;
  let peakDay: string | null = null;
  let users = 0;
  let activeDays = 0;
  for (const d of daily) {
    const events = toNumber(d.events);
    totalOpens += events;
    users += toNumber(d.users);
    if (events > 0) activeDays += 1;
    if (events > peakOpens) {
      peakOpens = events;
      peakDay = d.day;
    }
  }
  const avgUsers = daily.length > 0 ? Math.round((users / daily.length) * 10) / 10 : 0;
  return { totalOpens, peakOpens, peakDay, avgUsers, activeDays };
}

/** "2026-09-16" → "16/09". */
export function shortDay(day: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(day);
  return m ? `${m[3]}/${m[2]}` : day;
}

/**
 * Imprescindibles para enviar. SMTP_PORT y SMTP_FROM tienen valor por defecto, y
 * de `litespeed_finish_request` / `fastcgi_finish_request` basta con una (según
 * el servidor): no son "faltas".
 */
const REQUIRED_MAIL_CONFIG = ['SMTP_HOST', 'SMTP_USER', 'SMTP_PASS', 'openssl'];

/** Claves imprescindibles que el servidor no encuentra. */
export function missingMailConfig(config: Record<string, boolean> | null | undefined): string[] {
  if (!config || typeof config !== 'object') return [];
  return REQUIRED_MAIL_CONFIG.filter((k) => k in config && config[k] !== true).sort();
}

/** 12345 → "12.345" (sin depender de Intl). */
export function formatCount(value: unknown): string {
  const n = Math.round(toNumber(value));
  const sign = n < 0 ? '-' : '';
  return sign + String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

/** La respuesta tiene la forma mínima para pintar el panel (evita pantallazos con HTML o `{}`). */
export function isUsageReport(value: unknown): value is UsageReport {
  return (
    isObject(value) &&
    isObject(value.overview) &&
    Array.isArray(value.overview.plans) &&
    Array.isArray(value.totals) &&
    Array.isArray(value.by_platform) &&
    Array.isArray(value.daily)
  );
}

export function isMailTestResult(value: unknown): value is MailTestResult {
  return isObject(value) && typeof value.success === 'boolean';
}
