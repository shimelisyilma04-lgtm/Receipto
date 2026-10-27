import React, { useState, useEffect } from 'react';
import { X, Send, Mail, Copy, Check, Info, Sparkles } from 'lucide-react';
import type { Invoice } from '../types.js';
import { api } from '../api.js';

interface SendReminderModalProps {
  invoice: Invoice | null;
  onClose: () => void;
  onSuccess: (message: string) => void;
  onError: (error: string) => void;
}

export function SendReminderModal({ invoice, onClose, onSuccess, onError }: SendReminderModalProps) {
  const [tone, setTone] = useState<'friendly' | 'standard' | 'urgent'>(
    invoice?.payment_status === 'OVERDUE' ? 'urgent' : 'friendly'
  );
  const [customMessage, setCustomMessage] = useState('');
  const [loadingPreview, setLoadingPreview] = useState(true);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<{ subject: string; text: string; html: string } | null>(null);
  const [isEmailConfigured, setIsEmailConfigured] = useState(false);

  useEffect(() => {
    if (!invoice) return;
    loadPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice?.id, tone, customMessage]);

  async function loadPreview() {
    if (!invoice) return;
    try {
      setLoadingPreview(true);
      const res = await api.previewReminder(invoice.id, tone, customMessage);
      setPreview(res.preview);
      setIsEmailConfigured(res.isEmailConfigured);
    } catch (err: any) {
      console.error('Failed to load preview', err);
    } finally {
      setLoadingPreview(false);
    }
  }

  async function handleSend() {
    if (!invoice) return;
    try {
      setSending(true);
      const res = await api.sendReminder(invoice.id, tone, customMessage);
      if (res && res.success) {
        onSuccess(res.message || 'Reminder email sent.');
        onClose();
      } else {
        onError(res?.message || 'Email could not be sent. Please check your email configuration.');
      }
    } catch (err: any) {
      onError(err.message || 'Email could not be sent. Please check your email configuration.');
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

  if (!invoice) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-2xl overflow-hidden text-slate-900 dark:text-white transition-colors">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-400 flex items-center justify-center">
              <Mail className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-bold text-slate-900 dark:text-white text-base">Payment Reminder Generator</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Invoice #{invoice.invoice_number} &bull; {invoice.client_name}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Email configuration banner */}
          {isEmailConfigured ? (
            <div className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 text-xs font-medium">
              <Sparkles className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
              <span>Resend live email delivery is configured. Reminder will be dispatched to <strong>{invoice.client_email}</strong>.</span>
            </div>
          ) : (
            <div className="flex items-start gap-2.5 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200 text-xs">
              <Info className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold">Email Service Not Configured (RESEND_API_KEY unset):</span>
                <p className="text-amber-800 dark:text-amber-300 mt-0.5">
                  The reminder will be generated, previewed, and logged to your audit history. You can also copy the draft below to send via your own email client.
                </p>
              </div>
            </div>
          )}

          {/* Tone Selector */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
              Communication Tone
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setTone('friendly')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                  tone === 'friendly'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                😊 Friendly Gentle
              </button>
              <button
                type="button"
                onClick={() => setTone('standard')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                  tone === 'standard'
                    ? 'bg-indigo-50 dark:bg-indigo-950/60 border-indigo-500 text-indigo-700 dark:text-indigo-300 shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                📋 Standard Formal
              </button>
              <button
                type="button"
                onClick={() => setTone('urgent')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold border transition ${
                  tone === 'urgent'
                    ? 'bg-rose-50 dark:bg-rose-950/60 border-rose-500 text-rose-700 dark:text-rose-300 shadow-xs'
                    : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700'
                }`}
              >
                ⚠️ Urgent Overdue
              </button>
            </div>
          </div>

          {/* Custom Note */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1">
              Add Personal Note (Optional)
            </label>
            <input
              type="text"
              value={customMessage}
              onChange={(e) => setCustomMessage(e.target.value)}
              placeholder="e.g. Thanks for your partnership! Wire details are in invoice."
              className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-white placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* Live Preview Box */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Live Email Preview</label>
              <button
                type="button"
                onClick={handleCopyText}
                className="flex items-center gap-1 text-xs text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 font-medium"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied to Clipboard!' : 'Copy Text'}</span>
              </button>
            </div>

            <div className="bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 rounded-xl p-4 text-xs font-mono text-slate-800 dark:text-slate-200 max-h-48 overflow-y-auto space-y-2">
              {loadingPreview ? (
                <div className="py-4 text-center text-slate-400 dark:text-slate-500">Rendering preview...</div>
              ) : preview ? (
                <>
                  <div className="pb-2 border-b border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 dark:text-slate-500 font-sans font-medium">Subject:</span>{' '}
                    <span className="font-bold text-slate-900 dark:text-white font-sans">{preview.subject}</span>
                  </div>
                  <div className="whitespace-pre-line text-slate-700 dark:text-slate-300 font-sans leading-relaxed pt-1">
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
        <div className="flex items-center justify-between px-6 py-4 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-sm font-medium hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
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
