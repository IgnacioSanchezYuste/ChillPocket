import { Platform } from 'react-native';

/**
 * Wrapper fino de expo-local-authentication. Carga la librería de forma
 * protegida para que la app no se rompa en Expo Go o web cuando aún no
 * está instalada o no aplica.
 */

let LA: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  LA = require('expo-local-authentication');
} catch {
  LA = null;
}

const HAS_NATIVE = Platform.OS !== 'web' && !!LA && typeof LA.hasHardwareAsync === 'function';

/** True si el dispositivo TIENE sensor biométrico (huella o cara). */
export async function biometricHardwareAvailable(): Promise<boolean> {
  if (!HAS_NATIVE) return false;
  try {
    return !!(await LA.hasHardwareAsync());
  } catch {
    return false;
  }
}

/** True si el usuario tiene huella/cara configurada en el dispositivo. */
export async function biometricEnrolled(): Promise<boolean> {
  if (!HAS_NATIVE) return false;
  try {
    return !!(await LA.isEnrolledAsync());
  } catch {
    return false;
  }
}

/** Lanza el prompt biométrico nativo. Devuelve true si el usuario se autentica. */
export async function authenticateWithBiometric(reason = 'Desbloquea ChillPocket'): Promise<boolean> {
  if (!HAS_NATIVE) return false;
  try {
    const res = await LA.authenticateAsync({
      promptMessage: reason,
      // No exigir PIN del SO como fallback: nuestra app tiene su propio PIN.
      disableDeviceFallback: true,
      cancelLabel: 'Usar PIN',
    });
    return !!res?.success;
  } catch {
    return false;
  }
}
