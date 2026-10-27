import express from 'express';
import type { Request, Response } from 'express';
import {
  getSubscription,
  upsertSubscription,
  getSubscriptionDetails,
  createActivityLog,
  getUserById,
  updateOwnerDemoPlan,
  isWebhookEventProcessed,
  recordProcessedWebhookEvent,
  getSubscriptionByCustomerId,
  getSubscriptionByProviderSubId,
} from '../db.js';
import {
  requireAuth,
  requireVerified,
  type AuthenticatedRequest,
} from '../auth.js';
import {
  isStripeConfigured,
  isStripeWebhookConfigured,
  getStripePublishableKey,
  createStripeCheckoutSession,
  createStripePortalSession,
  cancelStripeSubscription,
  verifyStripeWebhookSignature,
} from '../stripe.js';
import {
  PLAN_CONFIGS,
  type PlanTier,
  type BillingInterval,
  isOwnerAccount,
} from '../plans.js';
import {
  sendSubscriptionConfirmationEmail,
  sendPaymentFailureEmail,
  sendSubscriptionCancelledEmail,
} from '../email.js';
import { logger } from '../lib/logger.js';
import { validateBody } from '../schemas/validate.js';
import { checkoutSessionSchema } from '../schemas/billing.schema.js';

export const billingRouter = express.Router();

// GET /api/billing/subscription
billingRouter.get('/billing/subscription', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const details = await getSubscriptionDetails(userId);
    const isOwner = isOwnerAccount(req.user);
    res.status(200).json({
      ...details,
      is_owner_demo: isOwner,
      access_mode: isOwner ? 'owner_demo' : 'standard',
      owner_demo_available_plans: isOwner ? ['FREE', 'STARTER', 'GROWTH'] : undefined,
      payment_provider: 'stripe',
      stripe_configured: isStripeConfigured(),
      stripe_publishable_key: getStripePublishableKey(),
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Failed to fetch subscription details');
    res.status(500).json({ error: 'Failed to fetch subscription details.' });
  }
});

// POST /api/billing/checkout
billingRouter.post('/billing/checkout', requireAuth, validateBody(checkoutSessionSchema), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const userEmail = req.user!.email;
    const { plan, interval } = req.body as { plan: 'STARTER' | 'GROWTH'; interval: BillingInterval };

    const billingInterval: BillingInterval = interval === 'annual' ? 'annual' : 'monthly';
    const sub = await getSubscription(userId);
    const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;

    const session = await createStripeCheckoutSession({
      userId,
      customerEmail: userEmail,
      plan,
      interval: billingInterval,
      customerId: sub.stripe_customer_id || sub.provider_customer_id,
      baseUrl,
    });

    await createActivityLog(
      userId,
      'CHECKOUT_INITIATED',
      `Initiated Stripe checkout for ${plan} (${billingInterval})`
    );

    res.status(200).json({
      success: true,
      provider: 'stripe',
      stripe_configured: isStripeConfigured(),
      url: session.url,
      session_id: session.sessionId,
      publishable_key: session.publishableKey,
      price_id: session.priceId,
      plan: session.plan,
      interval: session.interval,
      customer_email: userEmail,
      checkout_params: session,
      message: session.message,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Stripe checkout error');
    res.status(500).json({ error: err.message || 'Failed to initiate Stripe checkout.' });
  }
});

// POST /api/billing/portal
billingRouter.post('/billing/portal', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const sub = await getSubscription(userId);
    const customerId = sub.stripe_customer_id || sub.provider_customer_id;
    const baseUrl = process.env.APP_BASE_URL || `${req.protocol}://${req.get('host')}`;

    if (customerId && isStripeConfigured()) {
      const portalUrl = await createStripePortalSession(customerId, `${baseUrl}/?tab=billing`);
      if (portalUrl) {
        return res.status(200).json({
          url: portalUrl,
          message: 'Stripe Customer Portal session created.',
        });
      }
    }

    res.status(200).json({
      url: null,
      message: isStripeConfigured()
        ? 'No active Stripe customer found. Please subscribe to a paid plan first.'
        : 'Stripe Customer Portal is available when Stripe API keys are configured.',
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Stripe portal error');
    res.status(500).json({ error: err.message || 'Failed to fetch billing management details.' });
  }
});

// POST /api/billing/cancel
billingRouter.post('/billing/cancel', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const sub = await getSubscription(userId);

    if (sub.plan === 'FREE') {
      return res.status(400).json({ error: 'You are currently on the Free plan.' });
    }

    const subId = sub.stripe_subscription_id || sub.provider_subscription_id;
    if (subId && isStripeConfigured()) {
      await cancelStripeSubscription(subId);
    }

    const updated = await upsertSubscription({
      user_id: userId,
      cancel_at_period_end: true,
      status: 'cancelled',
      provider: 'stripe',
    });

    await createActivityLog(
      userId,
      'SUBSCRIPTION_CANCELLED',
      `Scheduled subscription cancellation for ${sub.plan} at period end`
    );

    res.status(200).json({
      message: 'Subscription set to cancel at end of current billing period. All features remain active until period end.',
      subscription: updated,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Cancel subscription error');
    res.status(500).json({ error: 'Failed to cancel subscription.' });
  }
});

export const handleConfirmBilling = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const { transaction_id, subscription_id, customer_id, plan, interval, session_id } = req.body;

    const subId = subscription_id || session_id || null;
    const custId = customer_id || null;

    let targetPlan: PlanTier = plan && (plan === 'GROWTH' || plan === 'STARTER') ? plan : 'STARTER';
    let targetInterval: BillingInterval = interval === 'annual' ? 'annual' : 'monthly';

    const now = new Date();
    const periodEnd = new Date(
      targetInterval === 'annual'
        ? now.getTime() + 365 * 24 * 60 * 60 * 1000
        : now.getTime() + 30 * 24 * 60 * 60 * 1000
    ).toISOString();

    await upsertSubscription({
      user_id: userId,
      plan: targetPlan,
      status: 'active',
      billing_interval: targetInterval,
      provider: 'stripe',
      provider_customer_id: custId,
      provider_subscription_id: subId,
      stripe_customer_id: custId,
      stripe_subscription_id: subId,
      current_period_start: now.toISOString(),
      current_period_end: periodEnd,
      cancel_at_period_end: false,
    });

    await createActivityLog(
      userId,
      'SUBSCRIPTION_ACTIVATED',
      `Confirmed active subscription to ${targetPlan} (${targetInterval}) via Stripe`,
      { customerId: custId, subscriptionId: subId, transactionId: transaction_id }
    );

    const targetUser = await getUserById(userId);
    if (targetUser) {
      const planCfg = PLAN_CONFIGS[targetPlan];
      const amountStr = targetInterval === 'annual' ? `$${planCfg.priceAnnual}/yr` : `$${planCfg.priceMonthly}/mo`;
      sendSubscriptionConfirmationEmail({
        to: targetUser.email,
        name: targetUser.name,
        planName: planCfg.name,
        billingInterval: targetInterval === 'annual' ? 'Annual' : 'Monthly',
        amountFormatted: amountStr,
      }).catch((e) => logger.error({ err: e.message }, 'Stripe confirm email error'));
    }

    const details = await getSubscriptionDetails(userId);
    res.status(200).json({
      success: true,
      message: `Your ${targetPlan} plan is now active.`,
      ...details,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Confirm billing error');
    res.status(500).json({ error: err.message || 'Failed to confirm Stripe transaction.' });
  }
};

billingRouter.post('/billing/confirm-transaction', requireAuth, handleConfirmBilling);
billingRouter.post('/billing/confirm-session', requireAuth, handleConfirmBilling);

// POST /api/billing/owner-demo/switch-plan
billingRouter.post('/billing/owner-demo/switch-plan', requireAuth, requireVerified, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const user = req.user!;
    if (!isOwnerAccount(user)) {
      return res.status(403).json({
        error: 'FORBIDDEN',
        message: 'Only the verified owner account can use demo plan controls.',
      });
    }

    const { plan } = req.body as { plan: PlanTier };
    if (!plan || !['FREE', 'STARTER', 'GROWTH'].includes(plan)) {
      return res.status(400).json({ error: 'Valid demo plan (FREE, STARTER, or GROWTH) is required.' });
    }

    await updateOwnerDemoPlan(user.id, plan);

    await createActivityLog(
      user.id,
      'OWNER_DEMO_PLAN_SWITCHED',
      `Switched owner demo access to ${plan} plan`
    );

    const details = await getSubscriptionDetails(user.id);
    res.status(200).json({
      success: true,
      message: `Owner demo access switched to ${plan}.`,
      ...details,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Owner demo switch plan error');
    res.status(500).json({ error: err.message || 'Failed to switch owner demo plan.' });
  }
});

// POST /api/billing/simulate
billingRouter.post('/billing/simulate', requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user!.id;
    const user = req.user!;
    const { plan, interval, status } = req.body as {
      plan: PlanTier;
      interval?: BillingInterval;
      status?: import('../plans.js').SubscriptionStatus;
    };

    if (!plan || !['FREE', 'STARTER', 'GROWTH'].includes(plan)) {
      return res.status(400).json({ error: 'Invalid plan. Choose FREE, STARTER, or GROWTH.' });
    }

    if (isOwnerAccount(user)) {
      await updateOwnerDemoPlan(userId, plan);
    } else {
      const now = new Date();
      const periodEnd = plan === 'FREE' ? null : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

      await upsertSubscription({
        user_id: userId,
        plan,
        status: status || 'active',
        billing_interval: interval || 'monthly',
        provider: 'stripe',
        current_period_start: now.toISOString(),
        current_period_end: periodEnd,
        cancel_at_period_end: false,
      });
    }

    await createActivityLog(
      userId,
      'PLAN_SIMULATED',
      `Switched plan to ${plan} (${interval || 'monthly'}) via developer sandbox`
    );

    const details = await getSubscriptionDetails(userId);
    res.status(200).json({
      message: `Plan successfully updated to ${plan}.`,
      ...details,
    });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Simulate plan error');
    res.status(500).json({ error: 'Failed to simulate plan change.' });
  }
});

// POST /api/webhooks/stripe
billingRouter.post('/webhooks/stripe', async (req: Request, res: Response) => {
  try {
    const rawBody = (req as any).rawBody || JSON.stringify(req.body);
    const sigHeader = (req.headers['stripe-signature'] as string) || '';

    if (isStripeWebhookConfigured()) {
      const isValid = verifyStripeWebhookSignature(rawBody, sigHeader);
      if (!isValid) {
        return res.status(400).json({ error: 'Invalid Stripe webhook signature' });
      }
    }

    const event = typeof req.body === 'object' ? req.body : JSON.parse(rawBody.toString('utf8'));
    const eventId = event?.id;

    if (eventId) {
      const isProcessed = await isWebhookEventProcessed(eventId);
      if (isProcessed) {
        return res.status(200).json({ received: true, duplicate: true });
      }
      await recordProcessedWebhookEvent(eventId, event.type || 'stripe.event');
    }

    const eventType = event?.type;
    const dataObj = event?.data?.object;

    switch (eventType) {
      case 'checkout.session.completed': {
        const userId = dataObj?.client_reference_id || dataObj?.metadata?.user_id;
        const customerId = dataObj?.customer;
        const subscriptionId = dataObj?.subscription;
        const plan: PlanTier = (dataObj?.metadata?.plan as PlanTier) || 'STARTER';
        const interval: BillingInterval = (dataObj?.metadata?.interval as BillingInterval) || 'monthly';

        if (userId) {
          const now = new Date();
          const periodEnd = new Date(
            interval === 'annual'
              ? now.getTime() + 365 * 24 * 60 * 60 * 1000
              : now.getTime() + 30 * 24 * 60 * 60 * 1000
          ).toISOString();

          await upsertSubscription({
            user_id: userId,
            plan,
            status: 'active',
            billing_interval: interval,
            provider: 'stripe',
            provider_customer_id: customerId || null,
            provider_subscription_id: subscriptionId || null,
            stripe_customer_id: customerId || null,
            stripe_subscription_id: subscriptionId || null,
            current_period_start: now.toISOString(),
            current_period_end: periodEnd,
            cancel_at_period_end: false,
          });

          await createActivityLog(
            userId,
            'SUBSCRIPTION_ACTIVATED',
            `Subscribed to ${plan} (${interval}) via Stripe Checkout`,
            { customerId, subscriptionId }
          );

          const targetUser = await getUserById(userId);
          if (targetUser) {
            const planCfg = PLAN_CONFIGS[plan];
            const amountStr = interval === 'annual' ? `$${planCfg.priceAnnual}/yr` : `$${planCfg.priceMonthly}/mo`;
            sendSubscriptionConfirmationEmail({
              to: targetUser.email,
              name: targetUser.name,
              planName: planCfg.name,
              billingInterval: interval === 'annual' ? 'Annual' : 'Monthly',
              amountFormatted: amountStr,
            }).catch((e) => logger.error({ err: e.message }, 'Stripe confirmation email error'));
          }
        }
        break;
      }

      case 'customer.subscription.updated': {
        const customerId = dataObj?.customer;
        const subscriptionId = dataObj?.id;
        let targetSub = subscriptionId ? await getSubscriptionByProviderSubId(subscriptionId) : null;
        if (!targetSub && customerId) {
          targetSub = await getSubscriptionByCustomerId(customerId);
        }

        if (targetSub) {
          const status = dataObj?.status === 'active' ? 'active' : dataObj?.status === 'past_due' ? 'past_due' : 'cancelled';
          const cancelAtPeriodEnd = Boolean(dataObj?.cancel_at_period_end);

          await upsertSubscription({
            user_id: targetSub.user_id,
            status,
            cancel_at_period_end: cancelAtPeriodEnd,
            provider: 'stripe',
            provider_subscription_id: subscriptionId,
            stripe_subscription_id: subscriptionId,
          });

          await createActivityLog(
            targetSub.user_id,
            'SUBSCRIPTION_UPDATED',
            `Stripe subscription updated: ${targetSub.plan} (${status})`,
            { subscriptionId, status, cancelAtPeriodEnd }
          );
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const customerId = dataObj?.customer;
        const subscriptionId = dataObj?.id;
        let targetSub = subscriptionId ? await getSubscriptionByProviderSubId(subscriptionId) : null;
        if (!targetSub && customerId) {
          targetSub = await getSubscriptionByCustomerId(customerId);
        }

        if (targetSub) {
          await upsertSubscription({
            user_id: targetSub.user_id,
            plan: 'FREE',
            status: 'expired',
            cancel_at_period_end: false,
            provider: 'stripe',
          });

          await createActivityLog(
            targetSub.user_id,
            'SUBSCRIPTION_EXPIRED',
            'Subscription ended. Reverted cleanly to Free tier without removing user data.'
          );

          const targetUser = await getUserById(targetSub.user_id);
          if (targetUser) {
            sendSubscriptionCancelledEmail({
              to: targetUser.email,
              name: targetUser.name,
              planName: targetSub.plan,
            }).catch((e) => logger.error({ err: e.message }, 'Stripe cancel email error'));
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const customerId = dataObj?.customer;
        let targetSub = customerId ? await getSubscriptionByCustomerId(customerId) : null;

        if (targetSub) {
          await upsertSubscription({
            user_id: targetSub.user_id,
            status: 'past_due',
            provider: 'stripe',
          });

          await createActivityLog(
            targetSub.user_id,
            'PAYMENT_FAILED',
            'Stripe recurring payment failed. Subscription marked past_due.',
            { customerId }
          );

          const targetUser = await getUserById(targetSub.user_id);
          if (targetUser) {
            sendPaymentFailureEmail({
              to: targetUser.email,
              name: targetUser.name,
              planName: targetSub.plan,
            }).catch((e) => logger.error({ err: e.message }, 'Stripe payment failure email error'));
          }
        }
        break;
      }
    }

    res.status(200).json({ received: true });
  } catch (err: any) {
    logger.error({ err: err.message }, 'Stripe webhook processing error');
    res.status(500).json({ error: 'Internal webhook error' });
  }
});
