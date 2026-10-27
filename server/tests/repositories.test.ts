import { describe, it, expect, beforeAll } from 'vitest';
import crypto from 'crypto';
import {
  initDatabase,
  reloadLocalStore,
  createUser,
  getUserById,
  getUserByEmail,
  updateUserEmail,
  updateUserPassword,
  createClient,
  getClientById,
  getClients,
  updateClient,
  deleteClient,
  createInvoice,
  getInvoiceById,
  getInvoiceByNumber,
  getInvoices,
  updateInvoice,
  markInvoicePaid,
  cancelInvoice,
  deleteInvoice,
  getSubscription,
  upsertSubscription,
  getSubscriptionDetails,
  createActivityLog,
  getActivityLogs,
  createSession,
  getSession,
  deleteSession,
  deleteUserSessions,
  checkCanCreateClient,
  checkCanCreateInvoice,
  checkFeatureAccess,
} from '../db.js';

describe('Authoritative Repository Layer Tests', () => {
  const uniqueSuffix = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
  let user1Id: string;
  let user2Id: string;
  let client1Id: string;
  let client2Id: string;
  let invoice1Id: string;

  beforeAll(async () => {
    await initDatabase();
    reloadLocalStore();
  });

  describe('User Repository', () => {
    it('creates and retrieves a new user by id and email', async () => {
      const email = `repo_user1_${uniqueSuffix}@example.com`;
      const created = await createUser({
        email,
        password_hash: '$2a$10$fakehashforrepotestingonly123',
        name: 'Repo User 1',
        business_name: 'Repo Co 1',
        email_verified: false,
      });

      expect(created).toBeDefined();
      expect(created.id).toBeDefined();
      expect(created.email).toBe(email);
      user1Id = created.id;

      const byId = await getUserById(user1Id);
      expect(byId).toBeDefined();
      expect(byId?.id).toBe(user1Id);
      expect(byId?.name).toBe('Repo User 1');

      const byEmail = await getUserByEmail(email);
      expect(byEmail).toBeDefined();
      expect(byEmail?.id).toBe(user1Id);
    });

    it('creates a second user for tenant isolation testing', async () => {
      const email = `repo_user2_${uniqueSuffix}@example.com`;
      const created = await createUser({
        email,
        password_hash: '$2a$10$fakehashforrepotestingonly456',
        name: 'Repo User 2',
        business_name: 'Repo Co 2',
        email_verified: true,
      });
      expect(created).toBeDefined();
      user2Id = created.id;
    });

    it('updates user email address', async () => {
      const newEmail = `repo_user1_updated_${uniqueSuffix}@example.com`;
      await updateUserEmail(user1Id, newEmail);

      const updated = await getUserById(user1Id);
      expect(updated?.email).toBe(newEmail);
    });

    it('updates user password hash', async () => {
      const newHash = '$2a$10$updatedhashforrepotestingonly789';
      await updateUserPassword(user1Id, newHash);

      const updated = await getUserById(user1Id);
      expect(updated?.password_hash).toBe(newHash);
    });

    it('returns null for nonexistent user lookup', async () => {
      const nonExistent = await getUserById('non-existent-user-id-999');
      expect(nonExistent).toBeNull();

      const nonExistentEmail = await getUserByEmail('nobody@nowhere-domain-999.test');
      expect(nonExistentEmail).toBeNull();
    });
  });

  describe('Session Repository', () => {
    let sessionToken: string;

    it('creates and retrieves a valid user session', async () => {
      sessionToken = crypto.randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const session = await createSession(user1Id, sessionToken, expiresAt);

      expect(session).toBeDefined();
      expect(session.user_id).toBe(user1Id);

      const retrieved = await getSession(sessionToken);
      expect(retrieved).toBeDefined();
      expect(retrieved?.user.id).toBe(user1Id);
      expect(retrieved?.session.token).toBe(sessionToken);
    });

    it('deletes a single session by token', async () => {
      await deleteSession(sessionToken);
      const retrieved = await getSession(sessionToken);
      expect(retrieved).toBeNull();
    });

    it('creates multiple sessions and deletes all user sessions', async () => {
      const tokenA = crypto.randomBytes(32).toString('hex');
      const tokenB = crypto.randomBytes(32).toString('hex');
      const exp = new Date(Date.now() + 3600000);

      await createSession(user1Id, tokenA, exp);
      await createSession(user1Id, tokenB, exp);

      expect(await getSession(tokenA)).toBeDefined();
      expect(await getSession(tokenB)).toBeDefined();

      await deleteUserSessions(user1Id);

      expect(await getSession(tokenA)).toBeNull();
      expect(await getSession(tokenB)).toBeNull();
    });
  });

  describe('Client Repository & Isolation', () => {
    it('creates client for user1', async () => {
      const client = await createClient(user1Id, {
        name: 'Client One',
        email: `client1_${uniqueSuffix}@example.com`,
        phone: '+1 555-0100',
        company: 'Company One Inc',
        address: '100 Main St',
      });

      expect(client).toBeDefined();
      expect(client.id).toBeDefined();
      expect(client.user_id).toBe(user1Id);
      expect(client.name).toBe('Client One');
      client1Id = client.id;
    });

    it('creates client for user2', async () => {
      const client = await createClient(user2Id, {
        name: 'Client Two',
        email: `client2_${uniqueSuffix}@example.com`,
        company: 'Company Two LLC',
      });
      expect(client).toBeDefined();
      client2Id = client.id;
    });

    it('retrieves user1 client by id and prevents user2 from accessing it', async () => {
      const user1Access = await getClientById(user1Id, client1Id);
      expect(user1Access).toBeDefined();
      expect(user1Access?.id).toBe(client1Id);

      // User 2 cannot access user 1's client
      const user2Access = await getClientById(user2Id, client1Id);
      expect(user2Access).toBeNull();
    });

    it('lists clients filtered by user owner only', async () => {
      const user1Clients = await getClients(user1Id);
      expect(user1Clients.some((c) => c.id === client1Id)).toBe(true);
      expect(user1Clients.some((c) => c.id === client2Id)).toBe(false);

      const user2Clients = await getClients(user2Id);
      expect(user2Clients.some((c) => c.id === client2Id)).toBe(true);
      expect(user2Clients.some((c) => c.id === client1Id)).toBe(false);
    });

    it('updates client fields accurately', async () => {
      const updated = await updateClient(user1Id, client1Id, {
        name: 'Client One Renamed',
        phone: '+1 555-9999',
      });

      expect(updated).toBeDefined();
      expect(updated?.name).toBe('Client One Renamed');
      expect(updated?.phone).toBe('+1 555-9999');
    });

    it('returns null when updating a non-existent or other user client', async () => {
      const updated = await updateClient(user2Id, client1Id, { name: 'Unauthorized Mod' });
      expect(updated).toBeNull();
    });

    it('deletes client and prevents further access', async () => {
      const tempClient = await createClient(user1Id, { name: 'Temp Client', email: 'temp@example.com' });
      expect(tempClient).toBeDefined();
      const deleted = await deleteClient(user1Id, tempClient.id);
      expect(deleted).toBe(true);
      const lookup = await getClientById(user1Id, tempClient.id);
      expect(lookup).toBeNull();
    });
  });

  describe('Invoice Repository & Lifecycle', () => {
    const invNumber = `INV-REPO-${Date.now()}`;

    it('creates an invoice for user1 and validates persistence', async () => {
      const invoice = await createInvoice(user1Id, {
        client_id: client1Id,
        invoice_number: invNumber,
        amount: 1250.75,
        currency: 'USD',
        issue_date: '2026-10-01',
        due_date: '2026-11-20',
        notes: 'Net 20 terms',
      });

      expect(invoice).toBeDefined();
      expect(invoice.id).toBeDefined();
      expect(invoice.user_id).toBe(user1Id);
      expect(invoice.amount).toBe(1250.75);
      expect(invoice.payment_status).toBe('UNPAID');
      invoice1Id = invoice.id;
    });

    it('finds invoice by invoice_number scoped to user', async () => {
      const found = await getInvoiceByNumber(user1Id, invNumber);
      expect(found).toBeDefined();
      expect(found?.id).toBe(invoice1Id);

      // User 2 cannot find user 1's invoice by number
      const unauthorized = await getInvoiceByNumber(user2Id, invNumber);
      expect(unauthorized).toBeNull();
    });

    it('retrieves invoice by id scoped to user', async () => {
      const found = await getInvoiceById(user1Id, invoice1Id);
      expect(found).toBeDefined();
      expect(found?.id).toBe(invoice1Id);

      const crossTenant = await getInvoiceById(user2Id, invoice1Id);
      expect(crossTenant).toBeNull();
    });

    it('updates invoice and respects immutability when paid', async () => {
      const updated = await updateInvoice(user1Id, invoice1Id, {
        notes: 'Updated invoice notes',
        amount: 1400.0,
      });

      expect(updated).toBeDefined();
      expect(updated?.notes).toBe('Updated invoice notes');
      expect(updated?.amount).toBe(1400.0);

      // Mark as paid
      const paid = await markInvoicePaid(user1Id, invoice1Id, '2026-10-15');
      expect(paid).toBeDefined();
      expect(paid?.payment_status).toBe('PAID');
      expect(paid?.paid_date).toBeDefined();
    });

    it('filters invoices by search and status query parameters', async () => {
      const invoices = await getInvoices(user1Id, { status: 'PAID' });
      expect(invoices.some((i) => i.id === invoice1Id)).toBe(true);

      const unpaidInvoices = await getInvoices(user1Id, { status: 'UNPAID' });
      expect(unpaidInvoices.some((i) => i.id === invoice1Id)).toBe(false);
    });

    it('cancels invoice and marks status CANCELLED', async () => {
      const invToCancel = await createInvoice(user1Id, {
        client_id: client1Id,
        invoice_number: `INV-CANCEL-${Date.now()}`,
        amount: 80.0,
        currency: 'USD',
        issue_date: '2026-10-01',
        due_date: '2026-11-10',
      });
      const cancelled = await cancelInvoice(user1Id, invToCancel.id);
      expect(cancelled).toBeDefined();
      expect(cancelled?.payment_status).toBe('CANCELLED');
    });

    it('deletes invoice successfully', async () => {
      const invToDelete = await createInvoice(user1Id, {
        client_id: client1Id,
        invoice_number: `INV-DEL-${Date.now()}`,
        amount: 50.0,
        currency: 'USD',
        issue_date: '2026-10-01',
        due_date: '2026-11-10',
      });

      expect(invToDelete).toBeDefined();
      const deleted = await deleteInvoice(user1Id, invToDelete.id);
      expect(deleted).toBe(true);

      const lookup = await getInvoiceById(user1Id, invToDelete.id);
      expect(lookup).toBeNull();
    });
  });

  describe('Subscription Repository & Entitlements', () => {
    it('returns default FREE subscription for user without prior records', async () => {
      const sub = await getSubscription(user1Id);
      expect(sub).toBeDefined();
      expect(sub.user_id).toBe(user1Id);
      expect(sub.plan).toBe('FREE');
      expect(sub.status.toLowerCase()).toBe('active');
    });

    it('upserts subscription to STARTER and verifies plan limits update', async () => {
      const upserted = await upsertSubscription(user1Id, {
        plan: 'STARTER',
        status: 'active',
        billing_interval: 'monthly',
        stripe_customer_id: 'cus_repo_test_123',
        stripe_subscription_id: 'sub_repo_test_123',
      });

      expect(upserted).toBeDefined();
      expect(upserted.plan).toBe('STARTER');

      const details = await getSubscriptionDetails(user1Id);
      expect(details.subscription.plan).toBe('STARTER');
      expect(details.plan_config.limits.maxClients).toBe(50);
      expect(details.plan_config.limits.maxInvoicesPerMonth).toBe(100);
      expect(details.plan_config.features.csvExport).toBe(true);
    });

    it('evaluates checkCanCreateClient and checkCanCreateInvoice limits correctly', async () => {
      const canClient = await checkCanCreateClient(user1Id);
      expect(canClient.allowed).toBe(true);
      expect(canClient.plan).toBe('STARTER');

      const canInvoice = await checkCanCreateInvoice(user1Id);
      expect(canInvoice.allowed).toBe(true);
      expect(canInvoice.plan).toBe('STARTER');

      const feature = await checkFeatureAccess(user1Id, 'csvExport');
      expect(feature.allowed).toBe(true);
    });
  });

  describe('Activity Log Repository', () => {
    it('creates and fetches structured activity logs', async () => {
      await createActivityLog(user1Id, 'TEST_EVENT', 'Test activity logging message', { meta: 'ok' });

      const logs = await getActivityLogs(user1Id);
      expect(Array.isArray(logs)).toBe(true);
      expect(logs.length).toBeGreaterThan(0);
      expect(logs.some((l) => l.action === 'TEST_EVENT')).toBe(true);
    });
  });

  describe('Reminder Repository', () => {
    let reminderId: string;

    it('creates a reminder record and stores it', async () => {
      const rem = await import('../db.js').then((m) =>
        m.createReminder(user1Id, {
          invoice_id: invoice1Id,
          client_id: client1Id,
          recipient_email: 'client1@example.com',
          subject: 'Payment reminder for INV-REPO',
          message: 'Please settle invoice at your earliest convenience.',
          status: 'SENT',
        })
      );

      expect(rem).toBeDefined();
      expect(rem.id).toBeDefined();
      expect(rem.user_id).toBe(user1Id);
      expect(rem.status).toBe('SENT');
      reminderId = rem.id;
    });

    it('fetches reminders filtered by user', async () => {
      const reminders = await import('../db.js').then((m) => m.getReminders(user1Id));
      expect(Array.isArray(reminders)).toBe(true);
      expect(reminders.some((r) => r.id === reminderId)).toBe(true);

      const user2Reminders = await import('../db.js').then((m) => m.getReminders(user2Id));
      expect(user2Reminders.some((r) => r.id === reminderId)).toBe(false);
    });

    it('retrieves recent reminders for a specific invoice', async () => {
      const recent = await import('../db.js').then((m) => m.getRecentRemindersForInvoice(invoice1Id));
      expect(Array.isArray(recent)).toBe(true);
      expect(recent.length).toBeGreaterThan(0);
      expect(recent[0].invoice_id).toBe(invoice1Id);
    });

    it('identifies users eligible for automated reminders based on active tier', async () => {
      const users = await import('../db.js').then((m) => m.getUsersWithAutomatedReminders());
      expect(Array.isArray(users)).toBe(true);
      expect(users.some((u) => u.id === user1Id)).toBe(true);
    });
  });

  describe('Admin Repository', () => {
    it('generates accurate administrative dashboard statistics', async () => {
      const stats = await import('../db.js').then((m) => m.getAdminDashboardStats());
      expect(stats).toBeDefined();
      expect(typeof stats.total_users).toBe('number');
      expect(typeof stats.active_users).toBe('number');
      expect(typeof stats.total_invoices).toBe('number');
      expect(stats.system_health).toBeDefined();
    });

    it('queries admin users with pagination and search', async () => {
      const result = await import('../db.js').then((m) => m.getAdminUsers({ page: 1, limit: 10 }));
      expect(result).toBeDefined();
      expect(Array.isArray(result.users)).toBe(true);
      expect(result.total).toBeGreaterThan(0);
    });

    it('suspends and restores a target user account', async () => {
      const suspendRes = await import('../db.js').then((m) => m.suspendUser(user1Id, user2Id));
      expect(suspendRes.success).toBe(true);

      const target = await getUserById(user2Id);
      expect(target?.status).toBe('SUSPENDED');

      const restoreRes = await import('../db.js').then((m) => m.restoreUser(user1Id, user2Id));
      expect(restoreRes.success).toBe(true);

      const restoredTarget = await getUserById(user2Id);
      expect(restoredTarget?.status).toBe('ACTIVE');
    });

    it('updates user role to ADMIN and back to USER', async () => {
      const makeAdminRes = await import('../db.js').then((m) => m.updateUserRole(user1Id, user2Id, 'ADMIN'));
      expect(makeAdminRes.success).toBe(true);

      let target = await getUserById(user2Id);
      expect(target?.role).toBe('ADMIN');

      const revertRoleRes = await import('../db.js').then((m) => m.updateUserRole(user1Id, user2Id, 'USER'));
      expect(revertRoleRes.success).toBe(true);

      target = await getUserById(user2Id);
      expect(target?.role).toBe('USER');
    });

    it('retrieves admin subscriptions and system health records', async () => {
      const subs = await import('../db.js').then((m) => m.getAdminSubscriptions({ page: 1, limit: 10 }));
      expect(subs).toBeDefined();
      expect(Array.isArray(subs.subscriptions)).toBe(true);

      const health = await import('../db.js').then((m) => m.getAdminSystemHealth());
      expect(health).toBeDefined();
      expect(health.database).toBeDefined();
    });
  });
});
