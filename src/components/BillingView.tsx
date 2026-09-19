import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Zap,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  ExternalLink,
  Users,
  FileText,
  Clock,
  Download,
  Check,
  X,
  AlertTriangle,
  Lock,
  LayoutDashboard,
} from 'lucide-react';
import type { SubscriptionDetails, SubscriptionUsage } from '../types.js';
import { PLAN_CONFIGS, type PlanTier, type BillingInterval, isPaidSubscriptionActive } from '../plans.js';
import { api } from '../api.js';

interface BillingViewProps {
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onSubscriptionUpdated?: () => void;
  onNavigateToDashboard?: () => void;
}

export function BillingView({
  onShowToast,
  onSubscriptionUpdated,
  onNavigateToDashboard,
}: BillingViewProps) {
  const [details, setDetails] = useState<SubscriptionDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [billingInterval, setBillingInterval] = useState<BillingInterval>('monthly');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showSandbox, setShowSandbox] = useState(false);

  // Verification state for returning from Stripe Checkout
  const [verificationState, setVerificationState] = useState<{
    status: 'idle' | 'verifying' | 'success' | 'error';
    message?: string;
  }>({ status: 'idle' });

  useEffect(() => {
    loadSubscription();

    // Check URL parameters for return from Stripe Checkout
    const params = new URLSearchParams(window.location.search);
    const billingStatus = params.get('billing_status');
    const sessionId = params.get('session_id');

    if (billingStatus === 'success' && sessionId) {
      verifyCheckoutSession(sessionId);
    } else if (billingStatus === 'success') {
      onShowToast('Payment received! Checking subscription status...', 'info');
      // Clean query param
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (billingStatus === 'cancelled') {
      onShowToast('Stripe checkout was cancelled. You can upgrade anytime.', 'info');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  async function verifyCheckoutSession(sessionId: string) {
    try {
      setVerificationState({
        status: 'verifying',
        message: 'Verifying payment directly with Stripe...',
      });

      const res = await api.confirmSession(sessionId);
      if (res.success) {
        setDetails(res);
        setVerificationState({
          status: 'success',
          message: 'Your plan is now active.',
        });
        onShowToast('Payment verified! Your plan is now active.', 'success');
        onSubscriptionUpdated?.();
      } else {
        setVerificationState({
          status: 'error',
          message: res.message || 'Payment could not be verified by Stripe.',
        });
      }
    } catch (err: any) {
      setVerificationState({
        status: 'error',
        message: err.message || 'Failed to verify Stripe checkout session.',
      });
      onShowToast(err.message || 'Payment verification failed', 'error');
    } finally {
      // Clean query params
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  async function loadSubscription() {
    try {
      setLoading(true);
      const data = await api.getSubscription();
      setDetails(data);
    } catch (err: any) {
      onShowToast(err.message || 'Failed to load subscription data', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade(targetPlan: 'STARTER' | 'GROWTH') {
    try {
      setActionLoading(targetPlan);

      // Check if real Stripe is configured
      if (!details?.stripe_configured) {
        onShowToast(
          'NOT CONFIGURED — Stripe credentials (STRIPE_SECRET_KEY) required to process real subscriptions.',
          'error'
        );
        return;
      }

      // Real Stripe Checkout redirect
      const res = await api.createCheckoutSession(targetPlan, billingInterval);
      if (res.url) {
        window.location.href = res.url;
        return;
      }
      throw new Error('No checkout URL returned from server.');
    } catch (err: any) {
      onShowToast(err.message || 'Failed to initiate Stripe checkout', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleOpenPortal() {
    try {
      setActionLoading('portal');
      const res = await api.createCustomerPortalSession();
      if (res.url) {
        window.location.href = res.url;
      }
    } catch (err: any) {
      onShowToast(err.message || 'Failed to open customer portal', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelSubscription() {
    if (
      !window.confirm(
        'Are you sure you want to cancel your subscription? Your access and all existing client data will remain fully intact until the end of your billing cycle.'
      )
    ) {
      return;
    }

    try {
      setActionLoading('cancel');
      const res = await api.cancelSubscription();
      onShowToast(res.message, 'info');
      await loadSubscription();
      onSubscriptionUpdated?.();
    } catch (err: any) {
      onShowToast(err.message || 'Failed to cancel subscription', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleDeveloperSandboxSwitch(plan: PlanTier) {
    try {
      setActionLoading(`sim-${plan}`);
      const res = await api.simulatePlan(plan, billingInterval);
      setDetails(res);
      onShowToast(`Switched plan to ${plan} for testing (Developer Sandbox).`, 'info');
      onSubscriptionUpdated?.();
    } catch (err: any) {
      onShowToast(err.message || 'Failed to switch sandbox plan', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
        <span className="ml-3 text-sm font-medium text-slate-600 dark:text-slate-400">
          Loading subscription details...
        </span>
      </div>
    );
  }

  const currentPlan = details?.subscription.plan || 'FREE';
  const subStatus = details?.subscription.status || 'active';
  const usage = details?.usage;

  return (
    <div className="space-y-8 max-w-6xl mx-auto pb-12">
      {/* Checkout Return Success Banner / Processing Banner */}
      {verificationState.status === 'verifying' && (
        <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 flex items-center gap-3 animate-pulse">
          <RefreshCw className="w-5 h-5 text-indigo-600 dark:text-indigo-400 animate-spin shrink-0" />
          <div>
            <h4 className="text-sm font-bold text-indigo-950 dark:text-indigo-200">
              Verifying Stripe Payment...
            </h4>
            <p className="text-xs text-indigo-700 dark:text-indigo-300">
              Confirming transaction with Stripe API and synchronizing your account subscription.
            </p>
          </div>
        </div>
      )}

      {verificationState.status === 'success' && (
        <div className="p-6 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/60 text-emerald-600 dark:text-emerald-300 flex items-center justify-center shrink-0">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-extrabold text-emerald-950 dark:text-emerald-200">
                  Your plan is now active.
                </h3>
                <p className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
                  Thank you! Your payment was verified by Stripe. All limits and premium features for {currentPlan} are unlocked.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {onNavigateToDashboard && (
                <button
                  type="button"
                  id="btn-goto-dashboard-after-upgrade"
                  onClick={onNavigateToDashboard}
                  className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition shadow-sm"
                >
                  <LayoutDashboard className="w-4 h-4" />
                  <span>Go to Dashboard</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setVerificationState({ status: 'idle' })}
                className="px-3 py-2 rounded-xl border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 text-xs font-medium hover:bg-emerald-100/50"
              >
                Dismiss
              </button>
            </div>
          </div>
        </div>
      )}

      {verificationState.status === 'error' && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-rose-950 dark:text-rose-200">
                Payment Verification Notice
              </h4>
              <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5">
                {verificationState.message}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setVerificationState({ status: 'idle' })}
            className="text-xs text-rose-600 dark:text-rose-400 font-semibold hover:underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
            Subscription &amp; Billing
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Choose your plan, monitor quota usage, and manage your Stripe subscription safely.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => setShowSandbox(!showSandbox)}
            className="text-xs font-medium text-slate-600 dark:text-slate-400 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-lg transition-colors border border-slate-200 dark:border-slate-700"
          >
            {showSandbox ? 'Hide Test Controls' : 'Developer Sandbox'}
          </button>
          {details?.subscription.provider_customer_id && details.stripe_configured && (
            <button
              type="button"
              id="btn-stripe-portal"
              onClick={handleOpenPortal}
              disabled={actionLoading === 'portal'}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs transition-colors"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Stripe Customer Portal
            </button>
          )}
        </div>
      </div>

      {/* Stripe Status Callout: Clear & Honest */}
      {!details?.stripe_configured && (
        <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 flex items-start gap-3">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-xs text-amber-900 dark:text-amber-200">
            <span className="font-bold block text-sm mb-0.5">
              NOT CONFIGURED — Stripe credentials required for live checkout
            </span>
            <span>
              Real Stripe payments require <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded">STRIPE_SECRET_KEY</code> to be configured in your environment. You can use the Developer Sandbox below to preview different tier limits and feature gating safely.
            </span>
          </div>
        </div>
      )}

      {/* Developer Sandbox Plan Switcher (Explicitly Labeled) */}
      {showSandbox && (
        <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <Zap className="w-4 h-4 text-indigo-500" />
              Developer Sandbox (Testing Only - Does NOT charge cards)
            </span>
            <span className="text-slate-500 dark:text-slate-400">
              Stripe Integration:{' '}
              <strong className={details?.stripe_configured ? 'text-emerald-600' : 'text-amber-600'}>
                {details?.stripe_configured ? 'Live Stripe Configured' : 'Offline / Mock Testing'}
              </strong>
            </span>
          </div>
          <p className="text-slate-600 dark:text-slate-400 mb-3">
            Quickly test plan limits (Free: 5 clients, 10 invoices; Starter: 50 clients, 100 invoices; Growth: unlimited) and automated reminders without running live checkout transactions.
          </p>
          <div className="flex flex-wrap gap-2">
            {(['FREE', 'STARTER', 'GROWTH'] as PlanTier[]).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => handleDeveloperSandboxSwitch(p)}
                disabled={currentPlan === p || actionLoading === `sim-${p}`}
                className={`px-3 py-1.5 rounded-lg font-semibold transition-colors ${
                  currentPlan === p
                    ? 'bg-indigo-600 text-white cursor-default'
                    : 'bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border border-slate-300 dark:border-slate-700'
                }`}
              >
                Set Plan to {p} {currentPlan === p ? '(Active)' : ''}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Current Plan Overview & Resource Usage Banner */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Current Plan Card */}
        <div className="lg:col-span-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Plan</span>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-semibold uppercase tracking-wider ${
                  subStatus === 'active'
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800'
                    : subStatus === 'past_due'
                    ? 'bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                }`}
              >
                {subStatus}
              </span>
            </div>

            <div className="flex items-baseline gap-2 mb-1">
              <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white">
                {PLAN_CONFIGS[currentPlan]?.name}
              </h2>
              {currentPlan !== 'FREE' && (
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  ({details?.subscription.billing_interval || 'monthly'})
                </span>
              )}
            </div>

            <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">{PLAN_CONFIGS[currentPlan]?.tagline}</p>

            {details?.subscription.current_period_end && (
              <div className="bg-slate-50 dark:bg-slate-850 rounded-xl p-3 border border-slate-100 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-400 mb-4 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">Period Ends:</span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {new Date(details.subscription.current_period_end).toLocaleDateString()}
                  </span>
                </div>
                {details.subscription.cancel_at_period_end && (
                  <p className="text-amber-600 dark:text-amber-400 font-medium pt-1 border-t border-slate-200 dark:border-slate-800">
                    Will cancel at period end. Features remain active until then.
                  </p>
                )}
              </div>
            )}
          </div>

          {currentPlan !== 'FREE' && !details?.subscription.cancel_at_period_end && (
            <button
              type="button"
              onClick={handleCancelSubscription}
              disabled={actionLoading === 'cancel'}
              className="text-xs text-slate-500 hover:text-rose-600 dark:hover:text-rose-400 font-medium transition-colors text-center pt-2"
            >
              Cancel subscription at period end
            </button>
          )}
        </div>

        {/* Live Resource Usage Meters */}
        <div className="lg:col-span-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-xs flex flex-col justify-between transition-colors">
          <div>
            <h3 className="text-sm font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
              Active Plan Resource Consumption
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              Limits are authoritative and strictly enforced server-side according to your current tier.
            </p>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Clients Meter */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-850/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    Clients
                  </span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {usage?.client_count || 0} / {usage?.max_clients === null ? 'Unlimited' : usage?.max_clients}
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      usage?.max_clients && (usage.client_count / usage.max_clients) >= 1
                        ? 'bg-rose-500'
                        : (usage?.client_count || 0) > 0
                        ? 'bg-indigo-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    style={{
                      width: `${
                        usage?.max_clients
                          ? Math.min(100, Math.round(((usage.client_count || 0) / usage.max_clients) * 100))
                          : (usage?.client_count || 0) > 0
                          ? 25
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  {usage?.max_clients === null
                    ? 'No client limits on your current tier'
                    : `${Math.max(0, (usage?.max_clients ?? 5) - (usage?.client_count ?? 0))} client slots remaining`}
                </p>
              </div>

              {/* Invoices Meter */}
              <div className="border border-slate-100 dark:border-slate-800 rounded-xl p-4 bg-slate-50/50 dark:bg-slate-850/50">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-slate-500" />
                    Monthly Invoices
                  </span>
                  <span className="text-xs font-bold text-slate-900 dark:text-white">
                    {usage?.invoices_this_period || 0} /{' '}
                    {usage?.max_invoices_per_month === null ? 'Unlimited' : usage?.max_invoices_per_month}
                  </span>
                </div>
                <div className="w-full bg-slate-200 dark:bg-slate-800 rounded-full h-2 overflow-hidden">
                  <div
                    className={`h-2 rounded-full transition-all ${
                      usage?.max_invoices_per_month &&
                      (usage.invoices_this_period / usage.max_invoices_per_month) >= 1
                        ? 'bg-rose-500'
                        : (usage?.invoices_this_period || 0) > 0
                        ? 'bg-emerald-600'
                        : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                    style={{
                      width: `${
                        usage?.max_invoices_per_month
                          ? Math.min(
                              100,
                              Math.round(((usage.invoices_this_period || 0) / usage.max_invoices_per_month) * 100)
                            )
                          : (usage?.invoices_this_period || 0) > 0
                          ? 30
                          : 0
                      }%`,
                    }}
                  />
                </div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2">
                  {usage?.max_invoices_per_month === null
                    ? 'Unlimited invoice generation unlocked'
                    : `${Math.max(0, (usage?.max_invoices_per_month ?? 10) - (usage?.invoices_this_period ?? 0))} invoices left this cycle`}
                </p>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>Cycle Start: {new Date(usage?.period_start || Date.now()).toLocaleDateString()}</span>
            <span className="flex items-center gap-1 text-slate-700 dark:text-slate-300 font-medium">
              <Clock className="w-3.5 h-3.5 text-indigo-500" />
              Automated Reminders sent: {usage?.automated_reminders_count || 0}
            </span>
          </div>
        </div>
      </div>

      {/* Interval Selector Toggle */}
      <div className="flex flex-col items-center justify-center pt-4">
        <div className="inline-flex p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl">
          <button
            type="button"
            id="btn-billing-monthly"
            onClick={() => setBillingInterval('monthly')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all ${
              billingInterval === 'monthly'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            type="button"
            id="btn-billing-annual"
            onClick={() => setBillingInterval('annual')}
            className={`px-4 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 ${
              billingInterval === 'annual'
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>Annual Billing</span>
            <span className="bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[10px] font-extrabold px-1.5 py-0.5 rounded-full">
              Save ~17%
            </span>
          </button>
        </div>
      </div>

      {/* Pricing Matrix Tier Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* FREE PLAN */}
        <div
          className={`rounded-2xl border p-6 flex flex-col justify-between transition-all ${
            currentPlan === 'FREE'
              ? 'border-indigo-600 ring-2 ring-indigo-600/10 bg-white dark:bg-slate-900'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Free</h4>
              {currentPlan === 'FREE' && (
                <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
                  Current
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 min-h-[32px]">
              {PLAN_CONFIGS.FREE.tagline}
            </p>

            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-extrabold text-slate-900 dark:text-white">$0</span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">/forever</span>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Up to <strong>5 clients</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Up to <strong>10 invoices/month</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Invoice status &amp; overdue tracking</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Manual 3-tone reminders</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                <X className="w-4 h-4 shrink-0" />
                <span>No automated reminder cadence</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                <X className="w-4 h-4 shrink-0" />
                <span>No CSV data export</span>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <button
              type="button"
              disabled={currentPlan === 'FREE'}
              className={`w-full py-2.5 text-xs font-bold rounded-xl transition-colors border ${
                currentPlan === 'FREE'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border-slate-200 dark:border-slate-700 cursor-default'
                  : 'bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 border-slate-300 dark:border-slate-700'
              }`}
            >
              {currentPlan === 'FREE' ? 'Active Plan' : 'Free Tier'}
            </button>
          </div>
        </div>

        {/* STARTER PLAN */}
        <div
          className={`rounded-2xl border p-6 flex flex-col justify-between relative transition-all ${
            currentPlan === 'STARTER'
              ? 'border-indigo-600 ring-2 ring-indigo-600/20 bg-white dark:bg-slate-900 shadow-md'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-indigo-300 hover:shadow-sm'
          }`}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider px-3 py-0.5 rounded-full shadow-xs">
            Most Popular
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Starter</h4>
              {currentPlan === 'STARTER' && (
                <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
                  Current
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 min-h-[32px]">
              {PLAN_CONFIGS.STARTER.tagline}
            </p>

            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-extrabold text-slate-900 dark:text-white">
                ${billingInterval === 'annual' ? '7.50' : '9'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                /mo {billingInterval === 'annual' ? '(billed $90/yr)' : ''}
              </span>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Up to <strong>50 clients</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Up to <strong>100 invoices/month</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Automated overdue reminder cycles</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Full CSV export for accounting</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Complete reminder history</span>
              </div>
              <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
                <X className="w-4 h-4 shrink-0" />
                <span>No custom reminder cadences</span>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <button
              type="button"
              id="btn-upgrade-starter"
              onClick={() => handleUpgrade('STARTER')}
              disabled={currentPlan === 'STARTER' || actionLoading === 'STARTER'}
              className={`w-full py-2.5 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 ${
                currentPlan === 'STARTER'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-default'
                  : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-indigo-600/25'
              }`}
            >
              {actionLoading === 'STARTER' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : currentPlan === 'STARTER' ? (
                'Current Plan'
              ) : (
                <>
                  <span>Upgrade to Starter</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>

        {/* GROWTH PLAN */}
        <div
          className={`rounded-2xl border p-6 flex flex-col justify-between transition-all ${
            currentPlan === 'GROWTH'
              ? 'border-indigo-600 ring-2 ring-indigo-600/20 bg-white dark:bg-slate-900 shadow-md'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div>
            <div className="flex justify-between items-center mb-2">
              <h4 className="text-lg font-bold text-slate-900 dark:text-white">Growth</h4>
              {currentPlan === 'GROWTH' && (
                <span className="text-[11px] font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200 dark:border-indigo-800 px-2 py-0.5 rounded-full">
                  Current
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-4 min-h-[32px]">
              {PLAN_CONFIGS.GROWTH.tagline}
            </p>

            <div className="flex items-baseline gap-1 mb-6">
              <span className="text-4xl font-extrabold text-slate-900 dark:text-white">
                ${billingInterval === 'annual' ? '24.16' : '29'}
              </span>
              <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                /mo {billingInterval === 'annual' ? '(billed $290/yr)' : ''}
              </span>
            </div>

            <div className="space-y-3 pt-4 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-700 dark:text-slate-300">
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span><strong>Unlimited clients</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span><strong>Unlimited invoices</strong></span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Custom reminder schedules &amp; cadences</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Full CSV export</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Unrestricted activity history</span>
              </div>
              <div className="flex items-center gap-2">
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>Priority support designation</span>
              </div>
            </div>
          </div>

          <div className="mt-8">
            <button
              type="button"
              id="btn-upgrade-growth"
              onClick={() => handleUpgrade('GROWTH')}
              disabled={currentPlan === 'GROWTH' || actionLoading === 'GROWTH'}
              className={`w-full py-2.5 text-xs font-bold rounded-xl transition-all shadow-xs flex items-center justify-center gap-1.5 ${
                currentPlan === 'GROWTH'
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700 cursor-default'
                  : 'bg-slate-900 hover:bg-slate-800 dark:bg-white dark:hover:bg-slate-100 dark:text-slate-900 text-white'
              }`}
            >
              {actionLoading === 'GROWTH' ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : currentPlan === 'GROWTH' ? (
                'Current Plan'
              ) : (
                <>
                  <span>Upgrade to Growth</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Security and Stripe Info */}
      <div className="bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-slate-600 dark:text-slate-400 transition-colors">
        <div className="flex items-center gap-3">
          <ShieldCheck className="w-6 h-6 text-emerald-600 shrink-0" />
          <div>
            <p className="font-semibold text-slate-800 dark:text-slate-200">
              Secure Payments &amp; Immediate Upgrades
            </p>
            <p className="text-slate-500 dark:text-slate-400">
              Official Stripe Checkout handles cards directly. Raw card data is never stored on Receipto servers.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-slate-400" />
          <span className="font-medium text-slate-700 dark:text-slate-300">
            Visa, Mastercard, Amex, Apple Pay, Google Pay
          </span>
        </div>
      </div>
    </div>
  );
}
