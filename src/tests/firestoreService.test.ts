import { describe, it, expect } from 'vitest';
import { computeInvoiceStatus, sanitizeForFirestore } from '../services/firestoreService';
import type { Invoice } from '../types';

describe('Firestore Service & Business Rules Test Suite', () => {
  describe('computeInvoiceStatus', () => {
    it('returns PAID for any invoice with payment_status PAID', () => {
      const inv: Partial<Invoice> = {
        payment_status: 'PAID',
        due_date: '2020-01-01',
      };
      expect(computeInvoiceStatus(inv, '2026-10-25')).toBe('PAID');
    });

    it('returns CANCELLED for cancelled invoices regardless of due date', () => {
      const inv: Partial<Invoice> = {
        payment_status: 'CANCELLED',
        due_date: '2020-01-01',
      };
      expect(computeInvoiceStatus(inv, '2026-10-25')).toBe('CANCELLED');
    });

    it('identifies OVERDUE invoices when due_date is in the past', () => {
      const inv: Partial<Invoice> = {
        payment_status: 'UNPAID',
        due_date: '2026-10-20',
      };
      expect(computeInvoiceStatus(inv, '2026-10-25')).toBe('OVERDUE');
    });

    it('keeps UNPAID status when due_date is in the future', () => {
      const inv: Partial<Invoice> = {
        payment_status: 'UNPAID',
        due_date: '2026-11-01',
      };
      expect(computeInvoiceStatus(inv, '2026-10-25')).toBe('UNPAID');
    });

    it('keeps UNPAID status on the exact due date', () => {
      const inv: Partial<Invoice> = {
        payment_status: 'UNPAID',
        due_date: '2026-10-25',
      };
      expect(computeInvoiceStatus(inv, '2026-10-25')).toBe('UNPAID');
    });

    it('handles invoices without due_date by defaulting to UNPAID', () => {
      const inv: Partial<Invoice> = {
        payment_status: 'UNPAID',
      };
      expect(computeInvoiceStatus(inv, '2026-10-25')).toBe('UNPAID');
    });
  });

  describe('sanitizeForFirestore', () => {
    it('preserves primitive values and null', () => {
      expect(sanitizeForFirestore(42)).toBe(42);
      expect(sanitizeForFirestore('receipto')).toBe('receipto');
      expect(sanitizeForFirestore(true)).toBe(true);
      expect(sanitizeForFirestore(null)).toBeNull();
      expect(sanitizeForFirestore(undefined)).toBeUndefined();
    });

    it('removes undefined properties from objects to prevent Firestore runtime errors', () => {
      const input = {
        id: 'inv-123',
        notes: undefined,
        amount: 250,
        metadata: {
          client: 'Acme',
          secondaryContact: undefined,
        },
      };

      const result = sanitizeForFirestore(input) as any;
      expect(result).toEqual({
        id: 'inv-123',
        amount: 250,
        metadata: {
          client: 'Acme',
        },
      });
      expect('notes' in result).toBe(false);
      expect('secondaryContact' in result.metadata).toBe(false);
    });

    it('filters out undefined elements from arrays and recursively sanitizes object items', () => {
      const input = [
        { name: 'Item 1', price: 100, promo: undefined },
        undefined,
        { name: 'Item 2', price: 200 },
      ];

      const result = sanitizeForFirestore(input) as any[];
      expect(result.length).toBe(2);
      expect(result[0]).toEqual({ name: 'Item 1', price: 100 });
      expect('promo' in result[0]).toBe(false);
      expect(result[1]).toEqual({ name: 'Item 2', price: 200 });
    });

    it('preserves native Date objects without corrupting them', () => {
      const date = new Date('2026-10-25T12:00:00Z');
      const input = { createdAt: date, title: 'Invoice' };
      const result = sanitizeForFirestore(input) as any;
      expect(result.createdAt).toBeInstanceOf(Date);
      expect(result.createdAt.toISOString()).toBe('2026-10-25T12:00:00.000Z');
    });
  });
});
