/**
 * Configuración de Client IDs de Google OAuth.
 *
 * Cómo se eligen los valores en tiempo de ejecución:
 *  - Web (incluido Expo Go cuando usa el proxy auth.expo.io): WEB_CLIENT_ID
 *  - Android nativo:                                          ANDROID_CLIENT_ID
 *  - iOS nativo:                                              IOS_CLIENT_ID
 *
 * Puedes inyectar los IDs desde el entorno con variables EXPO_PUBLIC_*
 * (`.env` o `.env.local`). Si no, edita los valores por defecto aquí.
 */

export const GOOGLE_CLIENT_IDS = {
  web:
    process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID ||
    'PEGA_AQUI_EL_WEB_CLIENT_ID.apps.googleusercontent.com',
  android:
    process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID ||
    '',
  ios:
    process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID ||
    '',
};

/** True si al menos hay un Web Client ID válido configurado. */
export function googleAuthAvailable(): boolean {
  return (
    !!GOOGLE_CLIENT_IDS.web &&
    !GOOGLE_CLIENT_IDS.web.startsWith('PEGA_AQUI')
  );
}
