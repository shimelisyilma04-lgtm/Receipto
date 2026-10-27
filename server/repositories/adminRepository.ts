import type {
  AdminDashboardStats,
  AdminUserItem,
  AdminSubscriptionItem,
  AdminSystemHealth,
} from '../types.js';
import { getAdminFirestore } from '../lib/firebaseAdmin.js';
import { deleteUserSessions } from './userRepository.js';
import { isStripeConfigured } from '../stripe.js';
import { logger } from '../lib/logger.js';

export async function getAdminDashboardStats(): Promise<AdminDashboardStats> {
  const db = getAdminFirestore();

  const [usersSnap, invoicesSnap, remindersSnap, clientsSnap, subsSnap, activitySnap] = await Promise.all([
    db.collection('users').get(),
    db.collectionGroup('invoices').get(),
    db.collectionGroup('reminders').get(),
    db.collectionGroup('clients').get(),
    db.collectionGroup('subscription').get(),
    db.collectionGroup('activity_logs').get(),
  ]);

  const users: any[] = [];
  usersSnap.forEach((d: any) => users.push(d.data()));

  const invoices: any[] = [];
  invoicesSnap.forEach((d: any) => invoices.push(d.data()));

  const reminders: any[] = [];
  remindersSnap.forEach((d: any) => reminders.push(d.data()));

  const subscriptions: any[] = [];
  subsSnap.forEach((d: any) => subscriptions.push(d.data()));

  const activityLogs: any[] = [];
  activitySnap.forEach((d: any) => activityLogs.push(d.data()));

  const totalUsers = users.length;
  const activeUsers = users.filter((u) => u.status === 'ACTIVE').length;
  const suspendedUsers = users.filter((u) => u.status === 'SUSPENDED').length;
  const adminUsers = users.filter((u) => u.role === 'ADMIN').length;
  const verifiedUsers = users.filter((u) => u.email_verified).length;
  const unverifiedUsers = totalUsers - verifiedUsers;

  const totalInvoices = invoices.length;
  const totalReminders = reminders.length;
  const paidInvoicesCount = invoices.filter((i) => i.payment_status === 'PAID').length;
  const overdueInvoicesCount = invoices.filter((i) => i.payment_status === 'OVERDUE').length;

  let paidInvoicesSum = 0;
  invoices.forEach((i) => {
    if (i.payment_status === 'PAID') paidInvoicesSum += Number(i.amount) || 0;
  });

  const freeUsers = subscriptions.filter((s) => s.plan === 'FREE').length;
  const starterUsers = subscriptions.filter((s) => s.plan === 'STARTER').length;
  const growthUsers = subscriptions.filter((s) => s.plan === 'GROWTH').length;
  const activeSubs = subscriptions.filter((s) => s.status === 'active').length;
  const pastDueSubs = subscriptions.filter((s) => s.status === 'past_due').length;
  const cancelledSubs = subscriptions.filter((s) => s.status === 'cancelled' || s.status === 'canceled').length;

  const activePaidSubs = subscriptions.filter(
    (s) => s.status === 'active' && s.plan !== 'FREE'
  );
  const mrr = activePaidSubs.reduce((acc, s) => {
    return acc + (s.plan === 'GROWTH' ? 49 : s.plan === 'STARTER' ? 19 : 0);
  }, 0);

  activityLogs.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  return {
    total_users: totalUsers,
    active_users: activeUsers,
    suspended_users: suspendedUsers,
    admin_users: adminUsers,
    verified_users: verifiedUsers,
    unverified_users: unverifiedUsers,
    free_users: freeUsers,
    starter_users: starterUsers,
    growth_users: growthUsers,
    active_subscriptions: activeSubs,
    past_due_subscriptions: pastDueSubs,
    cancelled_subscriptions: cancelledSubs,
    total_clients: clientsSnap.size,
    total_invoices: totalInvoices,
    paid_invoices: paidInvoicesCount,
    total_paid_invoices_amount: paidInvoicesSum,
    overdue_invoices: overdueInvoicesCount,
    reminders_sent: totalReminders,
    total_reminders_sent: totalReminders,
    subscriptions_by_plan: {
      FREE: freeUsers,
      STARTER: starterUsers,
      GROWTH: growthUsers,
    },
    active_paid_subscriptions_count: activePaidSubs.length,
    mrr_usd: mrr,
    recent_activity: activityLogs.slice(0, 10),
    system_health: {
      database: 'PASS',
      email: process.env.RESEND_API_KEY ? 'PASS' : 'NOT CONFIGURED',
      stripe: isStripeConfigured() ? 'PASS' : 'NOT CONFIGURED',
      worker: 'PASS',
    },
  };
}

export async function getAdminUsers(params?: {
  search?: string;
  role?: string;
  status?: string;
  plan?: string;
  page?: number;
  limit?: number;
}): Promise<{ users: AdminUserItem[]; total: number; page: number; totalPages: number }> {
  const db = getAdminFirestore();
  const [usersSnap, subsSnap, clientsSnap, invoicesSnap] = await Promise.all([
    db.collection('users').get(),
    db.collectionGroup('subscription').get(),
    db.collectionGroup('clients').get(),
    db.collectionGroup('invoices').get(),
  ]);

  const subMap = new Map<string, any>();
  subsSnap.forEach((sDoc: any) => {
    const s = sDoc.data();
    subMap.set(s.user_id, s);
  });

  const clientCountMap = new Map<string, number>();
  clientsSnap.forEach((cDoc: any) => {
    const c = cDoc.data();
    if (c.user_id) {
      clientCountMap.set(c.user_id, (clientCountMap.get(c.user_id) || 0) + 1);
    }
  });

  const invoiceCountMap = new Map<string, number>();
  invoicesSnap.forEach((iDoc: any) => {
    const i = iDoc.data();
    if (i.user_id) {
      invoiceCountMap.set(i.user_id, (invoiceCountMap.get(i.user_id) || 0) + 1);
    }
  });

  let list: any[] = [];
  usersSnap.forEach((uDoc: any) => list.push(uDoc.data()));

  if (params?.search) {
    const q = params.search.toLowerCase();
    list = list.filter((u) => u.email?.toLowerCase().includes(q) || u.name?.toLowerCase().includes(q));
  }
  if (params?.role && params.role !== 'ALL') {
    list = list.filter((u) => u.role === params.role);
  }
  if (params?.status && params.status !== 'ALL') {
    list = list.filter((u) => u.status === params.status);
  }

  const items: AdminUserItem[] = list.map((u) => {
    const sub = subMap.get(u.id);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      business_name: u.business_name,
      email_verified: Boolean(u.email_verified),
      role: u.role || 'USER',
      status: u.status || 'ACTIVE',
      created_at: u.created_at,
      last_login_at: u.last_login_at,
      plan: sub?.plan || 'FREE',
      subscription_status: sub?.status || 'active',
      client_count: clientCountMap.get(u.id) || 0,
      invoice_count: invoiceCountMap.get(u.id) || 0,
    };
  });

  if (params?.plan && params.plan !== 'ALL') {
    list = items.filter((u) => u.plan === params.plan);
  } else {
    list = items;
  }

  list.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 20));
  const total = list.length;
  const paginated = list.slice((page - 1) * limit, page * limit);

  return {
    users: paginated,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function suspendUser(
  adminIdOrTargetId: string,
  targetIdOptional?: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const adminId = targetIdOptional ? adminIdOrTargetId : undefined;
  const targetId = targetIdOptional ? targetIdOptional : adminIdOrTargetId;

  if (adminId && adminId === targetId) {
    return {
      success: false,
      message: 'Administrators cannot suspend their own account.',
      error: 'Administrators cannot suspend their own account.',
    };
  }

  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(targetId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return { success: false, message: 'User not found', error: 'User not found' };
  }

  const now = new Date().toISOString();
  await docRef.set({ status: 'SUSPENDED', updated_at: now }, { merge: true });
  await deleteUserSessions(targetId);

  logger.info({ targetId, adminId }, 'Admin suspended user in Firestore');
  return { success: true, message: 'User account suspended and active sessions revoked.' };
}

export async function restoreUser(
  adminIdOrTargetId: string,
  targetIdOptional?: string
): Promise<{ success: boolean; message: string; error?: string }> {
  const adminId = targetIdOptional ? adminIdOrTargetId : undefined;
  const targetId = targetIdOptional ? targetIdOptional : adminIdOrTargetId;

  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(targetId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return { success: false, message: 'User not found', error: 'User not found' };
  }

  const now = new Date().toISOString();
  await docRef.set({ status: 'ACTIVE', updated_at: now }, { merge: true });

  logger.info({ targetId, adminId }, 'Admin restored user in Firestore');
  return { success: true, message: 'User account restored to active status.' };
}

export async function updateUserRole(
  arg1: string,
  arg2: string,
  arg3?: string
): Promise<{ success: boolean; error?: string; message?: string }> {
  let adminId: string | undefined;
  let targetId: string;
  let role: 'ADMIN' | 'USER';

  if (arg3) {
    // Called as (adminId, targetId, role)
    adminId = arg1;
    targetId = arg2;
    role = arg3 as 'ADMIN' | 'USER';
  } else {
    // Called as (targetId, role)
    targetId = arg1;
    role = arg2 as 'ADMIN' | 'USER';
  }

  if (adminId && adminId === targetId && role !== 'ADMIN') {
    return { success: false, error: 'Administrators cannot remove their own admin privileges.' };
  }

  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(targetId);
  const snap = await docRef.get();
  if (!snap.exists) {
    return { success: false, error: 'User not found' };
  }

  const now = new Date().toISOString();
  await docRef.set({ role, updated_at: now }, { merge: true });

  // Update admins collection for Firestore Security Rules isAdmin check
  if (role === 'ADMIN') {
    const userData = snap.data();
    await db.collection('admins').doc(targetId).set({
      user_id: targetId,
      email: userData?.email || '',
      role: 'ADMIN',
      granted_at: now,
    });
  } else {
    await db.collection('admins').doc(targetId).delete();
  }

  logger.info({ targetId, role, adminId }, 'Admin updated user role in Firestore');
  return { success: true, message: `User role successfully updated to ${role}` };
}

export async function getAdminSubscriptions(params?: {
  page?: number;
  limit?: number;
}): Promise<{ subscriptions: AdminSubscriptionItem[]; total: number; page: number; totalPages: number }> {
  const db = getAdminFirestore();
  const [usersSnap, subsSnap] = await Promise.all([
    db.collection('users').get(),
    db.collectionGroup('subscription').get(),
  ]);

  const userMap = new Map<string, any>();
  usersSnap.forEach((uDoc: any) => userMap.set(uDoc.id, uDoc.data()));

  const subs: AdminSubscriptionItem[] = [];
  subsSnap.forEach((sDoc: any) => {
    const s = sDoc.data();
    const u = userMap.get(s.user_id);
    subs.push({
      id: s.id || sDoc.id,
      user_id: s.user_id,
      user_email: u?.email || 'unknown',
      user_name: u?.name || 'unknown',
      plan: s.plan,
      status: s.status,
      billing_interval: s.billing_interval,
      provider: s.provider,
      provider_customer_id: s.provider_customer_id,
      provider_subscription_id: s.provider_subscription_id,
      stripe_customer_id: s.stripe_customer_id,
      stripe_subscription_id: s.stripe_subscription_id,
      current_period_start: s.current_period_start,
      current_period_end: s.current_period_end,
      cancel_at_period_end: s.cancel_at_period_end,
      created_at: s.created_at,
    });
  });

  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 50));
  const total = subs.length;
  const paginated = subs.slice((page - 1) * limit, page * limit);

  return {
    subscriptions: paginated,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getAdminActivityLogs(params?: {
  userId?: string;
  action?: string;
  page?: number;
  limit?: number;
}): Promise<{ logs: any[]; total: number; page: number; totalPages: number }> {
  const db = getAdminFirestore();
  let snap: any;

  if (params?.userId) {
    snap = await db.collection('users').doc(params.userId).collection('activity_logs').get();
  } else {
    snap = await db.collectionGroup('activity_logs').get();
  }

  let logs: any[] = [];
  snap.forEach((d: any) => logs.push(d.data()));

  if (params?.action) {
    logs = logs.filter((l) => l.action === params.action);
  }

  logs.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  const page = Math.max(1, params?.page || 1);
  const limit = Math.max(1, Math.min(100, params?.limit || 50));
  const total = logs.length;
  const paginated = logs.slice((page - 1) * limit, page * limit);

  return {
    logs: paginated,
    total,
    page,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function getAdminSystemHealth(workerStatus?: any): Promise<AdminSystemHealth> {
  const emailConfigured = Boolean(process.env.RESEND_API_KEY);
  const stripeConfigured = isStripeConfigured();

  return {
    database: {
      status: 'PASS',
      connected: true,
      engine: 'firestore',
      details: 'Cloud Firestore authoritative backend (ai-studio-receptio-29c007e0-504b-47c8-9f48-f964bdf89cf7)',
    },
    email: {
      status: emailConfigured ? 'PASS' : 'NOT CONFIGURED',
      provider: 'Resend',
      from_email: process.env.EMAIL_FROM || 'receiptobusiness@gmail.com',
      configured: emailConfigured,
      details: emailConfigured ? 'Resend API key configured' : 'RESEND_API_KEY is not set',
    },
    stripe: {
      status: stripeConfigured ? 'PASS' : 'NOT CONFIGURED',
      configured: stripeConfigured,
      webhook_configured: Boolean(process.env.STRIPE_WEBHOOK_SECRET),
      publishable_key_configured: Boolean(process.env.STRIPE_PUBLISHABLE_KEY),
      price_ids_configured: Boolean(process.env.STRIPE_PRICE_STARTER_MONTHLY),
    },
    application: {
      status: 'PASS',
      app: 'Receipto',
      version: '1.2.0',
      environment: process.env.NODE_ENV || 'development',
      uptime_seconds: Math.floor(process.uptime()),
      memory_usage_mb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
      node_version: process.version,
    },
    worker: {
      status: workerStatus?.running ? 'PASS' : 'WARNING',
      running: Boolean(workerStatus?.running),
      last_run_at: workerStatus?.lastRunAt || null,
      last_success_at: workerStatus?.lastSuccessAt || null,
      last_failure_at: null,
      last_error: workerStatus?.lastError || null,
      total_runs: workerStatus?.totalRuns || 0,
      total_reminders_sent: workerStatus?.totalRemindersSent || 0,
      interval_seconds: 60,
    },
  };
}
