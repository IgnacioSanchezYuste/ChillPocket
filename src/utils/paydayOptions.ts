import type { WheelPickerItem } from '../components/WheelPicker';

/**
 * Días del mes seleccionables como día de cobro: 1-30 y "fin de mes" (31).
 * 29 y 30 caen en el último día de febrero (igual que el servidor).
 */
export const MONTH_DAYS: WheelPickerItem[] = [
  ...Array.from({ length: 30 }, (_, i) => ({ label: String(i + 1), value: i + 1 })),
  { label: 'Fin mes', value: 31 },
];

/** Días de la semana para el cobro semanal (valor = getDay(), 0 = domingo). */
export const WEEKDAYS = [
  { label: 'L', value: 1 },
  { label: 'M', value: 2 },
  { label: 'X', value: 3 },
  { label: 'J', value: 4 },
  { label: 'V', value: 5 },
  { label: 'S', value: 6 },
  { label: 'D', value: 0 },
];
