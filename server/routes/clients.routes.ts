import express from 'express';
import type { Response } from 'express';
import {
  getClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  createActivityLog,
  checkCanCreateClient,
} from '../db.js';
import { requireAuth, type AuthenticatedRequest } from '../auth.js';
import { PlanLimitExceededError } from '../plans.js';
import { isValidEmail } from './helpers.js';
import { logger } from '../lib/logger.js';
import { validateBody } from '../schemas/validate.js';
import { createClientSchema, updateClientSchema } from '../schemas/client.schema.js';

export const clientsRouter = express.Router();

// GET /api/clients
clientsRouter.get('/clients', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const clients = await getClients(userId);
    res.status(200).json({ clients });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to retrieve clients');
    res.status(500).json({ error: 'Failed to retrieve clients.' });
  }
});

// POST /api/clients
clientsRouter.post('/clients', requireAuth, validateBody(createClientSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, email, phone, company, address } = req.body;

    const limitCheck = await checkCanCreateClient(userId);
    if (!limitCheck.allowed) {
      return res.status(403).json({
        error: 'PLAN_LIMIT_REACHED',
        code: 'PLAN_LIMIT_REACHED',
        resource: 'clients',
        limit_type: 'clients',
        current: limitCheck.current,
        limit: limitCheck.max,
        max: limitCheck.max,
        plan: limitCheck.plan,
        message: limitCheck.reason,
        upgrade_required: true,
      });
    }

    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return res.status(400).json({ error: 'Client name is required.' });
    }

    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'A valid client email address is required.' });
    }

    const client = await createClient(userId, {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone?.trim(),
      company: company?.trim(),
      address: address?.trim(),
    });

    await createActivityLog(userId, 'CLIENT_CREATED', `Added client ${client.name} (${client.email})`, { clientId: client.id });

    res.status(201).json({ client });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to create client');
    if (err instanceof PlanLimitExceededError || err.code === 'PLAN_LIMIT_REACHED') {
      return res.status(403).json({
        error: 'PLAN_LIMIT_REACHED',
        code: 'PLAN_LIMIT_REACHED',
        resource: 'clients',
        limit_type: 'clients',
        current: err.current,
        limit: err.limit,
        max: err.limit,
        plan: err.plan,
        message: err.message,
        upgrade_required: true,
      });
    }
    res.status(500).json({ error: 'Failed to create client.' });
  }
});

// GET /api/clients/:id
clientsRouter.get('/clients/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const client = await getClientById(userId, req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found or does not belong to your account.' });
    }
    res.status(200).json({ client });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to retrieve client');
    res.status(500).json({ error: 'Failed to retrieve client.' });
  }
});

// PUT /api/clients/:id
clientsRouter.put('/clients/:id', requireAuth, validateBody(updateClientSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { name, email, phone, company, address } = req.body;

    if (email && !isValidEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address.' });
    }

    const updated = await updateClient(userId, req.params.id, {
      name,
      email,
      phone,
      company,
      address,
    });

    if (!updated) {
      return res.status(404).json({ error: 'Client not found or does not belong to your account.' });
    }

    await createActivityLog(userId, 'CLIENT_UPDATED', `Updated client ${updated.name}`, { clientId: updated.id });

    res.status(200).json({ client: updated });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to update client');
    res.status(500).json({ error: 'Failed to update client.' });
  }
});

// DELETE /api/clients/:id
clientsRouter.delete('/clients/:id', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const client = await getClientById(userId, req.params.id);
    if (!client) {
      return res.status(404).json({ error: 'Client not found or does not belong to your account.' });
    }

    const success = await deleteClient(userId, req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Client could not be deleted.' });
    }

    await createActivityLog(userId, 'CLIENT_DELETED', `Deleted client ${client.name}`, { clientId: req.params.id });

    res.status(200).json({ message: 'Client deleted successfully' });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to delete client');
    res.status(500).json({ error: 'Failed to delete client.' });
  }
});
