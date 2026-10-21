/**
 * Stripe Billing Adapter for Receipto
 * 
 * Exclusively provides Stripe Checkout, Customer Portal, Webhook Signature Verification,
 * and Subscription Management. All secrets are read strictly from environment variables.
 */

import crypto from 'crypto';
import type { PlanTier, BillingInterval } from './plans.js';

export interface StripeCheckoutResult {
  url: string | null;
  sessionId: string;
  publishableKey: string;
  priceId: string;
  plan: PlanTier;
  interval: BillingInterval;
  mode: 'live' | 'test_mock';
  message?: string;
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

export function getStripeSecretKey(): string {
  return process.env.STRIPE_SECRET_KEY?.trim() || '';
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

/**
 * Creates a Stripe Checkout Session via Stripe REST API.
 * If STRIPE_SECRET_KEY is configured, calls Stripe API; otherwise returns test sandbox session.
 */
export async function createStripeCheckoutSession(options: {
  userId: string;
  customerEmail: string;
  plan: PlanTier;
  interval: BillingInterval;
  customerId?: string | null;
  baseUrl: string;
}): Promise<StripeCheckoutResult> {
  const priceId = getStripePriceId(options.plan, options.interval);
  const successUrl = `${options.baseUrl}/?billing_success=true&plan=${options.plan}&interval=${options.interval}&session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${options.baseUrl}/?billing_cancelled=true`;
  const publishableKey = getStripePublishableKey();

  if (isStripeConfigured() && priceId) {
    const params = new URLSearchParams();
    params.append('mode', 'subscription');
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][price]', priceId);
    params.append('line_items[0][quantity]', '1');
    params.append('client_reference_id', options.userId);
    params.append('success_url', successUrl);
    params.append('cancel_url', cancelUrl);
    params.append('metadata[user_id]', options.userId);
    params.append('metadata[plan]', options.plan);
    params.append('metadata[interval]', options.interval);

    if (options.customerId) {
      params.append('customer', options.customerId);
    } else if (options.customerEmail) {
      params.append('customer_email', options.customerEmail);
    }

    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getStripeSecretKey()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error?.message || 'Stripe API checkout session creation failed.');
    }

    return {
      url: data.url,
      sessionId: data.id,
      publishableKey,
      priceId,
      plan: options.plan,
      interval: options.interval,
      mode: 'live',
    };
  }

  // Graceful test fallback when API keys are not yet configured in environment
  const mockSessionId = `cs_test_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  const mockUrl = `${options.baseUrl}/?billing_success=true&plan=${options.plan}&interval=${options.interval}&session_id=${mockSessionId}&test_mode=true`;

  return {
    url: mockUrl,
    sessionId: mockSessionId,
    publishableKey: publishableKey || 'pk_test_placeholder',
    priceId: priceId || `price_${options.plan.toLowerCase()}_${options.interval}`,
    plan: options.plan,
    interval: options.interval,
    mode: 'test_mock',
    message: isStripeConfigured()
      ? `Stripe price ID for ${options.plan} (${options.interval}) is not set in environment.`
      : 'Stripe API keys are not configured in environment. Using test mode simulation.',
  };
}

/**
 * Creates a Stripe Customer Portal session for managing or cancelling subscriptions
 */
export async function createStripePortalSession(customerId: string, returnUrl: string): Promise<string | null> {
  if (!isStripeConfigured() || !customerId) return null;

  try {
    const params = new URLSearchParams();
    params.append('customer', customerId);
    params.append('return_url', returnUrl);

    const res = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getStripeSecretKey()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await res.json();
    if (!res.ok) {
      console.warn('[Stripe Portal API Notice]:', data.error?.message);
      return null;
    }
    return data.url || null;
  } catch (err: any) {
    console.error('[Stripe Portal Error]', err.message);
    return null;
  }
}

/**
 * Cancels a Stripe subscription at period end
 */
export async function cancelStripeSubscription(subscriptionId: string): Promise<boolean> {
  if (!isStripeConfigured() || !subscriptionId) return false;

  try {
    const params = new URLSearchParams();
    params.append('cancel_at_period_end', 'true');

    const res = await fetch(`https://api.stripe.com/v1/subscriptions/${subscriptionId}`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${getStripeSecretKey()}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    return res.ok;
  } catch (err: any) {
    console.error('[Stripe Cancel Error]', err.message);
    return false;
  }
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
