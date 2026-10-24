import express from 'express';
import type { Response } from 'express';
import {
  getActivityLogs,
  getDashboardStats,
  checkFeatureAccess,
  checkDatabaseHealth,
  isDatabaseConfigured,
  updateUserProfile,
  createActivityLog,
} from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth.js';
import { isStripeConfigured, isStripeWebhookConfigured, getStripePublishableKey } from '../stripe.js';
import { logger } from '../lib/logger.js';

export const activityRouter = express.Router();

// GET /api/dashboard
activityRouter.get('/dashboard', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const stats = await getDashboardStats(userId);
    res.status(200).json({ stats });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to calculate dashboard statistics');
    res.status(500).json({ error: 'Failed to calculate dashboard statistics.' });
  }
});

// GET /api/activity
activityRouter.get('/activity', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const fullAccess = await checkFeatureAccess(userId, 'fullActivityHistory');
    const requestedLimit = parseInt(req.query.limit as string) || 50;
    const effectiveLimit = fullAccess.allowed ? Math.min(requestedLimit, 100) : Math.min(requestedLimit, 10);

    const logs = await getActivityLogs(userId, effectiveLimit);
    res.status(200).json({
      logs,
      full_history_unlocked: fullAccess.allowed,
      upgrade_required: !fullAccess.allowed,
      plan: fullAccess.plan,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to retrieve activity logs');
    res.status(500).json({ error: 'Failed to retrieve activity logs.' });
  }
});

// GET /api/settings/config
activityRouter.get('/settings/config', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const dbHealth = await checkDatabaseHealth();
    res.status(200).json({
      environment: process.env.NODE_ENV || 'development',
      database: {
        engine: dbHealth.engine,
        connected: dbHealth.connected,
        configured: isDatabaseConfigured(),
      },
      email_service: {
        provider: 'Resend',
        configured: Boolean(process.env.RESEND_API_KEY),
        from_email: process.env.RESEND_FROM_EMAIL || 'Receipto <billing@resend.dev>',
      },
      stripe_service: {
        configured: isStripeConfigured(),
        publishable_key: getStripePublishableKey(),
        webhook_configured: isStripeWebhookConfigured(),
      },
      app_version: '1.2.0',
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to fetch settings configuration');
    res.status(500).json({ error: 'Failed to fetch settings configuration.' });
  }
});

// POST /api/settings/profile
activityRouter.post('/settings/profile', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, business_name } = req.body;

    if (name && (typeof name !== 'string' || name.trim().length === 0)) {
      return res.status(400).json({ error: 'Name cannot be empty.' });
    }

    const updated = await updateUserProfile(userId, { name, business_name });

    await createActivityLog(userId, 'PROFILE_UPDATED', 'Updated business profile settings');

    res.status(200).json({
      message: 'Profile updated successfully',
      user: {
        id: updated?.id,
        email: updated?.email,
        name: updated?.name,
        business_name: updated?.business_name,
      },
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to update profile');
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});
