import { z } from 'zod';

const dateRegex = /^\d{4}-\d{2}-\d{2}$/;

export const createInvoiceSchema = z.object({
  client_id: z.string({ message: 'A client must be selected for the invoice.' }).min(1, 'A client must be selected for the invoice.'),
  invoice_number: z.string({ message: 'Invoice number is required (e.g. INV-001).' }).trim().min(1, 'Invoice number is required (e.g. INV-001).'),
  amount: z.coerce.number().positive('Invoice amount must be a positive number.'),
  currency: z.string().trim().optional().default('USD'),
  issue_date: z.string({ message: 'Valid issue date (YYYY-MM-DD) is required.' }).regex(dateRegex, 'Valid issue date (YYYY-MM-DD) is required.'),
  due_date: z.string({ message: 'Valid due date (YYYY-MM-DD) is required.' }).regex(dateRegex, 'Valid due date (YYYY-MM-DD) is required.'),
  notes: z.string().trim().optional().nullable(),
});

export const updateInvoiceSchema = z.object({
  client_id: z.string().min(1).optional(),
  invoice_number: z.string().trim().min(1).optional(),
  amount: z.coerce.number().positive('Invoice amount must be greater than zero.').optional(),
  currency: z.string().trim().optional(),
  issue_date: z.string().regex(dateRegex, 'Valid issue date (YYYY-MM-DD) is required.').optional(),
  due_date: z.string().regex(dateRegex, 'Valid due date (YYYY-MM-DD) is required.').optional(),
  notes: z.string().trim().optional().nullable(),
});

export const markInvoicePaidSchema = z.object({
  paid_date: z.string().regex(dateRegex, 'Valid paid date (YYYY-MM-DD) is required.').optional(),
});
