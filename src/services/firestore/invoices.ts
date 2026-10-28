import {
  db,
  doc,
  collection,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  handleFirestoreError,
  OperationType,
} from '../../firebase.js';
import type { Invoice } from '../../types.js';
import { computeInvoiceStatus, sanitizeForFirestore } from './utils.js';
import { logFirestoreActivity } from './reminders.js';
import { getFirestoreClient } from './clients.js';

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
    await setDoc(doc(db, 'users', uid, 'invoices', invoiceId), sanitizeForFirestore(newInvoice));
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

    await updateDoc(ref, sanitizeForFirestore(updatePayload));
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
    await updateDoc(ref, sanitizeForFirestore(updateData));
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
    await updateDoc(
      ref,
      sanitizeForFirestore({
        payment_status: 'CANCELLED',
        updated_at: now,
      })
    );
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
