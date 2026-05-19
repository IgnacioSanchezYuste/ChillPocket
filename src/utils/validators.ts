/**
 * Validadores reutilizables para formularios. Devuelven `null` si el
 * valor es válido o un `string` con el mensaje de error.
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateEmail(value: string): string | null {
  const v = value.trim();
  if (!v) return 'El email es obligatorio';
  if (!EMAIL_RE.test(v)) return 'Email no válido';
  return null;
}

export function validatePassword(value: string, minLength = 6): string | null {
  if (!value) return 'La contraseña es obligatoria';
  if (value.length < minLength) return `Mínimo ${minLength} caracteres`;
  return null;
}

export function validateName(value: string, minLength = 2): string | null {
  const v = value.trim();
  if (!v) return 'El nombre es obligatorio';
  if (v.length < minLength) return `Mínimo ${minLength} caracteres`;
  return null;
}

export function validateAmount(value: string, opts?: { min?: number; max?: number }): string | null {
  const min = opts?.min ?? 0;
  const max = opts?.max ?? Number.MAX_SAFE_INTEGER;
  const n = parseFloat(String(value).replace(',', '.'));
  if (!Number.isFinite(n)) return 'Importe no válido';
  if (n < min) return `Debe ser ≥ ${min}`;
  if (n > max) return `Debe ser ≤ ${max}`;
  return null;
}

export function validateISODate(value: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return 'Formato YYYY-MM-DD';
  const d = new Date(value);
  if (isNaN(d.getTime())) return 'Fecha no válida';
  return null;
}

/** Limpia espacios al inicio/fin y colapsa los internos a uno. */
export function sanitizeText(value: string): string {
  return value.trim().replace(/\s+/g, ' ');
}
