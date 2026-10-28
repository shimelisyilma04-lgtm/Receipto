import { auth } from '../firebase.js';
import {
  getFirestoreSubscription,
  setFirestoreSubscription,
} from '../services/firestoreService.js';
import type { SubscriptionDetails } from '../types.js';
import { PLAN_CONFIGS } from '../plans.js';
import { ApiError, request } from './client.js';

export const billingApi = {
  getSubscription: async (): Promise<SubscriptionDetails> => {
    const user = auth.currentUser;
    if (!user) {
      return {
        subscription: {
          id: 'sub_guest',
          user_id: 'guest',
          plan: 'FREE',
          status: 'active',
          billing_interval: 'monthly',
          provider: 'manual',
          provider_customer_id: null,
          provider_subscription_id: null,
          current_period_start: new Date().toISOString(),
          current_period_end: null,
          cancel_at_period_end: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        usage: {
          plan: 'FREE',
          client_count: 0,
          max_clients: 5,
          clients_remaining: 5,
          client_limit_reached: false,
          invoices_this_period: 0,
          invoice_count: 0,
          max_invoices_per_month: 10,
          invoices_remaining: 10,
          invoice_limit_reached: false,
          period_start: new Date().toISOString(),
          period_end: null,
          automated_reminders_count: 0,
          automated_reminders_enabled: false,
          csv_export_enabled: false,
          full_activity_history: false,
        },
        plan_config: PLAN_CONFIGS.FREE,
        is_active: true,
        is_owner_demo: false,
        access_mode: 'free' as const,
        billing_provider: 'manual' as const,
        stripe_configured: true,
      };
    }

    try {
      return await getFirestoreSubscription(user.uid);
    } catch {
      const isOwner =
        user.email?.trim().toLowerCase() === 'receiptobusiness@gmail.com' ||
        user.email?.trim().toLowerCase() === 'rshimelis48@gmail.com';
      return {
        subscription: {
          id: `sub_${user.uid}`,
          user_id: user.uid,
          plan: 'FREE' as const,
          status: 'active' as const,
          billing_interval: 'monthly' as const,
          provider: 'manual' as const,
          provider_customer_id: null,
          provider_subscription_id: null,
          current_period_start: new Date().toISOString(),
          current_period_end: null,
          cancel_at_period_end: false,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
        usage: {
          plan: 'FREE' as const,
          client_count: 0,
          max_clients: 5,
          clients_remaining: 5,
          client_limit_reached: false,
          invoice_count: 0,
          invoices_this_period: 0,
          max_invoices_per_month: 10,
          invoices_remaining: 10,
          invoice_limit_reached: false,
          period_start: new Date().toISOString(),
          period_end: null,
          automated_reminders_count: 0,
          automated_reminders_enabled: false,
          csv_export_enabled: false,
          full_activity_history: false,
        },
        plan_config: PLAN_CONFIGS.FREE,
        is_active: true,
        is_owner_demo: isOwner,
        owner_demo_available_plans: ['FREE', 'STARTER', 'GROWTH'],
        access_mode: isOwner ? 'owner_demo' : ('free' as const),
        billing_provider: 'manual' as const,
        stripe_configured: true,
      };
    }
  },

  createCheckoutSession: (plan: 'STARTER' | 'GROWTH', interval: 'monthly' | 'annual') =>
    request<{
      success: boolean;
      provider: 'stripe';
      stripe_configured: boolean;
      url?: string | null;
      session_id?: string;
      publishable_key?: string;
      price_id?: string;
      plan: 'STARTER' | 'GROWTH';
      interval: 'monthly' | 'annual';
      customer_email?: string;
      checkout_params?: any;
      message?: string;
    }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, interval }),
    }),

  createCustomerPortalSession: () =>
    request<{
      url?: string | null;
      message?: string;
    }>('/api/billing/portal', {
      method: 'POST',
    }),

  cancelSubscription: async () => {
    const user = auth.currentUser;
    if (user) {
      await setFirestoreSubscription(user.uid, {
        plan: 'FREE',
        status: 'canceled',
      });
    }
    return {
      message: 'Subscription cancelled successfully.',
      subscription: { plan: 'FREE', status: 'canceled' },
    };
  },

  confirmSession: async (
    data:
      | string
      | {
          session_id?: string;
          transaction_id?: string;
          subscription_id?: string;
          customer_id?: string;
          plan?: string;
          interval?: string;
        }
  ) => {
    const user = auth.currentUser;
    const plan = typeof data === 'object' && data.plan ? (data.plan as any) : 'STARTER';
    const interval = typeof data === 'object' && data.interval ? (data.interval as any) : 'monthly';

    if (user) {
      await setFirestoreSubscription(user.uid, {
        plan,
        billing_interval: interval,
        status: 'active',
        provider: 'stripe',
        stripe_subscription_id: typeof data === 'object' ? data.subscription_id : undefined,
      });
      return await getFirestoreSubscription(user.uid);
    }
    throw new ApiError('Unauthorized', 401);
  },

  simulatePlan: async (plan: 'FREE' | 'STARTER' | 'GROWTH', interval?: 'monthly' | 'annual') => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    await setFirestoreSubscription(user.uid, {
      plan,
      billing_interval: interval || 'monthly',
      status: 'active',
      provider: 'manual',
    });
    return await getFirestoreSubscription(user.uid);
  },

  switchOwnerDemoPlan: async (plan: 'FREE' | 'STARTER' | 'GROWTH') => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    await setFirestoreSubscription(user.uid, {
      plan,
      status: 'active',
      provider: 'manual',
    });
    try {
      await request('/api/billing/owner-demo/switch-plan', {
        method: 'POST',
        body: JSON.stringify({ plan }),
      });
    } catch {
      // Backend sync optional in pure client Firestore mode
    }
    return await getFirestoreSubscription(user.uid);
  },
};
