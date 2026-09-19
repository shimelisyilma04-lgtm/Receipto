import Stripe from 'stripe';
import { PlanTier, BillingInterval, PLAN_CONFIGS } from './plans.js';

let stripeClient: Stripe | null = null;

/**
 * Validates whether a given key has the syntax of a genuine Stripe secret or restricted key.
 * Stripe secret/restricted keys begin with sk_test_, sk_live_, rk_test_, or rk_live_ and are at least 20 chars long.
 */
export function isValidStripeKey(key?: string | null): boolean {
  if (!key) return false;
  const trimmed = key.trim();
  // Valid Stripe secret or restricted keys
  return /^(sk|rk)_(test|live)_[a-zA-Z0-9_\-]{14,}$/.test(trimmed);
}

export function isStripeConfigured(): boolean {
  return isValidStripeKey(process.env.STRIPE_SECRET_KEY);
}

export function getStripe(): Stripe | null {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey || !isValidStripeKey(secretKey)) {
    return null;
  }
  if (!stripeClient) {
    stripeClient = new Stripe(secretKey, {
      apiVersion: '2025-02-24.acacia' as any,
    });
  }
  return stripeClient;
}

/**
 * Resolves the Stripe Price ID for a given plan and interval.
 * Returns configured env variable if set, otherwise returns null to trigger dynamic checkout price_data.
 */
export function getStripePriceId(plan: PlanTier, interval: BillingInterval): string | null {
  if (plan === 'STARTER') {
    return interval === 'annual'
      ? process.env.STRIPE_STARTER_YEARLY_PRICE_ID?.trim() ||
        process.env.STRIPE_PRICE_STARTER_ANNUAL?.trim() ||
        null
      : process.env.STRIPE_STARTER_MONTHLY_PRICE_ID?.trim() ||
        process.env.STRIPE_PRICE_STARTER_MONTHLY?.trim() ||
        null;
  }
  if (plan === 'GROWTH') {
    return interval === 'annual'
      ? process.env.STRIPE_GROWTH_YEARLY_PRICE_ID?.trim() ||
        process.env.STRIPE_PRICE_GROWTH_ANNUAL?.trim() ||
        null
      : process.env.STRIPE_GROWTH_MONTHLY_PRICE_ID?.trim() ||
        process.env.STRIPE_PRICE_GROWTH_MONTHLY?.trim() ||
        null;
  }
  return null;
}

export interface CreateCheckoutParams {
  userId: string;
  userEmail: string;
  plan: 'STARTER' | 'GROWTH';
  interval: BillingInterval;
  successUrl: string;
  cancelUrl: string;
  existingCustomerId?: string | null;
}

export async function createStripeCheckoutSession(params: CreateCheckoutParams): Promise<{ url: string; sessionId: string }> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY in settings or environment.');
  }

  const planConfig = PLAN_CONFIGS[params.plan];
  if (!planConfig) {
    throw new Error(`Invalid plan tier: ${params.plan}`);
  }

  const priceId = getStripePriceId(params.plan, params.interval);
  let lineItems: Stripe.Checkout.SessionCreateParams.LineItem[];

  if (priceId) {
    lineItems = [
      {
        price: priceId,
        quantity: 1,
      },
    ];
  } else {
    // Dynamic price data so Checkout works out of the box with just STRIPE_SECRET_KEY
    const unitAmount = params.interval === 'annual'
      ? planConfig.priceAnnual * 100 // in cents ($90 -> 9000 cents)
      : planConfig.priceMonthly * 100; // in cents ($9 -> 900 cents)

    lineItems = [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Receipto ${planConfig.name} Plan`,
            description: `${planConfig.tagline} (${params.interval === 'annual' ? 'Billed annually' : 'Billed monthly'})`,
          },
          unit_amount: unitAmount,
          recurring: {
            interval: params.interval === 'annual' ? 'year' : 'month',
          },
        },
        quantity: 1,
      },
    ];
  }

  const sessionParams: Stripe.Checkout.SessionCreateParams = {
    mode: 'subscription',
    payment_method_types: ['card'],
    line_items: lineItems,
    customer: params.existingCustomerId || undefined,
    customer_email: params.existingCustomerId ? undefined : params.userEmail,
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
    metadata: {
      user_id: params.userId,
      plan: params.plan,
      billing_interval: params.interval,
    },
    subscription_data: {
      metadata: {
        user_id: params.userId,
        plan: params.plan,
        billing_interval: params.interval,
      },
    },
  };

  const session = await stripe.checkout.sessions.create(sessionParams);

  if (!session.url) {
    throw new Error('Stripe failed to return a checkout URL.');
  }

  return {
    url: session.url,
    sessionId: session.id,
  };
}

export async function createStripePortalSession(
  customerId: string,
  returnUrl: string
): Promise<{ url: string }> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe is not configured. Please set STRIPE_SECRET_KEY.');
  }

  const portalSession = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });

  return { url: portalSession.url };
}

export async function retrieveStripeCheckoutSession(sessionId: string): Promise<Stripe.Checkout.Session | null> {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe is not configured.');
  }
  return await stripe.checkout.sessions.retrieve(sessionId, {
    expand: ['subscription', 'customer'],
  });
}

export function constructStripeWebhookEvent(rawBody: Buffer | string, signature: string): Stripe.Event {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe client is not initialized.');
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!webhookSecret) {
    // If webhook secret is not set, we can parse event body directly with warning in dev mode
    console.warn('[Stripe Webhook] STRIPE_WEBHOOK_SECRET not set. Parsing event body directly without HMAC verification.');
    return typeof rawBody === 'string' ? JSON.parse(rawBody) : JSON.parse(rawBody.toString('utf-8'));
  }

  return stripe.webhooks.constructEvent(rawBody, signature, webhookSecret);
}
