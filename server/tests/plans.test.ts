import { describe, it, expect, beforeEach } from 'vitest';
import {
  PLAN_CONFIGS,
  isPaidSubscriptionActive,
  getEffectivePlan,
  getOwnerDemoEmail,
  isOwnerEmail,
  isOwnerAccount,
  getDefaultOwnerPlan,
  getPlanLimitReachedMessage,
  PlanLimitExceededError,
} from '../plans.js';

describe('Server Plans & Subscription Rules', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  describe('PLAN_CONFIGS dictionary', () => {
    it('defines FREE, STARTER, and GROWTH configurations with correct limits', () => {
      expect(PLAN_CONFIGS.FREE.limits.maxClients).toBe(5);
      expect(PLAN_CONFIGS.FREE.limits.maxInvoicesPerMonth).toBe(10);
      expect(PLAN_CONFIGS.FREE.features.automatedReminders).toBe(false);

      expect(PLAN_CONFIGS.STARTER.limits.maxClients).toBe(50);
      expect(PLAN_CONFIGS.STARTER.limits.maxInvoicesPerMonth).toBe(100);
      expect(PLAN_CONFIGS.STARTER.features.automatedReminders).toBe(true);

      expect(PLAN_CONFIGS.GROWTH.limits.maxClients).toBeNull();
      expect(PLAN_CONFIGS.GROWTH.limits.maxInvoicesPerMonth).toBeNull();
      expect(PLAN_CONFIGS.GROWTH.features.fullActivityHistory).toBe(true);
    });
  });

  describe('isPaidSubscriptionActive', () => {
    it('returns true for active or trialing status', () => {
      expect(isPaidSubscriptionActive('active')).toBe(true);
      expect(isPaidSubscriptionActive('trialing')).toBe(true);
    });

    it('returns false for past_due or expired status', () => {
      expect(isPaidSubscriptionActive('past_due')).toBe(false);
      expect(isPaidSubscriptionActive('expired')).toBe(false);
      expect(isPaidSubscriptionActive(undefined)).toBe(false);
    });

    it('handles cancelled status with future grace period', () => {
      const future = new Date(Date.now() + 86400000).toISOString();
      const past = new Date(Date.now() - 86400000).toISOString();

      expect(isPaidSubscriptionActive('cancelled', future)).toBe(true);
      expect(isPaidSubscriptionActive('cancelled', past)).toBe(false);
    });
  });

  describe('getEffectivePlan', () => {
    it('falls back to FREE when tier is empty or FREE', () => {
      expect(getEffectivePlan(null, 'active', null).tier).toBe('FREE');
      expect(getEffectivePlan('FREE', 'active', null).tier).toBe('FREE');
    });

    it('returns requested tier when paid subscription is active', () => {
      expect(getEffectivePlan('STARTER', 'active', null).tier).toBe('STARTER');
      expect(getEffectivePlan('GROWTH', 'active', null).tier).toBe('GROWTH');
    });

    it('gracefully degrades to FREE if paid plan is past_due or expired', () => {
      expect(getEffectivePlan('STARTER', 'past_due', null).tier).toBe('FREE');
      expect(getEffectivePlan('GROWTH', 'expired', null).tier).toBe('FREE');
    });
  });

  describe('Owner account detection', () => {
    it('identifies owner accounts by email address', () => {
      expect(isOwnerEmail('receiptobusiness@gmail.com')).toBe(true);
      expect(isOwnerEmail('rshimelis48@gmail.com')).toBe(true);
      expect(isOwnerEmail('regular_user@example.com')).toBe(false);
      expect(isOwnerEmail(null)).toBe(false);

      expect(isOwnerAccount({ email: 'receiptobusiness@gmail.com' })).toBe(true);
      expect(isOwnerAccount({ email: 'stranger@example.com' })).toBe(false);
      expect(isOwnerAccount(null)).toBe(false);
    });

    it('respects OWNER_DEMO_EMAIL environment variable', () => {
      process.env.OWNER_DEMO_EMAIL = 'custom_owner@corp.com';
      expect(getOwnerDemoEmail()).toBe('custom_owner@corp.com');
      expect(isOwnerEmail('custom_owner@corp.com')).toBe(true);
    });

    it('resolves default owner demo plan', () => {
      delete process.env.OWNER_DEMO_PLAN;
      expect(getDefaultOwnerPlan()).toBe('GROWTH');

      process.env.OWNER_DEMO_PLAN = 'STARTER';
      expect(getDefaultOwnerPlan()).toBe('STARTER');
    });
  });

  describe('Plan limits & exceptions', () => {
    it('generates clear limit reached messages with upgrade CTAs', () => {
      const clientMsg = getPlanLimitReachedMessage('clients', 'FREE', 5);
      expect(clientMsg).toContain('limit of 5 clients');
      expect(clientMsg).toContain('Upgrade to Starter');

      const invoiceMsg = getPlanLimitReachedMessage('invoices', 'STARTER', 100);
      expect(invoiceMsg).toContain('limit of 100 invoices');
      expect(invoiceMsg).toContain('Upgrade to Growth');
    });

    it('creates PlanLimitExceededError with structured properties', () => {
      const err = new PlanLimitExceededError('clients', 5, 5, 'FREE');
      expect(err.code).toBe('PLAN_LIMIT_REACHED');
      expect(err.resource).toBe('clients');
      expect(err.current).toBe(5);
      expect(err.limit).toBe(5);
      expect(err.plan).toBe('FREE');
      expect(err.message).toContain('limit of 5 clients');
    });
  });
});
