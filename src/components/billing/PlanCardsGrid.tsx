import React from 'react';
import { Check, X, RefreshCw, ArrowRight } from 'lucide-react';
import type { PlanTier, BillingInterval } from '../../plans.js';

interface PlanCardsGridProps {
  currentPlan: PlanTier;
  billingInterval: BillingInterval;
  actionLoading: string | null;
  onUpgrade: (plan: 'STARTER' | 'GROWTH') => void;
}

export function PlanCardsGrid({
  currentPlan,
  billingInterval,
  actionLoading,
  onUpgrade,
}: PlanCardsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
      {/* FREE PLAN */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Free Tier</span>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">Starter Free</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[32px]">
            Ideal for solo freelancers getting started with invoice tracking.
          </p>
          <div className="mt-4 mb-6">
            <span className="text-4xl font-extrabold text-slate-900 dark:text-white">$0</span>
            <span className="text-xs text-slate-400 ml-1">/ forever</span>
          </div>
          <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Up to 5 active clients</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Up to 10 invoices per month</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Manual 1-click email reminders</span>
            </li>
            <li className="flex items-center gap-2 text-slate-400">
              <X className="w-4 h-4 text-slate-400 shrink-0" />
              <span>No automated background reminders</span>
            </li>
            <li className="flex items-center gap-2 text-slate-400">
              <X className="w-4 h-4 text-slate-400 shrink-0" />
              <span>No CSV data export</span>
            </li>
          </ul>
        </div>
        <button
          disabled
          className="w-full mt-6 py-2.5 px-4 rounded-xl text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-default"
        >
          {currentPlan === 'FREE' ? 'Current Plan' : 'Free Tier'}
        </button>
      </div>

      {/* STARTER PLAN */}
      <div className="rounded-2xl border-2 border-indigo-600 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between relative shadow-lg shadow-indigo-600/10">
        <div className="absolute -top-3 right-6 bg-indigo-600 text-white text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full">
          Most Popular
        </div>
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Growth Tier</span>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">Starter</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[32px]">
            For growing small businesses needing hands-free follow-ups.
          </p>
          <div className="mt-4 mb-6">
            <span className="text-4xl font-extrabold text-slate-900 dark:text-white">
              {billingInterval === 'annual' ? '$15' : '$19'}
            </span>
            <span className="text-xs text-slate-400 ml-1">
              {billingInterval === 'annual' ? '/mo (billed annually)' : '/month'}
            </span>
          </div>
          <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Up to 50 active clients</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Up to 100 invoices per period</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Automated scheduled reminders</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>CSV accounting export (QuickBooks/Xero)</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Priority email support</span>
            </li>
          </ul>
        </div>
        <button
          onClick={() => onUpgrade('STARTER')}
          disabled={currentPlan === 'STARTER' || actionLoading === 'STARTER'}
          className={`w-full mt-6 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            currentPlan === 'STARTER'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-default'
              : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/20'
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

      {/* GROWTH PLAN */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 flex flex-col justify-between">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-purple-600 dark:text-purple-400">Scale Tier</span>
          <h3 className="text-2xl font-black text-slate-900 dark:text-white mt-1">Growth</h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 min-h-[32px]">
            Unlimited clients, high-volume automated invoicing, and scale features.
          </p>
          <div className="mt-4 mb-6">
            <span className="text-4xl font-extrabold text-slate-900 dark:text-white">
              {billingInterval === 'annual' ? '$39' : '$49'}
            </span>
            <span className="text-xs text-slate-400 ml-1">
              {billingInterval === 'annual' ? '/mo (billed annually)' : '/month'}
            </span>
          </div>
          <ul className="space-y-2.5 text-xs text-slate-600 dark:text-slate-300">
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Unlimited clients</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Unlimited invoices</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Fully automated 3-tone reminders</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Full audit history log access</span>
            </li>
            <li className="flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span>Dedicated account support</span>
            </li>
          </ul>
        </div>
        <button
          onClick={() => onUpgrade('GROWTH')}
          disabled={currentPlan === 'GROWTH' || actionLoading === 'GROWTH'}
          className={`w-full mt-6 py-2.5 px-4 rounded-xl text-xs font-bold transition flex items-center justify-center gap-2 ${
            currentPlan === 'GROWTH'
              ? 'bg-slate-100 dark:bg-slate-800 text-slate-500 cursor-default'
              : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 hover:bg-slate-800 dark:hover:bg-slate-100 shadow-md'
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
  );
}
