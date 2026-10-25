import express from 'express';
import type { Response } from 'express';
import {
  getAdminDashboardStats,
  getAdminUsers,
  suspendUser,
  restoreUser,
  updateUserRole,
  getAdminSubscriptions,
  getAdminActivityLogs,
  getAdminSystemHealth,
} from '../db.js';
import {
  requireAuth,
  requireAdmin,
  type AuthenticatedRequest,
} from '../auth.js';
import { getWorkerStatus, runWorkerCycle } from '../worker.js';
import { logger } from '../lib/logger.js';
import { validateBody } from '../schemas/validate.js';
import { updateUserRoleSchema } from '../schemas/admin.schema.js';

export const adminRouter = express.Router();

// GET /api/admin/dashboard
adminRouter.get('/admin/dashboard', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const stats = await getAdminDashboardStats();
    res.status(200).json(stats);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to retrieve admin dashboard stats');
    res.status(500).json({ error: 'Failed to retrieve admin dashboard stats.' });
  }
});

// GET /api/admin/users
adminRouter.get('/admin/users', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { search, role, status, plan, page, limit } = req.query;
    const data = await getAdminUsers({
      search: typeof search === 'string' ? search : undefined,
      role: typeof role === 'string' ? role : undefined,
      status: typeof status === 'string' ? status : undefined,
      plan: typeof plan === 'string' ? plan : undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.status(200).json(data);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to retrieve admin users list');
    res.status(500).json({ error: 'Failed to retrieve admin users list.' });
  }
});

// POST /api/admin/users/:id/suspend
adminRouter.post('/admin/users/:id/suspend', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const targetId = req.params.id;
    const result = await suspendUser(adminId, targetId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.status(200).json({ success: true, message: 'User account has been suspended and sessions invalidated.' });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to suspend user account');
    res.status(500).json({ error: 'Failed to suspend user account.' });
  }
});

// POST /api/admin/users/:id/restore
adminRouter.post('/admin/users/:id/restore', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const targetId = req.params.id;
    const result = await restoreUser(adminId, targetId);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.status(200).json({ success: true, message: 'User account has been restored to active status.' });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to restore user account');
    res.status(500).json({ error: 'Failed to restore user account.' });
  }
});

// POST /api/admin/users/:id/role
adminRouter.post('/admin/users/:id/role', requireAuth, requireAdmin, validateBody(updateUserRoleSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const adminId = req.user!.id;
    const targetId = req.params.id;
    const { role } = req.body;
    const result = await updateUserRole(adminId, targetId, role);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }
    res.status(200).json({ success: true, message: `User role updated to ${role}.` });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to update user role');
    res.status(500).json({ error: 'Failed to update user role.' });
  }
});

// GET /api/admin/subscriptions
adminRouter.get('/admin/subscriptions', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { page, limit } = req.query;
    const data = await getAdminSubscriptions({
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 20,
    });
    res.status(200).json(data);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to retrieve admin subscriptions list');
    res.status(500).json({ error: 'Failed to retrieve admin subscriptions list.' });
  }
});

// GET /api/admin/activity
adminRouter.get('/admin/activity', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { userId, action, page, limit } = req.query;
    const data = await getAdminActivityLogs({
      userId: typeof userId === 'string' ? userId : undefined,
      action: typeof action === 'string' ? action : undefined,
      page: page ? parseInt(page as string, 10) : 1,
      limit: limit ? parseInt(limit as string, 10) : 25,
    });
    res.status(200).json(data);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to retrieve activity audit log');
    res.status(500).json({ error: 'Failed to retrieve activity audit log.' });
  }
});

// GET /api/admin/system
adminRouter.get('/admin/system', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const workerStatus = getWorkerStatus();
    const health = await getAdminSystemHealth(workerStatus);
    res.status(200).json(health);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to retrieve system health diagnostics');
    res.status(500).json({ error: 'Failed to retrieve system health diagnostics.' });
  }
});

// POST /api/admin/system/trigger-worker
adminRouter.post('/admin/system/trigger-worker', requireAuth, requireAdmin, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const result = await runWorkerCycle();
    res.status(200).json(result);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Worker manual execution failed');
    res.status(500).json({ error: 'Worker manual execution failed.' });
  }
});
