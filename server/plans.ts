import fs from 'fs';
import path from 'path';

export type PlanTier = 'FREE' | 'STARTER' | 'GROWTH';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';
export type BillingInterval = 'monthly' | 'annual';
export type SubscriptionProvider = 'stripe' | 'manual' | 'demo';
export type AccessMode = 'stripe' | 'owner_demo' | 'free';

export interface PlanLimits {
  maxClients: number | null; // null represents unlimited
  maxInvoicesPerMonth: number | null; // null represents unlimited
}

export interface PlanFeatures {
  invoiceTracking: boolean;
  overdueDetection: boolean;
  manualReminders: boolean;
  automatedReminders: boolean;
  customReminderSchedules: boolean;
  csvExport: boolean;
  fullActivityHistory: boolean;
  professionalPrinting?: boolean;
  prioritySupport: boolean;
  activityHistoryDays?: number;
  customEmailTemplates?: boolean;
}

export interface PlanConfig {
  tier: PlanTier;
  name: string;
  displayName?: string;
  badge: string;
  tagline: string;
  priceMonthly: number;
  priceAnnual: number;
  limits: PlanLimits;
  features: PlanFeatures;
  featureList: string[];
}

export const PLAN_CONFIGS: Record<PlanTier, PlanConfig> = {
  FREE: {
    tier: 'FREE',
    name: 'Free',
    badge: 'Starter Tier',
    tagline: 'Ideal for solo professionals & testing out Receipto.',
    priceMonthly: 0,
    priceAnnual: 0,
    limits: {
      maxClients: 5,
      maxInvoicesPerMonth: 10,
    },
    features: {
      invoiceTracking: true,
      overdueDetection: true,
      manualReminders: true,
      automatedReminders: false,
      customReminderSchedules: false,
      csvExport: false,
      fullActivityHistory: false,
      professionalPrinting: false,
      prioritySupport: false,
    },
    featureList: [
      'Up to 5 clients',
      'Up to 10 invoices per month',
      'Invoice status & overdue tracking',
      'Manual payment reminders',
      'Basic activity history',
      'Standard invoice printing',
    ],
  },
  STARTER: {
    tier: 'STARTER',
    name: 'Starter',
    badge: 'Most Popular',
    tagline: 'For growing businesses needing automated reminders & data exports.',
    priceMonthly: 9,
    priceAnnual: 90,
    limits: {
      maxClients: 50,
      maxInvoicesPerMonth: 100,
    },
    features: {
      invoiceTracking: true,
      overdueDetection: true,
      manualReminders: true,
      automatedReminders: true,
      customReminderSchedules: false,
      csvExport: true,
      fullActivityHistory: true,
      professionalPrinting: true,
      prioritySupport: false,
    },
    featureList: [
      'Up to 50 clients',
      'Up to 100 invoices per month',
      'Automated email reminders',
      'Complete reminder history',
      'Full CSV export for accounting',
      'Unrestricted activity history',
      'Professional invoice printing',
    ],
  },
  GROWTH: {
    tier: 'GROWTH',
    name: 'Growth',
    badge: 'Scale',
    tagline: 'Unlimited capacity, customizable reminder cadences & priority support.',
    priceMonthly: 24,
    priceAnnual: 240,
    limits: {
      maxClients: null, // Unlimited
      maxInvoicesPerMonth: null, // Unlimited
    },
    features: {
      invoiceTracking: true,
      overdueDetection: true,
      manualReminders: true,
      automatedReminders: true,
      customReminderSchedules: true,
      csvExport: true,
      fullActivityHistory: true,
      professionalPrinting: true,
      prioritySupport: true,
    },
    featureList: [
      'Unlimited clients',
      'Unlimited invoices',
      'Automated email reminders',
      'Custom reminder schedules & cadences',
      'Complete reminder history',
      'Full CSV export',
      'Unrestricted activity history',
      'Professional invoice printing',
      'Priority support designation',
    ],
  },
};

/**
 * Calculates whether a subscription is currently granting paid privileges.
 * Paid features are active if status is 'active' or 'trialing', or if 'cancelled'
 * but current_period_end is in the future (cancel at period end).
 */
export function isPaidSubscriptionActive(
  status: SubscriptionStatus | string | null | undefined,
  currentPeriodEnd: string | null | undefined
): boolean {
  const s = (status || '').toString().toLowerCase();
  if (s === 'active' || s === 'trialing') {
    return true;
  }
  if (s === 'cancelled' && currentPeriodEnd) {
    const end = new Date(currentPeriodEnd).getTime();
    return end > Date.now();
  }
  return false;
}

/**
 * Resolves the effective plan configuration based on subscription tier and status.
 * If subscription has expired, failed payment (past_due), or cancellation period concluded,
 * falls back cleanly to the FREE plan configuration.
 */
export function getEffectivePlan(
  tier: PlanTier | null | undefined,
  status: SubscriptionStatus | null | undefined,
  currentPeriodEnd: string | null | undefined
): PlanConfig {
  if (!tier || tier === 'FREE') {
    return PLAN_CONFIGS.FREE;
  }

  const effectiveStatus = status || 'active';
  if (isPaidSubscriptionActive(effectiveStatus, currentPeriodEnd)) {
    return PLAN_CONFIGS[tier] || PLAN_CONFIGS.FREE;
  }

  // Gracefully fallback to FREE limits when paid period has expired or payment failed
  return PLAN_CONFIGS.FREE;
}

/**
 * Gets the authoritative configured owner email.
 * Strictly server-side; NEVER expose this email to frontend clients.
 */
export function getOwnerDemoEmail(): string {
  try {
    const overrideFile = path.join(process.cwd(), 'data', 'owner_override.json');
    if (fs.existsSync(overrideFile)) {
      const parsed = JSON.parse(fs.readFileSync(overrideFile, 'utf8'));
      if (parsed.email && parsed.email.includes('@')) {
        return parsed.email.trim().toLowerCase();
      }
    }
  } catch {}
  const envEmail = process.env.OWNER_DEMO_EMAIL?.trim().toLowerCase();
  if (envEmail && envEmail.includes('@')) {
    return envEmail;
  }
  return 'receiptobusiness@gmail.com';
}

/**
 * Checks if an email matches the configured OWNER_DEMO_EMAIL or admin email.
 * Strictly server-side; NEVER expose the email to frontend clients.
 */
export function isOwnerEmail(email?: string | null): boolean {
  if (!email) return false;
  const clean = email.trim().toLowerCase();
  const ownerEmail = getOwnerDemoEmail();
  const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();
  const envEmail = process.env.OWNER_DEMO_EMAIL?.trim().toLowerCase();
  return (
    (ownerEmail ? clean === ownerEmail : false) ||
    (envEmail ? clean === envEmail : false) ||
    (adminEmail ? clean === adminEmail : false) ||
    clean === 'receiptobusiness@gmail.com' ||
    clean === 'rshimelis48@gmail.com' ||
    clean === 'shimelisyilma04@gmail.com'
  );
}

/**
 * Checks if a user account is the verified owner account.
 */
export function isOwnerAccount(user: { email?: string; email_verified?: boolean } | null | undefined): boolean {
  if (!user || !user.email) return false;
  return isOwnerEmail(user.email);
}

/**
 * Gets the default demo plan for the owner account from environment or defaults to GROWTH.
 */
export function getDefaultOwnerPlan(): PlanTier {
  const envPlan = process.env.OWNER_DEMO_PLAN?.trim().toUpperCase();
  if (envPlan === 'FREE' || envPlan === 'STARTER' || envPlan === 'GROWTH') {
    return envPlan as PlanTier;
  }
  return 'GROWTH';
}

/**
 * Generates user-friendly, structured limit reached messages with clear upgrade path.
 */
export function getPlanLimitReachedMessage(
  resource: 'clients' | 'invoices',
  plan: PlanTier,
  limit: number
): string {
  if (resource === 'clients') {
    if (plan === 'FREE') {
      return `You've reached your Free plan limit of ${limit} clients. Upgrade to Starter for up to 50 clients.`;
    }
    return `You've reached your Starter plan limit of ${limit} clients. Upgrade to Growth for unlimited clients.`;
  } else {
    if (plan === 'FREE') {
      return `You've reached your Free plan limit of ${limit} invoices. Upgrade to Starter for up to 100 invoices per period.`;
    }
    return `You've reached your Starter plan limit of ${limit} invoices. Upgrade to Growth for unlimited invoices.`;
  }
}

export class PlanLimitExceededError extends Error {
  code = 'PLAN_LIMIT_REACHED';
  resource: 'clients' | 'invoices';
  current: number;
  limit: number;
  plan: PlanTier;

  constructor(resource: 'clients' | 'invoices', current: number, limit: number, plan: PlanTier) {
    const msg = getPlanLimitReachedMessage(resource, plan, limit);
    super(msg);
    this.name = 'PlanLimitExceededError';
    this.resource = resource;
    this.current = current;
    this.limit = limit;
    this.plan = plan;
  }
}
