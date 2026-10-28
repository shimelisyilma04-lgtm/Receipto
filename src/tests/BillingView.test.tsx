// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BillingView } from '../components/BillingView.js';
import { api } from '../api.js';

describe('BillingView Component', () => {
  const mockShowToast = vi.fn();
  const mockSubscriptionUpdated = vi.fn();
  const mockNavigateToDashboard = vi.fn();

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    mockShowToast.mockReset();
    mockSubscriptionUpdated.mockReset();
    mockNavigateToDashboard.mockReset();
  });

  const mockFreeDetails = {
    subscription: {
      plan: 'FREE' as const,
      status: 'active' as const,
      provider: 'free' as const,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    usage: {
      client_count: 2,
      max_clients: 5,
      invoice_count: 3,
      invoices_this_period: 3,
      max_invoices_per_month: 10,
      client_limit_reached: false,
      invoice_limit_reached: false,
    },
    plan_config: {
      tier: 'FREE' as const,
      name: 'Free',
      badge: 'Starter Tier',
      tagline: 'Ideal for solo professionals',
      priceMonthly: 0,
      priceAnnual: 0,
      limits: { maxClients: 5, maxInvoicesPerMonth: 10 },
      features: {
        invoiceTracking: true,
        overdueDetection: true,
        manualReminders: true,
        automatedReminders: false,
        customReminderSchedules: false,
        csvExport: false,
        fullActivityHistory: false,
        prioritySupport: false,
      },
      featureList: ['5 clients', '10 invoices/mo'],
    },
  };

  const mockActivePaidDetails = {
    subscription: {
      plan: 'STARTER' as const,
      status: 'active' as const,
      provider: 'stripe' as const,
      billing_interval: 'monthly' as const,
      current_period_end: new Date(Date.now() + 864000000).toISOString(),
      cancel_at_period_end: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    usage: {
      client_count: 8,
      max_clients: 50,
      invoice_count: 12,
      invoices_this_period: 12,
      max_invoices_per_month: 100,
      client_limit_reached: false,
      invoice_limit_reached: false,
    },
    plan_config: {
      tier: 'STARTER' as const,
      name: 'Starter',
      badge: 'Pro Tier',
      tagline: 'For growing businesses',
      priceMonthly: 19,
      priceAnnual: 190,
      limits: { maxClients: 50, maxInvoicesPerMonth: 100 },
      features: {
        invoiceTracking: true,
        overdueDetection: true,
        manualReminders: true,
        automatedReminders: true,
        customReminderSchedules: false,
        csvExport: true,
        fullActivityHistory: true,
        prioritySupport: false,
      },
      featureList: ['50 clients', '100 invoices/mo'],
    },
  };

  it('renders loading state initially and then displays plans', async () => {
    vi.spyOn(api, 'getSubscription').mockResolvedValueOnce(mockFreeDetails);

    render(
      <BillingView
        onShowToast={mockShowToast}
        onSubscriptionUpdated={mockSubscriptionUpdated}
        onNavigateToDashboard={mockNavigateToDashboard}
      />
    );

    // Initial loading spinner
    expect(screen.getByText('Loading subscription & quota details...')).toBeTruthy();

    await waitFor(() => {
      expect(screen.getByText('Subscription & Plans')).toBeTruthy();
      expect(screen.getAllByText('Current Plan').length).toBeGreaterThan(0);
    });
  });

  it('allows toggling between monthly and annual billing intervals', async () => {
    vi.spyOn(api, 'getSubscription').mockResolvedValueOnce(mockFreeDetails);

    render(
      <BillingView
        onShowToast={mockShowToast}
        onSubscriptionUpdated={mockSubscriptionUpdated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Monthly Billing')).toBeTruthy();
      expect(screen.getByText('Annual Billing')).toBeTruthy();
    });

    const annualButton = screen.getByText('Annual Billing');
    fireEvent.click(annualButton);

    // Annual prices reflect discounted rates
    expect(screen.getByText('$15')).toBeTruthy();
    expect(screen.getByText('$39')).toBeTruthy();
  });

  it('initiates checkout when upgrade button is clicked', async () => {
    vi.spyOn(api, 'getSubscription').mockResolvedValueOnce(mockFreeDetails);
    const checkoutSpy = vi.spyOn(api, 'createCheckoutSession').mockResolvedValueOnce({
      url: 'https://checkout.stripe.com/pay/cs_test_123',
    });

    // Mock window.location
    const originalLocation = window.location;
    delete (window as any).location;
    window.location = { ...originalLocation, href: '' } as any;

    render(
      <BillingView
        onShowToast={mockShowToast}
        onSubscriptionUpdated={mockSubscriptionUpdated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Upgrade to Starter')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Upgrade to Starter'));

    await waitFor(() => {
      expect(checkoutSpy).toHaveBeenCalledWith('STARTER', 'monthly');
      expect(window.location.href).toBe('https://checkout.stripe.com/pay/cs_test_123');
    });

    window.location = originalLocation;
  });

  it('displays error toast when checkout initiation fails', async () => {
    vi.spyOn(api, 'getSubscription').mockResolvedValueOnce(mockFreeDetails);
    vi.spyOn(api, 'createCheckoutSession').mockRejectedValueOnce(
      new Error('Stripe API network timeout')
    );

    render(
      <BillingView
        onShowToast={mockShowToast}
        onSubscriptionUpdated={mockSubscriptionUpdated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Upgrade to Starter')).toBeTruthy();
    });

    fireEvent.click(screen.getByText('Upgrade to Starter'));

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Stripe API network timeout', 'error');
    });
  });

  it('renders active subscription management view for paid user', async () => {
    vi.spyOn(api, 'getSubscription').mockResolvedValueOnce(mockActivePaidDetails);

    render(
      <BillingView
        onShowToast={mockShowToast}
        onSubscriptionUpdated={mockSubscriptionUpdated}
      />
    );

    await waitFor(() => {
      expect(screen.getByText('Stripe Customer Portal')).toBeTruthy();
      expect(screen.getByText('Cancel Subscription')).toBeTruthy();
    });
  });

  it('handles subscription load failure gracefully', async () => {
    vi.spyOn(api, 'getSubscription').mockRejectedValueOnce(new Error('Unauthorized'));

    render(
      <BillingView
        onShowToast={mockShowToast}
        onSubscriptionUpdated={mockSubscriptionUpdated}
      />
    );

    await waitFor(() => {
      expect(mockShowToast).toHaveBeenCalledWith('Unauthorized', 'error');
    });
  });
});
