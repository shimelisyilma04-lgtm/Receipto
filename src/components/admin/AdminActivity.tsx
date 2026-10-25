import React from 'react';
import { Activity, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ActivityLog } from '../../types';

interface AdminActivityProps {
  activityLogs: ActivityLog[];
  actTotal: number;
  actPage: number;
  actTotalPages: number;
  loading: boolean;
  actActionFilter: string;
  onActionFilterChange: (a: string) => void;
  onFilterSubmit: () => void;
  onPageChange: (p: number) => void;
}

export const AdminActivity: React.FC<AdminActivityProps> = ({
  activityLogs,
  actTotal,
  actPage,
  actTotalPages,
  loading,
  actActionFilter,
  onActionFilterChange,
  onFilterSubmit,
  onPageChange,
}) => {
  return (
    <div className="space-y-4" id="admin-view-activity">
      <div className="flex items-center gap-3">
        <input
          type="text"
          placeholder="Filter by action (e.g., USER_LOGGED_IN, INVOICE_CREATED)..."
          value={actActionFilter}
          onChange={(e) => onActionFilterChange(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onFilterSubmit()}
          className="px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex-1 text-slate-900 dark:text-white"
        />
        <button
          onClick={onFilterSubmit}
          className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-sm"
        >
          Filter
        </button>
      </div>

      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
        <div className="divide-y divide-slate-200 dark:divide-slate-800">
          {activityLogs.length === 0 ? (
            <div className="p-8 text-center text-slate-400">
              {loading ? 'Loading audit records...' : 'No activity logs found.'}
            </div>
          ) : (
            activityLogs.map((log) => (
              <div key={log.id} className="p-4 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-start gap-3">
                  <div className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 mt-0.5">
                    <Activity className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200">
                        {log.action}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(log.created_at).toLocaleString()}
                      </span>
                    </div>
                    <div className="text-sm text-slate-700 dark:text-slate-300 mt-1">
                      {log.details}
                    </div>
                    {log.metadata && Object.keys(log.metadata).length > 0 && (
                      <pre className="text-[11px] font-mono text-slate-500 dark:text-slate-400 mt-1.5 p-2 bg-slate-50 dark:bg-slate-800/70 rounded-lg overflow-x-auto max-w-xl">
                        {JSON.stringify(log.metadata, null, 2)}
                      </pre>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Pagination Controls */}
        {actTotalPages > 1 && (
          <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
            <span>
              Showing page {actPage} of {actTotalPages} ({actTotal} events)
            </span>
            <div className="flex items-center gap-1">
              <button
                disabled={actPage <= 1}
                onClick={() => onPageChange(Math.max(1, actPage - 1))}
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={actPage >= actTotalPages}
                onClick={() => onPageChange(actPage + 1)}
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
