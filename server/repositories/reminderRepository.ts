import crypto from 'crypto';
import type { Reminder, User } from '../types.js';
import { memoryStore, saveStore, reloadLocalStore } from '../lib/dbStore.js';
import { getSubscription } from './subscriptionRepository.js';
import { getEffectivePlan } from '../plans.js';
import { logger } from '../lib/logger.js';

export async function createReminder(
  userIdOrData:
    | string
    | (Partial<Reminder> & {
        user_id?: string;
        invoice_id: string;
        client_id: string;
        recipient_email: string;
        subject: string;
        message: string;
      }),
  maybeData?: any
): Promise<Reminder> {
  const data =
    typeof userIdOrData === 'string'
      ? { ...maybeData!, user_id: userIdOrData }
      : userIdOrData;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();

  const reminder: Reminder = {
    id,
    user_id: data.user_id || (typeof userIdOrData === 'string' ? userIdOrData : ''),
    invoice_id: data.invoice_id || '',
    client_id: data.client_id || '',
    recipient_email: data.recipient_email || '',
    subject: data.subject || '',
    message: data.message || '',
    sent_at: data.status === 'SENT' ? now : undefined,
    status: (data.status as any) || 'SENT',
    error_message: data.error_message,
    reminder_type: (data.reminder_type as any) || 'manual',
    scheduled_at: data.scheduled_at,
    attempted_at: data.attempted_at,
    provider_message_id: data.provider_message_id,
    attempt_count: data.attempt_count || 1,
    created_at: now,
  };
  memoryStore.reminders.push(reminder);
  saveStore();
  logger.info({ reminderId: id, invoiceId: reminder.invoice_id, status: reminder.status }, 'Reminder created');
  return reminder;
}

export async function getUsersWithAutomatedReminders(): Promise<User[]> {
  reloadLocalStore();
  const eligibleUsers: User[] = [];
  for (const user of memoryStore.users) {
    if (user.status === 'SUSPENDED') continue;
    const sub = await getSubscription(user.id);
    const planConfig = getEffectivePlan(sub.plan, sub.status, sub.current_period_end);
    if (planConfig.features.automatedReminders) {
      eligibleUsers.push(user);
    }
  }
  return eligibleUsers;
}

export async function getRecentRemindersForInvoice(invoiceId: string, days: number = 3): Promise<Reminder[]> {
  reloadLocalStore();
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  return memoryStore.reminders.filter((r) => {
    if (r.invoice_id !== invoiceId) return false;
    const dateToCheck = r.sent_at || r.created_at;
    if (!dateToCheck) return false;
    const reminderTime = new Date(dateToCheck).getTime();
    return reminderTime >= cutoffTime;
  });
}

export async function getReminders(userId: string, invoiceId?: string): Promise<Reminder[]> {
  reloadLocalStore();
  let list = memoryStore.reminders.filter((r) => r.user_id === userId);
  if (invoiceId) {
    list = list.filter((r) => r.invoice_id === invoiceId);
  }
  return list.sort((a, b) => (b.sent_at || b.created_at || '').localeCompare(a.sent_at || a.created_at || ''));
}
