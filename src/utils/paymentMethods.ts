import type { PaymentMethod } from '../api/types';
import type { Ionicons } from '@expo/vector-icons';

export type PaymentMethodMeta = {
  value: PaymentMethod;
  label: string;
  /** Versión corta para espacios estrechos (cuadrícula del formulario). */
  shortLabel: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  { value: 'cash',        label: 'Efectivo',         shortLabel: 'Efectivo',      icon: 'cash-outline' },
  { value: 'debit_card',  label: 'Tarjeta débito',   shortLabel: 'Débito',        icon: 'card-outline' },
  { value: 'credit_card', label: 'Tarjeta crédito',  shortLabel: 'Crédito',       icon: 'card' },
  { value: 'bizum',       label: 'Bizum',            shortLabel: 'Bizum',         icon: 'phone-portrait-outline' },
  { value: 'transfer',    label: 'Transferencia',    shortLabel: 'Transferencia', icon: 'swap-horizontal-outline' },
  { value: 'other',       label: 'Otro',             shortLabel: 'Otro',          icon: 'ellipsis-horizontal-circle-outline' },
];

export function paymentMethodMeta(value: PaymentMethod | null | undefined): PaymentMethodMeta | null {
  if (!value) return null;
  return PAYMENT_METHODS.find((p) => p.value === value) ?? null;
}

export function paymentMethodLabel(value: PaymentMethod | null | undefined): string {
  return paymentMethodMeta(value)?.label ?? '—';
}
