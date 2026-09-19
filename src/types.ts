export type TabType = 'dashboard' | 'invoices' | 'clients' | 'reminders' | 'activity' | 'billing' | 'pricing' | 'settings' | 'admin';

export * from './plans.js';

export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export interface Subscription {
  id: string;
  user_id: string;
  plan: import('./plans.js').PlanTier;
  status: import('./plans.js').SubscriptionStatus;
  billing_interval: import('./plans.js').BillingInterval;
  provider: import('./plans.js').SubscriptionProvider;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionUsage {
  client_count: number;
  max_clients: number | null;
  invoices_this_period: number;
  max_invoices_per_month: number | null;
  period_start: string;
  period_end: string | null;
  automated_reminders_count: number;
}

export interface SubscriptionDetails {
  subscription: Subscription;
  plan_config: import('./plans.js').PlanConfig;
  usage: SubscriptionUsage;
  is_active: boolean;
  stripe_configured: boolean;
}

export interface User {
  id: string;
  email: string;
  name: string;
  business_name?: string;
  email_verified: boolean;
  role: UserRole;
  status: UserStatus;
  terms_accepted_at?: string;
  terms_version?: string;
  last_login_at?: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  phone?: string;
  company?: string;
  address?: string;
  created_at: string;
  updated_at: string;
}

export type PaymentStatus = 'UNPAID' | 'PAID' | 'OVERDUE' | 'CANCELLED';

export interface Invoice {
  id: string;
  user_id: string;
  client_id: string;
  client_name?: string;
  client_email?: string;
  client_company?: string;
  client_phone?: string;
  client_address?: string;
  invoice_number: string;
  amount: number;
  currency: string;
  issue_date: string;
  due_date: string;
  payment_status: PaymentStatus;
  paid_date?: string | null;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  invoice_id: string;
  client_id: string;
  recipient_email: string;
  subject: string;
  message: string;
  sent_at: string;
  status: 'SENT' | 'FAILED' | 'CONFIG_REQUIRED';
  error_message?: string;
}

export interface ActivityLog {
  id: string;
  action: string;
  details: string;
  metadata?: Record<string, any>;
  created_at: string;
}

export interface DashboardStats {
  total_outstanding: number;
  total_overdue: number;
  total_paid: number;
  invoice_counts: {
    total: number;
    unpaid: number;
    overdue: number;
    paid: number;
    cancelled: number;
  };
  client_count: number;
  urgent_invoices: Invoice[];
  recent_activity: ActivityLog[];
}

export interface SystemConfig {
  environment: string;
  database: {
    engine: string;
    connected: boolean;
    configured: boolean;
  };
  email_service: {
    provider: string;
    configured: boolean;
    from_email: string;
  };
  app_version: string;
}

export interface AdminDashboardStats {
  total_users: number;
  verified_users: number;
  unverified_users: number;
  free_users: number;
  starter_users: number;
  growth_users: number;
  active_subscriptions: number;
  past_due_subscriptions: number;
  cancelled_subscriptions: number;
  total_invoices: number;
  paid_invoices: number;
  overdue_invoices: number;
  reminders_sent: number;
  recent_activity: ActivityLog[];
  system_health: {
    database: 'PASS' | 'FAIL';
    email: 'PASS' | 'NOT CONFIGURED' | 'FAIL';
    stripe: 'PASS' | 'NOT CONFIGURED';
    worker: 'PASS' | 'WARNING' | 'FAIL';
  };
}

export interface AdminUserItem {
  id: string;
  email: string;
  name: string;
  business_name?: string;
  email_verified: boolean;
  role: UserRole;
  status: UserStatus;
  plan: import('./plans.js').PlanTier;
  subscription_status: import('./plans.js').SubscriptionStatus;
  client_count: number;
  invoice_count: number;
  created_at: string;
  last_login_at?: string | null;
}

export interface AdminSubscriptionItem {
  id: string;
  user_id: string;
  user_name: string;
  user_email: string;
  plan: import('./plans.js').PlanTier;
  status: import('./plans.js').SubscriptionStatus;
  billing_interval: import('./plans.js').BillingInterval;
  provider: import('./plans.js').SubscriptionProvider;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  current_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface AdminSystemHealth {
  database: {
    status: 'PASS' | 'FAIL';
    engine: 'postgres' | 'local_persistent';
    connected: boolean;
    latency_ms?: number;
    details?: string;
  };
  email: {
    status: 'PASS' | 'NOT CONFIGURED' | 'FAIL';
    provider: string;
    configured: boolean;
    from_email: string;
    details?: string;
  };
  stripe: {
    status: 'PASS' | 'NOT CONFIGURED' | 'FAIL';
    configured: boolean;
    webhook_configured: boolean;
    price_ids_configured: boolean;
  };
  application: {
    status: 'PASS';
    app: string;
    version: string;
    environment: string;
    uptime_seconds: number;
    memory_usage_mb: number;
    node_version: string;
  };
  worker: {
    status: 'PASS' | 'WARNING' | 'FAIL';
    running: boolean;
    last_run_at: string | null;
    last_success_at: string | null;
    last_failure_at: string | null;
    last_error: string | null;
    total_runs: number;
    total_reminders_sent: number;
    interval_seconds: number;
  };
}

