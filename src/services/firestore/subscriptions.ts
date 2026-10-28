import {
  db,
  auth,
  doc,
  getDoc,
  setDoc,
  handleFirestoreError,
  OperationType,
} from '../../firebase.js';
import type { DashboardStats, SubscriptionDetails } from '../../types.js';
import { getEffectivePlan } from '../../plans.js';
import { sanitizeForFirestore } from './utils.js';
import { logFirestoreActivity, getFirestoreActivityLogs } from './reminders.js';
import { getFirestoreClients } from './clients.js';
import { getFirestoreInvoices } from './invoices.js';

export async function getFirestoreSubscription(uid: string): Promise<SubscriptionDetails> {
  const path = `users/${uid}/subscription/details`;
  try {
    const ref = doc(db, 'users', uid, 'subscription', 'details');
    const snap = await getDoc(ref);

    const [clients, invoices] = await Promise.all([
      getFirestoreClients(uid),
      getFirestoreInvoices(uid),
    ]);

    const activePlan = snap.exists() ? snap.data().plan || 'FREE' : 'FREE';
    const activeStatus = snap.exists() ? snap.data().status || 'active' : 'active';
    const interval = snap.exists() ? snap.data().billing_interval || 'monthly' : 'monthly';
    const now = new Date().toISOString();
    const periodStart = snap.exists() ? snap.data().current_period_start || now : now;
    const periodEnd = snap.exists() ? snap.data().current_period_end || null : null;
    const planConfig = getEffectivePlan(activePlan, activeStatus, periodEnd);
    const maxClients = planConfig.limits.maxClients;
    const maxInvoices = planConfig.limits.maxInvoicesPerMonth;

    const isOwner =
      auth.currentUser?.email?.trim().toLowerCase() === 'receiptobusiness@gmail.com' ||
      auth.currentUser?.email?.trim().toLowerCase() === 'rshimelis48@gmail.com';

    return {
      subscription: snap.exists()
        ? (snap.data() as any)
        : {
            id: `sub_${uid}`,
            user_id: uid,
            plan: 'FREE',
            status: 'active',
            billing_interval: interval,
            provider: 'manual',
            provider_customer_id: null,
            provider_subscription_id: null,
            current_period_start: now,
            current_period_end: null,
            cancel_at_period_end: false,
            created_at: now,
            updated_at: now,
          },
      usage: {
        plan: activePlan,
        client_count: clients.length,
        max_clients: maxClients,
        clients_remaining: maxClients !== null ? Math.max(0, maxClients - clients.length) : null,
        client_limit_reached: maxClients !== null && clients.length >= maxClients,
        invoice_count: invoices.length,
        invoices_this_period: invoices.length,
        max_invoices_per_month: maxInvoices,
        invoices_remaining: maxInvoices !== null ? Math.max(0, maxInvoices - invoices.length) : null,
        invoice_limit_reached: maxInvoices !== null && invoices.length >= maxInvoices,
        period_start: periodStart,
        period_end: periodEnd,
        automated_reminders_count: 0,
        automated_reminders_enabled: planConfig.features.automatedReminders,
        csv_export_enabled: planConfig.features.csvExport,
        full_activity_history: planConfig.features.fullActivityHistory,
      },
      plan_config: planConfig,
      is_active: activeStatus === 'active',
      is_owner_demo: isOwner,
      owner_demo_available_plans: ['FREE', 'STARTER', 'GROWTH'],
      access_mode: isOwner ? 'owner_demo' : 'free',
      billing_provider: 'manual',
      stripe_configured: true,
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function setFirestoreSubscription(
  uid: string,
  data: {
    plan: 'FREE' | 'STARTER' | 'GROWTH';
    status?: 'active' | 'trialing' | 'past_due' | 'canceled' | 'paused';
    billing_interval?: 'monthly' | 'annual';
    provider?: 'manual' | 'stripe';
    stripe_customer_id?: string;
    stripe_subscription_id?: string;
  }
): Promise<SubscriptionDetails> {
  const path = `users/${uid}/subscription/details`;
  const now = new Date().toISOString();
  try {
    const ref = doc(db, 'users', uid, 'subscription', 'details');
    const existing = await getDoc(ref);

    const subData = {
      id: existing.exists() ? existing.data().id : `sub_${uid}`,
      user_id: uid,
      plan: data.plan,
      status: data.status || 'active',
      billing_interval: data.billing_interval || 'monthly',
      provider: data.provider || 'stripe',
      stripe_customer_id: data.stripe_customer_id || (existing.exists() ? existing.data().stripe_customer_id : null),
      stripe_subscription_id: data.stripe_subscription_id || (existing.exists() ? existing.data().stripe_subscription_id : null),
      current_period_start: now,
      updated_at: now,
    };

    await setDoc(ref, sanitizeForFirestore(subData), { merge: true });
    await logFirestoreActivity(uid, 'UPDATE_SUBSCRIPTION', `Subscription updated to ${data.plan}`);
    return await getFirestoreSubscription(uid);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function getFirestoreDashboardStats(uid: string): Promise<DashboardStats> {
  try {
    const [invoices, activities, clients] = await Promise.all([
      getFirestoreInvoices(uid),
      getFirestoreActivityLogs(uid, 5),
      getFirestoreClients(uid),
    ]);

    let totalOutstanding = 0;
    let totalOverdue = 0;
    let totalPaid = 0;
    let paidCount = 0;
    let overdueCount = 0;
    let unpaidCount = 0;
    let cancelledCount = 0;

    invoices.forEach((inv) => {
      const amount = Number(inv.amount) || 0;
      if (inv.payment_status === 'PAID') {
        totalPaid += amount;
        paidCount++;
      } else if (inv.payment_status === 'OVERDUE') {
        totalOutstanding += amount;
        totalOverdue += amount;
        overdueCount++;
      } else if (inv.payment_status === 'UNPAID') {
        totalOutstanding += amount;
        unpaidCount++;
      } else if (inv.payment_status === 'CANCELLED') {
        cancelledCount++;
      }
    });

    const upcomingInvoices = invoices
      .filter((i) => i.payment_status === 'UNPAID' || i.payment_status === 'OVERDUE')
      .slice(0, 5);

    return {
      total_outstanding: totalOutstanding,
      total_overdue: totalOverdue,
      total_paid: totalPaid,
      invoice_counts: {
        total: invoices.length,
        paid: paidCount,
        overdue: overdueCount,
        unpaid: unpaidCount,
        cancelled: cancelledCount,
      },
      client_count: clients.length,
      urgent_invoices: upcomingInvoices,
      recent_activity: activities.map((a) => ({
        id: a.id,
        action: a.action,
        details: a.details,
        created_at: a.created_at,
      })),
      upcoming_due_invoices: upcomingInvoices.map((inv) => ({
        id: inv.id,
        invoice_number: inv.invoice_number,
        client_name: inv.client_name || 'Client',
        amount: inv.amount,
        due_date: inv.due_date,
        payment_status: inv.payment_status,
      })),
    };
  } catch (err) {
    console.error('Failed to compute dashboard stats from Firestore:', err);
    return {
      total_outstanding: 0,
      total_overdue: 0,
      total_paid: 0,
      invoice_counts: { total: 0, paid: 0, overdue: 0, unpaid: 0, cancelled: 0 },
      client_count: 0,
      urgent_invoices: [],
      recent_activity: [],
      upcoming_due_invoices: [],
    };
  }
}
