/**
 * Monitoreo de uso propio (anónimo y agregado) → `POST /usage`.
 *
 * `track()` solo suma 1 a un contador en memoria del día (`evento` o
 * `evento:dimension`) y lo guarda en AsyncStorage. No se hace una petición por
 * evento: los contadores se envían en lotes (uno por día pendiente) cuando:
 *  - la app pasa a segundo plano (si hay algo pendiente);
 *  - arranca o aparece la sesión y quedan días anteriores sin enviar;
 *  - hay ≥ 40 eventos pendientes (como mucho una vez cada 5 minutos).
 * Nunca más de un envío por minuto, solo con sesión, y si falla se conserva
 * para el siguiente disparador (sin reintentos inmediatos). Las reglas puras
 * están en `usageQueue.ts` (con tests).
 *
 * Eventos conocidos (dimensión entre paréntesis):
 *  - `app_open`: arranque y vuelta a primer plano (tras ≥ 30 s fuera).
 *  - `screen` (ruta): `screen:home`, `screen:login`…
 *  - `onboarding` (start | finish | skip).
 *  - `transaction_created` (expense | income), `transaction_updated`,
 *    `transaction_deleted`, `transaction_duplicated`, `receipt_uploaded`.
 *  - `recurring_created`, `goal_created`, `goal_contribution`, `goal_withdrawal`,
 *    `budget_created`, `balance_mode` (historical), `filters_applied`,
 *    `search_used`, `financial_profile_saved`, `email_verified`, `password_reset`.
 *  - `export` (csv | pdf).
 *  - Plan: `paywall_viewed`, `upgrade_clicked` (feature o plan),
 *    `purchase_started` / `purchase_success` / `purchase_failed` (plan),
 *    `plan_limit_reached` (entity), `restore_purchases`.
 * Si se pasa un objeto de props, solo se usa la propiedad que actúa de
 * dimensión para ese evento (ver `dimensionFromProps`); el resto se ignora.
 */
import { AppState, Platform, type AppStateStatus } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import appConfig from '../../app.json';
import { usageApi } from '../api/endpoints';
// Importación circular (useAuthStore → useOnboardingStore → analytics): solo se
// usa dentro de funciones, nunca al cargar el módulo.
import { useAuthStore } from '../store/useAuthStore';
import type { UsagePlatform } from '../api/types';
import {
  addUsageEvent,
  applySentBatch,
  buildUsageBatch,
  dimensionFromProps,
  emptyUsageState,
  failurePolicy,
  mergeUsageStates,
  parseUsageState,
  pendingDays,
  pendingTotal,
  pruneUsageState,
  removeBatchCounts,
  shouldFlush,
  toDayKey,
  usageKey,
  type FlushReason,
  type UsageState,
} from './usageQueue';

export type KnownEvent =
  | 'app_open'
  | 'screen'
  | 'onboarding'
  | 'transaction_created'
  | 'transaction_updated'
  | 'transaction_deleted'
  | 'transaction_duplicated'
  | 'receipt_uploaded'
  | 'recurring_created'
  | 'goal_created'
  | 'goal_contribution'
  | 'goal_withdrawal'
  | 'budget_created'
  | 'balance_mode'
  | 'filters_applied'
  | 'search_used'
  | 'financial_profile_saved'
  | 'email_verified'
  | 'password_reset'
  | 'export'
  | 'paywall_viewed'
  | 'upgrade_clicked'
  | 'purchase_started'
  | 'purchase_success'
  | 'purchase_failed'
  | 'plan_limit_reached'
  | 'restore_purchases';

/** Compatibilidad con el nombre anterior. */
export type AnalyticsEvent = KnownEvent;

/** Dimensión directa (`'expense'`) o props de las que se extrae (ver cabecera). */
export type TrackDetail = string | number | Record<string, unknown> | null | undefined;

export const USAGE_STORAGE_KEY = '@chillpocket:usage';
/** Agrupa las escrituras en AsyncStorage. */
const PERSIST_DELAY_MS = 2_000;
/** Un vistazo rápido a otra app (cámara, código 2FA…) no cuenta como apertura. */
export const APP_OPEN_MIN_BACKGROUND_MS = 30_000;

const APP_VERSION: string | undefined =
  typeof appConfig?.expo?.version === 'string' ? appConfig.expo.version : undefined;

let state: UsageState = emptyUsageState();
let hydrated = false;
let hydratePromise: Promise<void> | null = null;
let flushing = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;
let startupTracked = false;
let backgroundSince: number | null = null;

const today = () => toDayKey(new Date());

function platform(): UsagePlatform {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
}

function session(): { token: string | null; userKey: string } {
  const { token, user } = useAuthStore.getState();
  // El id solo se usa en local para no repetir first_today; nunca se envía.
  return { token, userKey: user?.id != null ? String(user.id) : 'session' };
}

function ensureHydrated(): Promise<void> {
  if (!hydratePromise) {
    hydratePromise = (async () => {
      let stored = emptyUsageState();
      try {
        stored = parseUsageState(await AsyncStorage.getItem(USAGE_STORAGE_KEY));
      } catch {
        /* storage no disponible: seguimos solo en memoria */
      }
      // Lo registrado antes de leer (p. ej. el app_open del arranque) se suma.
      state = pruneUsageState(mergeUsageStates(stored, state), today());
      hydrated = true;
    })();
  }
  return hydratePromise;
}

async function persistNow(): Promise<void> {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  // Nunca escribir antes de haber leído: pisaría lo pendiente de otra sesión.
  await ensureHydrated();
  try {
    await AsyncStorage.setItem(USAGE_STORAGE_KEY, JSON.stringify(state));
  } catch {
    /* sin storage: se conserva en memoria */
  }
}

function schedulePersist(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistNow();
  }, PERSIST_DELAY_MS);
}

function maybeFlush(reason: FlushReason): void {
  if (!hydrated) {
    void ensureHydrated().then(() => maybeFlush(reason));
    return;
  }
  const day = today();
  const ok = shouldFlush(reason, {
    now: Date.now(),
    lastSendAt: state.lastSendAt,
    backoffUntil: state.backoffUntil,
    pendingTotal: pendingTotal(state),
    hasPreviousDays: pendingDays(state).some((d) => d < day),
    hasSession: !!session().token,
    inFlight: flushing,
  });
  if (ok) void flush();
}

function httpStatus(e: unknown): number | undefined {
  const status = (e as { response?: { status?: unknown } } | null)?.response?.status;
  return typeof status === 'number' ? status : undefined;
}

async function flush(): Promise<void> {
  if (flushing) return;
  flushing = true;
  try {
    await ensureHydrated();
    // El intento cuenta aunque falle: así nunca hay bucles de reintento.
    state = { ...pruneUsageState(state, today()), lastSendAt: Date.now() };
    const { userKey } = session();
    // Una sola petición por disparador, empezando por el día más antiguo: tras
    // días sin conexión, el resto sale en los siguientes disparadores (cuota MySQL).
    const batch = pendingDays(state)
      .map((day) => buildUsageBatch(state, day, userKey, platform(), APP_VERSION))
      .find((b) => b !== null);
    if (!batch || !session().token) return;
    try {
      await usageApi.send(batch);
      // Se aplica sobre el estado actual: lo registrado durante el envío se conserva.
      state = applySentBatch(state, batch, userKey);
    } catch (e) {
      const policy = failurePolicy(httpStatus(e));
      if (policy.drop) state = removeBatchCounts(state, batch);
      else if (policy.backoffMs > 0) state = { ...state, backoffUntil: Date.now() + policy.backoffMs };
    }
  } finally {
    flushing = false;
    await persistNow();
  }
}

/**
 * Registra un evento. Nunca lanza ni hace peticiones por sí mismo (salvo el
 * envío por umbral, limitado a uno cada 5 minutos).
 */
export function track(event: KnownEvent | (string & {}), detail?: TrackDetail): void {
  try {
    const dimension =
      typeof detail === 'string' || typeof detail === 'number'
        ? detail
        : dimensionFromProps(event, detail);
    const key = usageKey(event, dimension);
    if (__DEV__) {
      // eslint-disable-next-line no-console
      console.log(`[usage] ${key ?? `descartado: ${String(event)}`}`);
    }
    if (!key) return;
    state = addUsageEvent(state, today(), key);
    schedulePersist();
    maybeFlush('threshold');
  } catch {
    /* la analítica nunca debe romper la app */
  }
}

function onAppStateChange(next: AppStateStatus): void {
  if (next === 'background' || next === 'inactive') {
    if (next === 'background' && backgroundSince === null) backgroundSince = Date.now();
    void persistNow();
    maybeFlush('background');
  } else if (next === 'active') {
    // Solo cuenta si de verdad estuvo en segundo plano (en iOS, bajar el centro
    // de notificaciones pasa por "inactive" sin llegar a "background").
    if (backgroundSince !== null && Date.now() - backgroundSince >= APP_OPEN_MIN_BACKGROUND_MS) {
      track('app_open');
    }
    backgroundSince = null;
  }
}

/**
 * Arranca el monitoreo (una vez, desde `App.tsx`): cuenta la apertura, lee lo
 * pendiente, escucha el segundo plano y la aparición de la sesión.
 */
export function initUsageTracking(): () => void {
  if (!startupTracked) {
    startupTracked = true;
    track('app_open');
  }
  void ensureHydrated().then(() => maybeFlush('startup'));

  const appStateSub = AppState.addEventListener('change', onAppStateChange);
  const unsubscribeAuth = useAuthStore.subscribe((s, prev) => {
    // Sesión recién restaurada o iniciada: envía lo de días anteriores.
    if (s.token && !prev.token) maybeFlush('startup');
  });

  return () => {
    appStateSub.remove();
    unsubscribeAuth();
  };
}
