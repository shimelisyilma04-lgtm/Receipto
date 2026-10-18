import {
  db,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  handleFirestoreError,
  OperationType,
} from '../firebase.js';
import type {
  User,
  Client,
  Invoice,
  Reminder,
  ActivityLog,
  DashboardStats,
  SubscriptionDetails,
  PaymentStatus,
} from '../types.js';

// Calculate invoice payment status based on due date
export function computeInvoiceStatus(invoice: Partial<Invoice>, todayStr?: string): PaymentStatus {
  if (invoice.payment_status === 'PAID') return 'PAID';
  if (invoice.payment_status === 'CANCELLED') return 'CANCELLED';

  const today = todayStr || new Date().toISOString().split('T')[0];
  if (invoice.due_date && invoice.due_date < today) {
    return 'OVERDUE';
  }
  return 'UNPAID';
}

// ============================================================================
// 1. User Profile Management
// ============================================================================
export async function getFirestoreUserProfile(uid: string): Promise<User | null> {
  const path = `users/${uid}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return null;
    return snap.data() as User;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function setFirestoreUserProfile(uid: string, profile: Partial<User>): Promise<User> {
  const path = `users/${uid}`;
  try {
    const ref = doc(db, 'users', uid);
    const existing = await getDoc(ref);
    const now = new Date().toISOString();

    const userData: User = {
      id: uid,
      email: profile.email || '',
      name: profile.name || 'User',
      business_name: profile.business_name || '',
      email_verified: Boolean(profile.email_verified),
      role: profile.role || 'USER',
      status: profile.status || 'ACTIVE',
      terms_accepted_at: profile.terms_accepted_at || now,
      terms_version: profile.terms_version || '1.0',
      last_login_at: now,
      created_at: existing.exists() ? (existing.data().created_at || now) : now,
      updated_at: now,
      paddle_customer_id: profile.paddle_customer_id,
    };

    await setDoc(ref, userData, { merge: true });
    return userData;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

export async function updateFirestoreUserProfile(
  uid: string,
  updates: Partial<Pick<User, 'name' | 'business_name' | 'email_verified' | 'last_login_at' | 'terms_accepted_at' | 'terms_version'>>
): Promise<User> {
  const path = `users/${uid}`;
  try {
    const ref = doc(db, 'users', uid);
    const now = new Date().toISOString();
    const dataToUpdate = {
      ...updates,
      updated_at: now,
    };
    await updateDoc(ref, dataToUpdate);
    const updatedSnap = await getDoc(ref);
    return updatedSnap.data() as User;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

// ============================================================================
// 2. Client Management
// ============================================================================
export async function getFirestoreClients(uid: string): Promise<Client[]> {
  const path = `users/${uid}/clients`;
  try {
    const clientsRef = collection(db, 'users', uid, 'clients');
    const snap = await getDocs(clientsRef);
    const clients: Client[] = [];
    snap.forEach((d) => {
      clients.push(d.data() as Client);
    });
    return clients.sort((a, b) => a.name.localeCompare(b.name));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getFirestoreClient(uid: string, clientId: string): Promise<Client | null> {
  const path = `users/${uid}/clients/${clientId}`;
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'clients', clientId));
    if (!snap.exists()) return null;
    return snap.data() as Client;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createFirestoreClient(
  uid: string,
  data: { name: string; email: string; phone?: string; company?: string; address?: string }
): Promise<Client> {
  const clientId = crypto.randomUUID();
  const path = `users/${uid}/clients/${clientId}`;
  const now = new Date().toISOString();

  const newClient: Client = {
    id: clientId,
    user_id: uid,
    name: data.name.trim(),
    email: data.email.trim().toLowerCase(),
    phone: data.phone?.trim() || '',
    company: data.company?.trim() || '',
    address: data.address?.trim() || '',
    created_at: now,
    updated_at: now,
  };

  try {
    await setDoc(doc(db, 'users', uid, 'clients', clientId), newClient);
    await logFirestoreActivity(uid, 'CREATE_CLIENT', `Created client ${newClient.name}`);
    return newClient;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateFirestoreClient(
  uid: string,
  clientId: string,
  data: Partial<{ name: string; email: string; phone?: string; company?: string; address?: string }>
): Promise<Client> {
  const path = `users/${uid}/clients/${clientId}`;
  try {
    const ref = doc(db, 'users', uid, 'clients', clientId);
    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = { updated_at: now };

    if (data.name !== undefined) updatePayload.name = data.name.trim();
    if (data.email !== undefined) updatePayload.email = data.email.trim().toLowerCase();
    if (data.phone !== undefined) updatePayload.phone = data.phone.trim();
    if (data.company !== undefined) updatePayload.company = data.company.trim();
    if (data.address !== undefined) updatePayload.address = data.address.trim();

    await updateDoc(ref, updatePayload);
    const snap = await getDoc(ref);
    const updated = snap.data() as Client;
    await logFirestoreActivity(uid, 'UPDATE_CLIENT', `Updated details for client ${updated.name}`);
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreClient(uid: string, clientId: string): Promise<void> {
  const path = `users/${uid}/clients/${clientId}`;
  try {
    const ref = doc(db, 'users', uid, 'clients', clientId);
    const snap = await getDoc(ref);
    const clientName = snap.exists() ? snap.data().name : clientId;

    await deleteDoc(ref);
    await logFirestoreActivity(uid, 'DELETE_CLIENT', `Removed client ${clientName}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ============================================================================
// 3. Invoice Management
// ============================================================================
export async function getFirestoreInvoices(
  uid: string,
  options?: { status?: string; client_id?: string; search?: string }
): Promise<Invoice[]> {
  const path = `users/${uid}/invoices`;
  const today = new Date().toISOString().split('T')[0];

  try {
    const invoicesRef = collection(db, 'users', uid, 'invoices');
    const snap = await getDocs(invoicesRef);
    let invoices: Invoice[] = [];

    snap.forEach((d) => {
      const inv = d.data() as Invoice;
      invoices.push({
        ...inv,
        payment_status: computeInvoiceStatus(inv, today),
      });
    });

    if (options?.client_id) {
      invoices = invoices.filter((i) => i.client_id === options.client_id);
    }
    if (options?.status && options.status !== 'ALL') {
      invoices = invoices.filter((i) => i.payment_status === options.status);
    }
    if (options?.search) {
      const q = options.search.toLowerCase();
      invoices = invoices.filter(
        (i) =>
          i.invoice_number.toLowerCase().includes(q) ||
          (i.client_name && i.client_name.toLowerCase().includes(q)) ||
          (i.client_company && i.client_company.toLowerCase().includes(q))
      );
    }

    return invoices.sort((a, b) => a.due_date.localeCompare(b.due_date));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function getFirestoreInvoice(uid: string, invoiceId: string): Promise<Invoice | null> {
  const path = `users/${uid}/invoices/${invoiceId}`;
  const today = new Date().toISOString().split('T')[0];
  try {
    const snap = await getDoc(doc(db, 'users', uid, 'invoices', invoiceId));
    if (!snap.exists()) return null;
    const inv = snap.data() as Invoice;
    return {
      ...inv,
      payment_status: computeInvoiceStatus(inv, today),
    };
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, path);
  }
}

export async function createFirestoreInvoice(
  uid: string,
  data: {
    client_id: string;
    invoice_number: string;
    amount: number;
    currency?: string;
    issue_date: string;
    due_date: string;
    notes?: string;
  }
): Promise<Invoice> {
  const invoiceId = crypto.randomUUID();
  const path = `users/${uid}/invoices/${invoiceId}`;
  const now = new Date().toISOString();
  const today = now.split('T')[0];

  // Fetch client details for denormalized display
  const client = await getFirestoreClient(uid, data.client_id);
  const status = computeInvoiceStatus({ payment_status: 'UNPAID', due_date: data.due_date }, today);

  const newInvoice: Invoice = {
    id: invoiceId,
    user_id: uid,
    client_id: data.client_id,
    client_name: client?.name || 'Unknown Client',
    client_email: client?.email || '',
    client_company: client?.company || '',
    invoice_number: data.invoice_number.trim(),
    amount: Number(data.amount),
    currency: (data.currency || 'USD').toUpperCase(),
    issue_date: data.issue_date,
    due_date: data.due_date,
    payment_status: status,
    notes: data.notes?.trim() || '',
    created_at: now,
    updated_at: now,
  };

  try {
    await setDoc(doc(db, 'users', uid, 'invoices', invoiceId), newInvoice);
    await logFirestoreActivity(
      uid,
      'CREATE_INVOICE',
      `Created invoice #${newInvoice.invoice_number} for $${newInvoice.amount.toFixed(2)}`
    );
    return newInvoice;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

export async function updateFirestoreInvoice(
  uid: string,
  invoiceId: string,
  data: Partial<{
    client_id: string;
    invoice_number: string;
    amount: number;
    currency?: string;
    issue_date: string;
    due_date: string;
    notes?: string;
  }>
): Promise<Invoice> {
  const path = `users/${uid}/invoices/${invoiceId}`;
  try {
    const ref = doc(db, 'users', uid, 'invoices', invoiceId);
    const existing = await getDoc(ref);
    if (!existing.exists()) throw new Error('Invoice not found');

    const now = new Date().toISOString();
    const updatePayload: Record<string, any> = { updated_at: now };

    if (data.client_id !== undefined) {
      updatePayload.client_id = data.client_id;
      const client = await getFirestoreClient(uid, data.client_id);
      if (client) {
        updatePayload.client_name = client.name;
        updatePayload.client_email = client.email;
        updatePayload.client_company = client.company;
      }
    }
    if (data.invoice_number !== undefined) updatePayload.invoice_number = data.invoice_number.trim();
    if (data.amount !== undefined) updatePayload.amount = Number(data.amount);
    if (data.currency !== undefined) updatePayload.currency = data.currency.toUpperCase();
    if (data.issue_date !== undefined) updatePayload.issue_date = data.issue_date;
    if (data.due_date !== undefined) {
      updatePayload.due_date = data.due_date;
      updatePayload.payment_status = computeInvoiceStatus(
        { payment_status: existing.data().payment_status, due_date: data.due_date },
        now.split('T')[0]
      );
    }
    if (data.notes !== undefined) updatePayload.notes = data.notes.trim();

    await updateDoc(ref, updatePayload);
    const snap = await getDoc(ref);
    const updated = snap.data() as Invoice;
    await logFirestoreActivity(uid, 'UPDATE_INVOICE', `Updated invoice #${updated.invoice_number}`);
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function markFirestoreInvoicePaid(uid: string, invoiceId: string, paidDate?: string): Promise<Invoice> {
  const path = `users/${uid}/invoices/${invoiceId}`;
  try {
    const ref = doc(db, 'users', uid, 'invoices', invoiceId);
    const now = new Date().toISOString();
    const updateData = {
      payment_status: 'PAID',
      paid_date: paidDate || now,
      updated_at: now,
    };
    await updateDoc(ref, updateData);
    const snap = await getDoc(ref);
    const updated = snap.data() as Invoice;
    await logFirestoreActivity(uid, 'PAY_INVOICE', `Marked invoice #${updated.invoice_number} as PAID`);
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function cancelFirestoreInvoice(uid: string, invoiceId: string): Promise<Invoice> {
  const path = `users/${uid}/invoices/${invoiceId}`;
  try {
    const ref = doc(db, 'users', uid, 'invoices', invoiceId);
    const now = new Date().toISOString();
    await updateDoc(ref, {
      payment_status: 'CANCELLED',
      updated_at: now,
    });
    const snap = await getDoc(ref);
    const updated = snap.data() as Invoice;
    await logFirestoreActivity(uid, 'CANCEL_INVOICE', `Cancelled invoice #${updated.invoice_number}`);
    return updated;
  } catch (err) {
    handleFirestoreError(err, OperationType.UPDATE, path);
  }
}

export async function deleteFirestoreInvoice(uid: string, invoiceId: string): Promise<void> {
  const path = `users/${uid}/invoices/${invoiceId}`;
  try {
    const ref = doc(db, 'users', uid, 'invoices', invoiceId);
    const snap = await getDoc(ref);
    const num = snap.exists() ? snap.data().invoice_number : invoiceId;
    await deleteDoc(ref);
    await logFirestoreActivity(uid, 'DELETE_INVOICE', `Deleted invoice #${num}`);
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, path);
  }
}

// ============================================================================
// 4. Reminders Management
// ============================================================================
export async function getFirestoreReminders(uid: string, invoiceId?: string): Promise<Reminder[]> {
  const path = `users/${uid}/reminders`;
  try {
    const remindersRef = collection(db, 'users', uid, 'reminders');
    const snap = await getDocs(remindersRef);
    let reminders: Reminder[] = [];
    snap.forEach((d) => {
      reminders.push(d.data() as Reminder);
    });

    if (invoiceId) {
      reminders = reminders.filter((r) => r.invoice_id === invoiceId);
    }
    return reminders.sort((a, b) => (b.sent_at || b.created_at || '').localeCompare(a.sent_at || a.created_at || ''));
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createFirestoreReminder(uid: string, reminder: Omit<Reminder, 'id' | 'user_id' | 'created_at'>): Promise<Reminder> {
  const reminderId = crypto.randomUUID();
  const path = `users/${uid}/reminders/${reminderId}`;
  const now = new Date().toISOString();

  const newReminder: Reminder = {
    ...reminder,
    id: reminderId,
    user_id: uid,
    created_at: now,
  };

  try {
    await setDoc(doc(db, 'users', uid, 'reminders', reminderId), newReminder);
    await logFirestoreActivity(uid, 'SEND_REMINDER', `Dispatched payment reminder to ${newReminder.recipient_email}`);
    return newReminder;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}

// ============================================================================
// 5. Activity Logs
// ============================================================================
export async function logFirestoreActivity(uid: string, action: string, details: string, metadata?: any): Promise<void> {
  const logId = crypto.randomUUID();
  const path = `users/${uid}/activity_logs/${logId}`;
  const logEntry: ActivityLog = {
    id: logId,
    user_id: uid,
    action,
    details,
    metadata,
    created_at: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'users', uid, 'activity_logs', logId), logEntry);
  } catch (err) {
    console.warn(`Failed to log activity event: ${err}`);
  }
}

export async function getFirestoreActivityLogs(uid: string, limitCount = 50): Promise<ActivityLog[]> {
  const path = `users/${uid}/activity_logs`;
  try {
    const logsRef = collection(db, 'users', uid, 'activity_logs');
    const snap = await getDocs(logsRef);
    const logs: ActivityLog[] = [];
    snap.forEach((d) => {
      logs.push(d.data() as ActivityLog);
    });

    return logs
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limitCount);
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

// ============================================================================
// 6. Subscriptions & Billing
// ============================================================================
export async function getFirestoreSubscription(uid: string): Promise<SubscriptionDetails> {
  const path = `users/${uid}/subscription/details`;
  try {
    const ref = doc(db, 'users', uid, 'subscription', 'details');
    const snap = await getDoc(ref);

    // Get current client & invoice counts for usage calculations
    const [clients, invoices] = await Promise.all([
      getFirestoreClients(uid),
      getFirestoreInvoices(uid),
    ]);

    const activePlan = snap.exists() ? (snap.data().plan || 'FREE') : 'FREE';
    const activeStatus = snap.exists() ? (snap.data().status || 'active') : 'active';
    const interval = snap.exists() ? (snap.data().billing_interval || 'monthly') : 'monthly';

    // Tier configurations
    const maxClients = activePlan === 'FREE' ? 5 : activePlan === 'STARTER' ? 50 : null;
    const maxInvoices = activePlan === 'FREE' ? 10 : activePlan === 'STARTER' ? 100 : null;

    return {
      subscription: snap.exists()
        ? (snap.data() as any)
        : {
            id: `sub_${uid}`,
            user_id: uid,
            plan: 'FREE',
            status: 'active',
            billing_interval: 'monthly',
            provider: 'manual',
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          },
      usage: {
        plan: activePlan,
        client_count: clients.length,
        max_clients: maxClients,
        client_limit_reached: maxClients !== null && clients.length >= maxClients,
        invoice_count: invoices.length,
        max_invoices_per_month: maxInvoices,
        invoice_limit_reached: maxInvoices !== null && invoices.length >= maxInvoices,
        automated_reminders_enabled: activePlan !== 'FREE',
        csv_export_enabled: activePlan !== 'FREE',
        full_activity_history: activePlan === 'GROWTH',
      },
      plan_config: {
        tier: activePlan,
        displayName: activePlan === 'GROWTH' ? 'Growth Plan' : activePlan === 'STARTER' ? 'Starter Plan' : 'Free Tier',
        priceMonthly: activePlan === 'GROWTH' ? 49 : activePlan === 'STARTER' ? 19 : 0,
        priceAnnual: activePlan === 'GROWTH' ? 470 : activePlan === 'STARTER' ? 190 : 0,
        limits: {
          maxClients,
          maxInvoicesPerMonth: maxInvoices,
        },
        features: {
          automatedReminders: activePlan !== 'FREE',
          csvExport: activePlan !== 'FREE',
          activityHistoryDays: activePlan === 'GROWTH' ? 365 : activePlan === 'STARTER' ? 30 : 7,
          customEmailTemplates: activePlan === 'GROWTH',
          prioritySupport: activePlan === 'GROWTH',
        },
      },
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
    provider?: 'manual' | 'paddle';
    paddle_customer_id?: string;
    paddle_subscription_id?: string;
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
      provider: data.provider || 'paddle',
      paddle_customer_id: data.paddle_customer_id || (existing.exists() ? existing.data().paddle_customer_id : null),
      paddle_subscription_id: data.paddle_subscription_id || (existing.exists() ? existing.data().paddle_subscription_id : null),
      current_period_start: now,
      updated_at: now,
    };

    await setDoc(ref, subData, { merge: true });
    await logFirestoreActivity(uid, 'UPDATE_SUBSCRIPTION', `Subscription updated to ${data.plan}`);
    return await getFirestoreSubscription(uid);
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, path);
  }
}

// ============================================================================
// 7. Dashboard Stats
// ============================================================================
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
