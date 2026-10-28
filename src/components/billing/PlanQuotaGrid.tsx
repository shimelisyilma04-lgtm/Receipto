import React from 'react';
import { Users, FileText, Clock } from 'lucide-react';
import type { SubscriptionUsage } from '../../types.js';
import { PLAN_CONFIGS, type PlanTier } from '../../plans.js';

interface PlanQuotaGridProps {
  usage: SubscriptionUsage;
  currentPlan: PlanTier;
}

export function PlanQuotaGrid({ usage, currentPlan }: PlanQuotaGridProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 pt-6">
      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span className="flex items-center gap-1.5 font-medium">
            <Users className="w-4 h-4 text-indigo-500" />
            <span>Clients</span>
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {usage.client_count} / {usage.max_clients !== null ? usage.max_clients : 'Unlimited'}
          </span>
        </div>
        {usage.max_clients !== null && (
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                usage.client_count >= usage.max_clients ? 'bg-rose-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.min(100, (usage.client_count / usage.max_clients) * 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span className="flex items-center gap-1.5 font-medium">
            <FileText className="w-4 h-4 text-indigo-500" />
            <span>Invoices</span>
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {usage.invoices_this_period} / {usage.max_invoices_per_month !== null ? usage.max_invoices_per_month : 'Unlimited'}
          </span>
        </div>
        {usage.max_invoices_per_month !== null && (
          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
            <div
              className={`h-full transition-all duration-300 ${
                usage.invoices_this_period >= usage.max_invoices_per_month ? 'bg-rose-500' : 'bg-indigo-600'
              }`}
              style={{ width: `${Math.min(100, (usage.invoices_this_period / usage.max_invoices_per_month) * 100)}%` }}
            />
          </div>
        )}
      </div>

      <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/60 dark:border-slate-700/60 sm:col-span-2 lg:col-span-1">
        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mb-2">
          <span className="flex items-center gap-1.5 font-medium">
            <Clock className="w-4 h-4 text-indigo-500" />
            <span>Automated Reminders</span>
          </span>
          <span className="font-bold text-slate-900 dark:text-white">
            {PLAN_CONFIGS[currentPlan]?.features.automatedReminders ? 'Enabled' : 'Free: Manual Only'}
          </span>
        </div>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
          {PLAN_CONFIGS[currentPlan]?.features.automatedReminders
            ? 'Automated background cron runs daily.'
            : 'Upgrade to Starter to schedule hands-free reminders.'}
        </p>
      </div>
    </div>
  );
}
