import { z } from 'zod';

export const checkoutSessionSchema = z.object({
  plan: z.enum(['STARTER', 'GROWTH'] as const, {
    message: 'Valid plan (STARTER or GROWTH) is required.',
  }),
  interval: z.enum(['monthly', 'annual'] as const).optional().default('monthly'),
});

export const updateOwnerDemoPlanSchema = z.object({
  plan: z.enum(['FREE', 'STARTER', 'GROWTH'] as const, {
    message: 'Valid plan (FREE, STARTER, or GROWTH) is required.',
  }),
});
