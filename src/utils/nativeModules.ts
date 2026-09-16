/**
 * Detección de módulos nativos que faltan en el binario instalado.
 *
 * El JS nuevo puede llegar (Metro, actualización) a un build de EAS generado
 * antes de añadir una librería nativa. En vez de un error genérico, se avisa de
 * que hay que instalar la versión nueva de la app.
 */

export const MISSING_NATIVE_MESSAGE =
  'Tu versión de la app no incluye esta función. Instala la última versión para usarla.';

// Solo mensajes de "no existe en el binario". Nombrar el módulo no basta: un
// fallo real ("Call to function 'ExpoPrint.printToFileAsync' has been rejected")
// también lo nombra y no se arregla actualizando la app.
const MISSING_NATIVE_RE =
  /cannot find native module|native module\b.*\b(not found|doesn't exist|is null)|requireNativeModule|not linked|could not be found\. verify that a module by this name is registered|linked all the native dependencies/i;

export function isMissingNativeModule(error: unknown): boolean {
  if (error == null) return false;
  // UnavailabilityError de expo-modules-core: p. ej. el shim de
  // expo-file-system/legacy cuando el binario no trae ExponentFileSystem.
  if ((error as { code?: unknown }).code === 'ERR_UNAVAILABLE') return true;
  const message =
    error instanceof Error ? error.message : typeof error === 'string' ? error : String((error as any)?.message ?? '');
  return message === MISSING_NATIVE_MESSAGE || MISSING_NATIVE_RE.test(message);
}
