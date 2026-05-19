import { Alert, Platform } from 'react-native';

type ConfirmOptions = {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
};

/**
 * Diálogo de confirmación cross-platform. Devuelve una promesa que
 * resuelve a `true` si el usuario confirma, `false` si cancela.
 *
 * En web usa window.confirm; en native usa Alert.alert con botones
 * tipados (destructive en iOS, default en Android).
 */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  const {
    title,
    message,
    confirmLabel = 'Aceptar',
    cancelLabel = 'Cancelar',
    destructive = false,
  } = opts;

  if (Platform.OS === 'web') {
    const txt = message ? `${title}\n\n${message}` : title;
    return Promise.resolve(typeof window !== 'undefined' && window.confirm(txt));
  }

  return new Promise((resolve) => {
    Alert.alert(
      title,
      message,
      [
        { text: cancelLabel, style: 'cancel', onPress: () => resolve(false) },
        {
          text: confirmLabel,
          style: destructive ? 'destructive' : 'default',
          onPress: () => resolve(true),
        },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}

/** Atajo: confirmación de eliminación. */
export function confirmDelete(label: string, detail?: string): Promise<boolean> {
  return confirm({
    title: `Eliminar ${label}`,
    message: detail || '¿Seguro que quieres eliminarlo? Esta acción no se puede deshacer.',
    confirmLabel: 'Eliminar',
    cancelLabel: 'Cancelar',
    destructive: true,
  });
}
