import { GoogleSignin } from '@react-native-google-signin/google-signin';

// En nativo cerramos la sesión del SDK de Google para que el próximo login
// muestre el selector de cuentas y no reutilice la anterior.
export async function clearGoogleSession(): Promise<void> {
  try {
    await GoogleSignin.signOut();
  } catch {
    /* puede no haber sesión Google; ignoramos */
  }
}
