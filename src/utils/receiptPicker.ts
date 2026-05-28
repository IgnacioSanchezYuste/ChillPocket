/**
 * receiptPicker — stub para TypeScript.
 *
 * Metro resuelve esta importación con la variante de plataforma correcta:
 *   receiptPicker.native.ts  → Android / iOS  (expo-image-picker)
 *   receiptPicker.web.ts     → Web             (input type="file")
 *
 * TSC no entiende las extensiones de plataforma; apuntamos aquí a la
 * variante nativa como referencia de tipos.
 */
export {
  validateReceiptAsset,
  buildReceiptFormData,
  pickFromGallery,
  pickFromCamera,
} from './receiptPicker.native';
export type { ReceiptAsset } from './receiptPicker.native';
