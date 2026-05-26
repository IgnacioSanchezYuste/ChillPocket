import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

/**
 * Wrapper unificado de almacenamiento seguro. Usa `expo-secure-store` cuando
 * está disponible (Android Keystore / iOS Keychain) y cae a AsyncStorage si
 * no lo está (web, Expo Go sin autolink, o build sin el paquete instalado).
 *
 * La firma es asíncrona en ambos casos para mantener una API uniforme.
 */

let SecureStore: any = null;
try {
  // Lazy require: si el paquete no está instalado o no es compatible (web),
  // mantenemos `SecureStore = null` y caemos a AsyncStorage.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  SecureStore = require('expo-secure-store');
} catch {
  SecureStore = null;
}

const HAS_NATIVE =
  Platform.OS !== 'web' && !!SecureStore && typeof SecureStore.getItemAsync === 'function';

export function secureStorageAvailable(): boolean {
  return HAS_NATIVE;
}

export async function secureGet(key: string): Promise<string | null> {
  if (HAS_NATIVE) {
    try {
      const v = await SecureStore.getItemAsync(key);
      return v ?? null;
    } catch {
      /* cae a fallback */
    }
  }
  return AsyncStorage.getItem(key);
}

export async function secureSet(key: string, value: string): Promise<void> {
  if (HAS_NATIVE) {
    try {
      await SecureStore.setItemAsync(key, value);
      return;
    } catch {
      /* cae a fallback */
    }
  }
  await AsyncStorage.setItem(key, value);
}

export async function secureDel(key: string): Promise<void> {
  if (HAS_NATIVE) {
    try {
      await SecureStore.deleteItemAsync(key);
      // no hagas return: también borra el fallback por si quedó copia legacy.
    } catch {
      /* ignore */
    }
  }
  try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
}

/**
 * Migra una clave de AsyncStorage al almacén seguro. Llámala una vez al
 * arranque para mover tokens legacy. Idempotente: si ya está en secure-store
 * y no hay residuo en AsyncStorage, no hace nada.
 */
export async function migrateToSecure(key: string): Promise<void> {
  if (!HAS_NATIVE) return;
  try {
    const inSecure = await SecureStore.getItemAsync(key);
    if (inSecure) {
      // Limpia cualquier residuo en AsyncStorage.
      try { await AsyncStorage.removeItem(key); } catch { /* ignore */ }
      return;
    }
    const legacy = await AsyncStorage.getItem(key);
    if (legacy) {
      await SecureStore.setItemAsync(key, legacy);
      await AsyncStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
