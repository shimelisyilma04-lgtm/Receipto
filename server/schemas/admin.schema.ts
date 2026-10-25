import { z } from 'zod';

export const updateUserRoleSchema = z.object({
  role: z.enum(['USER', 'ADMIN'] as const, {
    message: 'Invalid role. Must be USER or ADMIN.',
  }),
});
