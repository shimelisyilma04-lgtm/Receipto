import express from 'express';
import type { Request, Response } from 'express';
import { checkDatabaseHealth, isDatabaseConfigured } from './db.js';
import { evaluateProductionReadiness } from './readiness.js';
import { requireAuth, requireVerified } from './auth.js';
import { logger } from './lib/logger.js';

// Domain Sub-routers
import { authRouter } from './routes/auth.routes.js';
import { clientsRouter } from './routes/clients.routes.js';
import { invoicesRouter } from './routes/invoices.routes.js';
import { remindersRouter } from './routes/reminders.routes.js';
import { activityRouter } from './routes/activity.routes.js';
import { billingRouter } from './routes/billing.routes.js';
import { adminRouter } from './routes/admin.routes.js';

export const router = express.Router();

// ==========================================
// 1. HEALTH & READINESS HANDLERS
// ==========================================
export async function healthHandler(req: Request, res: Response) {
  try {
    const dbHealth = await checkDatabaseHealth();
    res.status(200).json({
      status: 'ok',
      app: 'Receipto',
      version: '1.2.0',
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: dbHealth.connected,
        engine: dbHealth.engine,
        configured: isDatabaseConfigured(),
        details: dbHealth.details,
      },
      email_service: {
        configured: Boolean(process.env.RESEND_API_KEY),
        provider: 'Resend',
      },
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Health check failure');
    res.status(503).json({
      status: 'error',
      app: 'Receipto',
      error: 'Health check encountered an internal failure',
    });
  }
}

export function readinessHandler(req: Request, res: Response) {
  const report = evaluateProductionReadiness();
  const statusCode = 200; // Returns full structured report
  res.status(statusCode).json(report);
}

router.get('/health', healthHandler);
router.get('/system/readiness', readinessHandler);
router.get('/readiness', readinessHandler);

// Verification Gates: Ensure email verification for core customer/billing operations
router.use('/clients', requireAuth, requireVerified);
router.use('/invoices', requireAuth, requireVerified);
router.use('/dashboard', requireAuth, requireVerified);
router.use('/reminders', requireAuth, requireVerified);
router.use('/activity', requireAuth, requireVerified);
router.use('/settings', requireAuth, requireVerified);

// Mount Domain Routers
router.use(authRouter);
router.use(clientsRouter);
router.use(invoicesRouter);
router.use(remindersRouter);
router.use(activityRouter);
router.use(billingRouter);
router.use(adminRouter);
