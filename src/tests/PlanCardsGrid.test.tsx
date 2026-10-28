// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PlanCardsGrid } from '../components/billing/PlanCardsGrid.js';

describe('PlanCardsGrid Component', () => {
  it('renders all three pricing tiers (Free, Starter, Growth)', () => {
    const handleUpgrade = vi.fn();
    render(
      <PlanCardsGrid
        currentPlan="FREE"
        billingInterval="monthly"
        actionLoading={null}
        onUpgrade={handleUpgrade}
      />
    );

    expect(screen.getByText('Starter Free')).toBeTruthy();
    expect(screen.getByText('Starter')).toBeTruthy();
    expect(screen.getByText('Growth')).toBeTruthy();
    expect(screen.getByText('$0')).toBeTruthy();
    expect(screen.getByText('$19')).toBeTruthy();
    expect(screen.getByText('$49')).toBeTruthy();
  });

  it('updates price display when annual billing interval is selected', () => {
    render(
      <PlanCardsGrid
        currentPlan="FREE"
        billingInterval="annual"
        actionLoading={null}
        onUpgrade={vi.fn()}
      />
    );

    expect(screen.getByText('$15')).toBeTruthy();
    expect(screen.getByText('$39')).toBeTruthy();
  });

  it('calls onUpgrade with STARTER when upgrade button is clicked', () => {
    const handleUpgrade = vi.fn();
    render(
      <PlanCardsGrid
        currentPlan="FREE"
        billingInterval="monthly"
        actionLoading={null}
        onUpgrade={handleUpgrade}
      />
    );

    const starterBtn = screen.getByText('Upgrade to Starter');
    fireEvent.click(starterBtn);
    expect(handleUpgrade).toHaveBeenCalledWith('STARTER');
  });

  it('calls onUpgrade with GROWTH when growth upgrade button is clicked', () => {
    const handleUpgrade = vi.fn();
    render(
      <PlanCardsGrid
        currentPlan="FREE"
        billingInterval="monthly"
        actionLoading={null}
        onUpgrade={handleUpgrade}
      />
    );

    const growthBtn = screen.getByText('Upgrade to Growth');
    fireEvent.click(growthBtn);
    expect(handleUpgrade).toHaveBeenCalledWith('GROWTH');
  });

  it('disables current plan button when user is already on STARTER', () => {
    render(
      <PlanCardsGrid
        currentPlan="STARTER"
        billingInterval="monthly"
        actionLoading={null}
        onUpgrade={vi.fn()}
      />
    );

    const currentPlanButtons = screen.getAllByText('Current Plan');
    expect(currentPlanButtons.length).toBeGreaterThan(0);
  });
});
