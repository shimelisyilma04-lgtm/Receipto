// Centralized API client for Receipto

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

const TOKEN_KEY = 'receipto_auth_token';

export function getStoredToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setStoredToken(token?: string | null) {
  try {
    if (token) {
      localStorage.setItem(TOKEN_KEY, token);
    } else {
      localStorage.removeItem(TOKEN_KEY);
    }
  } catch {
    // Ignore storage issues
  }
}

export interface RequestOptions extends RequestInit {
  timeout?: number;
  retries?: number;
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const method = (options.method || 'GET').toUpperCase();
  const maxRetries = options.retries ?? (method === 'GET' ? 1 : 0);
  const timeoutMs = options.timeout ?? 45000;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }

    // Fallback token header for cross-origin iframes where 3rd-party cookies may be blocked
    const token = getStoredToken();
    if (token && !headers.has('Authorization')) {
      headers.set('Authorization', `Bearer ${token}`);
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    if (options.signal) {
      options.signal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(path, {
        ...options,
        headers,
        credentials: 'include', // sends cookies
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const text = await response.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        data = { error: text };
      }

      if (!response.ok) {
        if (response.status === 401 && path !== '/api/auth/login' && path !== '/api/auth/register') {
          setStoredToken(null);
        }
        const errorMsg = data?.error || data?.message || (typeof data === 'string' && data ? data : `Request failed with status ${response.status}`);
        throw new ApiError(errorMsg, response.status);
      }

      // If response yielded a token, persist it
      if (data && typeof data.token === 'string') {
        setStoredToken(data.token);
      }

      return data as T;
    } catch (err: any) {
      clearTimeout(timeoutId);
      const isAbort = err.name === 'AbortError';
      const isRetryable = attempt < maxRetries && (isAbort || err instanceof TypeError);

      if (isRetryable) {
        // Wait 500ms before retrying idempotent requests
        await new Promise((r) => setTimeout(r, 500));
        continue;
      }

      if (isAbort) {
        throw new ApiError('Request timed out. Please try again.', 408);
      }
      throw err;
    }
  }

  throw new ApiError('Request failed after retries.', 500);
}

export const api = {
  // Auth
  getMe: () =>
    request<{
      user: any;
      requires_verification?: boolean;
      email_delivery?: 'sent' | 'not_configured' | 'error';
      dev_preview_otp?: string;
      message?: string;
    }>('/api/auth/me'),
  login: async (credentials: { email: string; password: string }) => {
    const res = await request<{
      user: any;
      token?: string;
      requires_verification?: boolean;
      email_delivery?: 'sent' | 'not_configured' | 'error';
      email_sent?: boolean;
      email_error?: string;
      dev_preview_otp?: string;
      message?: string;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(credentials),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },
  register: async (data: { email: string; password: string; confirm_password?: string; name: string; business_name?: string; terms_accepted: boolean }) => {
    const res = await request<{
      user: any;
      token?: string;
      requires_verification?: boolean;
      email_delivery?: 'sent' | 'not_configured' | 'error';
      email_sent?: boolean;
      email_error?: string;
      dev_preview_otp?: string;
      message?: string;
    }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },
  verifyEmail: async (data: { code: string; email?: string; user_id?: string }) => {
    const res = await request<{ success: boolean; message: string; user: any; token?: string }>('/api/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify(data),
    });
    if (res.token) setStoredToken(res.token);
    return res;
  },
  resendVerificationCode: (data: { email?: string; user_id?: string }) =>
    request<{
      success: boolean;
      message: string;
      email_delivery?: 'sent' | 'not_configured' | 'error';
      email_sent?: boolean;
      email_error?: string;
      dev_preview_otp?: string;
      cooldown_seconds?: number;
    }>('/api/auth/resend-code', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  changeRegistrationEmail: (data: { new_email: string; current_email?: string; user_id?: string }) =>
    request<{
      success: boolean;
      message: string;
      email: string;
      email_delivery?: 'sent' | 'not_configured' | 'error';
      email_sent?: boolean;
      email_error?: string;
      dev_preview_otp?: string;
    }>('/api/auth/change-registration-email', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  deleteAccount: () =>
    request<{ success: boolean; message: string }>('/api/auth/account', {
      method: 'DELETE',
    }),
  logout: async () => {
    try {
      await request<{ message: string }>('/api/auth/logout', {
        method: 'POST',
      });
    } finally {
      setStoredToken(null);
    }
  },
  updatePassword: (data: { current_password: string; new_password: string }) =>
    request<{ message: string }>('/api/auth/password', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  // Dashboard
  getDashboard: () => request<{ stats: any }>('/api/dashboard'),

  // Clients
  getClients: () => request<{ clients: any[] }>('/api/clients'),
  getClient: (id: string) => request<{ client: any }>(`/api/clients/${id}`),
  createClient: (client: { name: string; email: string; phone?: string; company?: string; address?: string }) =>
    request<{ client: any }>('/api/clients', {
      method: 'POST',
      body: JSON.stringify(client),
    }),
  updateClient: (id: string, client: Partial<{ name: string; email: string; phone?: string; company?: string; address?: string }>) =>
    request<{ client: any }>(`/api/clients/${id}`, {
      method: 'PUT',
      body: JSON.stringify(client),
    }),
  deleteClient: (id: string) =>
    request<{ message: string }>(`/api/clients/${id}`, {
      method: 'DELETE',
    }),

  // Invoices
  getInvoices: (params?: { status?: string; client_id?: string; search?: string }) => {
    const searchParams = new URLSearchParams();
    if (params?.status) searchParams.set('status', params.status);
    if (params?.client_id) searchParams.set('client_id', params.client_id);
    if (params?.search) searchParams.set('search', params.search);
    const query = searchParams.toString();
    return request<{ invoices: any[] }>(`/api/invoices${query ? `?${query}` : ''}`);
  },
  getInvoice: (id: string) => request<{ invoice: any }>(`/api/invoices/${id}`),
  createInvoice: (data: { client_id: string; invoice_number: string; amount: number; currency?: string; issue_date: string; due_date: string; notes?: string }) =>
    request<{ invoice: any }>('/api/invoices', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  updateInvoice: (id: string, data: Partial<{ client_id: string; invoice_number: string; amount: number; currency?: string; issue_date: string; due_date: string; notes?: string }>) =>
    request<{ invoice: any }>(`/api/invoices/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  markInvoicePaid: (id: string, paid_date?: string) =>
    request<{ invoice: any; message: string }>(`/api/invoices/${id}/pay`, {
      method: 'POST',
      body: JSON.stringify({ paid_date }),
    }),
  cancelInvoice: (id: string) =>
    request<{ invoice: any; message: string }>(`/api/invoices/${id}/cancel`, {
      method: 'POST',
    }),
  deleteInvoice: (id: string) =>
    request<{ message: string }>(`/api/invoices/${id}`, {
      method: 'DELETE',
    }),

  // Reminders
  getReminders: (invoiceId?: string) => {
    const q = invoiceId ? `?invoice_id=${invoiceId}` : '';
    return request<{ reminders: any[] }>(`/api/reminders${q}`);
  },
  previewReminder: (invoice_id: string, tone: 'friendly' | 'standard' | 'urgent', custom_message?: string) =>
    request<{ preview: { subject: string; html: string; text: string }; recipient: string; isEmailConfigured: boolean }>('/api/reminders/preview', {
      method: 'POST',
      body: JSON.stringify({ invoice_id, tone, custom_message }),
    }),
  sendReminder: (invoice_id: string, tone: 'friendly' | 'standard' | 'urgent', custom_message?: string) =>
    request<{ success: boolean; configured: boolean; message: string; reminder: any }>('/api/reminders/send', {
      method: 'POST',
      body: JSON.stringify({ invoice_id, tone, custom_message }),
    }),

  // Activity & Settings
  getActivity: (limit = 50) =>
    request<{ logs: any[]; full_history_unlocked?: boolean; upgrade_required?: boolean; plan?: string }>(
      `/api/activity?limit=${limit}`
    ),
  getConfig: () => request<any>('/api/settings/config'),
  updateProfile: (profile: { name?: string; business_name?: string }) =>
    request<{ message: string; user: any }>('/api/settings/profile', {
      method: 'POST',
      body: JSON.stringify(profile),
    }),

  // Reminders automation & schedules
  runAutomatedReminders: () =>
    request<{ message: string; processed: number; results: any[] }>('/api/reminders/automate', {
      method: 'POST',
    }),
  saveReminderSchedule: (cadence: string) =>
    request<{ message: string; cadence: string }>('/api/reminders/schedules', {
      method: 'POST',
      body: JSON.stringify({ cadence }),
    }),

  // Billing & Subscriptions
  getSubscription: () => request<import('./types.js').SubscriptionDetails>('/api/billing/subscription'),
  createCheckoutSession: (plan: 'STARTER' | 'GROWTH', interval: 'monthly' | 'annual') =>
    request<{
      success: boolean;
      paddle_configured: boolean;
      environment: string;
      client_token: string;
      price_id: string;
      plan: 'STARTER' | 'GROWTH';
      interval: 'monthly' | 'annual';
      customer_email?: string;
      customer_id?: string;
      custom_data?: any;
      checkout_params: any;
    }>('/api/billing/checkout', {
      method: 'POST',
      body: JSON.stringify({ plan, interval }),
    }),
  createCustomerPortalSession: () =>
    request<{
      subscription_id?: string;
      status?: string;
      plan?: string;
      update_payment_method_url?: string | null;
      cancel_url?: string | null;
      message?: string;
    }>('/api/billing/portal', {
      method: 'POST',
    }),
  cancelSubscription: () =>
    request<{ message: string; subscription: any }>('/api/billing/cancel', {
      method: 'POST',
    }),
  confirmSession: (data: string | { session_id?: string; transaction_id?: string; subscription_id?: string; customer_id?: string; plan?: string; interval?: string }) => {
    const body = typeof data === 'string' ? { session_id: data } : data;
    return request<import('./types.js').SubscriptionDetails & { success: boolean; message: string }>('/api/billing/confirm-transaction', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },
  simulatePlan: (plan: import('./plans.js').PlanTier, interval?: import('./plans.js').BillingInterval) =>
    request<import('./types.js').SubscriptionDetails & { message: string }>('/api/billing/simulate', {
      method: 'POST',
      body: JSON.stringify({ plan, interval }),
    }),
  switchOwnerDemoPlan: (plan: import('./plans.js').PlanTier) =>
    request<import('./types.js').SubscriptionDetails & { success: boolean; message: string }>('/api/billing/owner-demo/switch-plan', {
      method: 'POST',
      body: JSON.stringify({ plan }),
    }),

  // Admin Management
  getAdminDashboard: () => request<import('./types.js').AdminDashboardStats>('/api/admin/dashboard'),
  getAdminUsers: (params?: { search?: string; role?: string; status?: string; plan?: string; page?: number; limit?: number }) => {
    const query = new URLSearchParams();
    if (params?.search) query.set('search', params.search);
    if (params?.role) query.set('role', params.role);
    if (params?.status) query.set('status', params.status);
    if (params?.plan) query.set('plan', params.plan);
    if (params?.page) query.set('page', String(params.page));
    if (params?.limit) query.set('limit', String(params.limit));
    const qs = query.toString();
    return request<{ users: import('./types.js').AdminUserItem[]; total: number; page: number; totalPages: number }>(`/api/admin/users${qs ? `?${qs}` : ''}`);
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
    return request<{ subscriptions: import('./types.js').AdminSubscriptionItem[]; total: number; page: number; totalPages: number }>(`/api/admin/subscriptions${qs ? `?${qs}` : ''}`);
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
  getAdminSystemHealth: () => request<import('./types.js').AdminSystemHealth>('/api/admin/system'),
  triggerWorkerCycle: () => request<{ success: boolean; processedUsers: number; sentReminders: number; errors: any[] }>('/api/admin/system/trigger-worker', { method: 'POST' }),
};

