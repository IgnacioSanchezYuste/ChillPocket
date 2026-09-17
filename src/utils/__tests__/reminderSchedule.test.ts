import { parseReminderTime, reminderSlots } from '../reminderSchedule';

const MSGS = [
  { title: 'A', body: 'a' },
  { title: 'B', body: 'b' },
];

describe('parseReminderTime', () => {
  it('acepta HH:MM y descarta lo inválido', () => {
    expect(parseReminderTime('20:00')).toBe(1200);
    expect(parseReminderTime('9:05')).toBe(545);
    expect(parseReminderTime('24:00')).toBeNull();
    expect(parseReminderTime('12:60')).toBeNull();
    expect(parseReminderTime('mediodía')).toBeNull();
  });
});

describe('reminderSlots', () => {
  const now = new Date(2026, 8, 30, 21, 30); // 30 de septiembre, 21:30

  it('empieza mañana (hoy ya se abrió la app) y cruza de mes', () => {
    const slots = reminderSlots(now, ['20:00'], 2, MSGS);
    expect(slots.map((s) => s.date)).toEqual([new Date(2026, 9, 1, 20, 0), new Date(2026, 9, 2, 20, 0)]);
  });

  it('varias horas al día, ordenadas y sin duplicados; mensajes alternos', () => {
    const slots = reminderSlots(now, ['19:00', '10:30', '19:00', 'x'], 1, MSGS);
    expect(slots.map((s) => [s.date.getHours(), s.date.getMinutes(), s.title])).toEqual([
      [10, 30, 'A'],
      [19, 0, 'B'],
    ]);
  });

  it('no pasa del máximo de avisos pendientes', () => {
    const slots = reminderSlots(now, ['9:00', '13:00', '17:00', '21:00'], 30, MSGS, 60);
    expect(slots).toHaveLength(60);
    expect(slots[slots.length - 1].date).toEqual(new Date(2026, 9, 15, 21, 0));
  });

  it('sin horas válidas, sin días o sin mensajes no programa nada', () => {
    expect(reminderSlots(now, [], 14, MSGS)).toEqual([]);
    expect(reminderSlots(now, ['20:00'], 0, MSGS)).toEqual([]);
    expect(reminderSlots(now, ['20:00'], 14, [])).toEqual([]);
  });
});
