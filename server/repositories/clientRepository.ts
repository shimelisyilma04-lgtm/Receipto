import crypto from 'crypto';
import type { Client } from '../types.js';
import { memoryStore, saveStore, reloadLocalStore, userMutex } from '../lib/dbStore.js';
import { getSubscription } from './subscriptionRepository.js';
import { getEffectivePlan, PlanLimitExceededError } from '../plans.js';
import { logger } from '../lib/logger.js';

export async function getClients(userId: string): Promise<Client[]> {
  reloadLocalStore();
  return memoryStore.clients
    .filter((c) => c.user_id === userId)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClientById(userId: string, clientId: string): Promise<Client | null> {
  reloadLocalStore();
  return memoryStore.clients.find((c) => c.user_id === userId && c.id === clientId) || null;
}

export async function createClient(
  userId: string,
  data: { name: string; email: string; phone?: string; company?: string; address?: string }
): Promise<Client> {
  return await userMutex.acquire(userId, async () => {
    const sub = await getSubscription(userId);
    const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
    const maxClients = planConfig.limits.maxClients;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

    reloadLocalStore();
    const currentCount = memoryStore.clients.filter((c) => c.user_id === userId).length;
    if (maxClients !== null && currentCount >= maxClients) {
      throw new PlanLimitExceededError('clients', currentCount, maxClients, planConfig.tier);
    }

    const client: Client = {
      id,
      user_id: userId,
      name: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone?.trim(),
      company: data.company?.trim(),
      address: data.address?.trim(),
      created_at: now,
      updated_at: now,
    };
    memoryStore.clients.push(client);
    saveStore();
    logger.info({ userId, clientId: id, name: client.name }, 'Client created');
    return client;
  });
}

export async function updateClient(
  userId: string,
  clientId: string,
  data: { name?: string; email?: string; phone?: string; company?: string; address?: string }
): Promise<Client | null> {
  const now = new Date().toISOString();
  const client = memoryStore.clients.find((c) => c.user_id === userId && c.id === clientId);
  if (!client) return null;
  if (data.name) client.name = data.name.trim();
  if (data.email) client.email = data.email.trim().toLowerCase();
  if (data.phone !== undefined) client.phone = data.phone?.trim();
  if (data.company !== undefined) client.company = data.company?.trim();
  if (data.address !== undefined) client.address = data.address?.trim();
  client.updated_at = now;
  saveStore();
  logger.info({ userId, clientId }, 'Client updated');
  return client;
}

export async function deleteClient(userId: string, clientId: string): Promise<boolean> {
  const idx = memoryStore.clients.findIndex((c) => c.user_id === userId && c.id === clientId);
  if (idx === -1) return false;
  memoryStore.clients.splice(idx, 1);
  const invIds = memoryStore.invoices
    .filter((i) => i.client_id === clientId && i.user_id === userId)
    .map((i) => i.id);
  memoryStore.invoices = memoryStore.invoices.filter((i) => !(i.client_id === clientId && i.user_id === userId));
  memoryStore.reminders = memoryStore.reminders.filter((r) => !invIds.includes(r.invoice_id));
  saveStore();
  logger.info({ userId, clientId }, 'Client deleted along with cascade invoices/reminders');
  return true;
}
