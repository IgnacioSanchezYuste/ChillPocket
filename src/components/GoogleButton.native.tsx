import React, { useState } from 'react';
import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { ErrorBoundary } from './ErrorBoundary';
import { GoogleButtonView } from './GoogleButtonView';
import { useToast } from './Toast';
import { GOOGLE_CLIENT_IDS, googleAuthAvailable } from '../api/googleConfig';
import { useAuthStore } from '../store/useAuthStore';

type Props = {
  label?: string;
  hideIfUnavailable?: boolean;
};

// Configuración única del SDK nativo. `webClientId` es lo único necesario:
// el SDK identifica el cliente de Android internamente a través del package
// name + huella SHA-1 de la firma (registrados en Google Cloud), y pone el
// `aud` del idToken al Web Client ID para que nuestro backend lo valide.
// IMPORTANTE: `androidClientId` NO es una opción válida de esta librería.
let configured = false;
function ensureConfigured() {
  if (configured) return;
  GoogleSignin.configure({
    webClientId: GOOGLE_CLIENT_IDS.web || undefined,
    // offlineAccess: false → no necesitamos serverAuthCode, solo idToken.
    offlineAccess: false,
  });
  configured = true;
}

// Implementación NATIVA (Android/iOS) usando el SDK nativo de Google.
// No usa navegador ni custom URI scheme, así que evita el error
// "Custom URI scheme is not enabled for your Android client".
export const GoogleButton: React.FC<Props> = (props) => {
  const available = googleAuthAvailable();
  if (props.hideIfUnavailable !== false && !available) return null;
  return (
    <ErrorBoundary label="GoogleButton(native)" fallback={null}>
      <GoogleButtonNativeInner {...props} />
    </ErrorBoundary>
  );
};

const GoogleButtonNativeInner: React.FC<Props> = ({ label = 'Continuar con Google' }) => {
  const toast = useToast();
  const loginWithGoogle = useAuthStore((s) => s.loginWithGoogle);
  const [loading, setLoading] = useState(false);

  const onPress = async () => {
    setLoading(true);
    try {
      ensureConfigured();
      await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
      // Forzar el selector de cuenta: si había una sesión Google cacheada,
      // signIn() entraría directo con ella sin dejar elegir otra. Cerrando
      // sesión nativa antes, Google muestra siempre el selector de cuentas.
      try { await GoogleSignin.signOut(); } catch { /* no había sesión previa */ }
      const result: any = await GoogleSignin.signIn();

      // Soporta ambas formas de respuesta según versión del SDK:
      //  v13+: { type: 'success', data: { idToken, ... } }
      //  <v13: { idToken, user, ... }
      const idToken: string | undefined = result?.data?.idToken ?? result?.idToken;
      if (result?.type === 'cancelled') {
        return; // el usuario cerró el selector
      }
      if (!idToken) {
        throw new Error('Google no devolvió idToken (revisa webClientId)');
      }
      await loginWithGoogle(idToken);
    } catch (e: any) {
      const code = e?.code;
      if (code === statusCodes.SIGN_IN_CANCELLED || code === statusCodes.IN_PROGRESS) {
        // silencioso
      } else if (code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        toast.error('Google Play Services no disponible');
      } else {
        toast.error(e?.message ? String(e.message) : 'Error iniciando sesión con Google');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <GoogleButtonView label={label} loading={loading} disabled={loading} onPress={onPress} />
  );
};
