/**
 * Monitoreo de uso — lógica pura (sin React Native, con tests).
 *
 * Claves de evento, contadores por día, lotes para `POST /usage` y reglas de
 * envío. La persistencia, los disparadores y la red viven en `analytics.ts`.
 *
 * Privacidad: solo se agregan nombres de evento (con, como mucho, UNA dimensión
 * de baja cardinalidad) y contadores. Nada de importes, textos libres, emails
 * ni mensajes de error.
 */
import type { UsageBatch, UsagePlatform } from '../api/types';

// ---------------------------------------------------------------------------
// Límites (espejo de las reglas del servidor para POST /usage)
// ---------------------------------------------------------------------------

/** El servidor acepta días de hasta 7 días atrás. */
export const USAGE_MAX_DAYS_BACK = 7;
/** Máximo de nombres por lote. */
export const USAGE_MAX_KEYS_PER_BATCH = 60;
/** Cada cuenta enviada va de 1 a 500; el resto se queda para el siguiente envío. */
export const USAGE_MAX_COUNT = 500;
/** Formato de nombre que acepta el servidor. */
export const USAGE_KEY_PATTERN = /^[a-z0-9_.:-]{1,64}$/;
/** Freno local contra claves dinámicas por error (no debería alcanzarse nunca). */
export const USAGE_MAX_KEYS_PER_DAY = 200;
const MAX_KEY_LENGTH = 64;
const MAX_DIMENSION_LENGTH = 32;

// ---------------------------------------------------------------------------
// Reglas de envío (cuota Hostinger: 500 conexiones MySQL/hora compartidas)
// ---------------------------------------------------------------------------

/** Nunca más de un envío por minuto, sea cual sea el disparador. */
export const MIN_SEND_INTERVAL_MS = 60_000;
/** Con tantos eventos pendientes se envía sin esperar al segundo plano… */
export const BULK_THRESHOLD = 40;
/** …pero como mucho una vez cada 5 minutos. */
export const BULK_INTERVAL_MS = 5 * 60_000;
/** Endpoint ausente o prohibido (backend sin desplegar): no insistir en horas. */
export const LONG_BACKOFF_MS = 6 * 60 * 60_000;
/** Servidor saturado o caído: esperar un rato antes del siguiente disparador. */
export const SHORT_BACKOFF_MS = 15 * 60_000;

// ---------------------------------------------------------------------------
// Estado
// ---------------------------------------------------------------------------

export type UsageState = {
  /** Contadores pendientes de enviar: día (YYYY-MM-DD) → clave → veces. */
  pending: Record<string, Record<string, number>>;
  /**
   * Claves ya enviadas como `first_today`: día → usuario → claves. Se guarda por
   * usuario (id local, nunca se envía) para no contar dos veces al mismo
   * usuario ni dejar sin contar a otro que inicie sesión en el dispositivo.
   */
  firstSent: Record<string, Record<string, string[]>>;
  /** Último intento de envío (ms). Cuenta también los fallidos: sin bucles. */
  lastSendAt: number;
  /** No enviar antes de este instante (ms) tras ciertos errores. */
  backoffUntil: number;
};

export const emptyUsageState = (): UsageState => ({
  pending: {},
  firstSent: {},
  lastSendAt: 0,
  backoffUntil: 0,
});

// ---------------------------------------------------------------------------
// Fechas
// ---------------------------------------------------------------------------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Día local en formato YYYY-MM-DD. */
export function toDayKey(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Días naturales de `from` a `to` (negativo si `to` es anterior). NaN si no son fechas. */
export function dayDiff(from: string, to: string): number {
  if (!DAY_RE.test(from) || !DAY_RE.test(to)) return Number.NaN;
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  // En UTC para que el cambio de hora no descuadre la resta.
  return Math.round((Date.UTC(ty, tm - 1, td) - Date.UTC(fy, fm - 1, fd)) / 86_400_000);
}

// ---------------------------------------------------------------------------
// Claves
// ---------------------------------------------------------------------------

const ACCENTS: Record<string, string> = {
  á: 'a', à: 'a', ä: 'a', â: 'a',
  é: 'e', è: 'e', ë: 'e', ê: 'e',
  í: 'i', ì: 'i', ï: 'i', î: 'i',
  ó: 'o', ò: 'o', ö: 'o', ô: 'o',
  ú: 'u', ù: 'u', ü: 'u', û: 'u',
  ñ: 'n', ç: 'c',
};

/** Minúsculas, sin tildes y solo `[a-z0-9_.:-]` (lo demás pasa a `_`). */
export function normalizeKeyPart(raw: string, maxLength = MAX_KEY_LENGTH): string {
  return raw
    .toLowerCase()
    .replace(/[áàäâéèëêíìïîóòöôúùüûñç]/g, (c) => ACCENTS[c] ?? c)
    .replace(/[^a-z0-9_.:-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, maxLength);
}

/**
 * Clave agregada: `evento` o `evento:dimension` (p. ej. `screen:home`,
 * `transaction_created:expense`). Devuelve null si no queda un nombre válido.
 */
export function usageKey(event: string, dimension?: string | number | null): string | null {
  if (typeof event !== 'string') return null;
  const base = normalizeKeyPart(event);
  if (!base) return null;
  const dim =
    typeof dimension === 'string' || (typeof dimension === 'number' && Number.isFinite(dimension))
      ? normalizeKeyPart(String(dimension), MAX_DIMENSION_LENGTH)
      : '';
  const key = (dim ? `${base}:${dim}` : base).slice(0, MAX_KEY_LENGTH);
  return USAGE_KEY_PATTERN.test(key) ? key : null;
}

/**
 * Qué propiedad hace de dimensión cuando se llama a `track(evento, props)`.
 * Las propiedades que no aparecen aquí se ignoran siempre (p. ej. `error`).
 */
const DIMENSION_PROPS: Record<string, readonly string[]> = {
  upgrade_clicked: ['feature', 'plan'],
  purchase_started: ['plan'],
  purchase_success: ['plan'],
  purchase_failed: ['plan'],
  plan_limit_reached: ['entity'],
};

export function dimensionFromProps(
  event: string,
  props: Record<string, unknown> | null | undefined,
): string | undefined {
  const candidates = DIMENSION_PROPS[event];
  if (!candidates || !props || typeof props !== 'object') return undefined;
  for (const name of candidates) {
    const value = props[name];
    if (typeof value === 'string' && value.trim()) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// Operaciones sobre el estado (inmutables)
// ---------------------------------------------------------------------------

export function addUsageEvent(state: UsageState, day: string, key: string, times = 1): UsageState {
  if (!DAY_RE.test(day) || !USAGE_KEY_PATTERN.test(key)) return state;
  const n = Math.floor(times);
  if (!(n > 0)) return state;
  const dayCounts = state.pending[day] ?? {};
  if (!(key in dayCounts) && Object.keys(dayCounts).length >= USAGE_MAX_KEYS_PER_DAY) return state;
  return {
    ...state,
    pending: { ...state.pending, [day]: { ...dayCounts, [key]: (dayCounts[key] ?? 0) + n } },
  };
}

/** Total de eventos pendientes. */
export function pendingTotal(state: UsageState): number {
  let total = 0;
  for (const counts of Object.values(state.pending)) {
    for (const n of Object.values(counts)) total += n;
  }
  return total;
}

/** Días con algo pendiente, del más antiguo al más reciente. */
export function pendingDays(state: UsageState): string[] {
  return Object.keys(state.pending)
    .filter((day) => Object.values(state.pending[day]).some((n) => n > 0))
    .sort();
}

/**
 * Quita lo que ya no se puede enviar: días de más de 7 días de antigüedad y
 * días "futuros" de más de 1 día (reloj del dispositivo mal puesto).
 */
export function pruneUsageState(state: UsageState, today: string): UsageState {
  const keep = (day: string) => {
    const age = dayDiff(day, today);
    return Number.isFinite(age) && age <= USAGE_MAX_DAYS_BACK && age >= -1;
  };
  const pending: UsageState['pending'] = {};
  for (const [day, counts] of Object.entries(state.pending)) {
    if (keep(day) && Object.keys(counts).length > 0) pending[day] = counts;
  }
  const firstSent: UsageState['firstSent'] = {};
  for (const [day, byUser] of Object.entries(state.firstSent)) {
    if (keep(day)) firstSent[day] = byUser;
  }
  return { ...state, pending, firstSent };
}

/** Une dos estados (p. ej. lo guardado con lo registrado antes de leerlo). */
export function mergeUsageStates(a: UsageState, b: UsageState): UsageState {
  let merged: UsageState = {
    ...a,
    lastSendAt: Math.max(a.lastSendAt, b.lastSendAt),
    backoffUntil: Math.max(a.backoffUntil, b.backoffUntil),
  };
  for (const [day, counts] of Object.entries(b.pending)) {
    for (const [key, n] of Object.entries(counts)) merged = addUsageEvent(merged, day, key, n);
  }
  const firstSent: UsageState['firstSent'] = { ...merged.firstSent };
  for (const [day, byUser] of Object.entries(b.firstSent)) {
    const target = { ...(firstSent[day] ?? {}) };
    for (const [user, keys] of Object.entries(byUser)) {
      target[user] = Array.from(new Set([...(target[user] ?? []), ...keys]));
    }
    firstSent[day] = target;
  }
  return { ...merged, firstSent };
}

/** Lee lo guardado en AsyncStorage tolerando basura (patrón `safeParseUser`). */
export function parseUsageState(raw: string | null | undefined): UsageState {
  const empty = emptyUsageState();
  if (!raw || raw === 'undefined' || raw === 'null') return empty;
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return empty;
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return empty;
  const obj = parsed as Record<string, unknown>;
  const isRecord = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === 'object' && !Array.isArray(v);

  let state = empty;
  if (isRecord(obj.pending)) {
    for (const [day, counts] of Object.entries(obj.pending)) {
      if (!DAY_RE.test(day) || !isRecord(counts)) continue;
      for (const [key, n] of Object.entries(counts)) {
        if (typeof n === 'number' && Number.isFinite(n)) state = addUsageEvent(state, day, key, n);
      }
    }
  }
  const firstSent: UsageState['firstSent'] = {};
  if (isRecord(obj.firstSent)) {
    for (const [day, byUser] of Object.entries(obj.firstSent)) {
      if (!DAY_RE.test(day) || !isRecord(byUser)) continue;
      const users: Record<string, string[]> = {};
      for (const [user, keys] of Object.entries(byUser)) {
        if (!Array.isArray(keys)) continue;
        const valid = keys.filter((k): k is string => typeof k === 'string' && USAGE_KEY_PATTERN.test(k));
        if (valid.length > 0) users[user] = valid;
      }
      if (Object.keys(users).length > 0) firstSent[day] = users;
    }
  }
  const time = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);
  return { ...state, firstSent, lastSendAt: time(obj.lastSendAt), backoffUntil: time(obj.backoffUntil) };
}

// ---------------------------------------------------------------------------
// Lotes
// ---------------------------------------------------------------------------

/**
 * Lote de un día: las 60 claves con más eventos (cada cuenta topada a 500) y,
 * en `first_today`, las que este usuario aún no ha enviado ese día.
 */
export function buildUsageBatch(
  state: UsageState,
  day: string,
  userKey: string,
  platform: UsagePlatform,
  appVersion?: string,
): UsageBatch | null {
  const counts = state.pending[day];
  if (!counts) return null;
  const entries = Object.entries(counts)
    .map(([key, n]) => [key, Math.floor(n)] as const)
    .filter(([key, n]) => n >= 1 && USAGE_KEY_PATTERN.test(key))
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, USAGE_MAX_KEYS_PER_BATCH);
  if (entries.length === 0) return null;

  const events: Record<string, number> = {};
  for (const [key, n] of entries) events[key] = Math.min(n, USAGE_MAX_COUNT);

  const already = new Set(state.firstSent[day]?.[userKey] ?? []);
  const first = Object.keys(events).filter((key) => !already.has(key));

  const batch: UsageBatch = { day, platform, events };
  if (appVersion) batch.app_version = appVersion;
  if (first.length > 0) batch.first_today = first;
  return batch;
}

/** Resta del pendiente lo que llevaba el lote (lo registrado mientras tanto se conserva). */
export function removeBatchCounts(state: UsageState, batch: UsageBatch): UsageState {
  const counts = state.pending[batch.day];
  if (!counts) return state;
  const rest: Record<string, number> = { ...counts };
  for (const [key, n] of Object.entries(batch.events)) {
    const left = (rest[key] ?? 0) - n;
    if (left > 0) rest[key] = left;
    else delete rest[key];
  }
  const pending = { ...state.pending };
  if (Object.keys(rest).length > 0) pending[batch.day] = rest;
  else delete pending[batch.day];
  return { ...state, pending };
}

/** Lote aceptado: descuenta los eventos y apunta sus `first_today`. */
export function applySentBatch(state: UsageState, batch: UsageBatch, userKey: string): UsageState {
  const next = removeBatchCounts(state, batch);
  const first = batch.first_today ?? [];
  if (first.length === 0) return next;
  const byUser = next.firstSent[batch.day] ?? {};
  const keys = Array.from(new Set([...(byUser[userKey] ?? []), ...first]));
  return {
    ...next,
    firstSent: { ...next.firstSent, [batch.day]: { ...byUser, [userKey]: keys } },
  };
}

// ---------------------------------------------------------------------------
// Cuándo enviar y qué hacer si falla
// ---------------------------------------------------------------------------

export type FlushReason = 'background' | 'startup' | 'threshold';

export type FlushContext = {
  now: number;
  lastSendAt: number;
  backoffUntil: number;
  pendingTotal: number;
  /** Hay pendientes de días anteriores a hoy (datos de sesiones previas). */
  hasPreviousDays: boolean;
  hasSession: boolean;
  inFlight: boolean;
};

/**
 * - background: al pasar a segundo plano, si hay algo pendiente.
 * - startup: al arrancar (o al aparecer la sesión) solo si quedan días anteriores.
 * - threshold: con ≥ 40 pendientes, como mucho cada 5 minutos.
 * Siempre: con sesión, sin otro envío en curso, fuera de backoff y ≥ 1 min
 * desde el último intento.
 */
export function shouldFlush(reason: FlushReason, ctx: FlushContext): boolean {
  if (!ctx.hasSession || ctx.inFlight || ctx.pendingTotal <= 0) return false;
  // Si el reloj retrocede, un backoff "demasiado largo" no debe bloquear para siempre.
  const waiting = ctx.backoffUntil - ctx.now;
  if (waiting > 0 && waiting <= LONG_BACKOFF_MS) return false;
  const since = ctx.now >= ctx.lastSendAt ? ctx.now - ctx.lastSendAt : Number.POSITIVE_INFINITY;
  if (since < MIN_SEND_INTERVAL_MS) return false;
  switch (reason) {
    case 'background':
      return true;
    case 'startup':
      return ctx.hasPreviousDays;
    case 'threshold':
      return ctx.pendingTotal >= BULK_THRESHOLD && since >= BULK_INTERVAL_MS;
    default:
      return false;
  }
}

export type FailurePolicy = {
  /** El servidor rechaza el lote tal cual: reintentarlo no sirve, se descarta. */
  drop: boolean;
  /** Espera extra antes del siguiente envío (0 = la regla normal de 1 min). */
  backoffMs: number;
};

/** Qué hacer con un lote según el estado HTTP del fallo (undefined = sin respuesta). */
export function failurePolicy(status?: number): FailurePolicy {
  if (status === 400 || status === 413 || status === 422) return { drop: true, backoffMs: 0 };
  if (status === 403 || status === 404 || status === 405) return { drop: false, backoffMs: LONG_BACKOFF_MS };
  if (status === 429 || (typeof status === 'number' && status >= 500)) {
    return { drop: false, backoffMs: SHORT_BACKOFF_MS };
  }
  // Red caída, timeout o 401 (la sesión se cierra sola): se conserva y se
  // reintenta en el siguiente disparador.
  return { drop: false, backoffMs: 0 };
}
