import {
  db,
  doc,
  collection,
  getDocs,
  setDoc,
  handleFirestoreError,
  OperationType,
} from '../../firebase.js';
import type { Reminder, ActivityLog } from '../../types.js';
import { sanitizeForFirestore } from './utils.js';

export async function logFirestoreActivity(
  uid: string,
  action: string,
  details: string,
  metadata?: any
): Promise<void> {
  const logId = crypto.randomUUID();
  const logEntry: any = {
    id: logId,
    user_id: uid,
    action,
    details,
    created_at: new Date().toISOString(),
  };
  if (metadata !== undefined) {
    logEntry.metadata = metadata;
  }

  try {
    await setDoc(doc(db, 'users', uid, 'activity_logs', logId), sanitizeForFirestore(logEntry));
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
    return reminders.sort((a, b) =>
      (b.sent_at || b.created_at || '').localeCompare(a.sent_at || a.created_at || '')
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, path);
  }
}

export async function createFirestoreReminder(
  uid: string,
  reminder: Omit<Reminder, 'id' | 'user_id' | 'created_at'>
): Promise<Reminder> {
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
    await setDoc(doc(db, 'users', uid, 'reminders', reminderId), sanitizeForFirestore(newReminder));
    await logFirestoreActivity(
      uid,
      'SEND_REMINDER',
      `Dispatched payment reminder to ${newReminder.recipient_email}`
    );
    return newReminder;
  } catch (err) {
    handleFirestoreError(err, OperationType.CREATE, path);
  }
}
