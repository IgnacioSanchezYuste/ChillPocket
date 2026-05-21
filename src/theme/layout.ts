import { useWindowDimensions } from 'react-native';

// Breakpoints responsive. La app no estira el contenido: reorganiza.
//  - sm  (< 600): móvil, columna única, bottom tabs.
//  - md  (600–959): tablet, columna más ancha, algunas tarjetas en 2 columnas.
//  - lg  (>= 960): desktop/web, SIDEBAR lateral + contenido en grid.
export const BREAKPOINTS = { sm: 0, md: 600, lg: 960 } as const;
export type Breakpoint = 'sm' | 'md' | 'lg';

/** Ancho de la barra lateral en desktop. */
export const SIDEBAR_WIDTH = 240;
/** Ancho máximo del contenido en móvil/tablet. */
export const CONTENT_MAX_WIDTH = 600;
/** Ancho máximo del contenido en tablet (md). */
export const TABLET_MAX_WIDTH = 720;
/** Ancho máximo del área de contenido en desktop (sin contar el sidebar). */
export const DESKTOP_CONTENT_MAX = 960;

/**
 * Devuelve el breakpoint activo y banderas de conveniencia. Reacciona al
 * resize de la ventana (web) vía `useWindowDimensions`.
 */
export function useBreakpoint() {
  const { width } = useWindowDimensions();
  const bp: Breakpoint = width >= BREAKPOINTS.lg ? 'lg' : width >= BREAKPOINTS.md ? 'md' : 'sm';
  return {
    bp,
    width,
    isSm: bp === 'sm',
    isMd: bp === 'md',
    isLg: bp === 'lg',
    /** Alias semántico: en desktop mostramos el sidebar y ocultamos los bottom tabs. */
    isDesktop: bp === 'lg',
  };
}

/**
 * Ancho real del contenido (acotado) y un estilo de columna centrada.
 * - Desktop: el área útil es la ventana menos el sidebar, acotada a DESKTOP_CONTENT_MAX.
 * - Tablet/móvil: columna centrada como hasta ahora.
 */
export function useContentWidth() {
  const { width } = useWindowDimensions();
  const isDesktop = width >= BREAKPOINTS.lg;
  const isTablet = width >= BREAKPOINTS.md && !isDesktop;

  const maxWidth = isDesktop ? DESKTOP_CONTENT_MAX : isTablet ? TABLET_MAX_WIDTH : CONTENT_MAX_WIDTH;
  const available = isDesktop ? width - SIDEBAR_WIDTH : width;
  const contentWidth = Math.max(280, Math.min(available, maxWidth));

  return {
    width: contentWidth,
    columnStyle: { width: '100%' as const, maxWidth, alignSelf: 'center' as const },
  };
}
