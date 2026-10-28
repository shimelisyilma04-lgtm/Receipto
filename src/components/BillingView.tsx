import React, { useState, useEffect } from 'react';
import {
  CreditCard,
  CheckCircle2,
  Sparkles,
  RefreshCw,
  ExternalLink,
  X,
  AlertTriangle,
  LayoutDashboard,
} from 'lucide-react';
import type { SubscriptionDetails, SubscriptionUsage } from '../types.js';
import { PLAN_CONFIGS, type PlanTier, type BillingInterval, isPaidSubscriptionActive } from '../plans.js';
import { api } from '../api.js';
import { PlanQuotaGrid } from './billing/PlanQuotaGrid.js';
import { PlanCardsGrid } from './billing/PlanCardsGrid.js';
import { SandboxDevPanel } from './billing/SandboxDevPanel.js';

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
    const billingSuccess = params.get('billing_success');
    const billingCancelled = params.get('billing_cancelled');
    const sessionId = params.get('session_id');
    const plan = (params.get('plan') as PlanTier) || 'STARTER';
    const interval = (params.get('interval') as BillingInterval) || 'monthly';

    if (billingSuccess === 'true' && sessionId) {
      verifyStripeSession(sessionId, plan, interval);
    } else if (billingSuccess === 'true') {
      onShowToast('Payment received! Your subscription is active.', 'success');
      window.history.replaceState({}, document.title, window.location.pathname);
      loadSubscription();
    } else if (billingCancelled === 'true') {
      onShowToast('Stripe checkout was cancelled. You can upgrade anytime.', 'info');
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function verifyStripeSession(sessionId: string, plan: PlanTier, interval: BillingInterval) {
    try {
      setVerificationState({
        status: 'verifying',
        message: 'Verifying payment with Stripe...',
      });

      const res = await api.confirmSession({
        session_id: sessionId,
        plan,
        interval,
      });

      if (res) {
        setVerificationState({
          status: 'success',
          message: `Your subscription to ${plan} is confirmed and active!`,
        });
        setDetails(res);
        onShowToast(`Subscribed to ${plan}! Premium features unlocked.`, 'success');
        onSubscriptionUpdated?.();
      }
    } catch (err: any) {
      console.error('[Stripe Session Verification Error]', err);
      setVerificationState({
        status: 'error',
        message: err.message || 'Payment confirmation failed. Please refresh or contact support.',
      });
      onShowToast(err.message || 'Payment verification failed.', 'error');
    } finally {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }

  async function loadSubscription() {
    try {
      setLoading(true);
      const res = await api.getSubscription();
      setDetails(res);
    } catch (err: any) {
      console.error('Failed to load subscription:', err);
      onShowToast(err.message || 'Failed to load subscription details.', 'error');
    } finally {
      setLoading(false);
    }
  }

  async function handleUpgrade(targetPlan: 'STARTER' | 'GROWTH') {
    if (actionLoading) return;
    try {
      setActionLoading(targetPlan);

      const res = await api.createCheckoutSession(targetPlan, billingInterval);

      if (res?.url) {
        // Redirect directly to Stripe Checkout
        window.location.href = res.url;
        return;
      }

      // If simulated / test response without external URL
      if (res?.checkout_params) {
        onShowToast(
          res.message || `Stripe test checkout initiated for ${targetPlan} (${billingInterval}).`,
          'info'
        );
        if (res.url) {
          window.location.href = res.url;
        }
      }
    } catch (err: any) {
      console.error('[Stripe Checkout Error]', err);
      onShowToast(err.message || 'Failed to initiate Stripe checkout', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleOpenCustomerPortal() {
    try {
      setActionLoading('portal');
      const res = await api.createCustomerPortalSession();
      if (res?.url) {
        window.location.href = res.url;
      } else {
        onShowToast(res.message || 'Stripe Customer Portal is not available for this account.', 'info');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Could not open billing portal.', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleCancelSubscription() {
    if (!window.confirm('Are you sure you want to cancel your subscription? Your access will continue until the end of your billing cycle.')) {
      return;
    }
    try {
      setActionLoading('cancel');
      const res = await api.cancelSubscription();
      onShowToast(res.message || 'Subscription cancelled.', 'info');
      await loadSubscription();
      onSubscriptionUpdated?.();
    } catch (err: any) {
      onShowToast(err.message || 'Failed to cancel subscription.', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleOwnerDemoSwitch(plan: PlanTier) {
    try {
      setActionLoading(`owner-${plan}`);
      const res = await api.switchOwnerDemoPlan(plan);
      setDetails(res);
      onShowToast(`Switched account plan to ${plan} via demo controls.`, 'success');
      onSubscriptionUpdated?.();
    } catch (err: any) {
      onShowToast(err.message || 'Failed to switch demo plan.', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  async function handleSimulatePlan(plan: PlanTier) {
    try {
      setActionLoading(`sim-${plan}`);
      const res = await api.simulatePlan(plan, billingInterval);
      setDetails(res);
      onShowToast(`Switched plan to ${plan} (${billingInterval}) in sandbox mode.`, 'success');
      onSubscriptionUpdated?.();
    } catch (err: any) {
      onShowToast(err.message || 'Failed to simulate plan change.', 'error');
    } finally {
      setActionLoading(null);
    }
  }

  if (loading && !details) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-500 dark:text-slate-400">
        <RefreshCw className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
        <p className="text-sm font-medium">Loading subscription &amp; quota details...</p>
      </div>
    );
  }

  const currentPlan = details?.subscription?.plan || 'FREE';
  const isPaid = currentPlan !== 'FREE' && isPaidSubscriptionActive(details?.subscription?.status || 'active', details?.subscription?.current_period_end);
  const usage: SubscriptionUsage = details?.usage || {
    client_count: 0,
    max_clients: 5,
    clients_remaining: 5,
    invoices_this_period: 0,
    max_invoices_per_month: 10,
    invoices_remaining: 10,
    period_start: new Date().toISOString(),
    period_end: null,
    automated_reminders_count: 0,
  };

  return (
    <div className="space-y-8 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
      {/* Verification Banner if returning from checkout */}
      {verificationState.status === 'verifying' && (
        <div className="rounded-2xl border border-indigo-200 dark:border-indigo-800 bg-indigo-50/80 dark:bg-indigo-950/40 p-6 flex items-center gap-4">
          <RefreshCw className="w-6 h-6 animate-spin text-indigo-600 dark:text-indigo-400 shrink-0" />
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-white text-base">Verifying Stripe Payment...</h3>
            <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
              Confirming transaction with Stripe and synchronizing your account subscription.
            </p>
          </div>
        </div>
      )}

      {verificationState.status === 'success' && (
        <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50/80 dark:bg-emerald-950/40 p-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white text-base">Payment Verified Successfully</h3>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-0.5">
                Thank you! Your payment was verified by Stripe. All limits and premium features for {currentPlan} are active.
              </p>
            </div>
          </div>
          <button
            onClick={() => setVerificationState({ status: 'idle' })}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      )}

      {/* Header section */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-6 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
            <CreditCard className="w-7 h-7 text-indigo-600 dark:text-indigo-400" />
            <span>Subscription &amp; Plans</span>
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your Stripe billing, monitor client &amp; invoice quotas, and upgrade your tier.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {onNavigateToDashboard && (
            <button
              onClick={onNavigateToDashboard}
              className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 rounded-xl transition"
            >
              <LayoutDashboard className="w-4 h-4" />
              <span>Dashboard</span>
            </button>
          )}

          {isPaid && (
            <button
              onClick={handleOpenCustomerPortal}
              disabled={actionLoading === 'portal'}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-500 rounded-xl shadow-sm transition"
            >
              <ExternalLink className="w-4 h-4" />
              <span>Stripe Customer Portal</span>
            </button>
          )}
        </div>
      </div>

      {/* Owner Demo Controls (if authorized) */}
      {details?.is_owner_demo && (
        <div className="rounded-2xl border border-purple-200 dark:border-purple-900 bg-purple-50/70 dark:bg-purple-950/30 p-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2 text-purple-700 dark:text-purple-300 font-bold text-sm">
              <Sparkles className="w-4 h-4" />
              <span>Owner Demo Controls Active</span>
            </div>
            <span className="text-xs bg-purple-200 dark:bg-purple-800 text-purple-900 dark:text-purple-100 px-2 py-0.5 rounded-full font-semibold">
              Instant Tier Switching
            </span>
          </div>
          <p className="text-xs text-slate-600 dark:text-slate-300 mb-3">
            As the verified owner account, you can test Receipto under any plan tier without creating real Stripe charges.
          </p>
          <div className="flex flex-wrap gap-2">
            {(['FREE', 'STARTER', 'GROWTH'] as PlanTier[]).map((p) => (
              <button
                key={p}
                onClick={() => handleOwnerDemoSwitch(p)}
                disabled={actionLoading === `owner-${p}` || currentPlan === p}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition ${
                  currentPlan === p
                    ? 'bg-purple-600 text-white shadow-sm'
                    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                }`}
              >
                {currentPlan === p ? `Active: ${p}` : `Switch to ${p}`}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Stripe Status Notice if unconfigured */}
      {!details?.stripe_configured && (
        <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-950/30 p-5 flex items-start gap-3.5">
          <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div className="text-sm">
            <h4 className="font-semibold text-slate-900 dark:text-white">Stripe Setup Mode Active</h4>
            <p className="text-slate-600 dark:text-slate-300 mt-1">
              Live payments require configuring <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded text-xs">STRIPE_SECRET_KEY</code> and <code className="font-mono bg-amber-100 dark:bg-amber-900/60 px-1 py-0.5 rounded text-xs">STRIPE_PUBLISHABLE_KEY</code> in your environment.
              You can test the checkout flow safely using the Developer Sandbox or Owner Controls.
            </p>
          </div>
        </div>
      )}

      {/* Current Subscription Status Card */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-slate-100 dark:border-slate-800">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Current Plan</span>
            <div className="flex items-center gap-3 mt-1">
              <h2 className="text-2xl font-black text-slate-900 dark:text-white">{PLAN_CONFIGS[currentPlan]?.name || currentPlan}</h2>
              <span
                className={`text-xs px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                  details?.subscription?.status === 'active'
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/70 dark:text-emerald-400'
                    : details?.subscription?.status === 'past_due'
                    ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/70 dark:text-amber-400'
                    : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                }`}
              >
                {details?.subscription?.status || 'active'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Provider: <span className="font-semibold text-slate-700 dark:text-slate-300">Stripe</span> &bull; Interval: {details?.subscription?.billing_interval || 'monthly'}
            </p>
          </div>

          {isPaid && (
            <div className="flex items-center gap-2">
              <button
                onClick={handleCancelSubscription}
                disabled={actionLoading === 'cancel'}
                className="px-3.5 py-2 text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-xl transition"
              >
                Cancel Subscription
              </button>
            </div>
          )}
        </div>

        {/* Quota Usage Grid */}
        <PlanQuotaGrid usage={usage} currentPlan={currentPlan} />
      </div>

      {/* Pricing Interval Switcher */}
      <div className="flex flex-col items-center gap-3 pt-4">
        <div className="inline-flex items-center p-1.5 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setBillingInterval('monthly')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition ${
              billingInterval === 'monthly'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            Monthly Billing
          </button>
          <button
            onClick={() => setBillingInterval('annual')}
            className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-semibold transition flex items-center gap-1.5 ${
              billingInterval === 'annual'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white'
            }`}
          >
            <span>Annual Billing</span>
            <span className="px-1.5 py-0.5 text-[10px] font-bold rounded-md bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300">
              Save 20%
            </span>
          </button>
        </div>
      </div>

      {/* Plan Cards Grid */}
      <PlanCardsGrid
        currentPlan={currentPlan}
        billingInterval={billingInterval}
        actionLoading={actionLoading}
        onUpgrade={handleUpgrade}
      />

      {/* Developer Sandbox Drawer */}
      <SandboxDevPanel
        showSandbox={showSandbox}
        onToggleSandbox={() => setShowSandbox(!showSandbox)}
        onSimulatePlan={handleSimulatePlan}
      />
    </div>
  );
}
