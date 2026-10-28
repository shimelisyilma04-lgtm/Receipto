import { auth } from '../firebase.js';
import {
  getFirestoreInvoice,
  getFirestoreReminders,
  createFirestoreReminder,
  getFirestoreActivityLogs,
  updateFirestoreUserProfile,
} from '../services/firestoreService.js';
import type { ActivityLog } from '../types.js';
import { ApiError, request } from './client.js';

export const remindersApi = {
  getReminders: async (invoiceId?: string) => {
    const user = auth.currentUser;
    if (!user) return { reminders: [] };
    const reminders = await getFirestoreReminders(user.uid, invoiceId);
    return { reminders };
  },

  previewReminder: async (
    invoice_id: string,
    tone: 'friendly' | 'standard' | 'urgent',
    custom_message?: string
  ) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);

    try {
      return await request<{
        preview: { subject: string; html: string; text: string };
        recipient: string;
        isEmailConfigured: boolean;
      }>('/api/reminders/preview', {
        method: 'POST',
        body: JSON.stringify({ invoice_id, tone, custom_message }),
      });
    } catch {
      const inv = await getFirestoreInvoice(user.uid, invoice_id);
      const safeInvoice = inv?.invoice_number || invoice_id;
      return {
        preview: {
          subject: `Payment Reminder: Invoice #${safeInvoice}`,
          html: `<p>Payment reminder for invoice #${safeInvoice}</p>`,
          text: `Payment reminder for invoice #${safeInvoice}`,
        },
        recipient: inv?.client_email || 'client@example.com',
        isEmailConfigured: false,
      };
    }
  },

  sendReminder: async (
    invoice_id: string,
    tone: 'friendly' | 'standard' | 'urgent',
    custom_message?: string
  ) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);

    const inv = await getFirestoreInvoice(user.uid, invoice_id);
    if (!inv) throw new ApiError('Invoice not found', 404);

    let res: any;
    try {
      res = await request<{ success: boolean; configured: boolean; message: string; reminder?: any }>('/api/reminders/send', {
        method: 'POST',
        body: JSON.stringify({ invoice_id, tone, custom_message }),
      });
    } catch (err: any) {
      res = {
        success: false,
        configured: false,
        message: err.message || 'Email dispatch failed. Please verify Resend credentials.',
      };
    }

    const reminder = await createFirestoreReminder(user.uid, {
      invoice_id,
      client_id: inv.client_id,
      recipient_email: inv.client_email || '',
      subject: `Invoice #${inv.invoice_number} Payment Reminder`,
      message: custom_message || `Payment reminder for invoice #${inv.invoice_number} due on ${inv.due_date}`,
      sent_at: res.success ? new Date().toISOString() : undefined,
      status: res.success ? 'SENT' : res.configured ? 'FAILED' : 'CONFIG_REQUIRED',
      error_message: res.success ? undefined : res.message,
      reminder_type: 'manual',
      attempt_count: 1,
    });

    return {
      success: res.success,
      configured: res.configured ?? false,
      message: res.message || 'Reminder logged successfully.',
      reminder,
    };
  },

  getActivity: async (limit = 50): Promise<{ logs: ActivityLog[]; upgrade_required?: boolean; plan?: string }> => {
    const user = auth.currentUser;
    if (!user) return { logs: [], upgrade_required: false, plan: 'FREE' };
    const logs = await getFirestoreActivityLogs(user.uid, limit);
    return { logs, upgrade_required: false, plan: 'FREE' };
  },

  getConfig: () => request<any>('/api/settings/config'),

  updateProfile: async (profile: { name?: string; business_name?: string }) => {
    const user = auth.currentUser;
    if (!user) throw new ApiError('Unauthorized', 401);
    const updatedUser = await updateFirestoreUserProfile(user.uid, profile);
    return { message: 'Profile updated successfully.', user: updatedUser };
  },

  runAutomatedReminders: () =>
    request<{ message: string; processed: number; results: any[] }>('/api/reminders/automate', {
      method: 'POST',
    }),

  saveReminderSchedule: (cadence: string) =>
    request<{ message: string; cadence: string }>('/api/reminders/schedules', {
      method: 'POST',
      body: JSON.stringify({ cadence }),
    }),
};
