import React, { useState, useEffect } from 'react';
import {
  Shield,
  Users,
  CreditCard,
  Activity,
  Server,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  XCircle,
  RefreshCw,
  Play,
  UserCheck,
  UserX,
  TrendingUp,
  DollarSign,
  FileText,
  Clock,
  ExternalLink,
  Lock,
  ChevronLeft,
  ChevronRight,
  Database
} from 'lucide-react';
import { api } from '../api';
import type {
  User,
  AdminDashboardStats,
  AdminUserItem,
  AdminSubscriptionItem,
  AdminSystemHealth,
  ActivityLog
} from '../types';

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

  // Fetch data based on active tab
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
        search: searchQuery,
        role: roleFilter,
        status: statusFilter,
        plan: planFilter,
        page: usersPage,
        limit: 15,
      });
      setUsers(data.users);
      setUsersTotal(data.total);
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
      const data = await api.getAdminSubscriptions({
        page: subsPage,
        limit: 15,
      });
      setSubscriptions(data.subscriptions);
      setSubsTotal(data.total);
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
        action: actActionFilter,
        page: actPage,
        limit: 25,
      });
      setActivityLogs(data.logs);
      setActTotal(data.total);
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
      showNotification(err.message || 'Failed to load system diagnostics', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'overview') fetchOverview();
    else if (activeSubTab === 'users') fetchUsers();
    else if (activeSubTab === 'subscriptions') fetchSubscriptions();
    else if (activeSubTab === 'activity') fetchActivity();
    else if (activeSubTab === 'system') fetchSystem();
  }, [activeSubTab, usersPage, roleFilter, statusFilter, planFilter, subsPage, actPage, actActionFilter]);

  // Actions on Users
  const handleSuspendUser = async (userId: string, userName: string) => {
    if (!window.confirm(`Are you sure you want to suspend account for "${userName}"? They will be logged out and unable to access Receipto.`)) {
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

  // Trigger Worker Cycle
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

  // Security gate check (server-side enforces too)
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

      {/* TAB 1: OVERVIEW */}
      {activeSubTab === 'overview' && (
        <div className="space-y-6" id="admin-view-overview">
          {stats ? (
            <>
              {/* Metric Cards Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Users Metric */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Total Accounts</span>
                    <Users className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
                  </div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white">
                    {stats.total_users}
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {stats.verified_users} verified
                    </span>
                    •
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      {stats.unverified_users} unverified
                    </span>
                  </div>
                </div>

                {/* Subscriptions Metric */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Active Subscriptions</span>
                    <DollarSign className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">
                    {stats.active_subscriptions}
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    {stats.starter_users} Starter • {stats.growth_users} Growth
                  </div>
                </div>

                {/* Invoices Metric */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Total Invoices</span>
                    <FileText className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                  </div>
                  <div className="text-3xl font-bold text-slate-900 dark:text-white">
                    {stats.total_invoices}
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                    <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                      {stats.paid_invoices} paid
                    </span>
                    •
                    <span className="text-amber-600 dark:text-amber-400 font-medium">
                      {stats.overdue_invoices} overdue
                    </span>
                  </div>
                </div>

                {/* System Diagnostics Metric */}
                <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 mb-2">
                    <span className="text-xs font-semibold uppercase tracking-wider">Engine & Health</span>
                    <Database className="w-5 h-5 text-purple-600 dark:text-purple-400" />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
                    <span className="text-xl font-bold text-slate-900 dark:text-white uppercase">
                      {stats.system_health.database}
                    </span>
                  </div>
                  <div className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                    Worker: {stats.system_health.worker}
                  </div>
                </div>
              </div>

              {/* Tier Distribution & Quick Details */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                    Subscription Plan Breakdown
                  </h3>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-slate-700 dark:text-slate-300">Free Tier</span>
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">{stats.free_users} users</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-slate-400 dark:bg-slate-500 rounded-full"
                          style={{
                            width: `${stats.total_users ? (stats.free_users / stats.total_users) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-indigo-600 dark:text-indigo-400">Starter Plan ($9/mo)</span>
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">{stats.starter_users} users</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-indigo-600 dark:bg-indigo-500 rounded-full"
                          style={{
                            width: `${stats.total_users ? (stats.starter_users / stats.total_users) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="font-medium text-purple-600 dark:text-purple-400">Growth Plan ($24/mo)</span>
                        <span className="text-slate-500 dark:text-slate-400 font-semibold">{stats.growth_users} users</span>
                      </div>
                      <div className="w-full h-2.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-purple-600 dark:bg-purple-500 rounded-full"
                          style={{
                            width: `${stats.total_users ? (stats.growth_users / stats.total_users) * 100 : 0}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm">
                  <h3 className="text-base font-bold text-slate-900 dark:text-white mb-4 flex items-center gap-2">
                    <Activity className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
                    Operational Summary
                  </h3>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400">Total Invoices Tracked</span>
                      <span className="font-semibold text-slate-900 dark:text-white">
                        {stats.total_invoices} invoices
                      </span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400">Paid Invoices Count</span>
                      <span className="font-semibold text-emerald-600 dark:text-emerald-400">{stats.paid_invoices}</span>
                    </div>
                    <div className="flex justify-between py-2 border-b border-slate-100 dark:border-slate-800">
                      <span className="text-slate-500 dark:text-slate-400">Overdue Invoices Count</span>
                      <span className="font-semibold text-amber-600 dark:text-amber-400">{stats.overdue_invoices}</span>
                    </div>
                    <div className="flex justify-between py-2">
                      <span className="text-slate-500 dark:text-slate-400">Automated Reminders Sent</span>
                      <span className="font-semibold text-slate-900 dark:text-white">{stats.reminders_sent}</span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-500 dark:text-slate-400">
              Loading operational metrics...
            </div>
          )}
        </div>
      )}

      {/* TAB 2: USERS MANAGEMENT */}
      {activeSubTab === 'users' && (
        <div className="space-y-4" id="admin-view-users">
          {/* Filters and Search Bar */}
          <div className="flex flex-col md:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                id="admin-search-users"
                type="text"
                placeholder="Search user by name or email..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && fetchUsers()}
                className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
              />
            </div>

            <div className="flex flex-wrap gap-2">
              <select
                id="admin-filter-role"
                value={roleFilter}
                onChange={(e) => { setRoleFilter(e.target.value); setUsersPage(1); }}
                className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300"
              >
                <option value="">All Roles</option>
                <option value="USER">Standard User</option>
                <option value="ADMIN">Administrator</option>
              </select>

              <select
                id="admin-filter-status"
                value={statusFilter}
                onChange={(e) => { setStatusFilter(e.target.value); setUsersPage(1); }}
                className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300"
              >
                <option value="">All Statuses</option>
                <option value="ACTIVE">Active</option>
                <option value="SUSPENDED">Suspended</option>
              </select>

              <select
                id="admin-filter-plan"
                value={planFilter}
                onChange={(e) => { setPlanFilter(e.target.value); setUsersPage(1); }}
                className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300"
              >
                <option value="">All Plans</option>
                <option value="FREE">Free</option>
                <option value="STARTER">Starter</option>
                <option value="GROWTH">Growth</option>
              </select>

              <button
                id="btn-admin-search-users"
                onClick={() => { setUsersPage(1); fetchUsers(); }}
                className="px-4 py-2 text-sm font-medium bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition shadow-sm"
              >
                Filter
              </button>
            </div>
          </div>

          {/* Users Table */}
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" id="admin-users-table">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">User</th>
                    <th className="px-4 py-3.5">Role</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Plan</th>
                    <th className="px-4 py-3.5 text-center">Clients</th>
                    <th className="px-4 py-3.5 text-center">Invoices</th>
                    <th className="px-4 py-3.5">Last Login</th>
                    <th className="px-5 py-3.5 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {users.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-5 py-8 text-center text-slate-400">
                        {loading ? 'Loading users...' : 'No users match the search criteria.'}
                      </td>
                    </tr>
                  ) : (
                    users.map((u) => {
                      const isSelf = u.id === currentUser.id;
                      return (
                        <tr key={u.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                          <td className="px-5 py-3.5">
                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{u.name}</span>
                              {isSelf && (
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                                  YOU
                                </span>
                              )}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                              {u.email}
                            </div>
                            {u.business_name && (
                              <div className="text-[11px] text-slate-400 dark:text-slate-500">
                                {u.business_name}
                              </div>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            {u.role === 'ADMIN' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                                <Shield className="w-3 h-3" />
                                ADMIN
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                                USER
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            {u.status === 'ACTIVE' ? (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                                Active
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300">
                                <XCircle className="w-3 h-3" />
                                Suspended
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-3.5">
                            <span
                              className={`px-2 py-0.5 rounded text-xs font-semibold ${
                                u.plan === 'GROWTH'
                                  ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300'
                                  : u.plan === 'STARTER'
                                  ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                              }`}
                            >
                              {u.plan}
                            </span>
                          </td>
                          <td className="px-4 py-3.5 text-center font-medium">
                            {u.client_count}
                          </td>
                          <td className="px-4 py-3.5 text-center font-medium">
                            {u.invoice_count}
                          </td>
                          <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                            {u.last_login_at
                              ? new Date(u.last_login_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                              : 'Never'}
                          </td>
                          <td className="px-5 py-3.5 text-right">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Toggle Role Button */}
                              <button
                                title={u.role === 'ADMIN' ? 'Demote to standard user' : 'Promote to administrator'}
                                disabled={actionLoading === u.id || isSelf}
                                onClick={() => handleToggleRole(u.id, u.role, u.name)}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-40"
                              >
                                <Shield className="w-4 h-4" />
                              </button>

                              {/* Suspend / Restore Button */}
                              {u.status === 'ACTIVE' ? (
                                <button
                                  title="Suspend account"
                                  disabled={actionLoading === u.id || isSelf}
                                  onClick={() => handleSuspendUser(u.id, u.name)}
                                  className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-40"
                                >
                                  <UserX className="w-4 h-4" />
                                </button>
                              ) : (
                                <button
                                  title="Restore account"
                                  disabled={actionLoading === u.id}
                                  onClick={() => handleRestoreUser(u.id, u.name)}
                                  className="p-1.5 text-slate-500 hover:text-emerald-600 hover:bg-emerald-50 dark:hover:bg-emerald-950/30 rounded-lg transition disabled:opacity-40"
                                >
                                  <UserCheck className="w-4 h-4" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {usersTotalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Showing page {usersPage} of {usersTotalPages} ({usersTotal} total users)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={usersPage <= 1}
                    onClick={() => setUsersPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={usersPage >= usersTotalPages}
                    onClick={() => setUsersPage((p) => p + 1)}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: SUBSCRIPTIONS */}
      {activeSubTab === 'subscriptions' && (
        <div className="space-y-4" id="admin-view-subscriptions">
          <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm" id="admin-subscriptions-table">
                <thead className="bg-slate-50 dark:bg-slate-800/60 text-slate-500 dark:text-slate-400 text-xs font-semibold uppercase tracking-wider border-b border-slate-200 dark:border-slate-800">
                  <tr>
                    <th className="px-5 py-3.5">Subscriber</th>
                    <th className="px-4 py-3.5">Plan Tier</th>
                    <th className="px-4 py-3.5">Billing Cadence</th>
                    <th className="px-4 py-3.5">Status</th>
                    <th className="px-4 py-3.5">Provider</th>
                    <th className="px-4 py-3.5">Period End</th>
                    <th className="px-4 py-3.5">Provider ID</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800 text-slate-700 dark:text-slate-300">
                  {subscriptions.length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-5 py-8 text-center text-slate-400">
                        {loading ? 'Loading subscriptions...' : 'No subscriptions recorded.'}
                      </td>
                    </tr>
                  ) : (
                    subscriptions.map((sub) => (
                      <tr key={sub.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                        <td className="px-5 py-3.5">
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {sub.user_name}
                          </div>
                          <div className="text-xs text-slate-500 dark:text-slate-400 font-mono">
                            {sub.user_email}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`px-2 py-0.5 rounded text-xs font-semibold ${
                              sub.plan === 'GROWTH'
                                ? 'bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300'
                                : sub.plan === 'STARTER'
                                ? 'bg-indigo-100 dark:bg-indigo-950/50 text-indigo-700 dark:text-indigo-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {sub.plan}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs capitalize text-slate-600 dark:text-slate-400">
                          {sub.billing_interval || 'monthly'}
                        </td>
                        <td className="px-4 py-3.5">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              sub.status === 'active'
                                ? 'bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300'
                                : sub.status === 'past_due'
                                ? 'bg-rose-100 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                            }`}
                          >
                            {sub.status}
                          </span>
                        </td>
                        <td className="px-4 py-3.5 text-xs uppercase font-semibold text-slate-500 dark:text-slate-400">
                          {sub.provider || 'local'}
                        </td>
                        <td className="px-4 py-3.5 text-xs text-slate-500 dark:text-slate-400">
                          {sub.current_period_end
                            ? new Date(sub.current_period_end).toLocaleDateString()
                            : 'N/A'}
                        </td>
                        <td className="px-4 py-3.5 text-xs font-mono text-slate-400 dark:text-slate-500">
                          {sub.provider_subscription_id ? sub.provider_subscription_id.slice(0, 16) + '...' : '—'}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {/* Pagination Controls */}
            {subsTotalPages > 1 && (
              <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
                <span>
                  Showing page {subsPage} of {subsTotalPages} ({subsTotal} total subscriptions)
                </span>
                <div className="flex items-center gap-1">
                  <button
                    disabled={subsPage <= 1}
                    onClick={() => setSubsPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={subsPage >= subsTotalPages}
                    onClick={() => setSubsPage((p) => p + 1)}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 4: AUDIT ACTIVITY LOG */}
      {activeSubTab === 'activity' && (
        <div className="space-y-4" id="admin-view-activity">
          <div className="flex items-center gap-3">
            <input
              type="text"
              placeholder="Filter by action (e.g., USER_LOGGED_IN, INVOICE_CREATED)..."
              value={actActionFilter}
              onChange={(e) => setActActionFilter(e.target.value)}
              className="px-3.5 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl flex-1 text-slate-900 dark:text-white"
            />
            <button
              onClick={() => { setActPage(1); fetchActivity(); }}
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
                    onClick={() => setActPage((p) => Math.max(1, p - 1))}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <button
                    disabled={actPage >= actTotalPages}
                    onClick={() => setActPage((p) => p + 1)}
                    className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 5: SYSTEM & WORKER */}
      {activeSubTab === 'system' && (
        <div className="space-y-6" id="admin-view-system">
          {systemHealth && (
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
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold border ${
                    systemHealth.worker.running
                      ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                      : 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
                  }`}>
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
                    onClick={handleTriggerWorker}
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
          )}
        </div>
      )}
    </div>
  );
};
