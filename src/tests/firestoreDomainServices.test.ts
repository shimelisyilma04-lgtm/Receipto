import { describe, it, expect, vi, beforeEach } from 'vitest';

// In-memory document map for testing client Firestore services offline
const store = new Map<string, any>();

vi.mock('../firebase.js', () => {
  return {
    db: {},
    auth: {
      currentUser: {
        uid: 'user_test_client_1',
        email: 'tester@example.com',
      },
    },
    doc: (_db: any, ...pathSegments: string[]) => {
      return { path: pathSegments.join('/') };
    },
    collection: (_db: any, ...pathSegments: string[]) => {
      return { path: pathSegments.join('/') };
    },
    getDoc: async (docRef: { path: string }) => {
      const data = store.get(docRef.path);
      return {
        exists: () => data !== undefined,
        data: () => data,
      };
    },
    getDocs: async (collRef: { path: string }) => {
      const prefix = collRef.path + '/';
      const items: any[] = [];
      for (const [key, val] of store.entries()) {
        if (key.startsWith(prefix) && key.split('/').length === collRef.path.split('/').length + 1) {
          items.push({
            id: key.split('/').pop(),
            data: () => val,
          });
        }
      }
      return {
        forEach: (callback: (item: any) => void) => items.forEach(callback),
        docs: items,
      };
    },
    setDoc: async (docRef: { path: string }, data: any, options?: { merge?: boolean }) => {
      if (options?.merge && store.has(docRef.path)) {
        store.set(docRef.path, { ...store.get(docRef.path), ...data });
      } else {
        store.set(docRef.path, data);
      }
    },
    updateDoc: async (docRef: { path: string }, data: any) => {
      const existing = store.get(docRef.path) || {};
      store.set(docRef.path, { ...existing, ...data });
    },
    deleteDoc: async (docRef: { path: string }) => {
      store.delete(docRef.path);
    },
    handleFirestoreError: (err: any) => {
      throw err;
    },
    OperationType: {
      GET: 'GET',
      LIST: 'LIST',
      CREATE: 'CREATE',
      UPDATE: 'UPDATE',
      DELETE: 'DELETE',
      WRITE: 'WRITE',
    },
  };
});

import {
  getFirestoreUserProfile,
  setFirestoreUserProfile,
  updateFirestoreUserProfile,
  getFirestoreClients,
  getFirestoreClient,
  createFirestoreClient,
  updateFirestoreClient,
  deleteFirestoreClient,
  getFirestoreInvoices,
  getFirestoreInvoice,
  createFirestoreInvoice,
  updateFirestoreInvoice,
  markFirestoreInvoicePaid,
  cancelFirestoreInvoice,
  deleteFirestoreInvoice,
  getFirestoreReminders,
  createFirestoreReminder,
  getFirestoreActivityLogs,
  getFirestoreSubscription,
  setFirestoreSubscription,
  getFirestoreDashboardStats,
} from '../services/firestoreService.js';

describe('Firestore Client Services (In-Memory Offline)', () => {
  const uid = 'user_test_client_1';

  beforeEach(() => {
    store.clear();
  });

  describe('User Profile Service', () => {
    it('sets and retrieves user profile document', async () => {
      expect(await getFirestoreUserProfile(uid)).toBeNull();

      const created = await setFirestoreUserProfile(uid, {
        email: 'tester@example.com',
        name: 'Tester Name',
        business_name: 'Tester Corp',
      });

      expect(created.name).toBe('Tester Name');
      expect(created.business_name).toBe('Tester Corp');

      const fetched = await getFirestoreUserProfile(uid);
      expect(fetched).not.toBeNull();
      expect(fetched?.email).toBe('tester@example.com');
    });

    it('updates user profile fields', async () => {
      await setFirestoreUserProfile(uid, { name: 'Initial Name' });
      const updated = await updateFirestoreUserProfile(uid, { name: 'Updated Name' });
      expect(updated.name).toBe('Updated Name');
    });
  });

  describe('Client Management Service', () => {
    it('creates, retrieves, updates, and deletes clients', async () => {
      const client = await createFirestoreClient(uid, {
        name: 'Client Alpha',
        email: 'alpha@example.com',
        company: 'Alpha Inc',
        phone: '123-456',
      });

      expect(client.id).toBeDefined();
      expect(client.name).toBe('Client Alpha');

      const fetched = await getFirestoreClient(uid, client.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.email).toBe('alpha@example.com');

      const all = await getFirestoreClients(uid);
      expect(all.length).toBe(1);

      const updated = await updateFirestoreClient(uid, client.id, {
        company: 'Alpha Global',
      });
      expect(updated.company).toBe('Alpha Global');

      await deleteFirestoreClient(uid, client.id);
      expect(await getFirestoreClient(uid, client.id)).toBeNull();
    });
  });

  describe('Invoice Management Service', () => {
    it('creates, filters, pays, cancels, and deletes invoices', async () => {
      const client = await createFirestoreClient(uid, {
        name: 'Client Beta',
        email: 'beta@example.com',
      });

      const inv = await createFirestoreInvoice(uid, {
        client_id: client.id,
        invoice_number: 'INV-001',
        amount: 500,
        currency: 'USD',
        issue_date: '2026-10-01',
        due_date: '2026-10-15',
      });

      expect(inv.id).toBeDefined();
      expect(inv.invoice_number).toBe('INV-001');

      const fetched = await getFirestoreInvoice(uid, inv.id);
      expect(fetched).not.toBeNull();
      expect(fetched?.amount).toBe(500);

      const allInvoices = await getFirestoreInvoices(uid);
      expect(allInvoices.length).toBe(1);

      const searchResult = await getFirestoreInvoices(uid, { search: 'INV-001' });
      expect(searchResult.length).toBe(1);

      const paid = await markFirestoreInvoicePaid(uid, inv.id, '2026-10-10');
      expect(paid.payment_status).toBe('PAID');

      const cancelled = await cancelFirestoreInvoice(uid, inv.id);
      expect(cancelled.payment_status).toBe('CANCELLED');

      const updated = await updateFirestoreInvoice(uid, inv.id, { notes: 'Updated notes' });
      expect(updated.notes).toBe('Updated notes');

      await deleteFirestoreInvoice(uid, inv.id);
      expect(await getFirestoreInvoice(uid, inv.id)).toBeNull();
    });
  });

  describe('Reminders & Activity Logs Service', () => {
    it('creates reminders and activity log trail', async () => {
      const rem = await createFirestoreReminder(uid, {
        invoice_id: 'inv_10',
        client_id: 'client_10',
        recipient_email: 'rem@example.com',
        status: 'SENT',
        subject: 'Reminder',
        message: 'Please pay invoice',
      });

      expect(rem.id).toBeDefined();

      const reminders = await getFirestoreReminders(uid);
      expect(reminders.length).toBe(1);
      expect(reminders[0].recipient_email).toBe('rem@example.com');

      const logs = await getFirestoreActivityLogs(uid);
      expect(logs.length).toBeGreaterThan(0);
    });
  });

  describe('Subscription & Dashboard Stats Service', () => {
    it('manages subscription status and calculates dashboard stats', async () => {
      const sub = await setFirestoreSubscription(uid, {
        plan: 'STARTER',
        status: 'active',
        billing_interval: 'annual',
      });

      expect(sub.subscription.plan).toBe('STARTER');
      expect(sub.usage.plan).toBe('STARTER');

      const details = await getFirestoreSubscription(uid);
      expect(details.subscription.plan).toBe('STARTER');

      const stats = await getFirestoreDashboardStats(uid);
      expect(stats).toHaveProperty('total_outstanding');
      expect(stats).toHaveProperty('total_paid');
      expect(stats).toHaveProperty('invoice_counts');
    });
  });
});
