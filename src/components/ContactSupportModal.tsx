import React, { useState } from 'react';
import { X, Mail, Copy, Check, LifeBuoy, Sparkles, MessageSquare, Clock } from 'lucide-react';
import { ReceiptoLogo } from './ReceiptoLogo.js';

interface ContactSupportModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

export const RECEIPTO_SUPPORT_EMAIL = 'shimelisyilma04@gmail.com';

export function ContactSupportModal({ isOpen, onClose, userEmail }: ContactSupportModalProps) {
  const [copied, setCopied] = useState(false);

  if (!isOpen) return null;

  const mailtoSubject = encodeURIComponent('Receipto Support Request');
  const mailtoBody = encodeURIComponent(
    `Hello Receipto Support Team,\n\nI need assistance with:\n[Describe your account, billing, invoice, or technical question here]\n\nAccount Email: ${userEmail || '[Your Email]'}\nDate: ${new Date().toLocaleDateString()}`
  );
  const mailtoHref = `mailto:${RECEIPTO_SUPPORT_EMAIL}?subject=${mailtoSubject}&body=${mailtoBody}`;

  async function handleCopyEmail() {
    try {
      await navigator.clipboard.writeText(RECEIPTO_SUPPORT_EMAIL);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="support-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm transition-opacity"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden transform transition-all animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="relative px-6 pt-6 pb-5 bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 text-white overflow-hidden">
          <div className="absolute -right-8 -top-8 w-36 h-36 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />
          <div className="flex items-start justify-between relative z-10">
            <div className="flex items-center gap-3">
              <ReceiptoLogo size="sm" />
              <div>
                <span className="text-xs font-bold uppercase tracking-widest text-indigo-200">Customer Success</span>
                <h2 id="support-modal-title" className="text-xl font-extrabold text-white tracking-tight">
                  Need help?
                </h2>
              </div>
            </div>
            <button
              onClick={onClose}
              aria-label="Close support dialog"
              className="p-1.5 rounded-lg text-white/70 hover:text-white hover:bg-white/10 transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="mt-3 text-sm text-indigo-100/90 leading-relaxed relative z-10">
            Contact Receipto support and we'll help you with your account, billing, invoices, or other issues.
          </p>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Direct Support Email Box */}
          <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-850 border border-slate-200 dark:border-slate-800">
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
              Official Support Email
            </div>
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-lg border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-2.5 min-w-0">
                <Mail className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="font-mono text-sm font-semibold text-slate-900 dark:text-white truncate">
                  {RECEIPTO_SUPPORT_EMAIL}
                </span>
              </div>
              <button
                type="button"
                id="btn-copy-support-email"
                onClick={handleCopyEmail}
                className={`inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-semibold transition-all shrink-0 border ${
                  copied
                    ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
                }`}
                title="Copy support email address"
              >
                {copied ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                    <span>Support email copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy email</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Quick SLA / Topics info */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-slate-600 dark:text-slate-400">
            <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-850/50 border border-slate-100 dark:border-slate-800/80">
              <Clock className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800 dark:text-slate-200 block">Fast Response Time</span>
                <span>Our team reviews all billing and invoice inquiries promptly.</span>
              </div>
            </div>
            <div className="flex items-start gap-2 p-3 rounded-lg bg-slate-50 dark:bg-slate-850/50 border border-slate-100 dark:border-slate-800/80">
              <MessageSquare className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-slate-800 dark:text-slate-200 block">Dedicated Support</span>
                <span>Assistance with reminder delivery, custom schedules, and Stripe.</span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row items-center justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="w-full sm:w-auto px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition-colors"
            >
              Close
            </button>
            <a
              id="btn-email-support"
              href={mailtoHref}
              className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold text-sm shadow-md shadow-indigo-600/20 transition-all hover:scale-[1.02] active:scale-[0.98]"
            >
              <Mail className="w-4 h-4" />
              <span>Email Support</span>
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
