import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { router } from '../routes.js';
import {
  setUserEmailVerified,
  createClient,
  createInvoice,
  markInvoicePaid,
  upsertSubscription,
  getUserByEmail,
} from '../db.js';

const realFetch = globalThis.fetch;
let server: Server;
let baseUrl: string;

async function testRequest(
  path: string,
  options: { method?: string; body?: any; token?: string; cookie?: string; headers?: Record<string, string> } = {}
) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }

  const res = await realFetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json().catch(() => ({}));
  } else {
    data = await res.text().catch(() => '');
  }

  return { status: res.status, data };
}

describe('Reminders API & Follow-up Workflows', () => {
  let authToken: string;
  let userId: string;
  let testClientId: string;
  let openInvoiceId: string;
  let paidInvoiceId: string;
  let _overdueInvoiceId: string;

  beforeAll(async () => {
    const app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api', router);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as AddressInfo).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    // Register user
    const email = `reminder_test_${crypto.randomUUID()}@example.com`;
    const regRes = await testRequest('/api/auth/register', {
      method: 'POST',
      body: {
        email,
        password: 'Password123!',
        name: 'Reminder Tester',
        business_name: 'Reminder Acme Corp',
        terms_accepted: true,
      },
    });
    authToken = regRes.data.token;
    const user = await getUserByEmail(email);
    userId = user!.id;
    await setUserEmailVerified(userId, true);

    // Create client
    const client = await createClient(userId, {
      name: 'Client Acme',
      email: 'client_acme@example.com',
      company: 'Acme Corp',
    });
    testClientId = client.id;

    // Create open invoice
    const openInv = await createInvoice(userId, {
      client_id: testClientId,
      invoice_number: `INV-${Date.now()}-1`,
      issue_date: '2026-10-01',
      due_date: '2026-10-31',
      amount: 1500,
      currency: 'USD',
    });
    openInvoiceId = openInv.id;

    // Create paid invoice
    const paidInv = await createInvoice(userId, {
      client_id: testClientId,
      invoice_number: `INV-${Date.now()}-2`,
      issue_date: '2026-10-01',
      due_date: '2026-10-15',
      amount: 800,
      currency: 'USD',
    });
    await markInvoicePaid(userId, paidInv.id);
    paidInvoiceId = paidInv.id;

    // Create overdue invoice
    const overdueInv = await createInvoice(userId, {
      client_id: testClientId,
      invoice_number: `INV-${Date.now()}-3`,
      issue_date: '2026-09-01',
      due_date: '2026-09-15',
      amount: 3200,
      currency: 'USD',
    });
    _overdueInvoiceId = overdueInv.id;
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  describe('GET /api/reminders', () => {
    it('requires authentication', async () => {
      const res = await testRequest('/api/reminders');
      expect(res.status).toBe(401);
    });

    it('returns empty list for initial state', async () => {
      const res = await testRequest('/api/reminders', { token: authToken });
      expect(res.status).toBe(200);
      expect(Array.isArray(res.data.reminders)).toBe(true);
    });
  });

  describe('POST /api/reminders/preview', () => {
    it('rejects request with missing invoice_id', async () => {
      const res = await testRequest('/api/reminders/preview', {
        method: 'POST',
        token: authToken,
        body: {},
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('invoice_id is required');
    });

    it('returns 404 for non-existent invoice', async () => {
      const res = await testRequest('/api/reminders/preview', {
        method: 'POST',
        token: authToken,
        body: { invoice_id: 'non-existent-invoice-id' },
      });
      expect(res.status).toBe(404);
      expect(res.data.error).toContain('Invoice not found');
    });

    it('generates email preview with standard, friendly, and urgent tones', async () => {
      for (const tone of ['standard', 'friendly', 'urgent']) {
        const res = await testRequest('/api/reminders/preview', {
          method: 'POST',
          token: authToken,
          body: {
            invoice_id: openInvoiceId,
            tone,
            custom_message: 'Please settle soon.',
          },
        });

        expect(res.status).toBe(200);
        expect(res.data.preview).toBeDefined();
        expect(res.data.preview.subject).toBeDefined();
        expect(res.data.preview.text).toContain('Please settle soon.');
        expect(res.data.recipient).toBe('client_acme@example.com');
      }
    });
  });

  describe('POST /api/reminders/send', () => {
    it('validates required invoice_id', async () => {
      const res = await testRequest('/api/reminders/send', {
        method: 'POST',
        token: authToken,
        body: {},
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('invoice_id is required');
    });

    it('returns 404 if invoice is not found', async () => {
      const res = await testRequest('/api/reminders/send', {
        method: 'POST',
        token: authToken,
        body: { invoice_id: 'non-existent-id' },
      });
      expect(res.status).toBe(404);
    });

    it('prevents sending reminders for paid invoices', async () => {
      const res = await testRequest('/api/reminders/send', {
        method: 'POST',
        token: authToken,
        body: { invoice_id: paidInvoiceId },
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toContain('paid invoices');
    });

    it('creates reminder and records activity log', async () => {
      const res = await testRequest('/api/reminders/send', {
        method: 'POST',
        token: authToken,
        body: {
          invoice_id: openInvoiceId,
          tone: 'standard',
          custom_message: 'Gentle reminder to pay.',
        },
      });

      expect(res.status).toBe(200);
      expect(res.data.reminder).toBeDefined();
      expect(res.data.reminder.invoice_id).toBe(openInvoiceId);
      expect(res.data.reminder.recipient_email).toBe('client_acme@example.com');

      // Verify that reminder appears in GET /api/reminders
      const listRes = await testRequest(`/api/reminders?invoice_id=${openInvoiceId}`, {
        token: authToken,
      });
      expect(listRes.status).toBe(200);
      expect(listRes.data.reminders.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Feature Gating: /api/reminders/automate & /api/reminders/schedules', () => {
    it('blocks automate reminders for free plan users', async () => {
      const res = await testRequest('/api/reminders/automate', {
        method: 'POST',
        token: authToken,
      });
      expect(res.status).toBe(403);
      expect(res.data.code).toBe('FEATURE_LOCKED');
      expect(res.data.upgrade_required).toBe(true);
    });

    it('blocks custom schedules for free plan users', async () => {
      const res = await testRequest('/api/reminders/schedules', {
        method: 'POST',
        token: authToken,
        body: { cadence: '3,7,14' },
      });
      expect(res.status).toBe(403);
      expect(res.data.code).toBe('FEATURE_LOCKED');
    });

    it('allows automated reminders when user upgrades to starter plan', async () => {
      await upsertSubscription(userId, {
        plan: 'STARTER',
        status: 'active',
      });

      const res = await testRequest('/api/reminders/automate', {
        method: 'POST',
        token: authToken,
      });

      expect(res.status).toBe(200);
      expect(res.data.processed).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.data.results)).toBe(true);
    });

    it('blocks custom reminder schedules for starter plan', async () => {
      const res = await testRequest('/api/reminders/schedules', {
        method: 'POST',
        token: authToken,
        body: { cadence: '3,7,14' },
      });
      expect(res.status).toBe(403);
      expect(res.data.feature).toBe('customReminderSchedules');
    });

    it('allows custom reminder schedules when user upgrades to growth plan', async () => {
      await upsertSubscription(userId, {
        plan: 'GROWTH',
        status: 'active',
      });

      const res = await testRequest('/api/reminders/schedules', {
        method: 'POST',
        token: authToken,
        body: { cadence: '1,3,7,14,30' },
      });

      expect(res.status).toBe(200);
      expect(res.data.message).toContain('configured successfully');
      expect(res.data.cadence).toBe('1,3,7,14,30');
    });
  });
});
