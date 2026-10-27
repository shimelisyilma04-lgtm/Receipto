import crypto from 'crypto';
import type { Invoice, PaymentStatus } from '../types.js';
import { getAdminFirestore } from '../lib/firebaseAdmin.js';
import { AsyncKeyLock } from '../lib/asyncKeyLock.js';
import { getSubscription } from './subscriptionRepository.js';
import { getEffectivePlan, PlanLimitExceededError } from '../plans.js';
import { logger } from '../lib/logger.js';

const invoiceLock = new AsyncKeyLock();

export function computeInvoiceStatus(invoice: Partial<Invoice>, todayStr?: string): PaymentStatus {
  if (invoice.payment_status === 'PAID') return 'PAID';
  if (invoice.payment_status === 'CANCELLED') return 'CANCELLED';

  const today = todayStr || new Date().toISOString().split('T')[0];
  if (invoice.due_date && invoice.due_date < today) {
    return 'OVERDUE';
  }
  return 'UNPAID';
}

export async function getInvoices(
  userId: string,
  options?: { status?: string; clientId?: string; search?: string; sortBy?: string; sortOrder?: 'asc' | 'desc' }
): Promise<Invoice[]> {
  const db = getAdminFirestore();
  const today = new Date().toISOString().split('T')[0];

  // Fetch client map for hydration
  const clientsSnap = await db.collection('users').doc(userId).collection('clients').get();
  const clientMap = new Map<string, any>();
  clientsSnap.forEach((d: any) => clientMap.set(d.id, d.data()));

  const invoicesSnap = await db.collection('users').doc(userId).collection('invoices').get();
  let list: Invoice[] = [];

  invoicesSnap.forEach((d: any) => {
    const raw = d.data() as Invoice;
    const client = clientMap.get(raw.client_id);
    const computed = computeInvoiceStatus(raw, today);
    list.push({
      ...raw,
      client_name: client?.name || raw.client_name || 'Unknown Client',
      client_email: client?.email || raw.client_email || '',
      client_company: client?.company || raw.client_company || '',
      payment_status: computed,
    });
  });

  if (options?.clientId) {
    list = list.filter((i) => i.client_id === options.clientId);
  }

  if (options?.status && options.status !== 'ALL') {
    list = list.filter((i) => i.payment_status === options.status);
  }

  if (options?.search) {
    const q = options.search.toLowerCase();
    list = list.filter(
      (i) =>
        i.invoice_number.toLowerCase().includes(q) ||
        (i.client_name && i.client_name.toLowerCase().includes(q)) ||
        (i.client_company && i.client_company.toLowerCase().includes(q))
    );
  }

  list.sort((a, b) => a.due_date.localeCompare(b.due_date));
  return list;
}

export async function getInvoiceById(userId: string, invoiceId: string): Promise<Invoice | null> {
  const db = getAdminFirestore();
  const today = new Date().toISOString().split('T')[0];
  const docRef = db.collection('users').doc(userId).collection('invoices').doc(invoiceId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const invoice = snap.data() as Invoice;
  const clientDoc = await db.collection('users').doc(userId).collection('clients').doc(invoice.client_id).get();
  const client = clientDoc.exists ? clientDoc.data() : null;

  return {
    ...invoice,
    client_name: client?.name || invoice.client_name,
    client_email: client?.email || invoice.client_email,
    client_company: client?.company || invoice.client_company,
    payment_status: computeInvoiceStatus(invoice, today),
  };
}

export async function getInvoiceByNumber(userId: string, invoiceNumber: string): Promise<Invoice | null> {
  const db = getAdminFirestore();
  const today = new Date().toISOString().split('T')[0];
  const snap = await db.collection('users').doc(userId).collection('invoices').get();
  const cleanNum = invoiceNumber.trim().toLowerCase();

  let found: Invoice | null = null;
  snap.forEach((d: any) => {
    const inv = d.data() as Invoice;
    if (inv.invoice_number.toLowerCase() === cleanNum) {
      found = {
        ...inv,
        payment_status: computeInvoiceStatus(inv, today),
      };
    }
  });

  return found;
}

export async function createInvoice(
  userId: string,
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
  return await invoiceLock.acquire(userId, async () => {
    const db = getAdminFirestore();
    const sub = await getSubscription(userId);
    const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
    const maxInvoices = planConfig.limits.maxInvoicesPerMonth;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.split('T')[0];
    const currentMonthPrefix = now.substring(0, 7);

    // Count this month's invoices for the plan limit
    const allInvoicesSnap = await db.collection('users').doc(userId).collection('invoices').get();
    let currentMonthInvoices = 0;
    allInvoicesSnap.forEach((d: any) => {
      const inv = d.data();
      if (inv.created_at && inv.created_at.startsWith(currentMonthPrefix)) {
        currentMonthInvoices++;
      }
    });

    if (maxInvoices !== null && currentMonthInvoices >= maxInvoices) {
      throw new PlanLimitExceededError('invoices', currentMonthInvoices, maxInvoices, planConfig.tier);
    }

    const clientDoc = await db.collection('users').doc(userId).collection('clients').doc(data.client_id).get();
    const client = clientDoc.exists ? clientDoc.data() : null;

    const initialStatus = computeInvoiceStatus(
      {
        id,
        user_id: userId,
        client_id: data.client_id,
        invoice_number: data.invoice_number.trim(),
        amount: data.amount,
        issue_date: data.issue_date,
        due_date: data.due_date,
        payment_status: 'UNPAID',
        created_at: now,
        updated_at: now,
      },
      today
    );

    const invoice: Invoice = {
      id,
      user_id: userId,
      client_id: data.client_id,
      client_name: client?.name || 'Unknown Client',
      client_email: client?.email || '',
      client_company: client?.company || '',
      invoice_number: data.invoice_number.trim(),
      amount: data.amount,
      currency: (data.currency || 'USD').toUpperCase(),
      issue_date: data.issue_date,
      due_date: data.due_date,
      payment_status: initialStatus,
      notes: data.notes?.trim(),
      created_at: now,
      updated_at: now,
    };

    await db.collection('users').doc(userId).collection('invoices').doc(id).set(invoice);
    logger.info({ userId, invoiceId: id, invoiceNumber: invoice.invoice_number, amount: invoice.amount }, 'Invoice created in Firestore');
    return invoice;
  });
}

export async function updateInvoice(
  userId: string,
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
): Promise<Invoice | null> {
  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(userId).collection('invoices').doc(invoiceId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const invoice = snap.data() as Invoice;
  const now = new Date().toISOString();

  if (data.client_id && data.client_id !== invoice.client_id) {
    invoice.client_id = data.client_id;
    const clientDoc = await db.collection('users').doc(userId).collection('clients').doc(data.client_id).get();
    if (clientDoc.exists) {
      const client = clientDoc.data();
      invoice.client_name = client.name;
      invoice.client_email = client.email;
      invoice.client_company = client.company;
    }
  }

  if (data.invoice_number) invoice.invoice_number = data.invoice_number.trim();
  if (data.amount !== undefined) invoice.amount = data.amount;
  if (data.currency) invoice.currency = data.currency.toUpperCase();
  if (data.issue_date) invoice.issue_date = data.issue_date;
  if (data.due_date) {
    invoice.due_date = data.due_date;
    invoice.payment_status = computeInvoiceStatus(invoice);
  }
  if (data.notes !== undefined) invoice.notes = data.notes?.trim();
  invoice.updated_at = now;

  await docRef.set(invoice, { merge: true });
  logger.info({ userId, invoiceId }, 'Invoice updated in Firestore');
  return invoice;
}

export async function markInvoicePaid(userId: string, invoiceId: string, paidDate?: string): Promise<Invoice | null> {
  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(userId).collection('invoices').doc(invoiceId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const invoice = snap.data() as Invoice;
  const now = new Date().toISOString();
  invoice.payment_status = 'PAID';
  invoice.paid_date = paidDate || now;
  invoice.updated_at = now;

  await docRef.set(invoice, { merge: true });
  logger.info({ userId, invoiceId, paidDate: invoice.paid_date }, 'Invoice marked as paid in Firestore');
  return invoice;
}

export async function cancelInvoice(userId: string, invoiceId: string): Promise<Invoice | null> {
  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(userId).collection('invoices').doc(invoiceId);
  const snap = await docRef.get();
  if (!snap.exists) return null;

  const invoice = snap.data() as Invoice;
  const now = new Date().toISOString();
  invoice.payment_status = 'CANCELLED';
  invoice.updated_at = now;

  await docRef.set(invoice, { merge: true });
  logger.info({ userId, invoiceId }, 'Invoice marked as cancelled in Firestore');
  return invoice;
}

export async function deleteInvoice(userId: string, invoiceId: string): Promise<boolean> {
  const db = getAdminFirestore();
  const docRef = db.collection('users').doc(userId).collection('invoices').doc(invoiceId);
  const snap = await docRef.get();
  if (!snap.exists) return false;

  const batch = db.batch();
  batch.delete(docRef);

  // Clean up any reminders referencing this invoice
  const remindersSnap = await db.collection('users').doc(userId).collection('reminders').where('invoice_id', '==', invoiceId).get();
  remindersSnap.forEach((r: any) => batch.delete(r.ref));

  await batch.commit();
  logger.info({ userId, invoiceId }, 'Invoice and reminders deleted from Firestore');
  return true;
}
