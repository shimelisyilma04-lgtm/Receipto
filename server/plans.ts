export type PlanTier = 'FREE' | 'STARTER' | 'GROWTH';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';
export type BillingInterval = 'monthly' | 'annual';
export type SubscriptionProvider = 'stripe' | 'manual';

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
  professionalPrinting: boolean;
  prioritySupport: boolean;
}

export interface PlanConfig {
  tier: PlanTier;
  name: string;
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
    priceMonthly: 29,
    priceAnnual: 290,
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
  status: SubscriptionStatus,
  currentPeriodEnd: string | null | undefined
): boolean {
  if (status === 'active' || status === 'trialing') {
    return true;
  }
  if (status === 'cancelled' && currentPeriodEnd) {
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
