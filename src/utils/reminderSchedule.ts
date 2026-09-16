export type ReminderMessage = { title: string; body: string };
export type ReminderSlot = ReminderMessage & { date: Date };

/** "HH:MM" → minutos desde medianoche; null si no es una hora válida. */
export function parseReminderTime(time: string): number | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

/**
 * Avisos a programar al abrir la app: desde mañana (hoy ya se ha entrado), a
 * cada hora de `times`, durante `days` días y sin pasar de `max` avisos
 * (iOS guarda como mucho 64). Los mensajes se alternan en orden.
 */
export function reminderSlots(
  now: Date,
  times: string[],
  days: number,
  messages: ReminderMessage[],
  max = 60,
): ReminderSlot[] {
  const minutes = [...new Set(times.map(parseReminderTime).filter((m): m is number => m !== null))].sort(
    (a, b) => a - b,
  );
  if (minutes.length === 0 || messages.length === 0) return [];
  const totalDays = Math.min(Math.max(0, Math.floor(days)), Math.floor(max / minutes.length));
  const slots: ReminderSlot[] = [];
  for (let d = 1; d <= totalDays; d++) {
    for (const m of minutes) {
      const msg = messages[slots.length % messages.length];
      slots.push({
        ...msg,
        date: new Date(now.getFullYear(), now.getMonth(), now.getDate() + d, Math.floor(m / 60), m % 60),
      });
    }
  }
  return slots;
}
