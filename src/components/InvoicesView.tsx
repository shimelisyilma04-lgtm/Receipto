import React, { useState } from 'react';
import {
  Plus,
  Search,
  Filter,
  Download,
  CheckCircle,
  AlertTriangle,
  Send,
  Printer,
  Trash2,
  Edit2,
  XCircle,
  FileText,
  Lock,
} from 'lucide-react';
import type { Invoice, Client, PaymentStatus } from '../types.js';
import type { PlanTier } from '../plans.js';

interface InvoicesViewProps {
  invoices: Invoice[];
  clients: Client[];
  loading: boolean;
  onRefresh: () => void;
  onOpenCreateInvoice: () => void;
  onOpenEditInvoice: (inv: Invoice) => void;
  onOpenPrintInvoice: (inv: Invoice) => void;
  onOpenSendReminder: (inv: Invoice) => void;
  onMarkPaid: (id: string) => void;
  onCancelInvoice: (id: string) => void;
  onDeleteInvoice: (id: string) => void;
  plan?: PlanTier;
  onPromptUpgrade?: (title: string, message: string, feature: string) => void;
}

export function InvoicesView({
  invoices,
  clients,
  loading,
  onRefresh,
  onOpenCreateInvoice,
  onOpenEditInvoice,
  onOpenPrintInvoice,
  onOpenSendReminder,
  onMarkPaid,
  onCancelInvoice,
  onDeleteInvoice,
  plan = 'FREE',
  onPromptUpgrade,
}: InvoicesViewProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | PaymentStatus>('ALL');

  // Filter and search
  const filtered = invoices.filter((inv) => {
    if (statusFilter !== 'ALL' && inv.payment_status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchNum = inv.invoice_number.toLowerCase().includes(q);
      const matchClient = inv.client_name?.toLowerCase().includes(q);
      const matchCompany = inv.client_company?.toLowerCase().includes(q);
      if (!matchNum && !matchClient && !matchCompany) return false;
    }
    return true;
  });

  async function handleExportCSV() {
    if (plan === 'FREE') {
      onPromptUpgrade?.(
        'CSV Export Requires Starter Plan',
        'Exporting invoices and financial ledgers to CSV for bookkeeping and tax reporting is a feature of Starter and Growth plans. Upgrade to unlock instant accounting exports.',
        'csvExport'
      );
      return;
    }

    try {
      const res = await fetch('/api/invoices/export/csv', {
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Failed to export CSV');
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `receipto-invoices-${new Date().toISOString().split('T')[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err: any) {
      alert(err.message || 'Error exporting CSV');
    }
  }

  return (
    <div className="space-y-6">
      {/* Header & Main Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Invoices</h1>
          <p className="text-sm text-slate-500 mt-1">
            Manage billing, monitor payment status, and review aging receivables.
          </p>
        </div>
        <div className="flex items-center gap-2.5">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-sm font-medium transition shadow-xs"
            title={plan === 'FREE' ? 'Upgrade to export CSV' : 'Export invoices to CSV'}
          >
            {plan === 'FREE' ? (
              <Lock className="w-3.5 h-3.5 text-amber-600" />
            ) : (
              <Download className="w-4 h-4 text-slate-500" />
            )}
            <span>Export CSV</span>
            {plan === 'FREE' && (
              <span className="text-[10px] uppercase font-black tracking-wider bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded ml-1">
                Starter
              </span>
            )}
          </button>
          <button
            id="btn-create-invoice"
            onClick={onOpenCreateInvoice}
            className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition shadow-xs"
          >
            <Plus className="w-4 h-4" />
            <span>Create Invoice</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-3 rounded-xl border border-slate-200 shadow-xs">
        {/* Status Filters */}
        <div className="flex items-center gap-1 overflow-x-auto pb-1 md:pb-0">
          {(['ALL', 'UNPAID', 'OVERDUE', 'PAID', 'CANCELLED'] as const).map((st) => (
            <button
              key={st}
              id={`filter-${st.toLowerCase()}`}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition ${
                statusFilter === st
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {st === 'ALL' ? 'All Invoices' : st}
            </button>
          ))}
        </div>

        {/* Search Input */}
        <div className="relative w-full md:w-72">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            id="search-invoices"
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by #, client, or company..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
      </div>

      {/* Invoices List / Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading invoices...</div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center px-4">
            <FileText className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <h3 className="text-base font-semibold text-slate-900">No invoices found</h3>
            <p className="text-sm text-slate-500 max-w-sm mx-auto mt-1">
              {searchQuery || statusFilter !== 'ALL'
                ? 'Try adjusting your search query or status filter.'
                : 'Get started by creating your first client invoice.'}
            </p>
            {!(searchQuery || statusFilter !== 'ALL') && (
              <button
                onClick={onOpenCreateInvoice}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition"
              >
                <Plus className="w-4 h-4" />
                <span>Create First Invoice</span>
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-200 text-xs font-bold uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Client</th>
                  <th className="py-3 px-4">Due Date</th>
                  <th className="py-3 px-4">Amount</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((inv) => {
                  const isPaid = inv.payment_status === 'PAID';
                  const isOverdue = inv.payment_status === 'OVERDUE';
                  const isCancelled = inv.payment_status === 'CANCELLED';

                  return (
                    <tr key={inv.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-4 px-4 font-semibold text-slate-900 whitespace-nowrap">
                        #{inv.invoice_number}
                      </td>

                      <td className="py-4 px-4">
                        <div className="font-medium text-slate-900">{inv.client_name}</div>
                        {inv.client_company && (
                          <div className="text-xs text-slate-400">{inv.client_company}</div>
                        )}
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <span className={isOverdue ? 'text-rose-600 font-semibold' : 'text-slate-700'}>
                          {inv.due_date}
                        </span>
                        <div className="text-[11px] text-slate-400">Issued {inv.issue_date}</div>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="font-bold text-slate-900">
                          ${inv.amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="text-[11px] text-slate-400">{inv.currency}</div>
                      </td>

                      <td className="py-4 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isPaid
                              ? 'bg-emerald-100 text-emerald-800'
                              : isOverdue
                              ? 'bg-rose-100 text-rose-800'
                              : isCancelled
                              ? 'bg-slate-100 text-slate-600'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {inv.payment_status}
                        </span>
                      </td>

                      <td className="py-4 px-4 text-right whitespace-nowrap">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* Quick Mark Paid */}
                          {!isPaid && !isCancelled && (
                            <button
                              onClick={() => onMarkPaid(inv.id)}
                              className="px-2.5 py-1 rounded-md bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-medium transition"
                              title="Mark Paid"
                            >
                              Mark Paid
                            </button>
                          )}

                          {/* Send Reminder */}
                          {!isPaid && !isCancelled && (
                            <button
                              onClick={() => onOpenSendReminder(inv)}
                              className="p-1.5 rounded-md hover:bg-indigo-50 text-indigo-600 transition"
                              title="Send Reminder"
                            >
                              <Send className="w-4 h-4" />
                            </button>
                          )}

                          {/* Print / View */}
                          <button
                            onClick={() => onOpenPrintInvoice(inv)}
                            className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition"
                            title="Print / View Invoice"
                          >
                            <Printer className="w-4 h-4" />
                          </button>

                          {/* Edit (if unpaid) */}
                          {!isPaid && !isCancelled && (
                            <button
                              onClick={() => onOpenEditInvoice(inv)}
                              className="p-1.5 rounded-md hover:bg-slate-100 text-slate-600 transition"
                              title="Edit Invoice"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                          )}

                          {/* Cancel Invoice */}
                          {!isPaid && !isCancelled && (
                            <button
                              onClick={() => onCancelInvoice(inv.id)}
                              className="p-1.5 rounded-md hover:bg-amber-50 text-amber-600 transition"
                              title="Cancel Invoice"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}

                          {/* Delete Invoice */}
                          <button
                            onClick={() => onDeleteInvoice(inv.id)}
                            className="p-1.5 rounded-md hover:bg-rose-50 text-rose-500 transition"
                            title="Delete Record"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
