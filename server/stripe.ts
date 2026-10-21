/**
 * Stripe Billing Adapter (Configurable via Environment Variables)
 * 
 * Supports Stripe Checkout, customer management, and webhook verification
 * alongside Paddle. All keys and secrets are loaded strictly from environment variables.
 */

import crypto from 'crypto';
import type { PlanTier, BillingInterval } from './plans.js';

export interface StripeCheckoutParams {
  provider: 'stripe';
  publishableKey: string;
  priceId: string;
  plan: PlanTier;
  interval: BillingInterval;
  customerEmail?: string;
  customerId?: string;
  clientReferenceId?: string;
  successUrl: string;
  cancelUrl: string;
}

export function isStripeConfigured(): boolean {
  const key = process.env.STRIPE_SECRET_KEY?.trim();
  return Boolean(key && (key.startsWith('sk_test_') || key.startsWith('sk_live_')));
}

export function isStripeWebhookConfigured(): boolean {
  const secret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  return Boolean(secret && secret.startsWith('whsec_'));
}

export function getStripePublishableKey(): string {
  return process.env.STRIPE_PUBLISHABLE_KEY?.trim() || '';
}

export function getStripePriceId(plan: PlanTier, interval: BillingInterval): string | null {
  if (plan === 'FREE') return null;

  if (plan === 'STARTER') {
    return interval === 'annual'
      ? process.env.STRIPE_STARTER_YEARLY_PRICE_ID?.trim() || null
      : process.env.STRIPE_STARTER_MONTHLY_PRICE_ID?.trim() || null;
  }

  if (plan === 'GROWTH') {
    return interval === 'annual'
      ? process.env.STRIPE_GROWTH_YEARLY_PRICE_ID?.trim() || null
      : process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID?.trim() || null;
  }

  return null;
}

export function getStripeCheckoutParams(options: {
  plan: PlanTier;
  interval: BillingInterval;
  customerEmail?: string;
  customerId?: string;
  userId: string;
  baseUrl: string;
}): StripeCheckoutParams {
  const priceId = getStripePriceId(options.plan, options.interval) || `price_mock_${options.plan.toLowerCase()}_${options.interval}`;
  
  return {
    provider: 'stripe',
    publishableKey: getStripePublishableKey(),
    priceId,
    plan: options.plan,
    interval: options.interval,
    customerEmail: options.customerEmail,
    customerId: options.customerId,
    clientReferenceId: options.userId,
    successUrl: `${options.baseUrl}/?billing_success=true&provider=stripe`,
    cancelUrl: `${options.baseUrl}/?billing_cancelled=true&provider=stripe`,
  };
}

/**
 * Verifies Stripe webhook signatures using HMAC-SHA256
 */
export function verifyStripeWebhookSignature(
  rawBody: Buffer | string,
  sigHeader: string,
  webhookSecret?: string
): boolean {
  const secret = webhookSecret || process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || !sigHeader) return false;

  try {
    const parts = sigHeader.split(',').reduce((acc: Record<string, string>, item) => {
      const [k, v] = item.trim().split('=');
      if (k && v) acc[k] = v;
      return acc;
    }, {});

    const timestamp = parts['t'];
    const signature = parts['v1'];
    if (!timestamp || !signature) return false;

    // Check tolerance (5 minutes)
    const timestampSec = parseInt(timestamp, 10);
    const nowSec = Math.floor(Date.now() / 1000);
    if (Math.abs(nowSec - timestampSec) > 300) {
      return false;
    }

    const payload = `${timestamp}.${typeof rawBody === 'string' ? rawBody : rawBody.toString('utf8')}`;
    const expectedSig = crypto
      .createHmac('sha256', secret)
      .update(payload, 'utf8')
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSig, 'hex'));
  } catch {
    return false;
  }
}
