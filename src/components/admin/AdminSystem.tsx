import React from 'react';
import { Database, CheckCircle, Clock, Play } from 'lucide-react';
import type { AdminSystemHealth } from '../../types';

interface AdminSystemProps {
  systemHealth: AdminSystemHealth | null;
  workerRunning: boolean;
  workerResult: any;
  onTriggerWorker: () => void;
}

export const AdminSystem: React.FC<AdminSystemProps> = ({
  systemHealth,
  workerRunning,
  workerResult,
  onTriggerWorker,
}) => {
  if (!systemHealth) {
    return (
      <div className="text-center py-12 text-slate-500 dark:text-slate-400">
        Loading system health diagnostics...
      </div>
    );
  }

  return (
    <div className="space-y-6" id="admin-view-system">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Database & Platform Diagnostic */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Database className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
            Database & Runtime Diagnostics
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Database Engine</span>
              <span className="font-semibold uppercase text-slate-900 dark:text-white">
                {systemHealth.database.engine}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Database Connection</span>
              <span className="inline-flex items-center gap-1 font-semibold text-emerald-600 dark:text-emerald-400">
                <CheckCircle className="w-4 h-4" />
                Healthy
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Node Environment</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {systemHealth.application.environment}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Uptime</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {Math.floor(systemHealth.application.uptime_seconds / 60)} minutes ({systemHealth.application.uptime_seconds}s)
              </span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-slate-500 dark:text-slate-400">Memory Allocation</span>
              <span className="font-mono text-slate-700 dark:text-slate-300">
                {systemHealth.application.memory_usage_mb} MB
              </span>
            </div>
          </div>
        </div>

        {/* Background Worker Panel */}
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              Automated Reminder Worker
            </h3>
            <span
              className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                systemHealth.worker.running
                  ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                  : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
              }`}
            >
              {systemHealth.worker.running ? 'Running' : 'Scheduled'}
            </span>
          </div>

          <p className="text-xs text-slate-500 dark:text-slate-400">
            Worker checks overdue and upcoming invoices every {Math.round(systemHealth.worker.interval_seconds / 60)} minutes for Starter/Growth subscribers and dispatches automated email reminders.
          </p>

          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Cycle Interval</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                Every {Math.round(systemHealth.worker.interval_seconds / 60)} minutes ({systemHealth.worker.interval_seconds}s)
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Last Execution Time</span>
              <span className="font-medium text-slate-700 dark:text-slate-300">
                {systemHealth.worker.last_run_at
                  ? new Date(systemHealth.worker.last_run_at).toLocaleTimeString()
                  : 'Starting on schedule'}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500 dark:text-slate-400">Total Worker Cycles</span>
              <span className="font-semibold text-slate-900 dark:text-white">
                {systemHealth.worker.total_runs} (Reminders sent: {systemHealth.worker.total_reminders_sent})
              </span>
            </div>
          </div>

          {/* Manual Trigger Button */}
          <div className="pt-2">
            <button
              id="btn-trigger-worker-cycle"
              disabled={workerRunning}
              onClick={onTriggerWorker}
              className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl bg-purple-600 hover:bg-purple-700 text-white shadow-sm transition disabled:opacity-50"
            >
              <Play className={`w-4 h-4 ${workerRunning ? 'animate-spin' : ''}`} />
              <span>{workerRunning ? 'Executing Cycle...' : 'Trigger Reminder Cycle Now'}</span>
            </button>
          </div>

          {workerResult && (
            <div className="p-3 rounded-xl bg-purple-50 dark:bg-purple-950/30 border border-purple-200 dark:border-purple-800/40 text-xs text-purple-900 dark:text-purple-200 space-y-1">
              <div className="font-bold">Last Run Output:</div>
              <div>• Eligible Subscribers Checked: {workerResult.processedUsers}</div>
              <div>• Automated Reminders Dispatched: {workerResult.sentReminders}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
