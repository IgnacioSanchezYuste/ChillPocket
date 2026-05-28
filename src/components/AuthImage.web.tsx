/**
 * AuthImage — variante WEB
 *
 * En web, `<Image source={{ headers }}>` de React Native no envía las
 * cabeceras HTTP personalizadas. Por eso hacemos `fetch` con Authorization,
 * convertimos la respuesta en un Blob y creamos un Object URL temporal.
 * En cleanup revocamos el Object URL para no fugar memoria.
 *
 * Usa la etiqueta `<img>` nativa de HTML (React DOM) para máxima compatibilidad.
 *
 * Uso: se empleará en el detalle de transacción (Fase 3). NO usar en listados.
 */
import React, { useEffect, useRef, useState } from 'react';
import { StyleSheet, View, ViewStyle, ImageStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { secureGet } from '../utils/secureStorage';
import { TOKEN_KEY } from '../api/http';
import { useTheme } from '../theme/ThemeProvider';
import { radius } from '../theme/spacing';
import { Skeleton } from './Skeleton';

export type AuthImageProps = {
  /** URL absoluta del endpoint privado (usa `transactionsApi.getReceiptUrl(id)`). */
  url: string;
  /** Estilos de la imagen. Se extraen `width`/`height` para dimensionar el contenedor. */
  style?: ImageStyle;
  /** Estilos del contenedor exterior. */
  containerStyle?: ViewStyle;
  accessibilityLabel?: string;
};

type State =
  | { phase: 'loading' }
  | { phase: 'ready'; objectUrl: string }
  | { phase: 'error' };

export const AuthImage: React.FC<AuthImageProps> = ({
  url,
  style,
  containerStyle,
  accessibilityLabel = 'Foto de justificante',
}) => {
  const { palette } = useTheme();
  const [state, setState] = useState<State>({ phase: 'loading' });
  // Guardamos el Object URL en un ref para poder revocarlo aunque el estado haya cambiado
  const objectUrlRef = useRef<string | null>(null);

  const flatStyle = StyleSheet.flatten(style) as { width?: number; height?: number } | undefined;
  const w = flatStyle?.width ?? 200;
  const h = flatStyle?.height ?? 200;

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setState({ phase: 'loading' });

      // Revoca cualquier Object URL anterior
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }

      try {
        const token = await secureGet(TOKEN_KEY);
        const headers: Record<string, string> = {};
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(url, { headers });

        if (!res.ok) {
          // 401/403/404 → fallback, sin romper
          if (!cancelled) setState({ phase: 'error' });
          return;
        }

        const blob = await res.blob();
        if (cancelled) {
          // No crear URL si el componente ya se desmontó
          return;
        }

        const objectUrl = URL.createObjectURL(blob);
        objectUrlRef.current = objectUrl;
        setState({ phase: 'ready', objectUrl });
      } catch {
        if (!cancelled) setState({ phase: 'error' });
      }
    };

    load();

    return () => {
      cancelled = true;
      // Cleanup: revoca el Object URL para no fugar memoria
      if (objectUrlRef.current) {
        URL.revokeObjectURL(objectUrlRef.current);
        objectUrlRef.current = null;
      }
    };
  // Recarga si cambia la URL
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const borderRadius = (StyleSheet.flatten(style) as { borderRadius?: number } | undefined)?.borderRadius
    ?? radius.md;

  if (state.phase === 'loading') {
    return (
      <View style={[{ width: w, height: h }, containerStyle]}>
        <Skeleton width={w} height={h} borderRadius={borderRadius} />
      </View>
    );
  }

  if (state.phase === 'error') {
    return (
      <View
        style={[
          styles.fallback,
          {
            width: w,
            height: h,
            backgroundColor: palette.bgElevated,
            borderRadius,
          },
          containerStyle,
        ]}
      >
        <Ionicons name="image-outline" size={32} color={palette.textSecondary} />
      </View>
    );
  }

  // state.phase === 'ready'
  return (
    <View style={[{ width: w, height: h, borderRadius, overflow: 'hidden' }, containerStyle]}>
      {/* eslint-disable-next-line jsx-a11y/img-redundant-alt */}
      <img
        src={state.objectUrl}
        alt={accessibilityLabel}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          display: 'block',
          borderRadius,
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  fallback: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
