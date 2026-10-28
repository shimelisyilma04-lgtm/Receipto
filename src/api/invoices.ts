import { auth } from '../firebase.js';
import {
  getFirestoreInvoices,
  getFirestoreInvoice,
  createFirestoreInvoice,
  updateFirestoreInvoice,
  markFirestoreInvoicePaid,
  cancelFirestoreInvoice,
  deleteFirestoreInvoice,
  getFirestoreSubscription,
  getFirestoreDashboardStats,
} from '../services/firestoreService.js';
import type { DashboardStats } from '../types.js';
import { ApiError } from './client.js';

export const invoicesApi = {
  getDashboard: async (): Promise<{ stats: DashboardStats }> => {
    const user = auth.currentUser;
    if (!user) {
      return {
        stats: {
          total_outstanding: 0,
          total_overdue: 0,
          total_paid: 0,
          invoice_counts: {
            total: 0,
            paid: 0,
            overdue: 0,
            unpaid: 0,
            cancelled: 0,
          },
          client_count: 0,
          urgent_invoices: [],
          recent_activity: [],
          upcoming_due_invoices: [],
        },
      };
    }
    const stats = await getFirestoreDashboardStats(user.uid);
    return { stats };
  },
  getInvoices: async (params?: { status?: string; client_id?: string; search?: string }) => {
    const user = auth.currentUser;
    if (!user) return { invoices: [] };
    const invoices = await getFirestoreInvoices(user.uid, params);
    return { invoices };
  },

  getInvoice: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const invoice = await getFirestoreInvoice(user.uid, id);
    if (!invoice) throw new ApiError('Invoice not found', 404);
    return { invoice };
  },

  createInvoice: async (invoiceData: {
    client_id: string;
    invoice_number: string;
    amount: number;
    currency?: string;
    issue_date: string;
    due_date: string;
    notes?: string;
  }) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);

    const sub = await getFirestoreSubscription(user.uid);
    if (sub.usage.invoice_limit_reached) {
      throw new ApiError(
        `Invoice limit reached for your ${sub.usage.plan} tier (${sub.usage.max_invoices_per_month} invoices). Please upgrade to add more invoices.`,
        403
      );
    }

    const invoice = await createFirestoreInvoice(user.uid, invoiceData);
    return { invoice };
  },

  updateInvoice: async (
    id: string,
    data: Partial<{
      client_id: string;
      invoice_number: string;
      amount: number;
      currency?: string;
      issue_date: string;
      due_date: string;
      notes?: string;
    }>
  ) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const invoice = await updateFirestoreInvoice(user.uid, id, data);
    return { invoice };
  },

  markInvoicePaid: async (id: string, paid_date?: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const invoice = await markFirestoreInvoicePaid(user.uid, id, paid_date);
    return { invoice, message: 'Invoice marked as paid.' };
  },

  cancelInvoice: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const invoice = await cancelFirestoreInvoice(user.uid, id);
    return { invoice, message: 'Invoice cancelled.' };
  },

  deleteInvoice: async (id: string) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    await deleteFirestoreInvoice(user.uid, id);
    return { message: 'Invoice deleted successfully.' };
  },
};
