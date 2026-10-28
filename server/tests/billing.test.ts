import { describe, it, expect, vi, beforeEach, beforeAll, afterAll } from 'vitest';
import crypto from 'crypto';
import express from 'express';
import cookieParser from 'cookie-parser';
import type { Server } from 'http';
import type { AddressInfo } from 'net';
import { router } from '../routes.js';
import { setUserEmailVerified } from '../db.js';
import {
  isStripeConfigured,
  isStripeWebhookConfigured,
  getStripePriceId,
  createStripeCheckoutSession,
  createStripePortalSession,
  cancelStripeSubscription,
  verifyStripeWebhookSignature,
} from '../stripe.js';

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

  const setCookieHeader = res.headers.get('set-cookie');
  let cookie = '';
  if (setCookieHeader) {
    cookie = setCookieHeader.split(';')[0];
  }

  return { status: res.status, data, cookie };
}

describe('Stripe Billing & Adapter Unit Tests', () => {
  const originalEnv = { ...process.env };

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
  });

  afterAll(async () => {
    if (server) {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    process.env = { ...originalEnv };
  });

  it('detects live and test secret keys correctly', () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_1234567890abcdef';
    expect(isStripeConfigured()).toBe(true);

    process.env.STRIPE_SECRET_KEY = 'sk_live_1234567890abcdef';
    expect(isStripeConfigured()).toBe(true);

    process.env.STRIPE_SECRET_KEY = '';
    expect(isStripeConfigured()).toBe(false);

    delete process.env.STRIPE_SECRET_KEY;
    expect(isStripeConfigured()).toBe(false);
  });

  it('detects webhook secret configuration', () => {
    process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_123';
    expect(isStripeWebhookConfigured()).toBe(true);

    process.env.STRIPE_WEBHOOK_SECRET = 'invalid_secret';
    expect(isStripeWebhookConfigured()).toBe(false);
  });

  it('resolves price IDs for plan tiers and billing intervals', () => {
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter_mo_123';
    process.env.STRIPE_STARTER_YEARLY_PRICE_ID = 'price_starter_yr_456';
    process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID = 'price_growth_mo_789';
    process.env.STRIPE_GROWTH_YEARLY_PRICE_ID = 'price_growth_yr_012';

    expect(getStripePriceId('FREE', 'monthly')).toBeNull();
    expect(getStripePriceId('STARTER', 'monthly')).toBe('price_starter_mo_123');
    expect(getStripePriceId('STARTER', 'annual')).toBe('price_starter_yr_456');
    expect(getStripePriceId('GROWTH', 'monthly')).toBe('price_growth_mo_789');
    expect(getStripePriceId('GROWTH', 'annual')).toBe('price_growth_yr_012');
  });

  it('creates sandbox test session when Stripe API keys are omitted', async () => {
    delete process.env.STRIPE_SECRET_KEY;

    const result = await createStripeCheckoutSession({
      userId: 'test_user_1',
      customerEmail: 'user@example.com',
      plan: 'STARTER',
      interval: 'monthly',
      baseUrl: 'http://localhost:3000',
    });

    expect(result.mode).toBe('test_mock');
    expect(result.sessionId).toMatch(/^cs_test_/);
    expect(result.url).toContain('billing_success=true');
    expect(result.plan).toBe('STARTER');
    expect(result.interval).toBe('monthly');
  });

  it('creates live Stripe checkout session via Stripe API when configured', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_secret';
    process.env.STRIPE_STARTER_MONTHLY_PRICE_ID = 'price_starter_mo';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        id: 'cs_live_real_123',
        url: 'https://checkout.stripe.com/c/pay/cs_live_real_123',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const result = await createStripeCheckoutSession({
      userId: 'test_user_2',
      customerEmail: 'user2@example.com',
      plan: 'STARTER',
      interval: 'monthly',
      baseUrl: 'http://localhost:3000',
    });

    expect(result.mode).toBe('live');
    expect(result.sessionId).toBe('cs_live_real_123');
    expect(result.url).toBe('https://checkout.stripe.com/c/pay/cs_live_real_123');
  });

  it('verifies valid Stripe webhook signatures with HMAC-SHA256', () => {
    const secret = 'whsec_test_secret_abc123';
    const rawBody = JSON.stringify({ id: 'evt_test_1', type: 'customer.subscription.updated' });
    const timestamp = Math.floor(Date.now() / 1000);
    const payload = `${timestamp}.${rawBody}`;
    const signature = crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
    const sigHeader = `t=${timestamp},v1=${signature}`;

    const isValid = verifyStripeWebhookSignature(rawBody, sigHeader, secret);
    expect(isValid).toBe(true);
  });

  it('rejects expired or manipulated Stripe webhook signatures', () => {
    const secret = 'whsec_test_secret_abc123';
    const rawBody = JSON.stringify({ id: 'evt_test_1', type: 'customer.subscription.updated' });

    // Expired timestamp (10 minutes ago)
    const expiredTimestamp = Math.floor(Date.now() / 1000) - 600;
    const expiredPayload = `${expiredTimestamp}.${rawBody}`;
    const expiredSig = crypto.createHmac('sha256', secret).update(expiredPayload, 'utf8').digest('hex');
    expect(verifyStripeWebhookSignature(rawBody, `t=${expiredTimestamp},v1=${expiredSig}`, secret)).toBe(false);

    // Tampered payload
    const nowTimestamp = Math.floor(Date.now() / 1000);
    const tamperedPayload = `${nowTimestamp}.${rawBody}tampered`;
    const tamperedSig = crypto.createHmac('sha256', secret).update(tamperedPayload, 'utf8').digest('hex');
    expect(verifyStripeWebhookSignature(rawBody, `t=${nowTimestamp},v1=${tamperedSig}`, secret)).toBe(false);

    // Missing header or secret
    expect(verifyStripeWebhookSignature(rawBody, '', secret)).toBe(false);
  });

  it('creates portal sessions when customer ID and keys are present', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_secret';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ url: 'https://billing.stripe.com/session/portal_123' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const portalUrl = await createStripePortalSession('cus_12345', 'http://localhost:3000/billing');
    expect(portalUrl).toBe('https://billing.stripe.com/session/portal_123');

    // Without customerId or secret key
    expect(await createStripePortalSession('', 'http://localhost:3000')).toBeNull();
  });

  it('cancels Stripe subscriptions at period end via API', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_mock_secret';

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'sub_123', cancel_at_period_end: true }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const success = await cancelStripeSubscription('sub_123');
    expect(success).toBe(true);

    expect(await cancelStripeSubscription('')).toBe(false);
  });

  describe('Billing HTTP Endpoints', () => {
    let authToken: string;
    let authCookie: string;

    beforeEach(async () => {
      const regRes = await testRequest('/api/auth/register', {
        method: 'POST',
        body: {
          email: `billing_test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}@example.com`,
          password: 'Password123!',
          name: 'Billing Tester',
          terms_accepted: true,
        },
      });
      authToken = regRes.data.token;
      authCookie = regRes.cookie;
      if (regRes.data.user?.id) {
        await setUserEmailVerified(regRes.data.user.id, true);
      }
    });

    it('POST /api/billing/checkout returns session info', async () => {
      const res = await testRequest('/api/billing/checkout', {
        method: 'POST',
        token: authToken,
        cookie: authCookie,
        body: {
          plan: 'STARTER',
          interval: 'monthly',
        },
      });

      expect(res.status).toBe(200);
      expect(res.data.success).toBe(true);
      expect(res.data.provider).toBe('stripe');
      expect(res.data.plan).toBe('STARTER');
      expect(res.data.url).toBeDefined();
    });

    it('POST /api/billing/checkout validates requested plan tier', async () => {
      const res = await testRequest('/api/billing/checkout', {
        method: 'POST',
        token: authToken,
        cookie: authCookie,
        body: {
          plan: 'INVALID_TIER',
          interval: 'monthly',
        },
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toBeDefined();
    });

    it('POST /api/billing/portal handles portal requests without Stripe customer ID gracefully', async () => {
      const res = await testRequest('/api/billing/portal', {
        method: 'POST',
        token: authToken,
        cookie: authCookie,
      });

      expect(res.status).toBe(200);
      expect(res.data).toHaveProperty('url');
    });

    it('POST /api/webhooks/stripe processes or validates webhook signature', async () => {
      process.env.STRIPE_WEBHOOK_SECRET = 'whsec_test_secret_123';
      const res = await testRequest('/api/webhooks/stripe', {
        method: 'POST',
        headers: { 'stripe-signature': 't=12345,v1=bad_sig' },
        body: { type: 'checkout.session.completed' },
      });

      expect(res.status).toBe(400);
      expect(res.data.error).toContain('Invalid Stripe webhook signature');
    });
  });
});
