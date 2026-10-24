import crypto from 'crypto';
import type { Invoice, PaymentStatus } from '../types.js';
import { memoryStore, saveStore, reloadLocalStore, userMutex } from '../lib/dbStore.js';
import { getSubscription } from './subscriptionRepository.js';
import { getEffectivePlan, PlanLimitExceededError } from '../plans.js';
import { logger } from '../lib/logger.js';

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
  const today = new Date().toISOString().split('T')[0];
  reloadLocalStore();
  const clientMap = new Map(memoryStore.clients.map((c) => [c.id, c]));

  let list = memoryStore.invoices
    .filter((i) => i.user_id === userId)
    .map((i) => {
      const c = clientMap.get(i.client_id);
      return {
        ...i,
        client_name: c?.name || 'Unknown Client',
        client_email: c?.email || '',
        client_company: c?.company || '',
        payment_status: computeInvoiceStatus(i, today),
      };
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
  const today = new Date().toISOString().split('T')[0];
  reloadLocalStore();
  const invoice = memoryStore.invoices.find((i) => i.user_id === userId && i.id === invoiceId);
  if (!invoice) return null;
  const client = memoryStore.clients.find((c) => c.id === invoice.client_id);
  return {
    ...invoice,
    client_name: client?.name,
    client_email: client?.email,
    client_company: client?.company,
    payment_status: computeInvoiceStatus(invoice, today),
  };
}

export async function getInvoiceByNumber(userId: string, invoiceNumber: string): Promise<Invoice | null> {
  reloadLocalStore();
  return (
    memoryStore.invoices.find(
      (i) => i.user_id === userId && i.invoice_number.toLowerCase() === invoiceNumber.trim().toLowerCase()
    ) || null
  );
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
  return await userMutex.acquire(userId, async () => {
    const sub = await getSubscription(userId);
    const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
    const maxInvoices = planConfig.limits.maxInvoicesPerMonth;

    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    const today = now.split('T')[0];

    reloadLocalStore();
    const currentMonthPrefix = now.substring(0, 7);
    const currentMonthInvoices = memoryStore.invoices.filter(
      (i) => i.user_id === userId && i.created_at.startsWith(currentMonthPrefix)
    ).length;

    if (maxInvoices !== null && currentMonthInvoices >= maxInvoices) {
      throw new PlanLimitExceededError('invoices', currentMonthInvoices, maxInvoices, planConfig.tier);
    }

    const client = memoryStore.clients.find((c) => c.id === data.client_id);
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
    memoryStore.invoices.push(invoice);
    saveStore();
    logger.info({ userId, invoiceId: id, invoiceNumber: invoice.invoice_number, amount: invoice.amount }, 'Invoice created');
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
  const now = new Date().toISOString();
  const invoice = memoryStore.invoices.find((i) => i.user_id === userId && i.id === invoiceId);
  if (!invoice) return null;

  if (data.client_id) {
    invoice.client_id = data.client_id;
    const client = memoryStore.clients.find((c) => c.id === data.client_id);
    if (client) {
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
  saveStore();
  logger.info({ userId, invoiceId }, 'Invoice updated');
  return invoice;
}

export async function markInvoicePaid(userId: string, invoiceId: string, paidDate?: string): Promise<Invoice | null> {
  const now = new Date().toISOString();
  const invoice = memoryStore.invoices.find((i) => i.user_id === userId && i.id === invoiceId);
  if (!invoice) return null;

  invoice.payment_status = 'PAID';
  invoice.paid_date = paidDate || now;
  invoice.updated_at = now;
  saveStore();
  logger.info({ userId, invoiceId, paidDate: invoice.paid_date }, 'Invoice marked as paid');
  return invoice;
}

export async function cancelInvoice(userId: string, invoiceId: string): Promise<Invoice | null> {
  const now = new Date().toISOString();
  const invoice = memoryStore.invoices.find((i) => i.user_id === userId && i.id === invoiceId);
  if (!invoice) return null;

  invoice.payment_status = 'CANCELLED';
  invoice.updated_at = now;
  saveStore();
  logger.info({ userId, invoiceId }, 'Invoice marked as cancelled');
  return invoice;
}

export async function deleteInvoice(userId: string, invoiceId: string): Promise<boolean> {
  const idx = memoryStore.invoices.findIndex((i) => i.user_id === userId && i.id === invoiceId);
  if (idx === -1) return false;

  memoryStore.invoices.splice(idx, 1);
  memoryStore.reminders = memoryStore.reminders.filter((r) => r.invoice_id !== invoiceId);
  saveStore();
  logger.info({ userId, invoiceId }, 'Invoice deleted');
  return true;
}
