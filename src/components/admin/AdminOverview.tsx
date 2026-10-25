import React from 'react';
import {
  Users,
  CreditCard,
  Activity,
  DollarSign,
  FileText,
  Database,
} from 'lucide-react';
import type { AdminDashboardStats } from '../../types';

interface AdminOverviewProps {
  stats: AdminDashboardStats | null;
}

export const AdminOverview: React.FC<AdminOverviewProps> = ({ stats }) => {
  if (!stats) {
    return (
      <div className="text-center py-12 text-slate-500 dark:text-slate-400">
        Loading operational metrics...
      </div>
    );
  }

  return (
    <div className="space-y-6" id="admin-view-overview">
      {/* Metric Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Users Metric */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Accounts</span>
            <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">
            {stats.total_users}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {stats.verified_users} verified
            </span>
            •
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {stats.unverified_users} unverified
            </span>
          </div>
        </div>

        {/* Subscriptions Metric */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Active Subscriptions</span>
            <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
            {stats.active_subscriptions}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            {stats.starter_users} Starter • {stats.growth_users} Growth
          </div>
        </div>

        {/* Invoices Metric */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Total Invoices</span>
            <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-3xl font-bold text-slate-900 dark:text-white">
            {stats.total_invoices}
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {stats.paid_invoices} paid
            </span>
            •
            <span className="text-amber-600 dark:text-amber-400 font-medium">
              {stats.overdue_invoices} overdue
            </span>
          </div>
        </div>

        {/* System Diagnostics Metric */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
            <span className="text-xs font-semibold uppercase tracking-wider">Engine & Health</span>
            <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-xl font-bold text-slate-900 dark:text-white uppercase">
              {stats.system_health.database}
            </span>
          </div>
          <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
            Worker: {stats.system_health.worker}
          </div>
        </div>
      </div>

      {/* Tier Distribution & Quick Details */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Subscription Plan Breakdown
          </h3>
          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-slate-700 dark:text-slate-300">Free Tier</span>
                <span className="text-slate-500 dark:text-slate-400 font-semibold">{stats.free_users} users</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-slate-400 dark:bg-slate-500 rounded-full"
                  style={{
                    width: `${stats.total_users ? (stats.free_users / stats.total_users) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-indigo-600 dark:text-indigo-400">Starter Plan ($9/mo)</span>
                <span className="text-slate-500 dark:text-slate-400 font-semibold">{stats.starter_users} users</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full"
                  style={{
                    width: `${stats.total_users ? (stats.starter_users / stats.total_users) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>

            <div>
              <div className="flex justify-between text-sm mb-1">
                <span className="font-medium text-purple-600 dark:text-purple-400">Growth Plan ($24/mo)</span>
                <span className="text-slate-500 dark:text-slate-400 font-semibold">{stats.growth_users} users</span>
              </div>
              <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-purple-600 dark:bg-purple-500 rounded-full"
                  style={{
                    width: `${stats.total_users ? (stats.growth_users / stats.total_users) * 100 : 0}%`,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
          <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Operational Summary
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Total Invoices Tracked</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {stats.total_invoices} invoices
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Paid Invoices Count</span>
              <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.paid_invoices}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Overdue Invoices Count</span>
              <span className="font-semibold text-amber-600 dark:text-amber-400">{stats.overdue_invoices}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500 dark:text-slate-400">Automated Reminders Sent</span>
              <span className="font-semibold text-slate-900 dark:text-white">{stats.reminders_sent}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
