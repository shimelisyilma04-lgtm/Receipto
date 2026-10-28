// @vitest-environment happy-dom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import App from '../App.js';
import { api } from '../api.js';
import * as firebaseAuth from './../firebase.js';

describe('App Component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    window.history.pushState({}, '', '/');
  });

  it('renders landing page when user is not authenticated', async () => {
    // Mock firebase auth returning null user
    vi.spyOn(firebaseAuth, 'onAuthStateChanged').mockImplementation((_auth, callback) => {
      (callback as any)(null);
      return () => {};
    });

    render(<App />);

    await waitFor(() => {
      // Landing page elements should be visible
      expect(screen.getByText('Features')).toBeTruthy();
      expect(screen.getByText('Pricing')).toBeTruthy();
      expect(screen.getByText('FAQ')).toBeTruthy();
      expect(document.getElementById('btn-nav-get-started')).toBeTruthy();
    });
  });

  it('renders EmailVerificationView when authenticated user is not email_verified', async () => {
    vi.spyOn(firebaseAuth, 'onAuthStateChanged').mockImplementation((_auth, callback) => {
      (callback as any)({ uid: 'user_unverified_1' });
      return () => {};
    });

    vi.spyOn(api, 'getMe').mockResolvedValueOnce({
      user: {
        id: 'user_unverified_1',
        email: 'unverified@example.com',
        name: 'Unverified Dev',
        role: 'USER',
        email_verified: false,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      email_delivery: 'sent',
      dev_preview_otp: '123456',
      message: 'Code sent',
    });

    render(<App />);

    await waitFor(() => {
      expect(screen.getByText('Verify your email')).toBeTruthy();
      expect(screen.getByText('un***d@example.com')).toBeTruthy();
    });
  });

  it('renders dashboard and navbar when authenticated and verified', async () => {
    vi.spyOn(firebaseAuth, 'onAuthStateChanged').mockImplementation((_auth, callback) => {
      (callback as any)({ uid: 'user_verified_1' });
      return () => {};
    });

    const verifiedUser = {
      id: 'user_verified_1',
      email: 'owner@example.com',
      name: 'Owner User',
      role: 'USER' as const,
      email_verified: true,
      business_name: 'Acme SaaS',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    vi.spyOn(api, 'getMe').mockResolvedValueOnce({
      user: verifiedUser,
    });

    vi.spyOn(api, 'getDashboard').mockResolvedValueOnce({
      stats: {
        totalRevenue: 25000,
        pendingAmount: 3400,
        overdueAmount: 800,
        totalInvoices: 15,
        paidInvoices: 12,
        overdueInvoices: 2,
        unpaidInvoices: 1,
        totalClients: 6,
      },
      recentInvoices: [],
      overdueInvoices: [],
      recentReminders: [],
    });

    vi.spyOn(api, 'getClients').mockResolvedValueOnce({ clients: [] });
    vi.spyOn(api, 'getInvoices').mockResolvedValueOnce({ invoices: [] });
    vi.spyOn(api, 'getSubscription').mockResolvedValueOnce({
      subscription: {
        plan: 'STARTER',
        status: 'active',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      usage: {
        client_count: 6,
        max_clients: 50,
        invoice_count: 15,
        invoices_this_period: 15,
        max_invoices_per_month: 100,
        client_limit_reached: false,
        invoice_limit_reached: false,
      },
      plan_config: {
        tier: 'STARTER',
        name: 'Starter',
        limits: { maxClients: 50, maxInvoicesPerMonth: 100 },
        features: {} as any,
        featureList: [],
      } as any,
    });

    render(<App />);

    await waitFor(() => {
      // Navbar tab links
      expect(screen.getByText('Dashboard')).toBeTruthy();
      expect(screen.getByText('Invoices')).toBeTruthy();
      expect(screen.getByText('Clients')).toBeTruthy();
    });
  });

  it('supports navigation to Invoices, Clients, and Billing tabs', async () => {
    vi.spyOn(firebaseAuth, 'onAuthStateChanged').mockImplementation((_auth, callback) => {
      (callback as any)({ uid: 'user_verified_1' });
      return () => {};
    });

    vi.spyOn(api, 'getMe').mockResolvedValueOnce({
      user: {
        id: 'user_verified_1',
        email: 'owner@example.com',
        name: 'Owner User',
        role: 'USER',
        email_verified: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });

    vi.spyOn(api, 'getDashboard').mockResolvedValue({
      stats: {
        totalRevenue: 0,
        pendingAmount: 0,
        overdueAmount: 0,
        totalInvoices: 0,
        paidInvoices: 0,
        overdueInvoices: 0,
        unpaidInvoices: 0,
        totalClients: 0,
      },
      recentInvoices: [],
      overdueInvoices: [],
      recentReminders: [],
    });

    vi.spyOn(api, 'getClients').mockResolvedValue({ clients: [] });
    vi.spyOn(api, 'getInvoices').mockResolvedValue({ invoices: [] });
    vi.spyOn(api, 'getSubscription').mockResolvedValue({
      subscription: { plan: 'FREE', status: 'active', created_at: '', updated_at: '' },
      usage: {
        client_count: 0,
        max_clients: 5,
        invoice_count: 0,
        invoices_this_period: 0,
        max_invoices_per_month: 10,
        client_limit_reached: false,
        invoice_limit_reached: false,
      },
      plan_config: {
        tier: 'FREE',
        name: 'Free',
        limits: { maxClients: 5, maxInvoicesPerMonth: 10 },
        features: {} as any,
        featureList: [],
      } as any,
    });

    render(<App />);

    await waitFor(() => {
      expect(document.getElementById('nav-tab-invoices')).toBeTruthy();
    });

    // Navigate to Invoices
    fireEvent.click(document.getElementById('nav-tab-invoices')!);
    await waitFor(() => {
      expect(screen.getByText('Create Invoice')).toBeTruthy();
    });

    // Navigate to Clients
    fireEvent.click(document.getElementById('nav-tab-clients')!);
    await waitFor(() => {
      expect(document.getElementById('btn-add-client-main')).toBeTruthy();
    });
  });
});
