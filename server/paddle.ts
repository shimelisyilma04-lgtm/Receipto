import crypto from 'crypto';
import { PlanTier, BillingInterval, PLAN_CONFIGS } from './plans.js';

export interface PaddleWebhookEvent {
  event_id: string;
  event_type: string;
  occurred_at: string;
  data: any;
  notification_id?: string;
}

export function isValidPaddleClientToken(token?: string | null, env: 'sandbox' | 'production' = 'sandbox'): boolean {
  if (!token) return false;
  const trimmed = token.trim();
  const prefix = env === 'production' ? 'live_' : 'test_';
  return trimmed.startsWith(prefix) && trimmed.length >= 10;
}

export function isValidPaddlePriceId(priceId?: string | null): boolean {
  if (!priceId) return false;
  const trimmed = priceId.trim();
  return trimmed.startsWith('pri_') && trimmed.length >= 6;
}

export function isPaddleConfigured(): boolean {
  const env = getPaddleEnvironment();
  const clientToken = getPaddleClientToken();
  return isValidPaddleClientToken(clientToken, env);
}

export function isPaddleWebhookConfigured(): boolean {
  return Boolean(process.env.PADDLE_WEBHOOK_SECRET?.trim());
}

export function getPaddleEnvironment(): 'sandbox' | 'production' {
  const env = (process.env.PADDLE_ENVIRONMENT || process.env.PADDLE_ENV)?.trim().toLowerCase();
  if (env === 'production' || env === 'live') return 'production';
  if (env === 'sandbox' || env === 'test') return 'sandbox';
  if (process.env.PADDLE_CLIENT_TOKEN?.trim().startsWith('live_')) return 'production';
  return 'sandbox';
}

export function getPaddleBaseUrl(): string {
  return getPaddleEnvironment() === 'sandbox'
    ? 'https://sandbox-api.paddle.com'
    : 'https://api.paddle.com';
}

export function getPaddleClientToken(): string {
  return process.env.PADDLE_CLIENT_TOKEN?.trim() || '';
}

/**
 * Resolves the configured Paddle Price ID for a given plan and interval.
 * Supports both YEARLY and ANNUAL environment variable naming conventions.
 */
export function getPaddlePriceId(plan: PlanTier, interval: BillingInterval): string {
  if (plan === 'STARTER') {
    return interval === 'annual'
      ? process.env.PADDLE_STARTER_YEARLY_PRICE_ID?.trim() ||
        process.env.PADDLE_STARTER_ANNUAL_PRICE_ID?.trim() ||
        process.env.PADDLE_PRICE_STARTER_ANNUAL?.trim() ||
        ''
      : process.env.PADDLE_STARTER_MONTHLY_PRICE_ID?.trim() ||
        process.env.PADDLE_PRICE_STARTER_MONTHLY?.trim() ||
        '';
  }
  if (plan === 'GROWTH') {
    return interval === 'annual'
      ? process.env.PADDLE_GROWTH_YEARLY_PRICE_ID?.trim() ||
        process.env.PADDLE_GROWTH_ANNUAL_PRICE_ID?.trim() ||
        process.env.PADDLE_PRICE_GROWTH_ANNUAL?.trim() ||
        ''
      : process.env.PADDLE_GROWTH_MONTHLY_PRICE_ID?.trim() ||
        process.env.PADDLE_PRICE_GROWTH_MONTHLY?.trim() ||
        '';
  }
  return '';
}

/**
 * Maps a Paddle Price ID or custom data to the application PlanTier and BillingInterval.
 */
export function mapPaddlePriceToPlan(
  priceId?: string | null,
  customData?: any
): { plan: PlanTier; interval: BillingInterval } {
  // Check custom data first
  if (customData?.plan === 'GROWTH' || customData?.plan === 'STARTER') {
    const interval: BillingInterval = customData?.interval === 'annual' ? 'annual' : 'monthly';
    return { plan: customData.plan, interval };
  }

  const starterMonthly = getPaddlePriceId('STARTER', 'monthly');
  const starterAnnual = getPaddlePriceId('STARTER', 'annual');
  const growthMonthly = getPaddlePriceId('GROWTH', 'monthly');
  const growthAnnual = getPaddlePriceId('GROWTH', 'annual');

  if (priceId === starterMonthly) return { plan: 'STARTER', interval: 'monthly' };
  if (priceId === starterAnnual) return { plan: 'STARTER', interval: 'annual' };
  if (priceId === growthMonthly) return { plan: 'GROWTH', interval: 'monthly' };
  if (priceId === growthAnnual) return { plan: 'GROWTH', interval: 'annual' };

  if (priceId?.toLowerCase().includes('growth') && priceId?.toLowerCase().includes('ann')) {
    return { plan: 'GROWTH', interval: 'annual' };
  }
  if (priceId?.toLowerCase().includes('growth')) {
    return { plan: 'GROWTH', interval: 'monthly' };
  }
  if (priceId?.toLowerCase().includes('starter') && priceId?.toLowerCase().includes('ann')) {
    return { plan: 'STARTER', interval: 'annual' };
  }
  if (priceId?.toLowerCase().includes('starter')) {
    return { plan: 'STARTER', interval: 'monthly' };
  }

  // Default to STARTER monthly if undefined
  return { plan: 'STARTER', interval: 'monthly' };
}

/**
 * Verify Paddle Webhook Signature using HMAC-SHA256.
 * Paddle-Signature header format: ts=1690000000;h1=5d41402abc4b2a76b9719d911017c592...
 */
export function verifyPaddleWebhookSignature(
  rawBody: Buffer | string,
  signatureHeader?: string
): boolean {
  const secret = process.env.PADDLE_WEBHOOK_SECRET?.trim();
  if (!secret) {
    console.warn(
      '[Paddle Webhook] PADDLE_WEBHOOK_SECRET is not configured. Allowing event in sandbox/dev mode with warning.'
    );
    return true;
  }

  if (!signatureHeader) {
    throw new Error('Missing Paddle-Signature header in webhook request');
  }

  // Parse ts and h1 from header
  const parts = signatureHeader.split(';').reduce<Record<string, string>>((acc, item) => {
    const [key, val] = item.split('=');
    if (key && val) acc[key.trim()] = val.trim();
    return acc;
  }, {});

  const ts = parts['ts'];
  const h1 = parts['h1'];

  if (!ts || !h1) {
    throw new Error('Malformed Paddle-Signature header: missing ts or h1 component');
  }

  const rawBodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  const signedPayload = `${ts}:${rawBodyString}`;

  const expectedH1 = crypto
    .createHmac('sha256', secret)
    .update(signedPayload)
    .digest('hex');

  const h1Buffer = Buffer.from(h1, 'hex');
  const expectedBuffer = Buffer.from(expectedH1, 'hex');

  if (h1Buffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(h1Buffer, expectedBuffer)) {
    throw new Error('Paddle webhook signature verification failed: signature mismatch');
  }

  return true;
}

/**
 * Parses a Paddle webhook event payload safely.
 */
export function parsePaddleWebhookEvent(rawBody: Buffer | string): PaddleWebhookEvent {
  const rawBodyString = typeof rawBody === 'string' ? rawBody : rawBody.toString('utf-8');
  const json = JSON.parse(rawBodyString);

  if (!json.event_id || !json.event_type) {
    throw new Error('Invalid Paddle event format: missing event_id or event_type');
  }

  return {
    event_id: json.event_id,
    event_type: json.event_type,
    occurred_at: json.occurred_at || new Date().toISOString(),
    data: json.data || {},
    notification_id: json.notification_id,
  };
}

/**
 * Performs authenticated requests to the Paddle API.
 */
async function paddleApiRequest<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) {
    throw new Error('Paddle API key (PADDLE_API_KEY) is not configured.');
  }

  const baseUrl = getPaddleBaseUrl();
  const url = `${baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options.headers || {}),
    },
  });

  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const errorMsg = body?.error?.detail || body?.error?.message || `Paddle API request failed with status ${res.status}`;
    throw new Error(errorMsg);
  }

  return body as T;
}

/**
 * Cancels a Paddle subscription.
 */
export async function cancelPaddleSubscription(
  subscriptionId: string,
  effectiveFrom: 'next_billing_period' | 'immediately' = 'next_billing_period'
): Promise<{ success: boolean; data: any }> {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) {
    // If running in sandbox without API key, simulate cancellation
    console.warn('[Paddle] PADDLE_API_KEY not set. Simulating subscription cancellation.');
    return {
      success: true,
      data: {
        id: subscriptionId,
        status: 'active',
        scheduled_change: { action: 'cancel', effective_at: new Date(Date.now() + 30 * 86400000).toISOString() },
      },
    };
  }

  const result = await paddleApiRequest(`/subscriptions/${subscriptionId}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ effective_from: effectiveFrom }),
  });

  return { success: true, data: result.data };
}

/**
 * Retrieves a Paddle subscription details.
 */
export async function getPaddleSubscription(subscriptionId: string): Promise<any> {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) {
    return null;
  }

  const result = await paddleApiRequest(`/subscriptions/${subscriptionId}`, {
    method: 'GET',
  });

  return result.data;
}

/**
 * Retrieves or creates a customer in Paddle.
 */
export async function getOrCreatePaddleCustomer(
  email: string,
  name?: string
): Promise<string | null> {
  const apiKey = process.env.PADDLE_API_KEY?.trim();
  if (!apiKey) return null;

  try {
    // Search existing customer by email
    const searchRes = await paddleApiRequest(`/customers?search=${encodeURIComponent(email)}`, {
      method: 'GET',
    });

    if (searchRes.data && searchRes.data.length > 0) {
      return searchRes.data[0].id;
    }

    // Create customer if not found
    const createRes = await paddleApiRequest('/customers', {
      method: 'POST',
      body: JSON.stringify({ email, name: name || email }),
    });

    return createRes.data?.id || null;
  } catch (err: any) {
    console.error('[Paddle Customer Search/Create Error]:', err.message);
    return null;
  }
}

/**
 * Generates checkout parameters for Paddle.js checkout initiation.
 */
export interface PaddleCheckoutParams {
  priceId: string;
  plan: PlanTier;
  interval: BillingInterval;
  customerId?: string | null;
  customerEmail: string;
  customData: {
    user_id: string;
    plan: PlanTier;
    interval: BillingInterval;
  };
  environment: 'sandbox' | 'production';
  clientToken: string;
}

export function getCheckoutParams(
  userId: string,
  userEmail: string,
  plan: 'STARTER' | 'GROWTH',
  interval: BillingInterval,
  existingCustomerId?: string | null
): PaddleCheckoutParams {
  const priceId = getPaddlePriceId(plan, interval);
  const environment = getPaddleEnvironment();
  const clientToken = getPaddleClientToken();

  return {
    priceId,
    plan,
    interval,
    customerId: existingCustomerId || null,
    customerEmail: userEmail,
    customData: {
      user_id: userId,
      plan,
      interval,
    },
    environment,
    clientToken,
  };
}

/**
 * Dynamic IP allowlisting for Paddle Webhooks.
 * Fetches https://api.paddle.com/ips dynamically and caches the allowed CIDRs.
 * The endpoint is the authoritative source of truth.
 */
let cachedPaddleIps: string[] = [];
let lastIpFetchTime = 0;
const IP_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getPaddleAllowedIps(): Promise<string[]> {
  const now = Date.now();
  if (cachedPaddleIps.length > 0 && now - lastIpFetchTime < IP_CACHE_TTL_MS) {
    return cachedPaddleIps;
  }

  try {
    const res = await fetch('https://api.paddle.com/ips', {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.data?.ipv4_cidrs) && data.data.ipv4_cidrs.length > 0) {
        cachedPaddleIps = data.data.ipv4_cidrs.map((cidr: string) => cidr.trim());
        lastIpFetchTime = now;
        console.log(`[Paddle IP Allowlist] Dynamically refreshed ${cachedPaddleIps.length} live CIDRs from https://api.paddle.com/ips`);
        return cachedPaddleIps;
      }
    }
  } catch (err: any) {
    console.warn('[Paddle IP Allowlist] Error fetching live IPs from api.paddle.com/ips:', err.message);
  }

  if (cachedPaddleIps.length > 0) {
    return cachedPaddleIps;
  }

  // Fallback if network is temporarily unreachable during first cold start
  return [
    '34.237.3.244/32',
    '34.195.105.136/32',
    '34.232.58.13/32',
    '35.155.119.135/32',
    '34.212.5.7/32',
    '52.11.166.252/32',
  ];
}

function ipToNumber(ip: string): number {
  const parts = ip.split('.').map(Number);
  if (parts.length !== 4 || parts.some(isNaN)) return 0;
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function ipInCidr(ip: string, network: string, mask: number): boolean {
  const ipNum = ipToNumber(ip);
  const networkNum = ipToNumber(network);
  const bitmask = mask === 0 ? 0 : (~0 << (32 - mask)) >>> 0;
  return (ipNum & bitmask) === (networkNum & bitmask);
}

/**
 * Checks whether an incoming client IP belongs to Paddle's dynamic allowed IP CIDRs.
 */
export async function isPaddleIpAllowed(clientIp?: string | null): Promise<boolean> {
  if (!clientIp) return false;

  let cleanIp = clientIp.trim();
  if (cleanIp.startsWith('::ffff:')) {
    cleanIp = cleanIp.replace('::ffff:', '');
  }

  // Always permit local development loopback in sandbox/test environments
  const env = getPaddleEnvironment();
  if (env === 'sandbox' || process.env.NODE_ENV === 'test') {
    if (cleanIp === '127.0.0.1' || cleanIp === '::1' || cleanIp === 'localhost' || cleanIp === '') {
      return true;
    }
  }

  const allowedCidrs = await getPaddleAllowedIps();

  for (const cidr of allowedCidrs) {
    const [networkIp, maskStr] = cidr.split('/');
    const mask = maskStr ? parseInt(maskStr, 10) : 32;

    if (mask === 32) {
      if (cleanIp === networkIp) return true;
    } else {
      if (ipInCidr(cleanIp, networkIp, mask)) return true;
    }
  }

  return false;
}
