import {
  dailyStats,
  formatCount,
  isMailTestResult,
  isUsageReport,
  missingMailConfig,
  planLabel,
  planShares,
  platformShares,
  shortDay,
  splitUsageTotals,
  toNumber,
  usageLabel,
} from '../usageReport';
import { usageKey } from '../usageQueue';
import type { UsageReport } from '../../api/types';

describe('usageLabel', () => {
  it('traduce las rutas tal como las normaliza el cliente', () => {
    expect(usageLabel(usageKey('screen', 'Home')!)).toBe('Inicio');
    expect(usageLabel(usageKey('screen', 'Movimientos')!)).toBe('Movimientos');
    expect(usageLabel(usageKey('screen', 'Analítica')!)).toBe('Analítica');
    expect(usageLabel(usageKey('screen', 'Más')!)).toBe('Más');
    expect(usageLabel(usageKey('screen', 'NetWorth')!)).toBe('Patrimonio neto');
    expect(usageLabel(usageKey('screen', 'ForgotPassword')!)).toBe('Recuperar contraseña');
  });

  it('traduce acciones con y sin dimensión', () => {
    expect(usageLabel('transaction_created:expense')).toBe('Gasto creado');
    expect(usageLabel('transaction_created:income')).toBe('Ingreso creado');
    expect(usageLabel('balance_mode:historical')).toBe('Cambio a "Mis ahorros"');
    expect(usageLabel('search_used')).toBe('Búsqueda de movimientos');
  });

  it('con dimensión sin traducción exacta usa el evento base', () => {
    expect(usageLabel('purchase_success:plus')).toBe('Compra completada (Plus)');
    expect(usageLabel('upgrade_clicked:export')).toBe('Clic en mejorar plan (exportar)');
    expect(usageLabel('plan_limit_reached:goals')).toBe('Límite del plan alcanzado (goals)');
  });

  it('sin traducción devuelve la clave', () => {
    expect(usageLabel('screen:nueva')).toBe('screen:nueva');
    expect(usageLabel('evento_raro')).toBe('evento_raro');
    expect(usageLabel('evento_raro:x')).toBe('evento_raro:x');
  });
});

describe('splitUsageTotals', () => {
  const totals: UsageReport['totals'] = [
    { event: 'app_open', events: 900, users: 40 },
    { event: 'screen:home', events: 400, users: 38 },
    { event: 'screen:movimientos', events: 100, users: 20 },
    { event: 'transaction_created:expense', events: 50, users: 15 },
    { event: 'search_used', events: 25, users: 5 },
    { event: 'screen:settings', events: 0, users: 0 },
  ];

  it('separa pantallas y acciones, sin app_open ni filas a cero', () => {
    const { screens, actions } = splitUsageTotals(totals);
    expect(screens.map((r) => r.key)).toEqual(['screen:home', 'screen:movimientos']);
    expect(actions.map((r) => r.key)).toEqual(['transaction_created:expense', 'search_used']);
  });

  it('barras proporcionales al máximo de cada lista', () => {
    const { screens, actions } = splitUsageTotals(totals);
    expect(screens.map((r) => r.barPct)).toEqual([100, 25]);
    expect(actions.map((r) => r.barPct)).toEqual([100, 50]);
    expect(screens[0]).toMatchObject({ label: 'Inicio', events: 400, users: 38 });
  });

  it('ordena, limita y tolera números como texto', () => {
    const raw = [
      { event: 'goal_created', events: '3', users: '2' },
      { event: 'budget_created', events: '7', users: '1' },
      { event: 'export:csv', events: 5, users: 5 },
    ] as unknown as UsageReport['totals'];
    const { actions } = splitUsageTotals(raw, 2);
    expect(actions.map((r) => [r.key, r.events, r.users])).toEqual([
      ['budget_created', 7, 1],
      ['export:csv', 5, 5],
    ]);
  });
});

describe('repartos', () => {
  it('plataformas en porcentaje del total', () => {
    expect(
      platformShares([
        { platform: 'web', events: 25 },
        { platform: 'android', events: 75 },
        { platform: 'ios', events: 0 },
      ]),
    ).toEqual([
      { key: 'android', label: 'Android', value: 75, pct: 75 },
      { key: 'web', label: 'Web', value: 25, pct: 25 },
    ]);
  });

  it('planes con nombre legible', () => {
    expect(
      planShares([
        { plan_code: 'free', users: 8 },
        { plan_code: 'plus', users: 2 },
      ]).map((r) => [r.label, r.pct]),
    ).toEqual([
      ['Gratis', 80],
      ['Plus', 20],
    ]);
    expect(planLabel('desconocido')).toBe('desconocido');
  });

  it('sin datos, lista vacía', () => {
    expect(platformShares([])).toEqual([]);
  });
});

describe('dailyStats', () => {
  it('resume la serie de aperturas', () => {
    expect(
      dailyStats([
        { day: '2026-09-14', events: 0, users: 0 },
        { day: '2026-09-15', events: 12, users: 4 },
        { day: '2026-09-16', events: 8, users: 3 },
      ]),
    ).toEqual({ totalOpens: 20, peakOpens: 12, peakDay: '2026-09-15', avgUsers: 2.3, activeDays: 2 });
  });

  it('serie vacía', () => {
    expect(dailyStats([])).toEqual({ totalOpens: 0, peakOpens: 0, peakDay: null, avgUsers: 0, activeDays: 0 });
  });
});

describe('utilidades', () => {
  it('shortDay', () => {
    expect(shortDay('2026-09-16')).toBe('16/09');
    expect(shortDay('otra')).toBe('otra');
  });

  it('toNumber', () => {
    expect(toNumber('12')).toBe(12);
    expect(toNumber(null)).toBe(0);
    expect(toNumber('abc')).toBe(0);
  });

  it('missingMailConfig lista las claves que faltan', () => {
    expect(missingMailConfig({ SMTP_USER: true, SMTP_PASS: false, SMTP_HOST: false })).toEqual([
      'SMTP_HOST',
      'SMTP_PASS',
    ]);
    expect(missingMailConfig({ SMTP_HOST: true })).toEqual([]);
    expect(missingMailConfig(undefined)).toEqual([]);
  });

  it('missingMailConfig no marca como faltantes las claves opcionales ni la función de cierre que no aplica', () => {
    // Respuesta real de POST /admin/mail-test en LiteSpeed (Hostinger) con SMTP completo salvo la contraseña.
    const config = {
      SMTP_HOST: true,
      SMTP_PORT: false, // opcional (465 por defecto)
      SMTP_USER: true,
      SMTP_PASS: false,
      SMTP_FROM: false, // opcional (SMTP_USER por defecto)
      openssl: true,
      litespeed_finish_request: true,
      fastcgi_finish_request: false, // en LiteSpeed no existe y no hace falta
    };
    expect(missingMailConfig(config)).toEqual(['SMTP_PASS']);
    expect(missingMailConfig({ ...config, SMTP_PASS: true, openssl: false })).toEqual(['openssl']);
  });
});

describe('formatCount', () => {
  it('separa miles con punto', () => {
    expect(formatCount(0)).toBe('0');
    expect(formatCount(999)).toBe('999');
    expect(formatCount(12345)).toBe('12.345');
    expect(formatCount('1234567')).toBe('1.234.567');
    expect(formatCount(-4200)).toBe('-4.200');
    expect(formatCount('x')).toBe('0');
  });
});

describe('validación de respuestas', () => {
  const report: UsageReport = {
    days: 7,
    from: '2026-09-10',
    to: '2026-09-16',
    overview: { users_total: 1, users_new: 0, users_active: 1, verified_pct: 100, plans: [] },
    totals: [],
    by_platform: [],
    daily: [],
  };

  it('isUsageReport', () => {
    expect(isUsageReport(report)).toBe(true);
    expect(isUsageReport('<html>404</html>')).toBe(false);
    expect(isUsageReport({})).toBe(false);
    expect(isUsageReport({ ...report, totals: null })).toBe(false);
    expect(isUsageReport(null)).toBe(false);
  });

  it('isMailTestResult', () => {
    expect(isMailTestResult({ success: false, message: 'x', config: {} })).toBe(true);
    expect(isMailTestResult({ success: 'true' })).toBe(false);
    expect(isMailTestResult('ok')).toBe(false);
  });
});
