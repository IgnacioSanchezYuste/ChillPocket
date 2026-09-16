/**
 * receiptPicker — variante NATIVA (Android / iOS)
 *
 * Usa expo-image-picker para cámara y galería.
 * Retorna un ReceiptAsset listo para construir el FormData multipart,
 * o null si el usuario cancela o deniega permisos.
 */
import type * as ImagePickerModule from 'expo-image-picker';
import { MISSING_NATIVE_MESSAGE } from './nativeModules';

// Carga perezosa y protegida: un build sin expo-image-picker no debe romper la
// app al abrir el formulario; solo falla (con un mensaje claro) al usarlo.
let pickerModule: typeof ImagePickerModule | null | undefined;
function imagePicker(): typeof ImagePickerModule {
  if (pickerModule === undefined) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      pickerModule = require('expo-image-picker') as typeof ImagePickerModule;
    } catch {
      pickerModule = null;
    }
  }
  if (!pickerModule) throw new Error(MISSING_NATIVE_MESSAGE);
  return pickerModule;
}

export type ReceiptAsset = {
  /** URI local del archivo (file:// en nativo, data:/blob: en web). */
  uri: string;
  /** MIME type. */
  mimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  /** Tamaño en bytes. */
  size: number;
  /** Nombre sugerido (el servidor ignora esto; solo para el campo name del FormData). */
  fileName: string;
};

const MAX_BYTES = 5 * 1024 * 1024; // 5 MB

/** Valida el asset y retorna el error como string, o null si es válido. */
export function validateReceiptAsset(asset: ReceiptAsset): string | null {
  if (asset.size > MAX_BYTES) return 'La foto supera el límite de 5 MB';
  const allowed = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowed.includes(asset.mimeType)) return 'Formato no admitido (jpg, png, webp)';
  return null;
}

/** Construye el FormData multipart para el endpoint POST /transactions/{id}/receipt */
export function buildReceiptFormData(asset: ReceiptAsset): FormData {
  const form = new FormData();
  // React Native acepta el formato { uri, name, type } en append
  form.append('receipt', {
    uri: asset.uri,
    name: asset.fileName,
    type: asset.mimeType,
  } as unknown as Blob);
  return form;
}

/** Solicita permiso de galería y retorna el asset elegido o null. */
export async function pickFromGallery(): Promise<ReceiptAsset | null> {
  const ImagePicker = imagePicker();
  const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchImageLibraryAsync({
    mediaTypes: 'images',
    allowsEditing: false,
    quality: 0.85,
    allowsMultipleSelection: false,
  });

  if (result.canceled || !result.assets.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: (asset.mimeType as ReceiptAsset['mimeType']) ?? 'image/jpeg',
    size: asset.fileSize ?? 0,
    fileName: asset.fileName ?? `receipt_${Date.now()}.jpg`,
  };
}

/** Solicita permiso de cámara y retorna el asset fotografiado o null. */
export async function pickFromCamera(): Promise<ReceiptAsset | null> {
  const ImagePicker = imagePicker();
  const { status } = await ImagePicker.requestCameraPermissionsAsync();
  if (status !== 'granted') return null;

  const result = await ImagePicker.launchCameraAsync({
    mediaTypes: 'images',
    allowsEditing: false,
    quality: 0.85,
  });

  if (result.canceled || !result.assets.length) return null;
  const asset = result.assets[0];
  return {
    uri: asset.uri,
    mimeType: (asset.mimeType as ReceiptAsset['mimeType']) ?? 'image/jpeg',
    size: asset.fileSize ?? 0,
    fileName: asset.fileName ?? `receipt_${Date.now()}.jpg`,
  };
}
