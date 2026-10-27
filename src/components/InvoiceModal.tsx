import React, { useState, useEffect } from 'react';
import { X, FileText, Plus, AlertCircle } from 'lucide-react';
import type { Invoice, Client } from '../types.js';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: any) => Promise<void>;
  clients: Client[];
  initialInvoice?: Invoice | null;
  onOpenCreateClient: () => void;
}

export function InvoiceModal({
  isOpen,
  onClose,
  onSubmit,
  clients,
  initialInvoice,
  onOpenCreateClient,
}: InvoiceModalProps) {
  const todayStr = new Date().toISOString().split('T')[0];
  const in14DaysStr = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [clientId, setClientId] = useState(initialInvoice?.client_id || (clients[0]?.id || ''));
  const [invoiceNumber, setInvoiceNumber] = useState(
    initialInvoice?.invoice_number || `INV-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`
  );
  const [amount, setAmount] = useState(initialInvoice?.amount ? String(initialInvoice.amount) : '');
  const [currency, setCurrency] = useState(initialInvoice?.currency || 'USD');
  const [issueDate, setIssueDate] = useState(initialInvoice?.issue_date || todayStr);
  const [dueDate, setDueDate] = useState(initialInvoice?.due_date || in14DaysStr);
  const [notes, setNotes] = useState(initialInvoice?.notes || '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (initialInvoice) {
      setClientId(initialInvoice.client_id);
      setInvoiceNumber(initialInvoice.invoice_number);
      setAmount(String(initialInvoice.amount));
      setCurrency(initialInvoice.currency);
      setIssueDate(initialInvoice.issue_date);
      setDueDate(initialInvoice.due_date);
      setNotes(initialInvoice.notes || '');
    } else if (clients.length > 0 && !clientId) {
      setClientId(clients[0].id);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialInvoice, clients]);

  if (!isOpen) return null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!clientId) {
      setError('Please select or add a client first.');
      return;
    }

    if (!invoiceNumber.trim()) {
      setError('Invoice number is required.');
      return;
    }

    const numAmount = parseFloat(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      setError('Please enter a valid amount greater than 0.');
      return;
    }

    if (!issueDate || !dueDate) {
      setError('Issue date and due date are required.');
      return;
    }

    try {
      setSubmitting(true);
      await onSubmit({
        client_id: clientId,
        invoice_number: invoiceNumber.trim(),
        amount: numAmount,
        currency,
        issue_date: issueDate,
        due_date: dueDate,
        notes: notes.trim() || undefined,
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save invoice.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden text-slate-900 dark:text-white transition-colors">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-400 flex items-center justify-center">
              <FileText className="w-4 h-4" />
            </div>
            <h2 className="font-bold text-slate-900 dark:text-white text-base">
              {initialInvoice ? `Edit Invoice #${initialInvoice.invoice_number}` : 'Create New Invoice'}
            </h2>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-lg bg-rose-50 dark:bg-rose-950/80 border border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200 text-xs">
              <AlertCircle className="w-4 h-4 text-rose-600 dark:text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Client Selection */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Client</label>
              <button
                type="button"
                onClick={onOpenCreateClient}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-semibold flex items-center gap-1"
              >
                <Plus className="w-3 h-3" />
                <span>Add Client</span>
              </button>
            </div>
            {clients.length === 0 ? (
              <div className="p-3 border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 rounded-lg text-xs text-amber-900 dark:text-amber-200 flex items-center justify-between">
                <span>No clients registered yet.</span>
                <button
                  type="button"
                  onClick={onOpenCreateClient}
                  className="font-bold underline ml-2"
                >
                  Create Client Now
                </button>
              </div>
            ) : (
              <select
                id="select-invoice-client"
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              >
                {clients.map((c) => (
                  <option key={c.id} value={c.id} className="bg-white dark:bg-slate-900 text-slate-900 dark:text-white">
                    {c.name} {c.company ? `(${c.company})` : ''} - {c.email}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Invoice Number & Amount */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Invoice Number
              </label>
              <input
                id="input-invoice-number"
                type="text"
                required
                value={invoiceNumber}
                onChange={(e) => setInvoiceNumber(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Amount ({currency})
              </label>
              <div className="relative">
                <span className="absolute left-3 top-2 text-sm text-slate-400 font-bold">$</span>
                <input
                  id="input-invoice-amount"
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="w-full pl-7 pr-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
                />
              </div>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Issue Date
              </label>
              <input
                id="input-issue-date"
                type="date"
                required
                value={issueDate}
                onChange={(e) => setIssueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
                Due Date
              </label>
              <input
                id="input-due-date"
                type="date"
                required
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white"
              />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Scope / Notes (Optional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Net 15 payment terms. Thank you for your business."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500"
            />
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 transition-colors"
            >
              Cancel
            </button>
            <button
              id="btn-submit-invoice"
              type="submit"
              disabled={submitting}
              className="px-5 py-2 text-sm font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition shadow-sm"
            >
              {submitting ? 'Saving...' : initialInvoice ? 'Update Invoice' : 'Save Invoice'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
