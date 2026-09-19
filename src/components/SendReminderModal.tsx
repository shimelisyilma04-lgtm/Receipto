import React, { useState, useEffect } from 'react';
import { X, Send, Mail, Copy, Check, AlertCircle, Info, Sparkles } from 'lucide-react';
import type { Invoice } from '../types.js';
import { api } from '../api.js';

interface SendReminderModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
}

export function SendReminderModal({ invoice, onClose, onSuccess, onError }: SendReminderModalProps) {
  if (!invoice) return null;

  const [tone, setTone] = useState<'friendly' | 'standard' | 'urgent'>(
    invoice.payment_status === 'OVERDUE' ? 'urgent' : 'friendly'
  );
  const [customMessage, setCustomMessage] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; text: string; html: string } | null>(null);
  const [isEmailConfigured, setIsEmailConfigured] = useState(false);

  useEffect(() => {
    loadPreview();
  }, [tone, customMessage]);

  async function loadPreview() {
    try {
      setLoadingPreview(true);
      const res = await api.previewReminder(invoice!.id, tone, customMessage);
      setPreview(res.preview);
      setIsEmailConfigured(res.isEmailConfigured);
    } catch (err: any) {
      console.error('Failed to load preview', err);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleSend() {
    try {
      setSending(true);
      const res = await api.sendReminder(invoice!.id, tone, customMessage);
      onSuccess(res.message);
      onClose();
    } catch (err: any) {
      onError(err.message || 'Failed to dispatch reminder');
    } finally {
      setSending(false);
    }
  }

  function handleCopyText() {
    if (preview?.text) {
      navigator.clipboard.writeText(preview.text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 text-base">Payment Reminder Generator</h2>
              <p className="text-xs text-slate-500">Invoice #{invoice.invoice_number} â€¢ {invoice.client_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Email configuration banner */}
          {isEmailConfigured ? (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-medium">
              <Sparkles className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Resend live email delivery is configured. Reminder will be dispatched to <strong>{invoice.client_email}</strong>.</span>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Email Service Not Configured (RESEND_API_KEY unset):</span>
                <p className="text-amber-800 mt-0.5">
                  The reminder will be generated, previewed, and logged to your audit history. You can also copy the draft below to send via your own email client.
                </p>
              </div>
            </div>
          )}

          {/* Tone Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
              Communication Tone
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTone('friendly')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                  tone === 'friendly'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                ðŸ˜Š Friendly Gentle
              </button>
              <button
                type="button"
                onClick={() => setTone('standard')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                  tone === 'standard'
                    ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                ðŸ“‹ Standard Formal
              </button>
              <button
                type="button"
                onClick={() => setTone('urgent')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                  tone === 'urgent'
                    ? 'bg-rose-50 border-rose-500 text-rose-700 shadow-xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                }`}
              >
                âš ï¸  Urgent Overdue
              </button>
            </div>
          </div>

          {/* Custom Note */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1">
              Add Personal Note (Optional)
            </label>
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="e.g. Thanks for your partnership! Wire details are in invoice."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Live Preview Box */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500">Live Email Preview</label>
              <button
                type="button"
                onClick={handleCopyText}
                className="flex items-center gap-1 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Text'}</span>
              </button>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-xs font-mono text-slate-800 max-h-48 overflow-y-auto space-y-2">
              {loadingPreview ? (
                <div className="py-4 text-center text-slate-400">Rendering preview...</div>
              ) : preview ? (
                <>
                  <div className="pb-2 border-b border-slate-200">
                    <span className="text-slate-400 font-sans font-medium">Subject:</span>{' '}
                    <span className="font-bold text-slate-900 font-sans">{preview.subject}</span>
                  </div>
                  <div className="whitespace-pre-line text-slate-700 font-sans leading-relaxed pt-1">
                    {preview.text}
                  </div>
                </>
              ) : (
                <div className="py-4 text-center text-rose-500">Unable to generate email preview.</div>
              )}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 border-t border-slate-200">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 bg-white text-slate-700 text-sm font-medium hover:bg-slate-100"
          >
            Cancel
          </button>

          <button
            id="btn-confirm-send-reminder"
            type="button"
            disabled={sending}
            onClick={handleSend}
            className="flex items-center gap-1.5 px-5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold transition disabled:opacity-50 shadow-sm"
          >
            <Send className="w-4 h-4" />
            <span>{sending ? 'Processing...' : isEmailConfigured ? 'Dispatch Email' : 'Log & Complete Reminder'}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
