import crypto from 'crypto';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { router, healthHandler, readinessHandler } from '../routes.js';
import {
  initDatabase,
  reloadLocalStore,
  setUserEmailVerified,
  checkDatabaseHealth,
  isWebhookEventProcessed,
  recordProcessedWebhookEvent,
  checkFeatureAccess,
  checkCanCreateClient,
  checkCanCreateInvoice,
} from '../db.js';
import { verifyStripeWebhookSignature } from '../stripe.js';
import { generateReminderEmailContent, escapeHtml } from '../email.js';

let server: Server;
let baseUrl: string;

// Helper to make JSON requests against the test server
async function testRequest(path: string, options: { method?: string; body?: any; token?: string; cookie?: string } = {}) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  };
  if (options.token) {
    headers['Authorization'] = `Bearer ${options.token}`;
  }
  if (options.cookie) {
    headers['Cookie'] = options.cookie;
  }

  const res = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const contentType = res.headers.get('content-type') || '';
  let data: any = null;
  if (contentType.includes('application/json')) {
    data = await res.json();
  } else {
    data = await res.text();
  }

  const setCookieHeader = res.headers.get('set-cookie');
  let cookie = '';
  if (setCookieHeader) {
    cookie = setCookieHeader.split(';')[0];
  }

  return { status: res.status, data, contentType, cookie };
}

describe('Receipto Backend Routes & Security Test Suite', () => {
  beforeAll(async () => {
    await initDatabase();
    reloadLocalStore();

    const app = express();
    app.use(express.json());
    app.use(express.urlencoded({ extended: true }));
    app.use(cookieParser());

    app.get('/health', healthHandler);
    app.get('/system/readiness', readinessHandler);
    app.use('/api', router);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address() as AddressInfo;
        baseUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  describe('Health and Readiness Endpoints', () => {
    it('GET /health returns HTTP 200 with active service status', async () => {
      const res = await testRequest('/health');
      expect(res.status).toBe(200);
      expect(res.data).toBeDefined();
      expect(res.data.status).toBe('ok');
      expect(res.data.database).toBeDefined();

      const dbHealth = await checkDatabaseHealth();
      expect(dbHealth).toBeDefined();
    });

    it('GET /system/readiness returns detailed system readiness checks', async () => {
      const res = await testRequest('/system/readiness');
      expect(res.status).toBe(200);
      expect(typeof res.data.overall_ready).toBe('boolean');
      expect(res.data.summary).toBeDefined();
      expect(Array.isArray(res.data.checks)).toBe(true);
    });
  });

  describe('Authentication & Authorization', () => {
    // Isolated dynamic fixture per test execution to prevent static hardcoded credentials
    const testPassword = process.env.TEST_PASSWORD || ('Rcpt$' + crypto.randomBytes(12).toString('hex') + 'A9!');
    const userA_Email = `user_a_${Date.now()}@example.com`;
    const userB_Email = `user_b_${Date.now()}@example.com`;
    let userA_Token: string;
    let userA_Cookie: string;
    let userA_Id: string;
    let userB_Token: string;
    let userB_Cookie: string;
    let userB_Id: string;

    it('rejects registration with short password (< 8 chars)', async () => {
      const res = await testRequest('/api/auth/register', {
        method: 'POST',
        body: {
          email: 'short_pw@example.com',
          password: 'short',
          name: 'Short Password User',
          terms_accepted: true,
        },
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/8 characters/i);
    });

    it('rejects registration without terms acceptance', async () => {
      const res = await testRequest('/api/auth/register', {
        method: 'POST',
        body: {
          email: 'noterms@example.com',
          password: testPassword,
          name: 'No Terms User',
          terms_accepted: false,
        },
      });
      expect(res.status).toBe(400);
      expect(res.data.error).toMatch(/terms/i);
    });

    it('registers user A successfully', async () => {
      const res = await testRequest('/api/auth/register', {
        method: 'POST',
        body: {
          email: userA_Email,
          password: testPassword,
          name: 'Merchant Alpha',
          business_name: 'Alpha Enterprises',
          terms_accepted: true,
        },
      });
      expect(res.status).toBe(201);
      expect(res.data.user).toBeDefined();
      expect(res.data.user.email).toBe(userA_Email.toLowerCase());
      expect(res.data.token).toBeDefined();
      userA_Token = res.data.token;
      userA_Cookie = res.cookie;
      userA_Id = res.data.user.id;
    });

    it('rejects duplicate email registration with 409 Conflict', async () => {
      const res = await testRequest('/api/auth/register', {
        method: 'POST',
        body: {
          email: userA_Email,
          password: testPassword,
          name: 'Duplicate Alpha',
          terms_accepted: true,
        },
      });
      expect(res.status).toBe(409);
      expect(res.data.error).toMatch(/already exists/i);
    });

    it('authenticates user A via login endpoint', async () => {
      const res = await testRequest('/api/auth/login', {
        method: 'POST',
        body: {
          email: userA_Email,
          password: testPassword,
        },
      });
      expect(res.status).toBe(200);
      expect(res.data.token).toBeDefined();
      expect(res.data.user.id).toBe(userA_Id);
    });

    it('rejects login with invalid password', async () => {
      const res = await testRequest('/api/auth/login', {
        method: 'POST',
        body: {
          email: userA_Email,
          password: 'WrongPassword999!',
        },
      });
      expect(res.status).toBe(401);
      expect(res.data.error).toMatch(/invalid email or password/i);
    });

    it('returns 401 for GET /api/auth/me when unauthenticated', async () => {
      const res = await testRequest('/api/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns user profile for GET /api/auth/me when authenticated', async () => {
      const res = await testRequest('/api/auth/me', { token: userA_Token });
      expect(res.status).toBe(200);
      expect(res.data.user).toBeDefined();
      expect(res.data.user.email).toBe(userA_Email.toLowerCase());
    });

    it('authenticates user A via session cookie', async () => {
      const res = await testRequest('/api/auth/me', { cookie: userA_Cookie });
      expect(res.status).toBe(200);
      expect(res.data.user.id).toBe(userA_Id);
    });

    describe('Client and Invoice Management & Tenant Isolation', () => {
      let clientA_Id: string;
      let invoiceA_Id: string;

      it('rejects client creation if user email is unverified (requireVerified)', async () => {
        const res = await testRequest('/api/clients', {
          method: 'POST',
          token: userA_Token,
          body: {
            name: 'Client Alpha Unverified',
            email: 'client@test.com',
          },
        });
        expect(res.status).toBe(403);
        expect(res.data.requires_verification).toBe(true);
      });

      it('verifies users and allows verified user A to create a client', async () => {
        // Register User B for tenant isolation tests
        const regB = await testRequest('/api/auth/register', {
          method: 'POST',
          body: {
            email: userB_Email,
            password: testPassword,
            name: 'Merchant Beta',
            terms_accepted: true,
          },
        });
        userB_Token = regB.data.token;
        userB_Cookie = regB.cookie;
        userB_Id = regB.data.user.id;

        // Mark users verified in storage
        await setUserEmailVerified(userA_Id, true);
        await setUserEmailVerified(userB_Id, true);

        // User A now creates client successfully
        const res = await testRequest('/api/clients', {
          method: 'POST',
          token: userA_Token,
          body: {
            name: 'Client Alpha One',
            email: 'client1@alpha.test',
            company: 'Acme Alpha Inc',
            currency: 'USD',
          },
        });
        expect(res.status).toBe(201);
        expect(res.data.client).toBeDefined();
        expect(res.data.client.name).toBe('Client Alpha One');
        clientA_Id = res.data.client.id;
      });

      it('retrieves user A clients and isolates them from user B', async () => {
        const resA = await testRequest('/api/clients', { token: userA_Token });
        expect(resA.status).toBe(200);
        expect(Array.isArray(resA.data.clients)).toBe(true);
        expect(resA.data.clients.some((c: any) => c.id === clientA_Id)).toBe(true);

        const resB = await testRequest('/api/clients', { cookie: userB_Cookie });
        expect(resB.status).toBe(200);
        expect(Array.isArray(resB.data.clients)).toBe(true);
        expect(resB.data.clients.some((c: any) => c.id === clientA_Id)).toBe(false);
      });

      it('prevents user B from accessing user A client (tenant isolation)', async () => {
        const res = await testRequest(`/api/clients/${clientA_Id}`, { token: userB_Token });
        expect([403, 404]).toContain(res.status);
      });

      it('creates invoice for user A', async () => {
        const res = await testRequest('/api/invoices', {
          method: 'POST',
          token: userA_Token,
          body: {
            client_id: clientA_Id,
            invoice_number: `INV-TEST-${Date.now()}`,
            amount: 750.5,
            currency: 'USD',
            issue_date: '2026-10-01',
            due_date: '2026-10-15',
            notes: 'Test payment terms',
          },
        });
        expect(res.status).toBe(201);
        expect(res.data.invoice).toBeDefined();
        expect(res.data.invoice.amount).toBe(750.5);
        invoiceA_Id = res.data.invoice.id;
      });

      it('prevents user B from modifying or viewing user A invoice', async () => {
        const viewRes = await testRequest(`/api/invoices/${invoiceA_Id}`, { token: userB_Token });
        expect([403, 404]).toContain(viewRes.status);

        const updateRes = await testRequest(`/api/invoices/${invoiceA_Id}`, {
          method: 'PUT',
          token: userB_Token,
          body: { notes: 'Malicious modification' },
        });
        expect([403, 404]).toContain(updateRes.status);
      });

      it('allows user A to update and mark invoice as paid', async () => {
        const updateRes = await testRequest(`/api/invoices/${invoiceA_Id}`, {
          method: 'PUT',
          token: userA_Token,
          body: { notes: 'Updated notes Net 30' },
        });
        expect(updateRes.status).toBe(200);
        expect(updateRes.data.invoice.notes).toBe('Updated notes Net 30');

        const payRes = await testRequest(`/api/invoices/${invoiceA_Id}/pay`, {
          method: 'POST',
          token: userA_Token,
          body: { paid_date: '2026-10-10' },
        });
        expect(payRes.status).toBe(200);
        expect(payRes.data.invoice.payment_status).toBe('PAID');
      });
    });

    describe('Administrative Access Restrictions', () => {
      it('rejects unauthenticated access to admin endpoints with 401', async () => {
        const res = await testRequest('/api/admin/dashboard');
        expect(res.status).toBe(401);
      });

      it('rejects non-admin authenticated users from admin endpoints with 403', async () => {
        const res = await testRequest('/api/admin/dashboard', { token: userA_Token });
        expect(res.status).toBe(403);
        expect(res.data.error).toMatch(/admin|forbidden/i);
      });

      it('rejects non-admin from accessing user management endpoints with 403', async () => {
        const res = await testRequest('/api/admin/users', { token: userA_Token });
        expect(res.status).toBe(403);
      });
    });

    describe('Stripe Webhook Signature Verification & Idempotency', () => {
      const testSecret = 'whsec_test_secret_for_cryptographic_verification_12345';
      const testPayload = JSON.stringify({
        id: 'evt_test_123',
        type: 'checkout.session.completed',
        data: { object: { id: 'cs_123', client_reference_id: 'user_123' } },
      });

      it('validates authentic webhook signatures correctly using HMAC-SHA256', () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const signedPayload = `${timestamp}.${testPayload}`;
        const signature = crypto.createHmac('sha256', testSecret).update(signedPayload).digest('hex');
        const header = `t=${timestamp},v1=${signature}`;

        const isValid = verifyStripeWebhookSignature(testPayload, header, testSecret);
        expect(isValid).toBe(true);
      });

      it('rejects tampered or forged webhook payloads', () => {
        const timestamp = Math.floor(Date.now() / 1000);
        const header = `t=${timestamp},v1=invalid_tampered_signature_hex_value_0000000000000000`;

        const isValid = verifyStripeWebhookSignature(testPayload, header, testSecret);
        expect(isValid).toBe(false);
      });

      it('rejects expired webhook signatures to prevent replay attacks (> 300s)', () => {
        const expiredTimestamp = Math.floor(Date.now() / 1000) - 400; // 400 seconds ago
        const signedPayload = `${expiredTimestamp}.${testPayload}`;
        const signature = crypto.createHmac('sha256', testSecret).update(signedPayload).digest('hex');
        const header = `t=${expiredTimestamp},v1=${signature}`;

        const isValid = verifyStripeWebhookSignature(testPayload, header, testSecret);
        expect(isValid).toBe(false);
      });

      it('enforces webhook idempotency by detecting and recording duplicate events', async () => {
        const eventId = `evt_idempotent_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        expect(await isWebhookEventProcessed(eventId)).toBe(false);

        await recordProcessedWebhookEvent(eventId, 'customer.subscription.updated');
        expect(await isWebhookEventProcessed(eventId)).toBe(true);
      });
    });

    describe('Subscription Entitlements & Tier Limits', () => {
      it('evaluates feature access flags across plans correctly', async () => {
        const csvAccess = await checkFeatureAccess(userA_Id, 'csvExport');
        expect(typeof csvAccess.allowed).toBe('boolean');
        expect(csvAccess.plan).toBeDefined();

        const autoReminders = await checkFeatureAccess(userA_Id, 'automatedReminders');
        expect(typeof autoReminders.allowed).toBe('boolean');
      });

      it('validates client creation limit calculation', async () => {
        const clientLimit = await checkCanCreateClient(userA_Id);
        expect(clientLimit).toBeDefined();
        expect(typeof clientLimit.allowed).toBe('boolean');
        expect(typeof clientLimit.current).toBe('number');
      });

      it('validates invoice creation limit calculation', async () => {
        const invoiceLimit = await checkCanCreateInvoice(userA_Id);
        expect(invoiceLimit).toBeDefined();
        expect(typeof invoiceLimit.allowed).toBe('boolean');
        expect(typeof invoiceLimit.current).toBe('number');
      });
    });

    describe('Transactional Email Generation & XSS Protection', () => {
      it('escapes dangerous HTML characters to prevent XSS in email bodies', () => {
        const raw = '<script>alert("XSS")</script>&"\'';
        const escaped = escapeHtml(raw);
        expect(escaped).not.toContain('<script>');
        expect(escaped).toContain('&lt;script&gt;');
        expect(escaped).toContain('&amp;');
        expect(escaped).toContain('&quot;');
      });

      it('generates well-formatted payment reminders with proper tone and details', () => {
        const content = generateReminderEmailContent({
          to: 'client@example.com',
          clientName: 'Acme Client',
          invoiceNumber: 'INV-1001',
          amount: 500,
          currency: 'USD',
          dueDate: '2026-11-01',
          businessName: 'Receipto Billing',
          tone: 'urgent',
          customMessage: 'Please settle urgently.',
        });

        expect(content.subject).toContain('URGENT');
        expect(content.subject).toContain('INV-1001');
        expect(content.html).toContain('Acme Client');
        expect(content.html).toContain('USD 500.00');
        expect(content.html).toContain('Please settle urgently.');
      });
    });

    describe('Input Validation Edge Cases', () => {
      it('rejects invoice with negative amount', async () => {
        const res = await testRequest('/api/invoices', {
          method: 'POST',
          token: userA_Token,
          body: {
            client_id: 'any_client',
            invoice_number: `INV-NEG-${Date.now()}`,
            amount: -50,
            issue_date: '2026-10-01',
            due_date: '2026-10-15',
          },
        });
        expect([400, 404]).toContain(res.status);
      });

      it('rejects invoice with invalid date format', async () => {
        const res = await testRequest('/api/invoices', {
          method: 'POST',
          token: userA_Token,
          body: {
            client_id: 'any_client',
            invoice_number: `INV-DATE-${Date.now()}`,
            amount: 100,
            issue_date: 'not-a-valid-date',
            due_date: '2026-10-15',
          },
        });
        expect([400, 404]).toContain(res.status);
      });
    });
  });
});
