import type { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';

/**
 * Middleware factory that validates req.body against a Zod schema.
 * Formats errors uniformly with { error, code: 'VALIDATION_ERROR', details }.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message || 'Invalid request payload.',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten(),
      });
    }
    req.body = result.data;
    next();
  };
}

/**
 * Middleware factory that validates req.query against a Zod schema.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const firstIssue = result.error.issues[0];
      return res.status(400).json({
        error: firstIssue?.message || 'Invalid query parameters.',
        code: 'VALIDATION_ERROR',
        details: result.error.flatten(),
      });
    }
    req.query = result.data as any;
    next();
  };
}
