import { AppState, Platform } from 'react-native';
import type * as NotificationsModule from 'expo-notifications';
import { REMINDERS } from '../config/reminders';
import { reminderSlots } from '../utils/reminderSchedule';
import { useAuthStore } from '../store/useAuthStore';
import { useOnboardingStore } from '../store/useOnboardingStore';

type Notifications = typeof NotificationsModule;

const CHANNEL_ID = 'reminders';
const KIND = 'daily-reminder';

// Carga perezosa y protegida: las builds anteriores no traen el módulo nativo.
let loaded: Notifications | null | undefined;
function notifications(): Notifications | null {
  if (loaded === undefined) {
    if (Platform.OS === 'web') {
      loaded = null;
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        loaded = require('expo-notifications') as Notifications;
      } catch {
        loaded = null;
      }
    }
  }
  return loaded;
}

async function hasPermission(N: Notifications): Promise<boolean> {
  const current = await N.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await N.requestPermissionsAsync()).granted;
}

let running: Promise<void> | null = null;

/** Cancela los recordatorios y, con sesión, los programa de nuevo desde mañana. */
export function rescheduleReminders(): Promise<void> {
  const N = notifications();
  if (!N) return Promise.resolve();
  // Dos disparadores seguidos (arranque + sesión) no deben duplicar avisos.
  const previous = running ?? Promise.resolve();
  const next = previous.then(async () => {
    try {
      const pending = await N.getAllScheduledNotificationsAsync();
      await Promise.all(
        pending
          .filter((p) => p.content.data?.kind === KIND)
          .map((p) => N.cancelScheduledNotificationAsync(p.identifier)),
      );
      if (!REMINDERS.enabled || !useAuthStore.getState().token) return;
      // Durante el tutorial no se pide permiso: se hará al terminarlo.
      if (useOnboardingStore.getState().active) return;
      if (!(await hasPermission(N))) return;
      if (Platform.OS === 'android') {
        await N.setNotificationChannelAsync(CHANNEL_ID, {
          name: 'Recordatorios',
          importance: N.AndroidImportance.DEFAULT,
        });
      }
      for (const slot of reminderSlots(new Date(), REMINDERS.times, REMINDERS.days, REMINDERS.messages)) {
        await N.scheduleNotificationAsync({
          content: { title: slot.title, body: slot.body, data: { kind: KIND } },
          trigger: { type: N.SchedulableTriggerInputTypes.DATE, date: slot.date, channelId: CHANNEL_ID },
        });
      }
    } catch {
      /* los recordatorios nunca deben romper la app */
    }
  });
  running = next;
  return next;
}

/**
 * Arranca los recordatorios (una vez, desde `App.tsx`): reprograma al abrir, al
 * volver a primer plano, al iniciar o cerrar sesión y al terminar el tutorial.
 */
export function initReminders(): () => void {
  const N = notifications();
  if (!N) return () => {};
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: false,
      shouldSetBadge: false,
    }),
  });
  void rescheduleReminders();
  const appState = AppState.addEventListener('change', (state) => {
    if (state === 'active') void rescheduleReminders();
  });
  const unsubAuth = useAuthStore.subscribe((s, prev) => {
    if (s.token !== prev.token) void rescheduleReminders();
  });
  const unsubOnboarding = useOnboardingStore.subscribe((s, prev) => {
    if (prev.active && !s.active) void rescheduleReminders();
  });
  return () => {
    appState.remove();
    unsubAuth();
    unsubOnboarding();
  };
}
