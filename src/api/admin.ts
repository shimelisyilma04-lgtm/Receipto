import { request } from './client.js';

export const adminApi = {
  getAdminDashboard: () => request<import('../types.js').AdminDashboardStats>('/api/admin/dashboard'),
  getAdminUsers: (params?: { search?: string; role?: string; status?: string; plan?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.role) query.set('role', params.role);
    if (params?.status) query.set('status', params.status);
    if (params?.plan) query.set('plan', params.plan);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{ users: import('../types.js').AdminUserItem[]; total: number; page: number; totalPages: number }>(`/api/admin/users${qs ? `?${qs}` : ''}`);
  },
  suspendUser: (userId: string) =>
    request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/suspend`, { method: 'POST' }),
  restoreUser: (userId: string) =>
    request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/restore`, { method: 'POST' }),
  updateUserRole: (userId: string, role: 'USER' | 'ADMIN') =>
    request<{ success: boolean; message: string }>(`/api/admin/users/${userId}/role`, {
      method: 'POST',
      body: JSON.stringify({ role }),
    }),
  getAdminSubscriptions: (params?: { page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{ subscriptions: import('../types.js').AdminSubscriptionItem[]; total: number; page: number; totalPages: number }>(`/api/admin/subscriptions${qs ? `?${qs}` : ''}`);
  },
  getAdminActivity: (params?: { userId?: string; action?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.userId) query.set('userId', params.userId);
    if (params?.action) query.set('action', params.action);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{ logs: any[]; total: number; page: number; totalPages: number }>(`/api/admin/activity${qs ? `?${qs}` : ''}`);
  },
  getAdminSystemHealth: () => request<import('../types.js').AdminSystemHealth>('/api/admin/system'),
  triggerWorkerCycle: () =>
    request<{ success: boolean; processedUsers: number; sentReminders: number; errors: any[] }>('/api/admin/system/trigger-worker', {
      method: 'POST',
    }),
};
