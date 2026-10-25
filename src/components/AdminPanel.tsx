import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  CreditCard,
  Activity,
  Server,
  TrendingUp,
  RefreshCw,
  CheckCircle,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import { api } from '../api';
import type {
  User,
  AdminDashboardStats,
  AdminUserItem,
  AdminSubscriptionItem,
  AdminSystemHealth,
  ActivityLog,
} from '../types';
import { AdminOverview } from './admin/AdminOverview';
import { AdminUsers } from './admin/AdminUsers';
import { AdminSubscriptions } from './admin/AdminSubscriptions';
import { AdminActivity } from './admin/AdminActivity';
import { AdminSystem } from './admin/AdminSystem';

interface AdminPanelProps {
  currentUser: User;
}

type AdminSubTab = 'overview' | 'users' | 'subscriptions' | 'activity' | 'system';

export const AdminPanel: React.FC<AdminPanelProps> = ({ currentUser }) => {
  const [activeSubTab, setActiveSubTab] = useState<AdminSubTab>('overview');
  const [loading, setLoading] = useState<boolean>(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // Overview Stats
  const [stats, setStats] = useState<AdminDashboardStats | null>(null);

  // Users Tab State
  const [users, setUsers] = useState<AdminUserItem[]>([]);
  const [usersTotal, setUsersTotal] = useState<number>(0);
  const [usersPage, setUsersPage] = useState<number>(1);
  const [usersTotalPages, setUsersTotalPages] = useState<number>(1);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [roleFilter, setRoleFilter] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [planFilter, setPlanFilter] = useState<string>('');

  // Subscriptions Tab State
  const [subscriptions, setSubscriptions] = useState<AdminSubscriptionItem[]>([]);
  const [subsTotal, setSubsTotal] = useState<number>(0);
  const [subsPage, setSubsPage] = useState<number>(1);
  const [subsTotalPages, setSubsTotalPages] = useState<number>(1);

  // Activity Tab State
  const [activityLogs, setActivityLogs] = useState<ActivityLog[]>([]);
  const [actTotal, setActTotal] = useState<number>(0);
  const [actPage, setActPage] = useState<number>(1);
  const [actTotalPages, setActTotalPages] = useState<number>(1);
  const [actActionFilter, setActActionFilter] = useState<string>('');

  // System Health Tab State
  const [systemHealth, setSystemHealth] = useState<AdminSystemHealth | null>(null);
  const [workerRunning, setWorkerRunning] = useState<boolean>(false);
  const [workerResult, setWorkerResult] = useState<any>(null);

  const showNotification = (text: string, type: 'success' | 'error') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 5000);
  };

  const fetchOverview = async () => {
    try {
      setLoading(true);
      const data = await api.getAdminDashboard();
      setStats(data);
    } catch (err: any) {
      showNotification(err.message || 'Failed to load admin stats', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const data = await api.getAdminUsers({
        search: searchQuery || undefined,
        role: roleFilter || undefined,
        status: statusFilter || undefined,
        plan: planFilter || undefined,
        page: usersPage,
        limit: 15,
      });
      setUsers(data.users || []);
      setUsersTotal(data.total || 0);
      setUsersTotalPages(data.totalPages || 1);
    } catch (err: any) {
      showNotification(err.message || 'Failed to load users list', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSubscriptions = async () => {
    try {
      setLoading(true);
      const data = await api.getAdminSubscriptions({ page: subsPage, limit: 15 });
      setSubscriptions(data.subscriptions || []);
      setSubsTotal(data.total || 0);
      setSubsTotalPages(data.totalPages || 1);
    } catch (err: any) {
      showNotification(err.message || 'Failed to load subscriptions', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchActivity = async () => {
    try {
      setLoading(true);
      const data = await api.getAdminActivity({
        action: actActionFilter || undefined,
        page: actPage,
        limit: 25,
      });
      setActivityLogs(data.logs || []);
      setActTotal(data.total || 0);
      setActTotalPages(data.totalPages || 1);
    } catch (err: any) {
      showNotification(err.message || 'Failed to load activity logs', 'error');
    } finally {
      setLoading(false);
    }
  };

  const fetchSystem = async () => {
    try {
      setLoading(true);
      const data = await api.getAdminSystemHealth();
      setSystemHealth(data);
    } catch (err: any) {
      showNotification(err.message || 'Failed to load system health', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (currentUser.role !== 'ADMIN') return;
    if (activeSubTab === 'overview') fetchOverview();
    else if (activeSubTab === 'users') fetchUsers();
    else if (activeSubTab === 'subscriptions') fetchSubscriptions();
    else if (activeSubTab === 'activity') fetchActivity();
    else if (activeSubTab === 'system') fetchSystem();
  }, [activeSubTab, usersPage, subsPage, actPage, roleFilter, statusFilter, planFilter]);

  const handleSuspendUser = async (userId: string, userName: string) => {
    if (userId === currentUser.id) {
      alert('You cannot suspend your own administrative account.');
      return;
    }
    if (!window.confirm(`Are you sure you want to suspend account for "${userName}"? User sessions will be immediately revoked.`)) {
      return;
    }
    try {
      setActionLoading(userId);
      const res = await api.suspendUser(userId);
      showNotification(res.message, 'success');
      await fetchUsers();
    } catch (err: any) {
      showNotification(err.message || 'Failed to suspend user', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleRestoreUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Restore account access for "${userName}"?`)) {
      return;
    }
    try {
      setActionLoading(userId);
      const res = await api.restoreUser(userId);
      showNotification(res.message, 'success');
      await fetchUsers();
    } catch (err: any) {
      showNotification(err.message || 'Failed to restore user', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleRole = async (userId: string, currentRole: 'USER' | 'ADMIN', userName: string) => {
    const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
    if (userId === currentUser.id && newRole === 'USER') {
      alert('You cannot demote your own account from ADMIN role.');
      return;
    }
    if (!window.confirm(`Change role for "${userName}" to ${newRole}?`)) {
      return;
    }
    try {
      setActionLoading(userId);
      const res = await api.updateUserRole(userId, newRole);
      showNotification(res.message, 'success');
      await fetchUsers();
    } catch (err: any) {
      showNotification(err.message || 'Failed to update user role', 'error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleTriggerWorker = async () => {
    try {
      setWorkerRunning(true);
      const res = await api.triggerWorkerCycle();
      setWorkerResult(res);
      showNotification(`Worker completed: processed ${res.processedUsers} users, sent ${res.sentReminders} reminders.`, 'success');
      await fetchSystem();
    } catch (err: any) {
      showNotification(err.message || 'Failed to trigger worker', 'error');
    } finally {
      setWorkerRunning(false);
    }
  };

  if (currentUser.role !== 'ADMIN') {
    return (
      <div className="p-8 max-w-2xl mx-auto text-center" id="admin-unauthorized-view">
        <div className="w-16 h-16 bg-rose-100 dark:bg-rose-950/50 rounded-2xl flex items-center justify-center mx-auto mb-4 border border-rose-200 dark:border-rose-900/50">
          <Lock className="w-8 h-8 text-rose-600 dark:text-rose-400" />
        </div>
        <h2 className="text-2xl font-bold text-slate-900 dark:text-white mb-2">Access Denied</h2>
        <p className="text-slate-600 dark:text-slate-400 mb-6">
          The Receipto Administration Panel is strictly restricted to authorized system administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6" id="admin-panel-container">
      {/* Admin Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-indigo-600 dark:bg-indigo-500 text-white flex items-center justify-center shadow-md">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                Receipto Admin Console
              </h1>
              <span className="px-2 py-0.5 text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 rounded-full border border-indigo-200 dark:border-indigo-800">
                ADMIN
              </span>
            </div>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Operations, user management, billing subscriptions, and background workers
            </p>
          </div>
        </div>

        {/* Global Refresh */}
        <button
          id="btn-admin-refresh"
          onClick={() => {
            if (activeSubTab === 'overview') fetchOverview();
            else if (activeSubTab === 'users') fetchUsers();
            else if (activeSubTab === 'subscriptions') fetchSubscriptions();
            else if (activeSubTab === 'activity') fetchActivity();
            else if (activeSubTab === 'system') fetchSystem();
          }}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3.5 py-2 text-sm font-medium rounded-lg text-slate-700 dark:text-slate-200 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/60 transition shadow-sm"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-indigo-600' : ''}`} />
          <span>Refresh</span>
        </button>
      </div>

      {/* Notifications */}
      {message && (
        <div
          id="admin-notification-toast"
          className={`p-4 rounded-xl text-sm flex items-center gap-3 border ${
            message.type === 'success'
              ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/40'
              : 'bg-rose-50 dark:bg-rose-950/30 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/40'
          }`}
        >
          {message.type === 'success' ? (
            <CheckCircle className="w-5 h-5 text-emerald-600 dark:text-emerald-400 flex-shrink-0" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400 flex-shrink-0" />
          )}
          <span>{message.text}</span>
        </div>
      )}

      {/* Sub-Navigation Tabs */}
      <div className="flex border-b border-slate-200 dark:border-slate-800 overflow-x-auto">
        <button
          id="admin-tab-overview"
          onClick={() => setActiveSubTab('overview')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
            activeSubTab === 'overview'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <TrendingUp className="w-4 h-4" />
          <span>Overview</span>
        </button>

        <button
          id="admin-tab-users"
          onClick={() => setActiveSubTab('users')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
            activeSubTab === 'users'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Users className="w-4 h-4" />
          <span>Users ({stats?.total_users ?? usersTotal})</span>
        </button>

        <button
          id="admin-tab-subscriptions"
          onClick={() => setActiveSubTab('subscriptions')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
            activeSubTab === 'subscriptions'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <CreditCard className="w-4 h-4" />
          <span>Subscriptions</span>
        </button>

        <button
          id="admin-tab-activity"
          onClick={() => setActiveSubTab('activity')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
            activeSubTab === 'activity'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Activity className="w-4 h-4" />
          <span>Audit Log</span>
        </button>

        <button
          id="admin-tab-system"
          onClick={() => setActiveSubTab('system')}
          className={`px-4 py-2.5 text-sm font-medium border-b-2 whitespace-nowrap flex items-center gap-2 transition ${
            activeSubTab === 'system'
              ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400 dark:border-indigo-400'
              : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
          }`}
        >
          <Server className="w-4 h-4" />
          <span>System & Worker</span>
        </button>
      </div>

      {activeSubTab === 'overview' && <AdminOverview stats={stats} />}

      {activeSubTab === 'users' && (
        <AdminUsers
          users={users}
          usersTotal={usersTotal}
          usersPage={usersPage}
          usersTotalPages={usersTotalPages}
          loading={loading}
          actionLoading={actionLoading}
          searchQuery={searchQuery}
          roleFilter={roleFilter}
          statusFilter={statusFilter}
          planFilter={planFilter}
          currentUserId={currentUser.id}
          onSearchChange={setSearchQuery}
          onRoleFilterChange={(r) => { setRoleFilter(r); setUsersPage(1); }}
          onStatusFilterChange={(s) => { setStatusFilter(s); setUsersPage(1); }}
          onPlanFilterChange={(p) => { setPlanFilter(p); setUsersPage(1); }}
          onFilterSubmit={() => { setUsersPage(1); fetchUsers(); }}
          onPageChange={setUsersPage}
          onToggleRole={handleToggleRole}
          onSuspendUser={handleSuspendUser}
          onRestoreUser={handleRestoreUser}
        />
      )}

      {activeSubTab === 'subscriptions' && (
        <AdminSubscriptions
          subscriptions={subscriptions}
          subsTotal={subsTotal}
          subsPage={subsPage}
          subsTotalPages={subsTotalPages}
          loading={loading}
          onPageChange={setSubsPage}
        />
      )}

      {activeSubTab === 'activity' && (
        <AdminActivity
          activityLogs={activityLogs}
          actTotal={actTotal}
          actPage={actPage}
          actTotalPages={actTotalPages}
          loading={loading}
          actActionFilter={actActionFilter}
          onActionFilterChange={setActActionFilter}
          onFilterSubmit={() => { setActPage(1); fetchActivity(); }}
          onPageChange={setActPage}
        />
      )}

      {activeSubTab === 'system' && (
        <AdminSystem
          systemHealth={systemHealth}
          workerRunning={workerRunning}
          workerResult={workerResult}
          onTriggerWorker={handleTriggerWorker}
        />
      )}
    </div>
  );
};
