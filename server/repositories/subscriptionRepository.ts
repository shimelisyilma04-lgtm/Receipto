import type {
  Subscription,
  SubscriptionUsage,
  SubscriptionDetails,
  PlanTier,
} from '../types.js';
import { memoryStore, saveStore, reloadLocalStore } from '../lib/dbStore.js';
import { getEffectivePlan, getPlanLimitReachedMessage } from '../plans.js';
import { logger } from '../lib/logger.js';

export async function getSubscription(userId: string): Promise<Subscription> {
  reloadLocalStore();
  const sub = memoryStore.subscriptions.find((s) => s.user_id === userId);
  if (sub) return sub;

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
  memoryStore.subscriptions.push(defaultSub);
  saveStore();
  return defaultSub;
}

export async function upsertSubscription(
  userIdOrData: string | (Partial<Subscription> & { user_id: string; plan?: PlanTier }),
  dataArg?: Partial<Subscription> & { plan?: PlanTier }
): Promise<Subscription> {
  reloadLocalStore();
  const userId = typeof userIdOrData === 'string' ? userIdOrData : userIdOrData.user_id;
  const data = typeof userIdOrData === 'string' ? (dataArg || {}) : userIdOrData;

  const existing = memoryStore.subscriptions.find((s) => s.user_id === userId);
  const now = new Date().toISOString();

  if (existing) {
    if (data.plan) existing.plan = data.plan;
    if (data.status) existing.status = data.status;
    if (data.billing_interval) existing.billing_interval = data.billing_interval;
    if (data.provider) existing.provider = data.provider;
    if (data.provider_customer_id !== undefined) existing.provider_customer_id = data.provider_customer_id;
    if (data.provider_subscription_id !== undefined) existing.provider_subscription_id = data.provider_subscription_id;
    if (data.stripe_customer_id !== undefined) existing.stripe_customer_id = data.stripe_customer_id;
    if (data.stripe_subscription_id !== undefined) existing.stripe_subscription_id = data.stripe_subscription_id;
    if (data.current_period_end !== undefined) existing.current_period_end = data.current_period_end;
    if (data.cancel_at_period_end !== undefined) existing.cancel_at_period_end = data.cancel_at_period_end;
    existing.updated_at = now;
    saveStore();
    logger.info({ userId, plan: existing.plan, status: existing.status }, 'Subscription updated');
    return existing;
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
    current_period_start: now,
    current_period_end: data.current_period_end || null,
    cancel_at_period_end: data.cancel_at_period_end || false,
    created_at: now,
    updated_at: now,
  };
  memoryStore.subscriptions.push(newSub);
  saveStore();
  logger.info({ userId, plan: newSub.plan, status: newSub.status }, 'New subscription created');
  return newSub;
}

export async function getUserUsage(userId: string): Promise<SubscriptionUsage> {
  const sub = await getSubscription(userId);
  const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);

  reloadLocalStore();
  const clients = memoryStore.clients.filter((c) => c.user_id === userId);
  const invoices = memoryStore.invoices.filter((i) => i.user_id === userId);

  const maxClients = planConfig.limits.maxClients;
  const maxInvoices = planConfig.limits.maxInvoicesPerMonth;

  return {
    plan: planConfig.tier,
    client_count: clients.length,
    max_clients: maxClients,
    clients_remaining: maxClients !== null ? Math.max(0, maxClients - clients.length) : null,
    client_limit_reached: maxClients !== null && clients.length >= maxClients,
    invoice_count: invoices.length,
    invoices_this_period: invoices.length,
    max_invoices_per_month: maxInvoices,
    invoices_remaining: maxInvoices !== null ? Math.max(0, maxInvoices - invoices.length) : null,
    invoice_limit_reached: maxInvoices !== null && invoices.length >= maxInvoices,
    period_start: sub.current_period_start || new Date().toISOString(),
    period_end: sub.current_period_end || null,
    automated_reminders_count: 0,
    automated_reminders_enabled: planConfig.features.automatedReminders,
    csv_export_enabled: planConfig.features.csvExport,
    full_activity_history: planConfig.tier === 'GROWTH',
  };
}

export interface LimitCheckResult {
  allowed: boolean;
  message?: string;
  reason?: string;
  current?: number;
  max?: number | null;
  plan?: string;
}

export async function checkCanCreateClient(userId: string): Promise<LimitCheckResult> {
  const usage = await getUserUsage(userId);
  if (usage.client_limit_reached) {
    const plan = (usage.plan || 'FREE') as PlanTier;
    const msg = getPlanLimitReachedMessage('clients', plan, usage.max_clients || 5);
    return {
      allowed: false,
      message: msg,
      reason: msg,
      current: usage.client_count,
      max: usage.max_clients,
      plan: usage.plan,
    };
  }
  return {
    allowed: true,
    current: usage.client_count,
    max: usage.max_clients,
    plan: usage.plan,
  };
}

export async function checkCanCreateInvoice(userId: string): Promise<LimitCheckResult> {
  const usage = await getUserUsage(userId);
  if (usage.invoice_limit_reached) {
    const plan = (usage.plan || 'FREE') as PlanTier;
    const msg = getPlanLimitReachedMessage('invoices', plan, usage.max_invoices_per_month || 10);
    return {
      allowed: false,
      message: msg,
      reason: msg,
      current: usage.invoices_this_period,
      max: usage.max_invoices_per_month,
      plan: usage.plan,
    };
  }
  return {
    allowed: true,
    current: usage.invoices_this_period,
    max: usage.max_invoices_per_month,
    plan: usage.plan,
  };
}

export async function checkFeatureAccess(
  userId: string,
  feature: string
): Promise<{ allowed: boolean; plan: PlanTier; message?: string }> {
  const sub = await getSubscription(userId);
  const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);

  let allowed = false;
  if (feature === 'csvExport' || feature === 'csv_export') {
    allowed = planConfig.features.csvExport;
  } else if (feature === 'automatedReminders' || feature === 'automated_reminders') {
    allowed = planConfig.features.automatedReminders;
  } else if (feature === 'customReminderSchedules' || feature === 'custom_reminder_schedules') {
    allowed = planConfig.features.customReminderSchedules;
  } else if (feature === 'fullActivityHistory' || feature === 'full_activity_history') {
    allowed = planConfig.features.fullActivityHistory;
  } else if (feature in planConfig.features) {
    allowed = Boolean((planConfig.features as any)[feature]);
  }

  return {
    allowed,
    plan: planConfig.tier,
    message: allowed ? undefined : `The feature "${feature}" requires upgrading to a paid tier.`,
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
  reloadLocalStore();
  return memoryStore.processed_webhook_events.some((e) => e.id === eventId);
}

export async function recordProcessedWebhookEvent(eventId: string, eventType: string): Promise<void> {
  memoryStore.processed_webhook_events.push({
    id: eventId,
    event_type: eventType,
    processed_at: new Date().toISOString(),
  });
  saveStore();
}

export async function getSubscriptionByCustomerId(customerId: string): Promise<Subscription | null> {
  reloadLocalStore();
  return (
    memoryStore.subscriptions.find(
      (s) => s.provider_customer_id === customerId || s.stripe_customer_id === customerId
    ) || null
  );
}

export async function getSubscriptionByProviderSubId(subId: string): Promise<Subscription | null> {
  reloadLocalStore();
  return (
    memoryStore.subscriptions.find(
      (s) => s.provider_subscription_id === subId || s.stripe_subscription_id === subId
    ) || null
  );
}

export async function updateOwnerDemoPlan(identifier: string, plan: PlanTier): Promise<boolean> {
  reloadLocalStore();
  const clean = identifier.trim().toLowerCase();
  const user = memoryStore.users.find((u) => u.email.toLowerCase() === clean || u.id === identifier);
  if (!user) return false;
  await upsertSubscription(user.id, { plan, status: 'active', provider: 'manual' });
  return true;
}
