const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const PAYMENT_METHODS = new Set(['Cash', 'Card', 'UPI', 'Bank Transfer', 'Other']);

export function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const d = new Date(value + 'T00:00:00Z');
  return !Number.isNaN(d.getTime());
}

export function isValidAmount(value) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && value < 100000000;
}

export function isValidPaymentMethod(value) {
  return typeof value === 'string' && PAYMENT_METHODS.has(value);
}

// Strips HTML tags / angle brackets to prevent stored XSS, and trims length.
export function sanitizeNote(value) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').trim().slice(0, 200);
}

export function sanitizeName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[<>]/g, '').trim().slice(0, 50);
}

export const PAYMENT_METHOD_LIST = [...PAYMENT_METHODS];
