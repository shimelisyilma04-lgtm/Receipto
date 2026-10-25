import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { AdminSubscriptionItem } from '../../types';

interface AdminSubscriptionsProps {
  subscriptions: AdminSubscriptionItem[];
  subsTotal: number;
  subsPage: number;
  subsTotalPages: number;
  loading: boolean;
  onPageChange: (p: number) => void;
}

export const AdminSubscriptions: React.FC<AdminSubscriptionsProps> = ({
  subscriptions,
  subsTotal,
  subsPage,
  subsTotalPages,
  loading,
  onPageChange,
}) => {
  return (
    <div className="space-y-4" id="admin-view-subscriptions">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm" id="admin-subscriptions-table">
            <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
              <tr>
                <th className="px-5 py-3.5">Subscriber</th>
                <th className="px-4 py-3.5">Plan Tier</th>
                <th className="px-4 py-3.5">Billing Cadence</th>
                <th className="px-4 py-3.5">Status</th>
                <th className="px-4 py-3.5">Provider</th>
                <th className="px-4 py-3.5">Period End</th>
                <th className="px-4 py-3.5">Provider ID</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
              {subscriptions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                    {loading ? 'Loading subscriptions...' : 'No subscriptions recorded.'}
                  </td>
                </tr>
              ) : (
                subscriptions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                    <td className="px-5 py-3.5">
                      <div className="font-semibold text-slate-900 dark:text-white">
                        {sub.user_name}
                      </div>
                      <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                        {sub.user_email}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          sub.plan === 'GROWTH'
                            ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300'
                            : sub.plan === 'STARTER'
                            ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {sub.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs capitalize text-slate-600 dark:text-slate-400">
                      {sub.billing_interval || 'monthly'}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          sub.status === 'active'
                            ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                            : sub.status === 'past_due'
                            ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                        }`}
                      >
                        {sub.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400">
                      {sub.provider || 'local'}
                    </td>
                    <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                      {sub.current_period_end
                        ? new Date(sub.current_period_end).toLocaleDateString()
                        : 'N/A'}
                    </td>
                    <td className="px-4 py-3.5 text-xs font-mono text-slate-400 dark:text-slate-500">
                      {sub.provider_subscription_id ? sub.provider_subscription_id.slice(0, 16) + '...' : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Controls */}
        {subsTotalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Showing page {subsPage} of {subsTotalPages} ({subsTotal} total subscriptions)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={subsPage <= 1}
                onClick={() => onPageChange(Math.max(1, subsPage - 1))}
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={subsPage >= subsTotalPages}
                onClick={() => onPageChange(subsPage + 1)}
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
