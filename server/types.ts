export type UserRole = 'USER' | 'ADMIN';
export type UserStatus = 'ACTIVE' | 'SUSPENDED';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  name: string;
  business_name?: string;
  email_verified: boolean;
  role: UserRole;
  status: UserStatus;
  terms_accepted_at?: string;
  terms_version?: string;
  last_login_at?: string;
  stripe_customer_id?: string | null;
  created_at: string;
  updated_at: string;
}

export interface EmailVerification {
  id: string;
  user_id: string;
  email: string;
  otp_hash: string;
  salt: string;
  created_at: string;
  expires_at: string;
  attempt_count: number;
  used_at: string | null;
  purpose: 'email_verification' | 'password_reset';
  resend_count: number;
  last_resend_at: string;
}

export interface Session {
  id: string;
  user_id: string;
  expires_at: string;
  created_at: string;
}

export interface Client {
  id: string;
  user_id: string;
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
  invoice_number: string;
  amount: number;
  currency: string;
  issue_date: string; // YYYY-MM-DD
  due_date: string;   // YYYY-MM-DD
  payment_status: PaymentStatus;
  paid_date?: string | null;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export type ReminderType = 'manual' | 'automatic';
export type ReminderStatus = 'PENDING' | 'SENDING' | 'SENT' | 'FAILED' | 'CANCELLED' | 'CONFIG_REQUIRED';

export interface Reminder {
  id: string;
  user_id: string;
  invoice_id: string;
  client_id: string;
  recipient_email: string;
  reminder_type?: ReminderType;
  scheduled_at?: string | null;
  attempted_at?: string | null;
  sent_at?: string | null;
  status: ReminderStatus;
  provider_message_id?: string | null;
  attempt_count?: number;
  error_message?: string | null;
  subject: string;
  message: string;
  created_at?: string;
}

export interface ActivityLog {
  id: string;
  user_id: string;
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
  upcoming_due_invoices?: any[];
}

export type PlanTier = 'FREE' | 'STARTER' | 'GROWTH';
export type SubscriptionStatus = 'active' | 'trialing' | 'past_due' | 'cancelled' | 'expired';
export type BillingInterval = 'monthly' | 'annual';
export type SubscriptionProvider = 'stripe' | 'manual' | 'demo';
export type AccessMode = 'stripe' | 'owner_demo' | 'free';

export interface Subscription {
  id: string;
  user_id: string;
  plan: PlanTier;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;
  provider: SubscriptionProvider;
  access_mode?: AccessMode;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface SubscriptionUsage {
  client_count: number;
  max_clients: number | null;
  clients_remaining: number | null;
  client_limit_reached?: boolean;
  invoices_this_period: number;
  invoice_count?: number;
  max_invoices_per_month: number | null;
  invoices_remaining: number | null;
  invoice_limit_reached?: boolean;
  period_start: string;
  period_end: string | null;
  automated_reminders_count: number;
  automated_reminders_enabled?: boolean;
  csv_export_enabled?: boolean;
  full_activity_history?: boolean;
  plan?: PlanTier;
}

export interface SubscriptionDetails {
  subscription: Subscription;
  plan_config: any;
  usage: SubscriptionUsage;
}

export interface AdminDashboardStats {
  total_users: number;
  admin_users?: number;
  active_users?: number;
  suspended_users?: number;
  verified_users?: number;
  unverified_users?: number;
  free_users?: number;
  starter_users?: number;
  growth_users?: number;
  active_subscriptions?: number;
  past_due_subscriptions?: number;
  cancelled_subscriptions?: number;
  total_clients?: number;
  total_invoices?: number;
  paid_invoices?: number;
  total_paid_invoices_amount?: number;
  overdue_invoices?: number;
  reminders_sent?: number;
  total_reminders_sent?: number;
  subscriptions_by_plan?: {
    FREE: number;
    STARTER: number;
    GROWTH: number;
  };
  active_paid_subscriptions_count?: number;
  mrr_usd?: number;
  recent_activity?: ActivityLog[];
  system_health?: {
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
  plan: PlanTier;
  subscription_status: SubscriptionStatus;
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
  plan: PlanTier;
  status: SubscriptionStatus;
  billing_interval: BillingInterval;
  provider: SubscriptionProvider;
  provider_customer_id: string | null;
  provider_subscription_id: string | null;
  stripe_customer_id?: string | null;
  stripe_subscription_id?: string | null;
  current_period_start: string;
  current_period_end: string | null;
  cancel_at_period_end: boolean;
  created_at: string;
}

export interface AdminSystemHealth {
  database: {
    status: 'PASS' | 'FAIL';
    engine: 'firestore';
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
    price_ids_configured?: boolean;
    publishable_key_configured?: boolean;
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
    status: 'PASS' | 'WARNING' | 'FAIL' | 'active';
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


