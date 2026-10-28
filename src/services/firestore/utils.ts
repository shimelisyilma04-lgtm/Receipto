import type { Invoice, PaymentStatus } from '../../types.js';

// Calculate invoice payment status based on due date
export function computeInvoiceStatus(invoice: Partial<Invoice>, todayStr?: string): PaymentStatus {
  if (invoice.payment_status === 'PAID') return 'PAID';
  if (invoice.payment_status === 'CANCELLED') return 'CANCELLED';

  const today = todayStr || new Date().toISOString().split('T')[0];
  if (invoice.due_date && invoice.due_date < today) {
    return 'OVERDUE';
  }
  return 'UNPAID';
}

/**
 * Recursively strips undefined properties from data before sending to Firestore.
 * Firestore throws 'Unsupported field value: undefined' if any property is undefined.
 */
export function sanitizeForFirestore<T>(data: T): T {
  if (data === null || data === undefined) {
    return data;
  }
  if (Array.isArray(data)) {
    return data
      .filter((item) => item !== undefined)
      .map((item) => sanitizeForFirestore(item)) as unknown as T;
  }
  if (typeof data === 'object' && !(data instanceof Date)) {
    const sanitized: Record<string, any> = {};
    for (const [key, value] of Object.entries(data as Record<string, any>)) {
      if (value !== undefined) {
        sanitized[key] = sanitizeForFirestore(value);
      }
    }
    return sanitized as T;
  }
  return data;
}
