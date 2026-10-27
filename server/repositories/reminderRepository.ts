import crypto from 'crypto';
import type { Reminder, User } from '../types.js';
import { getAdminFirestore } from '../lib/firebaseAdmin.js';
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
  const db = getAdminFirestore();
  const data =
    typeof userIdOrData === 'string'
      ? { ...maybeData!, user_id: userIdOrData }
      : userIdOrData;

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const userId = data.user_id || (typeof userIdOrData === 'string' ? userIdOrData : '');

  const reminder: Reminder = {
    id,
    user_id: userId,
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

  await db.collection('users').doc(userId).collection('reminders').doc(id).set(reminder);
  logger.info({ reminderId: id, invoiceId: reminder.invoice_id, status: reminder.status }, 'Reminder created in Firestore');
  return reminder;
}

export async function getUsersWithAutomatedReminders(): Promise<User[]> {
  const db = getAdminFirestore();
  const usersSnap = await db.collection('users').get();
  const eligibleUsers: User[] = [];

  for (const doc of usersSnap.docs) {
    const user = doc.data() as User;
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
  const db = getAdminFirestore();
  const cutoffTime = Date.now() - days * 24 * 60 * 60 * 1000;
  const snap = await db.collectionGroup('reminders').where('invoice_id', '==', invoiceId).get();

  const results: Reminder[] = [];
  snap.forEach((d: any) => {
    const r = d.data() as Reminder;
    const dateToCheck = r.sent_at || r.created_at;
    if (dateToCheck) {
      const reminderTime = new Date(dateToCheck).getTime();
      if (reminderTime >= cutoffTime) {
        results.push(r);
      }
    }
  });

  return results;
}

export async function getReminders(userId: string, invoiceId?: string): Promise<Reminder[]> {
  const db = getAdminFirestore();
  const snap = await db.collection('users').doc(userId).collection('reminders').get();
  let list: Reminder[] = [];

  snap.forEach((d: any) => {
    list.push(d.data() as Reminder);
  });

  if (invoiceId) {
    list = list.filter((r) => r.invoice_id === invoiceId);
  }

  return list.sort((a, b) => (b.sent_at || b.created_at || '').localeCompare(a.sent_at || a.created_at || ''));
}
