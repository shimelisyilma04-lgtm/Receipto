import React from 'react';
import {
  DollarSign,
  AlertTriangle,
  CheckCircle,
  FileText,
  Plus,
  Send,
  Users,
  ArrowRight,
  Clock,
  Sparkles,
} from 'lucide-react';
import type { DashboardStats, Invoice } from '../types.js';

interface DashboardViewProps {
  stats: DashboardStats | null;
  loading: boolean;
  onNavigate: (tab: any) => void;
  onOpenCreateInvoice: () => void;
  onOpenCreateClient: () => void;
  onSendReminder: (invoice: Invoice) => void;
  onMarkPaid: (invoiceId: string) => void;
}

export function DashboardView({
  stats,
  loading,
  onNavigate,
  onOpenCreateInvoice,
  onOpenCreateClient,
  onSendReminder,
  onMarkPaid,
}: DashboardViewProps) {
  if (loading) {
    return (
      <div className="py-12 flex justify-center items-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  const outstanding = stats?.total_outstanding || 0;
  const overdue = stats?.total_overdue || 0;
  const paid = stats?.total_paid || 0;
  const counts = stats?.invoice_counts || { total: 0, unpaid: 0, overdue: 0, paid: 0, cancelled: 0 };
  const urgentInvoices = stats?.urgent_invoices || [];
  const recentActivity = stats?.recent_activity || [];

  return (
    <div className="space-y-8">
      {/* Top Banner & Quick Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200 dark:border-slate-800 transition-colors">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">Revenue & Overdue Command Center</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Track who owes you money, pinpoint overdue balances, and dispatch instant payment reminders.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            id="btn-quick-client"
            onClick={onOpenCreateClient}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-sm font-medium transition shadow-xs"
          >
            <Users className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <span>Add Client</span>
          </button>
          <button
            id="btn-quick-invoice"
            onClick={onOpenCreateInvoice}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>New Invoice</span>
          </button>
        </div>
      </div>

      {/* 4 Core Financial Metrics */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Outstanding */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Total Outstanding</span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              ${outstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {counts.unpaid + counts.overdue} pending invoice{counts.unpaid + counts.overdue === 1 ? '' : 's'}
            </p>
          </div>
        </div>

        {/* Overdue Amount (Critical Alert Card) */}
        <div className={`p-5 rounded-2xl border transition ${
          overdue > 0
            ? 'bg-rose-50/70 dark:bg-rose-950/30 border-rose-200 dark:border-rose-900/60 text-rose-900 dark:text-rose-100 shadow-xs'
            : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 shadow-xs'
        }`}>
          <div className="flex items-center justify-between">
            <span className={`text-xs font-semibold uppercase tracking-wider ${
              overdue > 0 ? 'text-rose-700 dark:text-rose-400 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}>
              Overdue Amount
            </span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
              overdue > 0 ? 'bg-rose-100 dark:bg-rose-900/60 text-rose-700 dark:text-rose-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400'
            }`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className={`text-2xl font-bold ${overdue > 0 ? 'text-rose-700 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
              ${overdue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <p className={`text-xs mt-1 ${overdue > 0 ? 'text-rose-600 dark:text-rose-400 font-medium' : 'text-slate-500 dark:text-slate-400'}`}>
              {counts.overdue} overdue invoice{counts.overdue === 1 ? '' : 's'} requiring follow-up
            </p>
          </div>
        </div>

        {/* Total Collected / Paid */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Collected Revenue</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">
              ${paid.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {counts.paid} paid invoice{counts.paid === 1 ? '' : 's'} to date
            </p>
          </div>
        </div>

        {/* Active Invoices & Clients */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-slate-300 dark:hover:border-slate-700 transition">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">Portfolio</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-2xl font-bold text-slate-900 dark:text-white">{counts.total}</span>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Across {stats?.client_count || 0} registered client{(stats?.client_count || 0) === 1 ? '' : 's'}
            </p>
          </div>
        </div>
      </div>

      {/* Urgent Attention: Overdue Invoices Requiring Reminders */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800/80 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className={`w-2.5 h-2.5 rounded-full ${overdue > 0 ? 'bg-rose-500 animate-pulse' : 'bg-emerald-500'}`} />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              {overdue > 0 ? 'Priority Action: Overdue Accounts' : 'Payment Status Check'}
            </h2>
          </div>
          <button
            onClick={() => onNavigate('invoices')}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 flex items-center gap-1"
          >
            <span>View All Invoices</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {urgentInvoices.length > 0 ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {urgentInvoices.map((inv) => (
              <div key={inv.id} className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-900 dark:text-white">#{inv.invoice_number}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full font-bold bg-rose-100 dark:bg-rose-950 border border-rose-200 dark:border-rose-900 text-rose-800 dark:text-rose-300">
                      OVERDUE
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400">Due {inv.due_date}</span>
                  </div>
                  <p className="text-sm text-slate-600 dark:text-slate-300">
                    Client: <span className="font-medium text-slate-900 dark:text-white">{inv.client_name}</span>
                    {inv.client_company && <span className="text-slate-500 dark:text-slate-400"> ({inv.client_company})</span>}
                  </p>
                </div>

                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <div className="text-lg font-bold text-rose-600 dark:text-rose-400">
                      ${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400">{inv.currency}</div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      id={`btn-mark-paid-${inv.id}`}
                      onClick={() => onMarkPaid(inv.id)}
                      className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
                      title="Mark as Paid"
                    >
                      Mark Paid
                    </button>
                    <button
                      id={`btn-send-reminder-${inv.id}`}
                      onClick={() => onSendReminder(inv)}
                      className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition shadow-xs"
                      title="Send payment reminder email"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>Send Reminder</span>
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="p-8 text-center">
            <div className="w-12 h-12 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mx-auto mb-3">
              <Sparkles className="w-6 h-6" />
            </div>
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">Zero Overdue Invoices</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-1">
              All your client accounts are currently in good standing or fully paid. Great job!
            </p>
          </div>
        )}
      </div>

      {/* Recent Activity Audit Feed */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs p-5 transition">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800/80">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Recent Activity Log</h2>
          </div>
          <button
            onClick={() => onNavigate('activity')}
            className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300"
          >
            Full Audit Trail &rarr;
          </button>
        </div>

        {recentActivity.length > 0 ? (
          <div className="mt-4 space-y-3">
            {recentActivity.map((log) => (
              <div key={log.id} className="flex items-start gap-3 text-sm">
                <div className="w-2 h-2 rounded-full bg-indigo-500 mt-2 shrink-0" />
                <div className="flex-1">
                  <p className="text-slate-800 dark:text-slate-200 font-medium leading-snug">{log.details}</p>
                  <span className="text-xs text-slate-500 dark:text-slate-400">
                    {new Date(log.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400 py-4 text-center">No activity recorded yet.</p>
        )}
      </div>
    </div>
  );
}
