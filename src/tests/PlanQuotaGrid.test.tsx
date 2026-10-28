// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PlanQuotaGrid } from '../components/billing/PlanQuotaGrid.js';
import type { SubscriptionUsage } from '../types.js';

describe('PlanQuotaGrid Component', () => {
  const mockUsage: SubscriptionUsage = {
    client_count: 3,
    max_clients: 5,
    clients_remaining: 2,
    client_limit_reached: false,
    invoice_count: 4,
    invoices_this_period: 4,
    max_invoices_per_month: 10,
    invoices_remaining: 6,
    invoice_limit_reached: false,
    period_start: '2026-10-01',
    period_end: null,
    automated_reminders_count: 0,
    automated_reminders_enabled: false,
    csv_export_enabled: false,
    full_activity_history: false,
  };

  it('renders client and invoice quota counters accurately', () => {
    render(<PlanQuotaGrid usage={mockUsage} currentPlan="FREE" />);

    expect(screen.getByText('3 / 5')).toBeTruthy();
    expect(screen.getByText('4 / 10')).toBeTruthy();
    expect(screen.getByText('Free: Manual Only')).toBeTruthy();
  });

  it('renders unlimited indicators for GROWTH tier', () => {
    const growthUsage: SubscriptionUsage = {
      ...mockUsage,
      client_count: 120,
      max_clients: null,
      invoices_this_period: 450,
      max_invoices_per_month: null,
      automated_reminders_enabled: true,
    };

    render(<PlanQuotaGrid usage={growthUsage} currentPlan="GROWTH" />);

    expect(screen.getByText('120 / Unlimited')).toBeTruthy();
    expect(screen.getByText('450 / Unlimited')).toBeTruthy();
    expect(screen.getByText('Enabled')).toBeTruthy();
  });
});
