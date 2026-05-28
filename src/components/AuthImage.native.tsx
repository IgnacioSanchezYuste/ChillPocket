/**
 * AuthImage — variante NATIVA (Android / iOS)
 *
 * Muestra una imagen privada autenticada enviando el JWT en la cabecera
 * `Authorization` directamente en el `source` de React Native Image.
 * Esto evita exponer el token en la URL o hacer un fetch adicional.
 *
 * Uso: se empleará en el detalle de transacción (Fase 3). NO usar en listados.
 */
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  ImageStyle,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { secureGet } from '../utils/secureStorage';
import { TOKEN_KEY } from '../api/http';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/spacing';
import { Skeleton } from './Skeleton';

export type AuthImageProps = {
  /** URL absoluta del endpoint privado (usa `transactionsApi.getReceiptUrl(id)`). */
  url: string;
  /** Estilos de la imagen. Debe incluir width/height para que RN la renderice. */
  style?: ImageStyle;
  /** Estilos del contenedor exterior. */
  containerStyle?: ViewStyle;
  accessibilityLabel?: string;
};

export const AuthImage: React.FC<AuthImageProps> = ({
  url,
  style,
  containerStyle,
  accessibilityLabel = 'Foto de justificante',
}) => {
  const { palette } = useTheme();
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [tokenReady, setTokenReady] = useState(false);

  // Carga el token una única vez al montar. No dispara fetch de imagen.
  useEffect(() => {
    let cancelled = false;
    secureGet(TOKEN_KEY).then((t) => {
      if (!cancelled) {
        setToken(t);
        setTokenReady(true);
      }
    });
    return () => { cancelled = true; };
  }, []);

  const containerSize = StyleSheet.flatten(style) as { width?: number; height?: number } | undefined;
  const w = containerSize?.width ?? 200;
  const h = containerSize?.height ?? 200;

  // Mientras obtenemos el token mostramos skeleton
  if (!tokenReady) {
    return (
      <View style={[styles.wrapper, { width: w, height: h }, containerStyle]}>
        <Skeleton width={w} height={h} borderRadius={radius.md} />
      </View>
    );
  }

  if (error) {
    return (
      <View
        style={[
          styles.wrapper,
          styles.fallback,
          { width: w, height: h, backgroundColor: palette.bgElevated, borderRadius: radius.md },
          containerStyle,
        ]}
      >
        <Ionicons name="image-outline" size={32} color={palette.textSecondary} />
      </View>
    );
  }

  return (
    <View style={[styles.wrapper, containerStyle]}>
      {loading && (
        <View
          style={[
            styles.overlay,
            { width: w, height: h, backgroundColor: palette.bgElevated, borderRadius: radius.md },
          ]}
        >
          <ActivityIndicator color={palette.accent} />
        </View>
      )}
      <Image
        source={
          token
            ? { uri: url, headers: { Authorization: `Bearer ${token}` } }
            : { uri: url }
        }
        style={[{ borderRadius: radius.md }, style]}
        accessibilityLabel={accessibilityLabel}
        onLoadStart={() => { setLoading(true); setError(false); }}
        onLoad={() => setLoading(false)}
        onError={() => { setLoading(false); setError(true); }}
        resizeMode="cover"
      />
    </View>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative',
  },
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1,
  },
});
