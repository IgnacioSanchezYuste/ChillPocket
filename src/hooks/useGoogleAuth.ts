import { useEffect, useState } from 'react';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import { GOOGLE_CLIENT_IDS, googleAuthAvailable } from '../api/googleConfig';
import { useAuthStore } from '../store/useAuthStore';

// Necesario para cerrar la ventana del navegador embebido al volver
// al deep-link de la app tras autenticarse con Google.
WebBrowser.maybeCompleteAuthSession();

type State =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'error'; error: string };

/**
 * Hook unificado para iniciar sesión con Google.
 *
 * Devuelve:
 *  - `available`: si hay Client ID configurado (si no, oculta el botón).
 *  - `request`:   request object de expo-auth-session (se usa para `disabled`).
 *  - `signIn`:    función a invocar al pulsar el botón.
 *  - `state`:     idle | pending | error.
 */
export function useGoogleAuth() {
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);

  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_CLIENT_IDS.web || undefined,
    androidClientId: GOOGLE_CLIENT_IDS.android || undefined,
    iosClientId: GOOGLE_CLIENT_IDS.ios || undefined,
    // Forzamos id_token en la respuesta (lo que validamos en backend).
    responseType: 'id_token' as any,
    scopes: ['openid', 'profile', 'email'],
  });

  const [state, setState] = useState<State>({ status: 'idle' });

  useEffect(() => {
    if (!response) return;
    if (response.type === 'success') {
      const idToken =
        (response.authentication as any)?.idToken || (response.params as any)?.id_token;
      if (!idToken) {
        setState({ status: 'error', error: 'Google no devolvió id_token' });
        return;
      }
      setState({ status: 'pending' });
      loginWithGoogle(idToken)
        .then(() => setState({ status: 'idle' }))
        .catch((e) =>
          setState({
            status: 'error',
            error: e?.message ? String(e.message) : 'Error iniciando sesión con Google',
          })
        );
    } else if (response.type === 'error') {
      setState({
        status: 'error',
        error: response.error?.message || 'No se pudo abrir Google',
      });
    } else if (response.type === 'cancel' || response.type === 'dismiss') {
      setState({ status: 'idle' });
    }
  }, [response, loginWithGoogle]);

  const signIn = async () => {
    if (!googleAuthAvailable()) {
      setState({ status: 'error', error: 'Google OAuth no configurado' });
      return;
    }
    setState({ status: 'pending' });
    try {
      await promptAsync();
    } catch (e: any) {
      setState({ status: 'error', error: e?.message || 'Error al abrir Google' });
    }
  };

  return {
    available: googleAuthAvailable(),
    request,
    signIn,
    state,
  };
}
