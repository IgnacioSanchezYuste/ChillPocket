import { create } from 'zustand';
import { secureGet, secureSet, secureDel } from '../utils/secureStorage';

// Claves de almacenamiento. El PIN va al almacén seguro (Keystore); el resto
// son flags que también guardamos ahí por simplicidad y porque son baratos.
const KEY_PIN     = '@chillpocket:lock_pin';
const KEY_ENABLED = '@chillpocket:lock_enabled';
const KEY_BIO     = '@chillpocket:lock_biometric';

/** Ventana de tolerancia: tras este tiempo en background, vuelve a bloquear. */
export const LOCK_BACKGROUND_GRACE_MS = 5 * 60 * 1000;

type State = {
  hydrated: boolean;
  /** El bloqueo está activado (el usuario lo configuró en Ajustes). */
  enabled: boolean;
  /** ¿La biometría está permitida como método rápido de desbloqueo? */
  biometricEnabled: boolean;
  /** Estado dinámico: true cuando hay que pedir desbloqueo ANTES de usar la app. */
  locked: boolean;
  /** Marca cuándo se fue al background, para decidir si re-bloquear al volver. */
  lastBackgroundAt: number | null;

  hydrate: () => Promise<void>;
  /** Activa el bloqueo guardando el PIN y la preferencia de biometría. */
  enable: (pin: string, biometric: boolean) => Promise<void>;
  /** Desactiva por completo. Requiere haber validado el PIN actual antes. */
  disable: () => Promise<void>;
  /** Cambia el PIN (asume que el caller ya verificó el actual). */
  setPin: (pin: string) => Promise<void>;
  /** Activa/desactiva el método biométrico sin tocar el PIN. */
  setBiometric: (on: boolean) => Promise<void>;
  /** Comprueba si el PIN proporcionado es correcto. */
  verifyPin: (pin: string) => Promise<boolean>;
  /** Marca la app como bloqueada (la UI mostrará el LockScreen). */
  lock: () => void;
  /** Marca la app como desbloqueada y resetea el cronómetro de background. */
  unlock: () => void;
  /** Llamar al ir a background para registrar el momento. */
  markBackground: () => void;
};

export const useSecurityStore = create<State>((set, get) => ({
  hydrated: false,
  enabled: false,
  biometricEnabled: false,
  locked: false,
  lastBackgroundAt: null,

  hydrate: async () => {
    try {
      const [enabled, bio] = await Promise.all([secureGet(KEY_ENABLED), secureGet(KEY_BIO)]);
      const isOn = enabled === '1';
      set({
        enabled: isOn,
        biometricEnabled: bio === '1',
        // Al arrancar la app, si el bloqueo está activo, la app empieza bloqueada (cold start).
        locked: isOn,
        hydrated: true,
      });
    } catch {
      set({ hydrated: true });
    }
  },

  enable: async (pin, biometric) => {
    await secureSet(KEY_PIN, pin);
    await secureSet(KEY_ENABLED, '1');
    await secureSet(KEY_BIO, biometric ? '1' : '0');
    set({ enabled: true, biometricEnabled: biometric, locked: false, lastBackgroundAt: null });
  },

  disable: async () => {
    await secureDel(KEY_PIN);
    await secureDel(KEY_ENABLED);
    await secureDel(KEY_BIO);
    set({ enabled: false, biometricEnabled: false, locked: false, lastBackgroundAt: null });
  },

  setPin: async (pin) => {
    await secureSet(KEY_PIN, pin);
  },

  setBiometric: async (on) => {
    await secureSet(KEY_BIO, on ? '1' : '0');
    set({ biometricEnabled: on });
  },

  verifyPin: async (pin) => {
    const stored = await secureGet(KEY_PIN);
    return !!stored && stored === pin;
  },

  lock: () => {
    if (get().enabled) set({ locked: true });
  },
  unlock: () => set({ locked: false, lastBackgroundAt: null }),
  markBackground: () => set({ lastBackgroundAt: Date.now() }),
}));
