import type { PaymentMethod } from '../api/types';
import type { Ionicons } from '@expo/vector-icons';

export type PaymentMethodMeta = {
  value: PaymentMethod;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
};

export const PAYMENT_METHODS: PaymentMethodMeta[] = [
  { value: 'cash',        label: 'Efectivo',         icon: 'cash-outline' },
  { value: 'debit_card',  label: 'Tarjeta débito',   icon: 'card-outline' },
  { value: 'credit_card', label: 'Tarjeta crédito',  icon: 'card' },
  { value: 'bizum',       label: 'Bizum',            icon: 'phone-portrait-outline' },
  { value: 'transfer',    label: 'Transferencia',    icon: 'swap-horizontal-outline' },
  { value: 'other',       label: 'Otro',             icon: 'ellipsis-horizontal-circle-outline' },
];

export function paymentMethodMeta(value: PaymentMethod | null | undefined): PaymentMethodMeta | null {
  if (!value) return null;
  return PAYMENT_METHODS.find((p) => p.value === value) ?? null;
}

export function paymentMethodLabel(value: PaymentMethod | null | undefined): string {
  return paymentMethodMeta(value)?.label ?? '—';
}
