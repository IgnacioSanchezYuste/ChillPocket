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

  // Este hook se usa SOLO en web (en Android/iOS se usa el SDK nativo en
  // GoogleButton.native.tsx). En web forzamos el flujo implícito id_token,
  // que es el que el cliente Web de Google soporta y nos da el id_token
  // directamente en `params.id_token`. (En nativo este responseType daba
  // "invalid_request", pero aquí ya no afecta porque nativo no usa este hook.)
  const [request, response, promptAsync] = Google.useAuthRequest({
    webClientId: GOOGLE_CLIENT_IDS.web || undefined,
    responseType: 'id_token' as any,
    scopes: ['openid', 'profile', 'email'],
  });

  const [state, setState] = useState<State>({ status: 'idle' });

  // DEV helper: imprime el redirect URI exacto que genera la app. Cópialo y
  // pégalo en Google Cloud → Credenciales → tu Client ID → URIs de redireccionamiento.
  // Puedes borrar este efecto cuando ya lo tengas configurado.
  useEffect(() => {
    if (__DEV__ && request?.redirectUri) {
      // eslint-disable-next-line no-console
      console.log('🔑 [Google OAuth] Redirect URI a registrar en Google Cloud:', request.redirectUri);
    }
  }, [request?.redirectUri]);

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
