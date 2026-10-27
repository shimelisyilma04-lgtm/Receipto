import crypto from 'crypto';
import type { Client } from '../types.js';
import { getAdminFirestore } from '../lib/firebaseAdmin.js';
import { AsyncKeyLock } from '../lib/asyncKeyLock.js';
import { getSubscription } from './subscriptionRepository.js';
import { getEffectivePlan, PlanLimitExceededError } from '../plans.js';
import { logger } from '../lib/logger.js';

const clientLock = new AsyncKeyLock();

export async function getClients(userId: string): Promise<Client[]> {
  const db = getAdminFirestore();
  const snap = await db.collection('users').doc(userId).collection('clients').get();
  const clients: Client[] = [];
  snap.forEach((doc: any) => {
    clients.push(doc.data() as Client);
  });
  return clients.sort((a, b) => a.name.localeCompare(b.name));
}

export async function getClientById(userId: string, clientId: string): Promise<Client | null> {
  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(userId).collection('clients').doc(clientId);
  const snap = await docRef.get();
  if (!snap.exists) return null;
  return snap.data() as Client;
}

export async function createClient(
  userId: string,
  data: { name: string; email: string; phone?: string; company?: string; address?: string }
): Promise<Client> {
  return await clientLock.acquire(userId, async () => {
    const db = getAdminFirestore();
    const sub = await getSubscription(userId);
    const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
    const maxClients = planConfig.limits.maxClients;

    const existingSnap = await db.collection('users').doc(userId).collection('clients').get();
    const currentCount = existingSnap.size;

    if (maxClients !== null && currentCount >= maxClients) {
      throw new PlanLimitExceededError('clients', currentCount, maxClients, planConfig.tier);
    }

    const id = crypto.randomUUID();
    const now = new Date().toISOString();

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

    await db.collection('users').doc(userId).collection('clients').doc(id).set(client);
    logger.info({ userId, clientId: id, name: client.name }, 'Client created in Firestore');
    return client;
  });
}

export async function updateClient(
  userId: string,
  clientId: string,
  data: { name?: string; email?: string; phone?: string; company?: string; address?: string }
): Promise<Client | null> {
  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(userId).collection('clients').doc(clientId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const existing = snap.data() as Client;
  const now = new Date().toISOString();
  const updated: Client = {
    ...existing,
    name: data.name ? data.name.trim() : existing.name,
    email: data.email ? data.email.trim().toLowerCase() : existing.email,
    phone: data.phone !== undefined ? data.phone.trim() : existing.phone,
    company: data.company !== undefined ? data.company.trim() : existing.company,
    address: data.address !== undefined ? data.address.trim() : existing.address,
    updated_at: now,
  };

  await docRef.set(updated, { merge: true });
  logger.info({ userId, clientId }, 'Client updated in Firestore');
  return updated;
}

export async function deleteClient(userId: string, clientId: string): Promise<boolean> {
  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(userId).collection('clients').doc(clientId);
  const snap = await docRef.get();
  if (!snap.exists) return false;

  // Find associated invoices
  const invoicesSnap = await db
    .collection('users')
    .doc(userId)
    .collection('invoices')
    .where('client_id', '==', clientId)
    .get();

  const batch = db.batch();
  const invoiceIds: string[] = [];

  invoicesSnap.forEach((invDoc: any) => {
    invoiceIds.push(invDoc.id);
    batch.delete(invDoc.ref);
  });

  // Delete reminders for these invoices
  if (invoiceIds.length > 0) {
    const remindersSnap = await db.collection('users').doc(userId).collection('reminders').get();
    remindersSnap.forEach((remDoc: any) => {
      const remData = remDoc.data();
      if (invoiceIds.includes(remData.invoice_id) || remData.client_id === clientId) {
        batch.delete(remDoc.ref);
      }
    });
  }

  // Delete the client document
  batch.delete(docRef);
  await batch.commit();

  logger.info({ userId, clientId }, 'Client and cascaded records deleted from Firestore');
  return true;
}
