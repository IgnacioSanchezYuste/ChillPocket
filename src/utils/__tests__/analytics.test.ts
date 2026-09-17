import {
  BULK_INTERVAL_MS,
  BULK_THRESHOLD,
  LONG_BACKOFF_MS,
  MIN_SEND_INTERVAL_MS,
  SHORT_BACKOFF_MS,
  USAGE_KEY_PATTERN,
  USAGE_MAX_COUNT,
  USAGE_MAX_KEYS_PER_BATCH,
  USAGE_MAX_KEYS_PER_DAY,
  addUsageEvent,
  applySentBatch,
  buildUsageBatch,
  dayDiff,
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
  type FlushContext,
  type UsageState,
} from '../usageQueue';

// ---------------------------------------------------------------------------
// Lógica pura (usageQueue)
// ---------------------------------------------------------------------------

const DAY = '2026-09-16';

function stateWith(counts: Record<string, Record<string, number>>): UsageState {
  let s = emptyUsageState();
  for (const [day, byKey] of Object.entries(counts)) {
    for (const [key, n] of Object.entries(byKey)) s = addUsageEvent(s, day, key, n);
  }
  return s;
}

describe('usageKey', () => {
  it('evento sin dimensión', () => {
    expect(usageKey('app_open')).toBe('app_open');
  });

  it('añade una dimensión normalizada (minúsculas, sin tildes)', () => {
    expect(usageKey('screen', 'Analítica')).toBe('screen:analitica');
    expect(usageKey('screen', 'Más')).toBe('screen:mas');
    expect(usageKey('screen', 'DayDetail')).toBe('screen:daydetail');
    expect(usageKey('transaction_created', 'expense')).toBe('transaction_created:expense');
    expect(usageKey('purchase_success', 'plus')).toBe('purchase_success:plus');
  });

  it('sustituye caracteres no permitidos y respeta el patrón del servidor', () => {
    const key = usageKey('Upgrade Clicked!', 'plan badge/2');
    expect(key).toBe('upgrade_clicked:plan_badge_2');
    expect(key).toMatch(USAGE_KEY_PATTERN);
  });

  it('acepta el evento con la dimensión ya incluida', () => {
    expect(usageKey('screen:Login')).toBe('screen:login');
  });

  it('recorta a 64 caracteres como máximo', () => {
    const key = usageKey('a'.repeat(80), 'b'.repeat(80));
    expect(key).not.toBeNull();
    expect(key!.length).toBeLessThanOrEqual(64);
    expect(key).toMatch(USAGE_KEY_PATTERN);
  });

  it('descarta nombres vacíos o sin caracteres válidos', () => {
    expect(usageKey('')).toBeNull();
    expect(usageKey('¿¿??')).toBeNull();
    expect(usageKey(undefined as unknown as string)).toBeNull();
  });

  it('ignora dimensiones vacías o que no son texto/número', () => {
    expect(usageKey('export', '')).toBe('export');
    expect(usageKey('export', null)).toBe('export');
    expect(usageKey('export', Number.NaN)).toBe('export');
    expect(usageKey('export', { x: 1 } as unknown as string)).toBe('export');
  });
});

describe('dimensionFromProps', () => {
  it('usa la propiedad prevista para cada evento', () => {
    expect(dimensionFromProps('upgrade_clicked', { feature: 'export', variant: 'banner' })).toBe('export');
    expect(dimensionFromProps('upgrade_clicked', { plan: 'plus', cycle: 'monthly' })).toBe('plus');
    expect(dimensionFromProps('purchase_success', { plan: 'plus', cycle: 'yearly' })).toBe('plus');
  });

  it('nunca usa el mensaje de error ni props de eventos sin dimensión', () => {
    expect(dimensionFromProps('purchase_failed', { error: 'boom' })).toBeUndefined();
    expect(usageKey('purchase_failed', dimensionFromProps('purchase_failed', { plan: 'plus', error: 'x@y.com' })))
      .toBe('purchase_failed:plus');
    expect(dimensionFromProps('paywall_viewed', { plan: 'free' })).toBeUndefined();
    expect(dimensionFromProps('restore_purchases', undefined)).toBeUndefined();
  });

  it('salta valores vacíos', () => {
    expect(dimensionFromProps('upgrade_clicked', { feature: '  ', plan: 'family' })).toBe('family');
    expect(dimensionFromProps('upgrade_clicked', { feature: undefined })).toBeUndefined();
  });
});

describe('fechas', () => {
  it('toDayKey usa la fecha local', () => {
    expect(toDayKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
  });

  it('dayDiff cuenta días naturales, también con cambio de hora', () => {
    expect(dayDiff('2026-09-09', DAY)).toBe(7);
    expect(dayDiff(DAY, '2026-09-15')).toBe(-1);
    expect(dayDiff('2026-03-28', '2026-03-30')).toBe(2);
    expect(dayDiff('basura', DAY)).toBeNaN();
  });
});

describe('addUsageEvent / pendingTotal / pendingDays', () => {
  it('acumula por día y clave sin mutar el estado', () => {
    const s0 = emptyUsageState();
    const s1 = addUsageEvent(s0, DAY, 'app_open');
    const s2 = addUsageEvent(s1, DAY, 'app_open', 2);
    const s3 = addUsageEvent(s2, '2026-09-15', 'screen:home');
    expect(s0.pending).toEqual({});
    expect(s3.pending).toEqual({ [DAY]: { app_open: 3 }, '2026-09-15': { 'screen:home': 1 } });
    expect(pendingTotal(s3)).toBe(4);
    expect(pendingDays(s3)).toEqual(['2026-09-15', DAY]);
  });

  it('ignora claves o días inválidos y cantidades no positivas', () => {
    const s = emptyUsageState();
    expect(addUsageEvent(s, DAY, 'Con Espacios')).toBe(s);
    expect(addUsageEvent(s, '16/09/2026', 'app_open')).toBe(s);
    expect(addUsageEvent(s, DAY, 'app_open', 0)).toBe(s);
    expect(addUsageEvent(s, DAY, 'app_open', -3)).toBe(s);
  });

  it('limita las claves distintas por día', () => {
    let s = emptyUsageState();
    for (let i = 0; i < USAGE_MAX_KEYS_PER_DAY + 5; i++) s = addUsageEvent(s, DAY, `k${i}`);
    expect(Object.keys(s.pending[DAY])).toHaveLength(USAGE_MAX_KEYS_PER_DAY);
    // Una clave ya existente sigue sumando.
    s = addUsageEvent(s, DAY, 'k0');
    expect(s.pending[DAY].k0).toBe(2);
  });
});

describe('pruneUsageState', () => {
  it('descarta días de más de 7 días y fechas futuras lejanas', () => {
    const s = stateWith({
      '2026-09-08': { app_open: 1 }, // 8 días: fuera
      '2026-09-09': { app_open: 2 }, // 7 días: dentro
      [DAY]: { app_open: 3 },
      '2026-09-17': { app_open: 4 }, // mañana (desfase horario): dentro
      '2026-09-20': { app_open: 5 }, // reloj mal puesto: fuera
    });
    const withFirst: UsageState = {
      ...s,
      firstSent: { '2026-09-01': { '1': ['app_open'] }, [DAY]: { '1': ['app_open'] } },
    };
    const pruned = pruneUsageState(withFirst, DAY);
    expect(Object.keys(pruned.pending).sort()).toEqual(['2026-09-09', DAY, '2026-09-17']);
    expect(Object.keys(pruned.firstSent)).toEqual([DAY]);
  });
});

describe('parseUsageState', () => {
  it('tolera basura', () => {
    for (const raw of [null, undefined, '', 'undefined', 'null', '{', '[]', '42', '"x"']) {
      expect(parseUsageState(raw)).toEqual(emptyUsageState());
    }
  });

  it('se queda solo con lo válido', () => {
    const raw = JSON.stringify({
      pending: {
        [DAY]: { app_open: 2, 'Mal Nombre': 3, 'screen:home': 'x', search_used: 1.7 },
        'no-es-fecha': { app_open: 1 },
        '2026-09-15': 'basura',
      },
      firstSent: {
        [DAY]: { '7': ['app_open', 42, 'MAL'], '8': 'x' },
        'otra-cosa': { '7': ['app_open'] },
      },
      lastSendAt: 123,
      backoffUntil: 'mañana',
    });
    expect(parseUsageState(raw)).toEqual({
      pending: { [DAY]: { app_open: 2, search_used: 1 } },
      firstSent: { [DAY]: { '7': ['app_open'] } },
      lastSendAt: 123,
      backoffUntil: 0,
    });
  });

  it('ida y vuelta con JSON', () => {
    const s: UsageState = {
      ...stateWith({ [DAY]: { app_open: 2, 'screen:home': 1 } }),
      firstSent: { [DAY]: { '1': ['app_open'] } },
      lastSendAt: 1000,
      backoffUntil: 2000,
    };
    expect(parseUsageState(JSON.stringify(s))).toEqual(s);
  });
});

describe('mergeUsageStates', () => {
  it('suma contadores, une first_today y conserva los tiempos más recientes', () => {
    const a: UsageState = {
      ...stateWith({ [DAY]: { app_open: 1 }, '2026-09-15': { search_used: 2 } }),
      firstSent: { [DAY]: { '1': ['app_open'] } },
      lastSendAt: 500,
      backoffUntil: 0,
    };
    const b: UsageState = {
      ...stateWith({ [DAY]: { app_open: 2, 'screen:home': 1 } }),
      firstSent: { [DAY]: { '1': ['app_open', 'screen:home'], '2': ['app_open'] } },
      lastSendAt: 100,
      backoffUntil: 900,
    };
    const m = mergeUsageStates(a, b);
    expect(m.pending).toEqual({
      [DAY]: { app_open: 3, 'screen:home': 1 },
      '2026-09-15': { search_used: 2 },
    });
    expect(m.firstSent).toEqual({ [DAY]: { '1': ['app_open', 'screen:home'], '2': ['app_open'] } });
    expect(m.lastSendAt).toBe(500);
    expect(m.backoffUntil).toBe(900);
  });
});

describe('buildUsageBatch', () => {
  it('arma el lote del día con plataforma, versión y first_today', () => {
    const s = stateWith({ [DAY]: { app_open: 2, 'screen:home': 3 }, '2026-09-15': { search_used: 1 } });
    expect(buildUsageBatch(s, DAY, '1', 'android', '2.0.0')).toEqual({
      day: DAY,
      platform: 'android',
      app_version: '2.0.0',
      events: { 'screen:home': 3, app_open: 2 },
      first_today: ['screen:home', 'app_open'],
    });
  });

  it('omite versión y first_today cuando no aplican', () => {
    const s: UsageState = {
      ...stateWith({ [DAY]: { app_open: 1 } }),
      firstSent: { [DAY]: { '1': ['app_open'] } },
    };
    const batch = buildUsageBatch(s, DAY, '1', 'web');
    expect(batch).toEqual({ day: DAY, platform: 'web', events: { app_open: 1 } });
  });

  it('first_today es por usuario', () => {
    const s: UsageState = {
      ...stateWith({ [DAY]: { app_open: 1 } }),
      firstSent: { [DAY]: { '1': ['app_open'] } },
    };
    expect(buildUsageBatch(s, DAY, '2', 'ios')?.first_today).toEqual(['app_open']);
  });

  it('respeta los límites del servidor: 60 claves y 500 por clave', () => {
    let s = emptyUsageState();
    for (let i = 0; i < 70; i++) s = addUsageEvent(s, DAY, `k${String(i).padStart(2, '0')}`, i + 1);
    s = addUsageEvent(s, DAY, 'k00', 1000);
    const batch = buildUsageBatch(s, DAY, '1', 'ios')!;
    const keys = Object.keys(batch.events);
    expect(keys).toHaveLength(USAGE_MAX_KEYS_PER_BATCH);
    // Van las de más eventos primero.
    expect(keys[0]).toBe('k00');
    expect(batch.events.k00).toBe(USAGE_MAX_COUNT);
    expect(keys).not.toContain('k01');
    expect(Object.values(batch.events).every((n) => Number.isInteger(n) && n >= 1 && n <= 500)).toBe(true);
    expect(batch.first_today).toHaveLength(USAGE_MAX_KEYS_PER_BATCH);
  });

  it('sin pendientes no hay lote', () => {
    expect(buildUsageBatch(emptyUsageState(), DAY, '1', 'ios')).toBeNull();
  });
});

describe('applySentBatch / removeBatchCounts', () => {
  it('descuenta lo enviado y conserva lo registrado durante el envío', () => {
    const before = stateWith({ [DAY]: { app_open: 2, 'screen:home': 1 } });
    const batch = buildUsageBatch(before, DAY, '1', 'ios')!;
    // Mientras viaja el lote, llegan más eventos.
    const during = addUsageEvent(addUsageEvent(before, DAY, 'app_open'), DAY, 'search_used');
    const after = applySentBatch(during, batch, '1');
    expect(after.pending).toEqual({ [DAY]: { app_open: 1, search_used: 1 } });
    expect(after.firstSent).toEqual({ [DAY]: { '1': ['app_open', 'screen:home'] } });
    // El siguiente lote ya no repite first_today de lo enviado.
    expect(buildUsageBatch(after, DAY, '1', 'ios')?.first_today).toEqual(['search_used']);
  });

  it('las cuentas topadas dejan el resto pendiente', () => {
    const s = stateWith({ [DAY]: { app_open: 620 } });
    const batch = buildUsageBatch(s, DAY, '1', 'ios')!;
    const after = applySentBatch(s, batch, '1');
    expect(after.pending).toEqual({ [DAY]: { app_open: 120 } });
    expect(buildUsageBatch(after, DAY, '1', 'ios')?.first_today).toBeUndefined();
  });

  it('elimina el día cuando queda vacío', () => {
    const s = stateWith({ [DAY]: { app_open: 1 }, '2026-09-15': { app_open: 1 } });
    const batch = buildUsageBatch(s, DAY, '1', 'ios')!;
    expect(Object.keys(removeBatchCounts(s, batch).pending)).toEqual(['2026-09-15']);
    // Descartar un lote no marca first_today.
    expect(removeBatchCounts(s, batch).firstSent).toEqual({});
  });
});

describe('shouldFlush', () => {
  const NOW = 10_000_000;
  const base: FlushContext = {
    now: NOW,
    lastSendAt: 0,
    backoffUntil: 0,
    pendingTotal: 3,
    hasPreviousDays: false,
    hasSession: true,
    inFlight: false,
  };

  it('segundo plano: envía si hay algo pendiente', () => {
    expect(shouldFlush('background', base)).toBe(true);
    expect(shouldFlush('background', { ...base, pendingTotal: 0 })).toBe(false);
  });

  it('sin sesión o con otro envío en curso no envía', () => {
    expect(shouldFlush('background', { ...base, hasSession: false })).toBe(false);
    expect(shouldFlush('background', { ...base, inFlight: true })).toBe(false);
  });

  it('nunca más de un envío por minuto', () => {
    expect(shouldFlush('background', { ...base, lastSendAt: NOW - MIN_SEND_INTERVAL_MS + 1 })).toBe(false);
    expect(shouldFlush('background', { ...base, lastSendAt: NOW - MIN_SEND_INTERVAL_MS })).toBe(true);
  });

  it('arranque: solo si quedan días anteriores', () => {
    expect(shouldFlush('startup', base)).toBe(false);
    expect(shouldFlush('startup', { ...base, hasPreviousDays: true })).toBe(true);
  });

  it('umbral: ≥ 40 pendientes y como mucho cada 5 minutos', () => {
    const many = { ...base, pendingTotal: BULK_THRESHOLD };
    expect(shouldFlush('threshold', { ...many, pendingTotal: BULK_THRESHOLD - 1 })).toBe(false);
    expect(shouldFlush('threshold', many)).toBe(true);
    expect(shouldFlush('threshold', { ...many, lastSendAt: NOW - BULK_INTERVAL_MS + 1 })).toBe(false);
    expect(shouldFlush('threshold', { ...many, lastSendAt: NOW - BULK_INTERVAL_MS })).toBe(true);
  });

  it('respeta el backoff', () => {
    expect(shouldFlush('background', { ...base, backoffUntil: NOW + 1 })).toBe(false);
    expect(shouldFlush('background', { ...base, backoffUntil: NOW })).toBe(true);
  });

  it('si el reloj retrocede no se bloquea para siempre', () => {
    expect(shouldFlush('background', { ...base, lastSendAt: NOW + 3_600_000 })).toBe(true);
    expect(shouldFlush('background', { ...base, backoffUntil: NOW + LONG_BACKOFF_MS * 10 })).toBe(true);
  });
});

describe('failurePolicy', () => {
  it('lote rechazado por validación: se descarta', () => {
    expect(failurePolicy(400)).toEqual({ drop: true, backoffMs: 0 });
    expect(failurePolicy(422)).toEqual({ drop: true, backoffMs: 0 });
  });

  it('endpoint ausente o prohibido: se conserva con espera larga', () => {
    expect(failurePolicy(404)).toEqual({ drop: false, backoffMs: LONG_BACKOFF_MS });
    expect(failurePolicy(403)).toEqual({ drop: false, backoffMs: LONG_BACKOFF_MS });
  });

  it('servidor saturado: se conserva con espera corta', () => {
    expect(failurePolicy(429)).toEqual({ drop: false, backoffMs: SHORT_BACKOFF_MS });
    expect(failurePolicy(503)).toEqual({ drop: false, backoffMs: SHORT_BACKOFF_MS });
  });

  it('sin red o 401: se conserva para el siguiente disparador', () => {
    expect(failurePolicy(undefined)).toEqual({ drop: false, backoffMs: 0 });
    expect(failurePolicy(401)).toEqual({ drop: false, backoffMs: 0 });
  });
});

// ---------------------------------------------------------------------------
// Runtime (analytics.ts) con red, sesión y AppState simulados
// ---------------------------------------------------------------------------

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest/async-storage-mock'),
);

const mockSend = jest.fn();
jest.mock('../../api/endpoints', () => ({
  usageApi: { send: (...args: unknown[]) => mockSend(...args) },
}));

type MockAuth = { token: string | null; user: { id: number } | null };
let mockAuth: MockAuth = { token: null, user: null };
const mockAuthListeners = new Set<(s: MockAuth, prev: MockAuth) => void>();
jest.mock('../../store/useAuthStore', () => ({
  useAuthStore: {
    getState: () => mockAuth,
    subscribe: (fn: (s: MockAuth, prev: MockAuth) => void) => {
      mockAuthListeners.add(fn);
      return () => mockAuthListeners.delete(fn);
    },
  },
}));

function setAuth(next: MockAuth) {
  const prev = mockAuth;
  mockAuth = next;
  mockAuthListeners.forEach((fn) => fn(next, prev));
}

type Runtime = {
  analytics: typeof import('../analytics');
  storage: { getItem: (k: string) => Promise<string | null>; setItem: (k: string, v: string) => Promise<void> };
  emitAppState: (s: string) => void;
};

function loadRuntime(): Runtime {
  let runtime!: Runtime;
  jest.isolateModules(() => {
    const RN = require('react-native');
    let handler: ((s: string) => void) | null = null;
    jest.spyOn(RN.AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => {
      handler = fn;
      return { remove: () => { handler = null; } };
    }) as never);
    runtime = {
      analytics: require('../analytics'),
      storage: require('@react-native-async-storage/async-storage'),
      emitAppState: (s) => handler?.(s),
    };
  });
  return runtime;
}

/** Deja correr promesas encadenadas (hidratación, envío, persistencia). */
async function settle() {
  for (let i = 0; i < 50; i++) await Promise.resolve();
}

describe('analytics (runtime)', () => {
  const START = new Date(2026, 8, 16, 10, 0, 0);
  let cleanup: (() => void) | undefined;

  beforeEach(async () => {
    jest.useFakeTimers({ now: START });
    jest.spyOn(console, 'log').mockImplementation(() => {});
    mockSend.mockReset();
    mockSend.mockResolvedValue({ success: true });
    mockAuth = { token: null, user: null };
    mockAuthListeners.clear();
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  async function start(stored?: object) {
    const rt = loadRuntime();
    await rt.storage.setItem('@chillpocket:usage', stored ? JSON.stringify(stored) : '');
    cleanup = rt.analytics.initUsageTracking();
    await settle();
    return rt;
  }

  async function saved(rt: Runtime): Promise<UsageState> {
    await jest.advanceTimersByTimeAsync(3_000);
    return parseUsageState(await rt.storage.getItem('@chillpocket:usage'));
  }

  it('cuenta la apertura y la guarda sin enviar nada', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    const rt = await start();
    rt.analytics.track('screen', 'Home');
    const s = await saved(rt);
    expect(s.pending[DAY]).toEqual({ app_open: 1, 'screen:home': 1 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('envía al pasar a segundo plano y como mucho una vez por minuto', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    const rt = await start();
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      day: DAY,
      events: { app_open: 1 },
      first_today: ['app_open'],
      app_version: expect.any(String),
    });

    // Vuelve enseguida (no cuenta como apertura) y se va otra vez: nada que enviar.
    rt.emitAppState('active');
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);

    // Vuelve tras un rato: nueva apertura; al irse antes del minuto no envía…
    await jest.advanceTimersByTimeAsync(40_000);
    rt.emitAppState('active');
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);

    // …y pasado el minuto sí, sin repetir first_today.
    await jest.advanceTimersByTimeAsync(25_000);
    rt.emitAppState('active');
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0].events).toEqual({ app_open: 1 });
    expect(mockSend.mock.calls[1][0].first_today).toBeUndefined();
  });

  it('sin sesión conserva los eventos y los envía cuando la hay', async () => {
    const rt = await start({
      pending: { '2026-09-15': { 'screen:login': 2 } },
      firstSent: {},
      lastSendAt: 0,
      backoffUntil: 0,
    });
    rt.emitAppState('background');
    await settle();
    expect(mockSend).not.toHaveBeenCalled();

    // Inicia sesión: hay un día anterior pendiente → sale ese (un lote por disparador).
    setAuth({ token: 't', user: { id: 5 } });
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0]).toMatchObject({ day: '2026-09-15', events: { 'screen:login': 2 } });
    let s = await saved(rt);
    expect(s.pending).toEqual({ [DAY]: { app_open: 1 } });
    expect(s.firstSent['2026-09-15']).toEqual({ '5': ['screen:login'] });

    // El de hoy, en el siguiente disparador.
    await jest.advanceTimersByTimeAsync(61_000);
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0].day).toBe(DAY);
    s = await saved(rt);
    expect(s.pending).toEqual({});
    expect(s.firstSent[DAY]).toEqual({ '5': ['app_open'] });
  });

  it('al arrancar solo envía si quedan días anteriores', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    await start({ pending: { [DAY]: { app_open: 1 } }, firstSent: {}, lastSendAt: 0, backoffUntil: 0 });
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('descarta días de más de 7 días al leer', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    const rt = await start({ pending: { '2026-09-01': { app_open: 9 } }, firstSent: {}, lastSendAt: 0, backoffUntil: 0 });
    expect(mockSend).not.toHaveBeenCalled();
    const s = await saved(rt);
    expect(Object.keys(s.pending)).toEqual([DAY]);
  });

  it('si el envío falla conserva los eventos y no reintenta de inmediato', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    mockSend.mockRejectedValue(new Error('Network Error'));
    const rt = await start();
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(10 * 60_000);
    expect(mockSend).toHaveBeenCalledTimes(1);

    const s = await saved(rt);
    expect(s.pending[DAY]).toEqual({ app_open: 1 });
    expect(s.firstSent).toEqual({});

    // En el siguiente disparador se reintenta.
    mockSend.mockResolvedValue({ success: true });
    rt.emitAppState('active');
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0].first_today).toEqual(['app_open']);
  });

  it('con el endpoint sin desplegar (404) espera horas antes de volver a intentarlo', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    mockSend.mockRejectedValue({ response: { status: 404 } });
    const rt = await start();
    rt.emitAppState('background');
    await settle();
    await jest.advanceTimersByTimeAsync(2 * 60_000);
    rt.emitAppState('active');
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);
  });

  it('un lote rechazado por validación (422) se descarta', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    mockSend.mockRejectedValue({ response: { status: 422 } });
    const rt = await start();
    rt.emitAppState('background');
    await settle();
    const s = await saved(rt);
    expect(s.pending).toEqual({});
  });

  it('con 40 eventos pendientes envía sin esperar, como mucho cada 5 minutos', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    const rt = await start();
    for (let i = 0; i < BULK_THRESHOLD - 2; i++) rt.analytics.track('search_used');
    expect(mockSend).not.toHaveBeenCalled();
    rt.analytics.track('search_used');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].events).toEqual({ search_used: BULK_THRESHOLD - 1, app_open: 1 });

    for (let i = 0; i < BULK_THRESHOLD + 5; i++) rt.analytics.track('filters_applied');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(BULK_INTERVAL_MS);
    rt.analytics.track('filters_applied');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(2);
  });

  it('varios días: un lote por disparador, el fallido se conserva y el aceptado no se repite', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    mockSend.mockRejectedValueOnce({ response: { status: 503 } });
    const rt = await start({
      pending: { '2026-09-14': { 'screen:home': 3 } },
      firstSent: {},
      lastSendAt: 0,
      backoffUntil: 0,
    });
    // El arranque envía (hay un día anterior) solo el más antiguo, y falla.
    expect(mockSend).toHaveBeenCalledTimes(1);
    expect(mockSend.mock.calls[0][0].day).toBe('2026-09-14');
    let s = await saved(rt);
    expect(s.pending).toEqual({ '2026-09-14': { 'screen:home': 3 }, [DAY]: { app_open: 1 } });
    expect(s.firstSent).toEqual({});
    expect(s.backoffUntil).toBeGreaterThan(Date.now());

    // Dentro de la espera corta no se insiste…
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);

    // …después sale el 14…
    await jest.advanceTimersByTimeAsync(SHORT_BACKOFF_MS);
    rt.emitAppState('active');
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(2);
    expect(mockSend.mock.calls[1][0]).toMatchObject({
      day: '2026-09-14',
      events: { 'screen:home': 3 },
      first_today: ['screen:home'],
    });
    s = await saved(rt);
    expect(s.pending).toEqual({ [DAY]: { app_open: 2 } });

    // …y en el siguiente disparador, hoy (el 14 no se repite).
    await jest.advanceTimersByTimeAsync(61_000);
    rt.emitAppState('active');
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(3);
    expect(mockSend.mock.calls[2][0]).toMatchObject({ day: DAY, events: { app_open: 3 }, first_today: ['app_open'] });
    s = await saved(rt);
    expect(s.pending).toEqual({});
  });

  it('lo registrado mientras el lote viaja no se pierde ni se da por enviado', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    let resolveSend!: (v: unknown) => void;
    mockSend.mockImplementationOnce(() => new Promise((r) => { resolveSend = r; }));
    const rt = await start();
    rt.emitAppState('background');
    await settle();
    expect(mockSend).toHaveBeenCalledTimes(1);
    rt.analytics.track('search_used');
    rt.analytics.track('app_open');
    resolveSend({ success: true });
    await settle();
    const s = await saved(rt);
    expect(s.pending).toEqual({ [DAY]: { search_used: 1, app_open: 1 } });
    expect(s.firstSent[DAY]).toEqual({ '1': ['app_open'] });
  });

  it('si la sesión se cierra durante el envío, lo de hoy espera a la siguiente', async () => {
    mockAuth = { token: 't', user: { id: 1 } };
    mockSend.mockImplementationOnce(async () => {
      setAuth({ token: null, user: null });
      return { success: true };
    });
    const rt = await start({
      pending: { '2026-09-15': { 'screen:home': 1 } },
      firstSent: {},
      lastSendAt: 0,
      backoffUntil: 0,
    });
    expect(mockSend).toHaveBeenCalledTimes(1);
    const s = await saved(rt);
    expect(s.pending).toEqual({ [DAY]: { app_open: 1 } });
  });

  it('ignora nombres inválidos y nunca lanza', async () => {
    const rt = await start();
    expect(() => rt.analytics.track('')).not.toThrow();
    expect(() => rt.analytics.track('upgrade_clicked', { feature: 'export', error: 'x' })).not.toThrow();
    const s = await saved(rt);
    expect(s.pending[DAY]).toEqual({ app_open: 1, 'upgrade_clicked:export': 1 });
  });
});
