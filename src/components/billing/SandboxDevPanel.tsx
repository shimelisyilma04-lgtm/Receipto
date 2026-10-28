import React from 'react';

interface SandboxDevPanelProps {
  showSandbox: boolean;
  onToggleSandbox: () => void;
  onSimulatePlan: (plan: 'FREE' | 'STARTER' | 'GROWTH') => void;
}

export function SandboxDevPanel({
  showSandbox,
  onToggleSandbox,
  onSimulatePlan,
}: SandboxDevPanelProps) {
  return (
    <div className="pt-4 border-t border-slate-200 dark:border-slate-800">
      <button
        onClick={onToggleSandbox}
        className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 flex items-center gap-1.5"
      >
        <span>Developer Testing &amp; Sandbox Controls</span>
        <span>{showSandbox ? '▲' : '▼'}</span>
      </button>
      {showSandbox && (
        <div className="mt-4 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <p className="text-xs text-slate-500 mb-3">
            Simulate tier updates directly in the local store to test quotas, automated reminders, and exports:
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => onSimulatePlan('FREE')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200"
            >
              Simulate Free Tier
            </button>
            <button
              onClick={() => onSimulatePlan('STARTER')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-100 dark:bg-indigo-950/60 hover:bg-indigo-200 text-indigo-700 dark:text-indigo-300"
            >
              Simulate Starter Tier
            </button>
            <button
              onClick={() => onSimulatePlan('GROWTH')}
              className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-purple-100 dark:bg-purple-950/60 hover:bg-purple-200 text-purple-700 dark:text-purple-300"
            >
              Simulate Growth Tier
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
