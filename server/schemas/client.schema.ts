import { z } from 'zod';

export const createClientSchema = z.object({
  name: z.string({ message: 'Client name is required.' }).trim().min(1, 'Client name is required.'),
  email: z.string({ message: 'A valid client email address is required.' }).trim().email('A valid client email address is required.').toLowerCase(),
  phone: z.string().trim().optional().nullable(),
  company: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  currency: z.string().trim().optional().nullable(),
});

export const updateClientSchema = z.object({
  name: z.string().trim().min(1, 'Client name cannot be empty.').optional(),
  email: z.string().trim().email('Invalid email address.').toLowerCase().optional(),
  phone: z.string().trim().optional().nullable(),
  company: z.string().trim().optional().nullable(),
  address: z.string().trim().optional().nullable(),
  currency: z.string().trim().optional().nullable(),
});
