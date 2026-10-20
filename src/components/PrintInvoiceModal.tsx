import React, { useState } from 'react';
import { X, Printer, Download, CheckCircle, AlertTriangle, Building2, Loader2 } from 'lucide-react';
import type { Invoice, User } from '../types.js';
import { ReceiptoLogo } from './ReceiptoLogo.js';
import { getStoredToken } from '../api.js';

interface PrintInvoiceModalProps {
  invoice: Invoice | null;
  currentUser: User;
  onClose: () => void;
}

export function PrintInvoiceModal({ invoice, currentUser, onClose }: PrintInvoiceModalProps) {
  const [isOpening, setIsOpening] = useState(false);
  if (!invoice) return null;

  function handlePrint() {
    if (!invoice || isOpening) return;
    setIsOpening(true);
    const token = getStoredToken();
    const url = `/api/invoices/${invoice.id}/print${token ? `?token=${encodeURIComponent(token)}` : ''}`;
    window.open(url, '_blank');
    setTimeout(() => setIsOpening(false), 1500);
  }

  const isPaid = invoice.payment_status === 'PAID';
  const isOverdue = invoice.payment_status === 'OVERDUE';

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh] text-slate-900 dark:text-white transition-colors">
        {/* Modal Controls (Hidden during print) */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 print:hidden">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">Invoice Preview: #{invoice.invoice_number}</span>
            <span className={`text-xs px-2 py-0.5 rounded-full font-bold uppercase border ${
              isPaid
                ? 'bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                : isOverdue
                ? 'bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border-rose-200 dark:border-rose-800'
                : 'bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border-amber-200 dark:border-amber-800'
            }`}>
              {invoice.payment_status}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              disabled={isOpening}
              className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold transition shadow-xs cursor-pointer"
            >
              {isOpening ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Printer className="w-3.5 h-3.5" />}
              <span>{isOpening ? 'Opening Print...' : 'Print / Save PDF'}</span>
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-800 transition"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Sheet */}
        <div id="printable-invoice" className="p-8 sm:p-12 overflow-y-auto space-y-8 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 print:bg-white print:text-slate-800">
          {/* Header */}
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-6 border-b border-slate-200 dark:border-slate-800 print:border-slate-200 pb-8">
            <div>
              <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 print:text-indigo-600 font-black text-2xl tracking-tight">
                <Building2 className="w-7 h-7" />
                <span>{currentUser.business_name || currentUser.name}</span>
              </div>
              <p className="text-sm text-slate-500 dark:text-slate-400 print:text-slate-500 mt-1">From: {currentUser.name} ({currentUser.email})</p>
            </div>

            <div className="text-left sm:text-right">
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white print:text-slate-900 tracking-tight">INVOICE</h1>
              <div className="mt-2 space-y-1 text-sm text-slate-600 dark:text-slate-300 print:text-slate-600">
                <p>
                  <strong className="text-slate-900 dark:text-white print:text-slate-900">Invoice Number:</strong> #{invoice.invoice_number}
                </p>
                <p>
                  <strong className="text-slate-900 dark:text-white print:text-slate-900">Issue Date:</strong> {invoice.issue_date}
                </p>
                <p>
                  <strong className="text-slate-900 dark:text-white print:text-slate-900">Due Date:</strong> {invoice.due_date}
                </p>
                {invoice.paid_date && (
                  <p className="text-emerald-700 dark:text-emerald-400 print:text-emerald-700 font-semibold">
                    <strong>Paid on:</strong> {invoice.paid_date.split('T')[0]}
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Bill To Info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <div className="bg-slate-50 dark:bg-slate-950/80 print:bg-slate-50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 print:border-slate-100">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 print:text-slate-400">Billed To</span>
              <div className="mt-2 text-sm text-slate-800 dark:text-slate-200 print:text-slate-800 space-y-1">
                <p className="font-bold text-slate-900 dark:text-white print:text-slate-900 text-base">{invoice.client_name}</p>
                {invoice.client_company && <p className="font-medium text-slate-700 dark:text-slate-300 print:text-slate-700">{invoice.client_company}</p>}
                <p className="text-slate-600 dark:text-slate-400 print:text-slate-600">{invoice.client_email}</p>
                {invoice.client_phone && <p className="text-slate-600 dark:text-slate-400 print:text-slate-600">{invoice.client_phone}</p>}
                {invoice.client_address && <p className="text-slate-600 dark:text-slate-400 print:text-slate-600 whitespace-pre-line">{invoice.client_address}</p>}
              </div>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950/80 print:bg-slate-50 p-4 rounded-xl border border-slate-100 dark:border-slate-800 print:border-slate-100 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 print:text-slate-400">Payment Status</span>
                <div className="mt-2 flex items-center gap-2">
                  {isPaid ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                      <CheckCircle className="w-4 h-4" /> PAID IN FULL
                    </span>
                  ) : isOverdue ? (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-100 dark:bg-rose-950/80 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-800">
                      <AlertTriangle className="w-4 h-4" /> PAYMENT OVERDUE
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-100 dark:bg-amber-950/80 text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                      PAYMENT PENDING
                    </span>
                  )}
                </div>
              </div>
              <div className="pt-4 border-t border-slate-200/60 dark:border-slate-800 print:border-slate-200/60 mt-4">
                <span className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-500">Balance Due:</span>
                <p className="text-2xl font-black text-slate-900 dark:text-white print:text-slate-900">
                  {isPaid ? '$0.00' : `${invoice.currency} $${invoice.amount.toFixed(2)}`}
                </p>
              </div>
            </div>
          </div>

          {/* Line Items Table */}
          <div className="border border-slate-200 dark:border-slate-800 print:border-slate-200 rounded-xl overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 dark:bg-slate-950 print:bg-slate-100 text-slate-700 dark:text-slate-300 print:text-slate-700 text-xs font-bold uppercase tracking-wider">
                <tr>
                  <th className="py-3 px-4">Description</th>
                  <th className="py-3 px-4 text-center">Qty</th>
                  <th className="py-3 px-4 text-right">Unit Price</th>
                  <th className="py-3 px-4 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 dark:divide-slate-800 print:divide-slate-200">
                <tr>
                  <td className="py-4 px-4 font-medium text-slate-800 dark:text-slate-200 print:text-slate-800">
                    Professional Services / Retainer #{invoice.invoice_number}
                    {invoice.notes && <p className="text-xs text-slate-500 dark:text-slate-400 print:text-slate-500 mt-1">{invoice.notes}</p>}
                  </td>
                  <td className="py-4 px-4 text-center text-slate-700 dark:text-slate-300 print:text-slate-700">1</td>
                  <td className="py-4 px-4 text-right text-slate-700 dark:text-slate-300 print:text-slate-700">${invoice.amount.toFixed(2)}</td>
                  <td className="py-4 px-4 text-right font-bold text-slate-900 dark:text-white print:text-slate-900">${invoice.amount.toFixed(2)}</td>
                </tr>
              </tbody>
            </table>

            <div className="bg-slate-50 dark:bg-slate-950/80 print:bg-slate-50 p-4 border-t border-slate-200 dark:border-slate-800 print:border-slate-200 space-y-2 text-right">
              <div className="flex justify-between sm:justify-end gap-8 text-sm text-slate-600 dark:text-slate-300 print:text-slate-600">
                <span>Subtotal:</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 print:text-slate-800">${invoice.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between sm:justify-end gap-8 text-sm text-slate-600 dark:text-slate-300 print:text-slate-600">
                <span>Tax (0%):</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200 print:text-slate-800">$0.00</span>
              </div>
              <div className="flex justify-between sm:justify-end gap-8 text-base font-bold text-slate-900 dark:text-white print:text-slate-900 pt-2 border-t border-slate-200 dark:border-slate-800 print:border-slate-200">
                <span>Total Due ({invoice.currency}):</span>
                <span>${invoice.amount.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Footer note */}
          <div className="pt-6 border-t border-slate-200 flex flex-col items-center justify-center text-center text-xs text-slate-400 gap-2">
            <p>Thank you for your business! Please send payments promptly as specified by invoice terms.</p>
            <div className="flex items-center gap-2 mt-1">
              <ReceiptoLogo size="xs" />
              <span>Generated electronically by <strong>Receipto</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
