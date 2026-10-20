import React, { useState, useEffect } from 'react';
import {
  BellRing,
  Send,
  AlertTriangle,
  CheckCircle,
  Clock,
  Mail,
  RefreshCw,
  Info,
  Sparkles,
  Zap,
  Lock,
} from 'lucide-react';
import type { Invoice, Reminder } from '../types.js';
import type { PlanTier } from '../plans.js';
import { api } from '../api.js';

interface RemindersViewProps {
  invoices: Invoice[];
  onOpenSendReminder: (inv: Invoice) => void;
  onMarkPaid: (id: string) => void;
  plan?: PlanTier;
  onPromptUpgrade?: (title: string, message: string, feature: string) => void;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export function RemindersView({
  invoices,
  onOpenSendReminder,
  onMarkPaid,
  plan = 'FREE',
  onPromptUpgrade,
  onShowToast,
}: RemindersViewProps) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [automating, setAutomating] = useState(false);

  // Filter invoices that need reminders: OVERDUE or UNPAID
  const actionableInvoices = invoices.filter(
    (i) => i.payment_status === 'OVERDUE' || i.payment_status === 'UNPAID'
  );

  useEffect(() => {
    loadReminders();
  }, []);

  async function loadReminders() {
    try {
      setLoading(true);
      const res = await api.getReminders();
      setReminders(res.reminders);
    } catch (err: any) {
      console.error('Failed to load reminders', err);
    } finally {
      setLoading(false);
    }
  }

  async function handleRunAutomation() {
    if (plan === 'FREE') {
      onPromptUpgrade?.(
        'Automated Reminders Require Starter Plan',
        'Automatic overdue email cycles run scheduled follow-ups without manual clicking. Upgrade to Starter or Growth to enable automated background dispatches.',
        'automatedReminders'
      );
      return;
    }

    try {
      setAutomating(true);
      const res = await api.runAutomatedReminders();
      onShowToast?.(res.message, 'success');
      await loadReminders();
    } catch (err: any) {
      onShowToast?.(err.message || 'Failed to run automated cycle', 'error');
    } finally {
      setAutomating(false);
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Payment Reminders Hub</h1>
          <p className="text-sm text-slate-500 mt-1">
            Dispatch automated email reminders, follow up on overdue accounts, and review delivery logs.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleRunAutomation}
            disabled={automating}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 border border-indigo-200 text-indigo-700 hover:bg-indigo-100 text-xs font-semibold transition shadow-xs"
            title={plan === 'FREE' ? 'Upgrade to enable automatic cycles' : 'Run automated follow-up cycle now'}
          >
            {plan === 'FREE' ? (
              <Lock className="w-3.5 h-3.5 text-amber-600" />
            ) : (
              <Zap className={`w-3.5 h-3.5 ${automating ? 'animate-bounce' : 'text-indigo-600'}`} />
            )}
            <span>Run Automated Cycle</span>
            {plan === 'FREE' && (
              <span className="text-[10px] uppercase font-bold bg-amber-100 text-amber-800 px-1 rounded">
                Starter
              </span>
            )}
          </button>
          <button
            onClick={loadReminders}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Refresh Queue</span>
          </button>
        </div>
      </div>

      {/* Queue: Invoices Needing Reminders */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-950/50">
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Active Receivables Queue ({actionableInvoices.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">Sorted by urgency</span>
        </div>

        {actionableInvoices.length === 0 ? (
          <div className="p-8 text-center">
            <CheckCircle className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            <h3 className="text-base font-semibold text-slate-900 dark:text-white">No Reminders Needed</h3>
            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
              All outstanding accounts have been collected or no invoices are currently active.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {actionableInvoices.map((inv) => {
              const isOverdue = inv.payment_status === 'OVERDUE';
              return (
                <div
                  key={inv.id}
                  className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-slate-900 dark:text-white">#{inv.invoice_number}</span>
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full font-bold border ${
                          isOverdue
                            ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                            : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                        }`}
                      >
                        {inv.payment_status}
                      </span>
                      <span className="text-xs text-slate-400 dark:text-slate-500">Due {inv.due_date}</span>
                    </div>
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Client: <span className="font-medium text-slate-900 dark:text-white">{inv.client_name}</span> &bull;{' '}
                      <span className="text-slate-500 dark:text-slate-400">{inv.client_email}</span>
                    </p>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-6">
                    <div className="text-left sm:text-right">
                      <div className="text-base font-bold text-slate-900 dark:text-white">
                        ${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </div>
                      <div className="text-xs text-slate-400 dark:text-slate-500">{inv.currency}</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => onMarkPaid(inv.id)}
                        className="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition"
                      >
                        Mark Paid
                      </button>
                      <button
                        onClick={() => onOpenSendReminder(inv)}
                        className="flex items-center gap-1 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition shadow-xs"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Send Reminder</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reminder Dispatch History */}
      <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs overflow-hidden transition-colors">
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-slate-500 dark:text-slate-400" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Reminder Delivery History</h2>
          </div>
          <span className="text-xs text-slate-500 dark:text-slate-400">{reminders.length} dispatched</span>
        </div>

        {loading ? (
          <div className="py-8 text-center text-slate-400 dark:text-slate-500">Loading reminder log...</div>
        ) : reminders.length === 0 ? (
          <div className="p-8 text-center text-slate-400 dark:text-slate-500 text-sm">
            No reminders dispatched yet. Click "Send Reminder" on any pending invoice above.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {reminders.map((rem) => (
              <div key={rem.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                    <span className="font-semibold text-slate-800 dark:text-slate-200">{rem.recipient_email}</span>
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase border ${
                        rem.status === 'SENT'
                          ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                          : rem.status === 'CONFIG_REQUIRED'
                          ? 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                          : 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                      }`}
                    >
                      {rem.status === 'CONFIG_REQUIRED' ? 'DRAFTED / SIMULATED' : rem.status}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">{rem.subject}</p>
                  {rem.error_message && (
                    <p className="text-[11px] text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/50 p-1.5 rounded border border-amber-200 dark:border-amber-800">
                      Notice: {rem.error_message}
                    </p>
                  )}
                </div>

                <div className="text-xs text-slate-400 dark:text-slate-500 whitespace-nowrap">
                  {rem.sent_at ? new Date(rem.sent_at).toLocaleString() : rem.created_at ? new Date(rem.created_at).toLocaleString() : 'Pending'}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
