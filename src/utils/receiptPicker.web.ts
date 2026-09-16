/**
 * receiptPicker — variante WEB
 *
 * En web, expo-image-picker usa internamente un <input type="file">,
 * pero el acceso a fileSize/mimeType real viene del File nativo.
 * Usamos un <input type="file"> programático para máxima fiabilidad
 * y obtener el File objeto directamente.
 */

export type ReceiptAsset = {
  /** URI local del archivo (objectURL en web). */
  uri: string;
  /** MIME type. */
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Tamaño en bytes. */
  size: number;
  /** Nombre sugerido. */
  fileName: string;
  /** Solo en web: el File objeto original para FormData. */
  file?: File;
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

export function validateReceiptAsset(asset: ReceiptAsset): string | null {
  if (asset.size > MAX_BYTES) return 'La foto supera el límite de 5 MB';
  if (!ALLOWED_TYPES.includes(asset.mimeType)) return 'Formato no admitido (jpg, png, webp)';
  return null;
}

/** Construye FormData para web usando el File objeto directamente. */
export function buildReceiptFormData(asset: ReceiptAsset): FormData {
  const form = new FormData();
  if (asset.file) {
    form.append('receipt', asset.file, asset.fileName);
  } else {
    // Fallback: si por alguna razón no tenemos el File, omitir.
    // El backend rechazará la petición con 400, que se maneja en el sheet.
  }
  return form;
}

/** Abre el selector de archivo del navegador y retorna el asset. */
export async function pickFromGallery(): Promise<ReceiptAsset | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const mimeType = ALLOWED_TYPES.includes(file.type)
        ? (file.type as ReceiptAsset['mimeType'])
        : 'image/jpeg';
      const uri = URL.createObjectURL(file);
      resolve({
        uri,
        mimeType,
        size: file.size,
        fileName: file.name,
        file,
      });
      // No revocamos aquí; el sheet lo gestiona al desmontar o al limpiar.
    };

    input.oncancel = () => resolve(null);

    document.body.appendChild(input);
    input.click();
    // Limpiar el DOM tras la interacción
    setTimeout(() => {
      if (document.body.contains(input)) document.body.removeChild(input);
    }, 5000);
  });
}

/** En web, cámara usa el mismo input con capture. */
export async function pickFromCamera(): Promise<ReceiptAsset | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/jpeg,image/png,image/webp';
    input.capture = 'environment';
    input.style.display = 'none';

    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const mimeType = ALLOWED_TYPES.includes(file.type)
        ? (file.type as ReceiptAsset['mimeType'])
        : 'image/jpeg';
      const uri = URL.createObjectURL(file);
      resolve({
        uri,
        mimeType,
        size: file.size,
        fileName: file.name,
        file,
      });
    };

    input.oncancel = () => resolve(null);

    document.body.appendChild(input);
    input.click();
    setTimeout(() => {
      if (document.body.contains(input)) document.body.removeChild(input);
    }, 5000);
  });
}
