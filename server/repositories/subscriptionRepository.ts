import type {
  Subscription,
  SubscriptionUsage,
  SubscriptionDetails,
  PlanTier,
} from '../types.js';
import { getAdminFirestore } from '../lib/firebaseAdmin.js';
import { getEffectivePlan, getPlanLimitReachedMessage } from '../plans.js';
import { logger } from '../lib/logger.js';

export interface LimitCheckResult {
  allowed: boolean;
  reason?: string;
  currentCount?: number;
  current?: number;
  maxLimit?: number | null;
  max?: number | null;
  tier?: PlanTier;
  plan?: PlanTier;
}

export async function getSubscription(userId: string): Promise<Subscription> {
  if (!userId || typeof userId !== 'string') {
    throw new Error('userId is required to fetch subscription');
  }
  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(userId).collection('subscription').doc('current');
  const snap = await docRef.get();
  if (snap.exists) {
    return snap.data() as Subscription;
  }

  const now = new Date().toISOString();
  const defaultSub: Subscription = {
    id: `sub_${userId}`,
    user_id: userId,
    plan: 'FREE',
    status: 'active',
    billing_interval: 'monthly',
    provider: 'manual',
    provider_customer_id: null,
    provider_subscription_id: null,
    stripe_customer_id: null,
    stripe_subscription_id: null,
    current_period_start: now,
    current_period_end: null,
    cancel_at_period_end: false,
    created_at: now,
    updated_at: now,
  };

  await docRef.set(defaultSub);
  return defaultSub;
}

export async function upsertSubscription(
  userIdOrData: string | (Partial<Subscription> & { user_id: string; plan?: PlanTier }),
  dataArg?: Partial<Subscription> & { plan?: PlanTier }
): Promise<Subscription> {
  const db = getAdminFirestore();
  const userId = typeof userIdOrData === 'string' ? userIdOrData : userIdOrData.user_id;
  const data = typeof userIdOrData === 'string' ? (dataArg || {}) : userIdOrData;

  const docRef = db.collection('users').doc(userId).collection('subscription').doc('current');
  const snap = await docRef.get();
  const now = new Date().toISOString();

  if (snap.exists) {
    const existing = snap.data() as Subscription;
    const updated: Subscription = {
      ...existing,
      plan: data.plan || existing.plan,
      status: data.status || existing.status,
      billing_interval: data.billing_interval || existing.billing_interval,
      provider: data.provider || existing.provider,
      provider_customer_id: data.provider_customer_id !== undefined ? data.provider_customer_id : existing.provider_customer_id,
      provider_subscription_id: data.provider_subscription_id !== undefined ? data.provider_subscription_id : existing.provider_subscription_id,
      stripe_customer_id: data.stripe_customer_id !== undefined ? data.stripe_customer_id : existing.stripe_customer_id,
      stripe_subscription_id: data.stripe_subscription_id !== undefined ? data.stripe_subscription_id : existing.stripe_subscription_id,
      current_period_start: data.current_period_start || existing.current_period_start,
      current_period_end: data.current_period_end !== undefined ? data.current_period_end : existing.current_period_end,
      cancel_at_period_end: data.cancel_at_period_end !== undefined ? data.cancel_at_period_end : existing.cancel_at_period_end,
      updated_at: now,
    };
    await docRef.set(updated, { merge: true });
    logger.info({ userId, plan: updated.plan, status: updated.status }, 'Subscription updated in Firestore');
    return updated;
  }

  const newSub: Subscription = {
    id: `sub_${userId}`,
    user_id: userId,
    plan: data.plan || 'FREE',
    status: data.status || 'active',
    billing_interval: data.billing_interval || 'monthly',
    provider: data.provider || 'stripe',
    provider_customer_id: data.provider_customer_id || null,
    provider_subscription_id: data.provider_subscription_id || null,
    stripe_customer_id: data.stripe_customer_id || null,
    stripe_subscription_id: data.stripe_subscription_id || null,
    current_period_start: data.current_period_start || now,
    current_period_end: data.current_period_end || null,
    cancel_at_period_end: data.cancel_at_period_end || false,
    created_at: now,
    updated_at: now,
  };

  await docRef.set(newSub);
  logger.info({ userId, plan: newSub.plan, status: newSub.status }, 'New subscription created in Firestore');
  return newSub;
}

export async function getUserUsage(userId: string): Promise<SubscriptionUsage> {
  const db = getAdminFirestore();
  const sub = await getSubscription(userId);
  const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);

  const [clientsSnap, invoicesSnap] = await Promise.all([
    db.collection('users').doc(userId).collection('clients').get(),
    db.collection('users').doc(userId).collection('invoices').get(),
  ]);

  const maxClients = planConfig.limits.maxClients;
  const maxInvoices = planConfig.limits.maxInvoicesPerMonth;

  const currentMonthPrefix = new Date().toISOString().substring(0, 7);
  let invoicesThisPeriod = 0;
  invoicesSnap.forEach((d: any) => {
    const inv = d.data();
    if (inv.created_at && inv.created_at.startsWith(currentMonthPrefix)) {
      invoicesThisPeriod++;
    }
  });

  const clientCount = clientsSnap.size;
  const invoiceCount = invoicesSnap.size;

  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();

  return {
    plan: planConfig.tier,
    client_count: clientCount,
    max_clients: maxClients,
    clients_remaining: maxClients !== null ? Math.max(0, maxClients - clientCount) : null,
    client_limit_reached: maxClients !== null && clientCount >= maxClients,
    invoice_count: invoiceCount,
    invoices_this_period: invoicesThisPeriod,
    max_invoices_per_month: maxInvoices,
    invoices_remaining: maxInvoices !== null ? Math.max(0, maxInvoices - invoicesThisPeriod) : null,
    invoice_limit_reached: maxInvoices !== null && invoicesThisPeriod >= maxInvoices,
    period_start: periodStart,
    period_end: periodEnd,
    automated_reminders_count: 0,
    automated_reminders_enabled: Boolean(planConfig.features.automatedReminders),
    csv_export_enabled: Boolean(planConfig.features.csvExport),
    full_activity_history: Boolean(planConfig.features.fullActivityHistory),
  };
}

export async function checkCanCreateClient(userId: string): Promise<LimitCheckResult> {
  const usage = await getUserUsage(userId);
  if (usage.client_limit_reached) {
    return {
      allowed: false,
      reason: getPlanLimitReachedMessage('clients', usage.plan || 'FREE', usage.max_clients!),
      currentCount: usage.client_count,
      current: usage.client_count,
      maxLimit: usage.max_clients,
      max: usage.max_clients,
      tier: usage.plan,
      plan: usage.plan,
    };
  }
  return {
    allowed: true,
    currentCount: usage.client_count,
    current: usage.client_count,
    maxLimit: usage.max_clients,
    max: usage.max_clients,
    tier: usage.plan,
    plan: usage.plan,
  };
}

export async function checkCanCreateInvoice(userId: string): Promise<LimitCheckResult> {
  const usage = await getUserUsage(userId);
  if (usage.invoice_limit_reached) {
    return {
      allowed: false,
      reason: getPlanLimitReachedMessage('invoices', usage.plan || 'FREE', usage.max_invoices_per_month!),
      currentCount: usage.invoices_this_period,
      current: usage.invoices_this_period,
      maxLimit: usage.max_invoices_per_month,
      max: usage.max_invoices_per_month,
      tier: usage.plan,
      plan: usage.plan,
    };
  }
  return {
    allowed: true,
    currentCount: usage.invoices_this_period,
    current: usage.invoices_this_period,
    maxLimit: usage.max_invoices_per_month,
    max: usage.max_invoices_per_month,
    tier: usage.plan,
    plan: usage.plan,
  };
}

export async function checkFeatureAccess(
  userId: string,
  feature: keyof ReturnType<typeof getEffectivePlan>['features']
): Promise<{ allowed: boolean; currentPlan: PlanTier; plan: PlanTier }> {
  const sub = await getSubscription(userId);
  const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
  return {
    allowed: Boolean(planConfig.features[feature]),
    currentPlan: planConfig.tier,
    plan: planConfig.tier,
  };
}

export async function getSubscriptionDetails(userId: string): Promise<SubscriptionDetails> {
  const sub = await getSubscription(userId);
  const usage = await getUserUsage(userId);
  const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
  return {
    subscription: sub,
    usage,
    plan_config: planConfig,
  };
}

export async function isWebhookEventProcessed(eventId: string): Promise<boolean> {
  const db = getAdminFirestore();
  const snap = await db.collection('processed_webhooks').doc(eventId).get();
  return snap.exists;
}

export async function recordProcessedWebhookEvent(eventId: string, eventType: string): Promise<void> {
  const db = getAdminFirestore();
  await db.collection('processed_webhooks').doc(eventId).set({
    id: eventId,
    event_type: eventType,
    processed_at: new Date().toISOString(),
  });
}

export async function getSubscriptionByCustomerId(customerId: string): Promise<Subscription | null> {
  const db = getAdminFirestore();
  const snap = await db.collectionGroup('subscription').where('stripe_customer_id', '==', customerId).limit(1).get();
  if (!snap.empty) {
    return snap.docs[0].data() as Subscription;
  }
  const snap2 = await db.collectionGroup('subscription').where('provider_customer_id', '==', customerId).limit(1).get();
  if (!snap2.empty) {
    return snap2.docs[0].data() as Subscription;
  }
  return null;
}

export async function getSubscriptionByProviderSubId(subId: string): Promise<Subscription | null> {
  const db = getAdminFirestore();
  const snap = await db.collectionGroup('subscription').where('stripe_subscription_id', '==', subId).limit(1).get();
  if (!snap.empty) {
    return snap.docs[0].data() as Subscription;
  }
  const snap2 = await db.collectionGroup('subscription').where('provider_subscription_id', '==', subId).limit(1).get();
  if (!snap2.empty) {
    return snap2.docs[0].data() as Subscription;
  }
  return null;
}

export async function updateOwnerDemoPlan(identifier: string, plan: PlanTier): Promise<boolean> {
  const db = getAdminFirestore();
  const clean = identifier.trim().toLowerCase();

  // Try finding user by email first
  let userDoc = await db.collection('users').where('email', '==', clean).limit(1).get();
  let userId = '';
  if (!userDoc.empty) {
    userId = userDoc.docs[0].id;
  } else {
    // Try finding by doc ID
    const directDoc = await db.collection('users').doc(identifier).get();
    if (directDoc.exists) {
      userId = directDoc.id;
    }
  }

  if (!userId) return false;
  await upsertSubscription(userId, { plan, status: 'active', provider: 'manual' });
  return true;
}
