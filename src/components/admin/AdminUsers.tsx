import React from 'react';
import {
  Search,
  Shield,
  UserX,
  UserCheck,
  ChevronLeft,
  ChevronRight,
  XCircle,
} from 'lucide-react';
import type { AdminUserItem } from '../../types';

interface AdminUsersProps {
  users: AdminUserItem[];
  usersTotal: number;
  usersPage: number;
  usersTotalPages: number;
  loading: boolean;
  actionLoading: string | null;
  searchQuery: string;
  roleFilter: string;
  statusFilter: string;
  planFilter: string;
  currentUserId: string;
  onSearchChange: (q: string) => void;
  onRoleFilterChange: (r: string) => void;
  onStatusFilterChange: (s: string) => void;
  onPlanFilterChange: (p: string) => void;
  onFilterSubmit: () => void;
  onPageChange: (p: number) => void;
  onToggleRole: (id: string, currentRole: 'USER' | 'ADMIN', name: string) => void;
  onSuspendUser: (id: string, name: string) => void;
  onRestoreUser: (id: string, name: string) => void;
}

export const AdminUsers: React.FC<AdminUsersProps> = ({
  users,
  usersTotal,
  usersPage,
  usersTotalPages,
  loading,
  actionLoading,
  searchQuery,
  roleFilter,
  statusFilter,
  planFilter,
  currentUserId,
  onSearchChange,
  onRoleFilterChange,
  onStatusFilterChange,
  onPlanFilterChange,
  onFilterSubmit,
  onPageChange,
  onToggleRole,
  onSuspendUser,
  onRestoreUser,
}) => {
  return (
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
            onChange={(e) => onSearchChange(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && onFilterSubmit()}
            className="w-full pl-9 pr-4 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            id="admin-filter-role"
            value={roleFilter}
            onChange={(e) => onRoleFilterChange(e.target.value)}
            className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300"
          >
            <option value="">All Roles</option>
            <option value="USER">Standard User</option>
            <option value="ADMIN">Administrator</option>
          </select>

          <select
            id="admin-filter-status"
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300"
          >
            <option value="">All Statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="SUSPENDED">Suspended</option>
          </select>

          <select
            id="admin-filter-plan"
            value={planFilter}
            onChange={(e) => onPlanFilterChange(e.target.value)}
            className="px-3 py-2 text-sm bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-slate-700 dark:text-slate-300"
          >
            <option value="">All Plans</option>
            <option value="FREE">Free</option>
            <option value="STARTER">Starter</option>
            <option value="GROWTH">Growth</option>
          </select>

          <button
            id="btn-admin-search-users"
            onClick={onFilterSubmit}
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
                  const isSelf = u.id === currentUserId;
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
                          <button
                            title={u.role === 'ADMIN' ? 'Demote to standard user' : 'Promote to administrator'}
                            disabled={actionLoading === u.id || isSelf}
                            onClick={() => onToggleRole(u.id, u.role, u.name)}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition disabled:opacity-40"
                          >
                            <Shield className="w-4 h-4" />
                          </button>

                          {u.status === 'ACTIVE' ? (
                            <button
                              title="Suspend account"
                              disabled={actionLoading === u.id || isSelf}
                              onClick={() => onSuspendUser(u.id, u.name)}
                              className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition disabled:opacity-40"
                            >
                              <UserX className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              title="Restore account"
                              disabled={actionLoading === u.id}
                              onClick={() => onRestoreUser(u.id, u.name)}
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
                onClick={() => onPageChange(Math.max(1, usersPage - 1))}
                className="p-1.5 rounded border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40 transition"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                disabled={usersPage >= usersTotalPages}
                onClick={() => onPageChange(usersPage + 1)}
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
