import { useWindowDimensions } from 'react-native';

// En web/PC la ventana es muy ancha. Limitamos el contenido a una columna
// tipo móvil centrada para que tarjetas y gráficas no se estiren ni se
// queden "pegadas" a un lado.
export const CONTENT_MAX_WIDTH = 600;

/**
 * Ancho real del contenido (acotado a CONTENT_MAX_WIDTH) y un estilo para
 * centrar una columna responsive. Reacciona a cambios de tamaño de ventana.
 */
export function useContentWidth() {
  const { width } = useWindowDimensions();
  const contentWidth = Math.min(width, CONTENT_MAX_WIDTH);
  return {
    width: contentWidth,
    /** Aplicar al contenedor que envuelve el contenido scrollable. */
    columnStyle: { width: '100%' as const, maxWidth: CONTENT_MAX_WIDTH, alignSelf: 'center' as const },
  };
}
