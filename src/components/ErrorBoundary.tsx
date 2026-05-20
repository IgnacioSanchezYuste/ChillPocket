import React from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Text } from './Text';

type Props = {
  children: React.ReactNode;
  /** Si se pasa, se renderiza en vez de la UI de error por defecto. `null` = no renderizar nada. */
  fallback?: React.ReactNode;
  /** Etiqueta para los logs. */
  label?: string;
};

type State = { hasError: boolean; error: Error | null };

/**
 * Captura errores de render de sus hijos para que un fallo en un
 * subárbol (p.ej. el botón de Google si su config nativa no está lista)
 * no tumbe toda la app. Sin esto, un throw en LoginScreen dejaba la app
 * en bucle de crash al estar deslogueado.
 */
export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // eslint-disable-next-line no-console
    console.error(`[ErrorBoundary${this.props.label ? ' · ' + this.props.label : ''}]`, error, info);
  }

  reset = () => this.setState({ hasError: false, error: null });

  render() {
    if (!this.state.hasError) return this.props.children;
    if (this.props.fallback !== undefined) return this.props.fallback;

    return (
      <View style={styles.wrap}>
        <Text variant="h2" align="center">Algo ha fallado</Text>
        <Text variant="body" tone="secondary" align="center" style={{ marginTop: 8 }}>
          {this.state.error?.message || 'Error inesperado'}
        </Text>
        <Pressable onPress={this.reset} style={styles.btn}>
          <Text variant="body" weight="semibold" tone="accent">Reintentar</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 },
  btn: { marginTop: 20, paddingVertical: 12, paddingHorizontal: 24 },
});
