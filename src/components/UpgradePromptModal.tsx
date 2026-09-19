import React from 'react';
import { Sparkles, X, Check, ArrowRight, ShieldCheck } from 'lucide-react';
import type { PlanTier } from '../plans.js';

interface UpgradePromptModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  message: string;
  featureOrLimit: string;
  currentPlan?: PlanTier;
  onNavigateToBilling: () => void;
}

export function UpgradePromptModal({
  isOpen,
  onClose,
  title,
  message,
  featureOrLimit,
  currentPlan = 'FREE',
  onNavigateToBilling,
}: UpgradePromptModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white dark:bg-slate-900 rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 dark:border-slate-800 relative transition-colors">
        <button
          type="button"
          onClick={onClose}
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-100 dark:border-indigo-800 flex items-center justify-center text-indigo-600 dark:text-indigo-400">
            <Sparkles className="w-5 h-5" />
          </div>
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2 py-0.5 rounded-md">
              Plan Upgrade Available
            </span>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white leading-tight mt-0.5">{title}</h3>
          </div>
        </div>

        <p className="text-xs text-slate-600 dark:text-slate-400 mb-5 leading-relaxed">{message}</p>

        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-700/60 rounded-xl p-4 mb-6 space-y-2 text-xs">
          <p className="font-semibold text-slate-800 dark:text-slate-200 mb-2">Upgrade to Starter ($9/mo) unlocks:</p>
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Up to <strong>50 clients</strong> (vs 5 on Free)</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Up to <strong>100 invoices</strong>/month (vs 10 on Free)</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>One-click <strong>CSV invoice &amp; accounting exports</strong></span>
          </div>
          <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300">
            <Check className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>Automated overdue reminder cycles</span>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 px-4 text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
          >
            Maybe Later
          </button>
          <button
            type="button"
            id="btn-modal-upgrade-now"
            onClick={() => {
              onClose();
              onNavigateToBilling();
            }}
            className="flex-1 py-2.5 px-4 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all shadow-sm flex items-center justify-center gap-1.5"
          >
            <span>View Pricing Plans</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );
}
