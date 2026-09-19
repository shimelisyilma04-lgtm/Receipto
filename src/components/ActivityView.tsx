import React, { useState, useEffect } from 'react';
import { History, Search, Clock, RefreshCw, CheckCircle2, Shield, Sparkles } from 'lucide-react';
import type { ActivityLog } from '../types.js';
import { api } from '../api.js';

interface ActivityViewProps {
  onNavigateToBilling?: () => void;
}

export function ActivityView({ onNavigateToBilling }: ActivityViewProps) {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [isTruncated, setIsTruncated] = useState(false);
  const [plan, setPlan] = useState<string>('FREE');

  useEffect(() => {
    loadLogs();
  }, []);

  async function loadLogs() {
    try {
      setLoading(true);
      const res = await api.getActivity(100);
      setLogs(res.logs);
      setIsTruncated(Boolean(res.upgrade_required));
      if (res.plan) setPlan(res.plan);
    } catch (err) {
      console.error('Failed to load logs', err);
    } finally {
      setLoading(false);
    }
  }

  const filtered = logs.filter((log) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return log.action.toLowerCase().includes(q) || log.details.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Activity & Audit Trail</h1>
          <p className="text-sm text-slate-500 mt-1">
            Complete tamper-evident log of all invoices, client modifications, and reminder dispatches.
          </p>
        </div>
        <button
          onClick={loadLogs}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold transition shadow-xs"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          <span>Refresh Audit Log</span>
        </button>
      </div>

      {/* Plan History Gating Banner */}
      {isTruncated && (
        <div className="bg-indigo-50/70 border border-indigo-100 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5 text-indigo-950">
            <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <strong>Recent 10 events shown ({plan} plan).</strong> Upgrade to Starter or Growth to access your complete, unlimited audit trail.
            </span>
          </div>
          {onNavigateToBilling && (
            <button
              onClick={onNavigateToBilling}
              className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-semibold whitespace-nowrap self-start sm:self-auto transition-colors"
            >
              Unlock Full History
            </button>
          )}
        </div>
      )}

      {/* Search Input */}
      <div className="bg-white p-3 rounded-xl border border-slate-200 shadow-xs flex items-center justify-between">
        <div className="relative w-full max-w-sm">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search activity records..."
            className="w-full pl-9 pr-3 py-1.5 text-sm rounded-lg border border-slate-300 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        <span className="text-xs text-slate-500 font-medium hidden sm:block">
          {filtered.length} entries recorded
        </span>
      </div>

      {/* Audit Log Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-12 text-center text-slate-400">Loading audit history...</div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">No activity records found.</div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filtered.map((log) => (
              <div key={log.id} className="p-4 hover:bg-slate-50/70 transition flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 mt-0.5">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
                        {log.action}
                      </span>
                    </div>
                    <p className="text-sm font-medium text-slate-900 mt-1">{log.details}</p>
                  </div>
                </div>

                <div className="text-xs text-slate-400 whitespace-nowrap text-right">
                  <div className="flex items-center justify-end gap-1">
                    <Clock className="w-3 h-3" />
                    <span>{new Date(log.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {new Date(log.created_at).toLocaleDateString()}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

