import fs from 'fs';
import path from 'path';
import { AsyncKeyLock } from './asyncKeyLock.js';
import { logger } from './logger.js';
import type {
  User,
  Session,
  Client,
  Invoice,
  Reminder,
  ActivityLog,
  EmailVerification,
  Subscription,
} from '../types.js';

export interface LocalStore {
  users: User[];
  sessions: Session[];
  clients: Client[];
  invoices: Invoice[];
  reminders: Reminder[];
  activity_logs: ActivityLog[];
  email_verifications: EmailVerification[];
  subscriptions: Subscription[];
  processed_webhook_events: { id: string; event_type: string; processed_at: string }[];
}

export const userMutex = new AsyncKeyLock();

const DATA_DIR = path.join(process.cwd(), 'data');
const LOCAL_DB_FILE = path.join(DATA_DIR, 'receipto_db.json');

export function loadStore(): LocalStore {
  try {
    if (fs.existsSync(LOCAL_DB_FILE)) {
      const data = fs.readFileSync(LOCAL_DB_FILE, 'utf-8');
      const parsed = JSON.parse(data);
      const adminEmail = process.env.ADMIN_EMAIL?.trim().toLowerCase();

      return {
        users: Array.isArray(parsed.users)
          ? parsed.users.map((u: any) => ({
              ...u,
              email_verified: Boolean(u.email_verified),
              role: adminEmail && u.email?.toLowerCase() === adminEmail ? 'ADMIN' : (u.role || 'USER'),
              status: u.status || 'ACTIVE',
              terms_accepted_at: u.terms_accepted_at || null,
              terms_version: u.terms_version || '1.0',
              last_login_at: u.last_login_at || null,
            }))
          : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        clients: Array.isArray(parsed.clients) ? parsed.clients : [],
        invoices: Array.isArray(parsed.invoices) ? parsed.invoices : [],
        reminders: Array.isArray(parsed.reminders) ? parsed.reminders : [],
        activity_logs: Array.isArray(parsed.activity_logs) ? parsed.activity_logs : [],
        email_verifications: Array.isArray(parsed.email_verifications) ? parsed.email_verifications : [],
        subscriptions: Array.isArray(parsed.subscriptions) ? parsed.subscriptions : [],
        processed_webhook_events: Array.isArray(parsed.processed_webhook_events) ? parsed.processed_webhook_events : [],
      };
    }
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error loading local store');
  }
  return {
    users: [],
    sessions: [],
    clients: [],
    invoices: [],
    reminders: [],
    activity_logs: [],
    email_verifications: [],
    subscriptions: [],
    processed_webhook_events: [],
  };
}

export const memoryStore: LocalStore = loadStore();

export function saveStore(): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const tempFile = `${LOCAL_DB_FILE}.tmp.${Date.now()}`;
    fs.writeFileSync(tempFile, JSON.stringify(memoryStore, null, 2), 'utf-8');
    fs.renameSync(tempFile, LOCAL_DB_FILE);
  } catch (err: any) {
    logger.error({ err: err.message }, 'Error persisting local store to disk');
  }
}

export function reloadLocalStore(): void {
  const fresh = loadStore();
  memoryStore.users = fresh.users;
  memoryStore.sessions = fresh.sessions;
  memoryStore.clients = fresh.clients;
  memoryStore.invoices = fresh.invoices;
  memoryStore.reminders = fresh.reminders;
  memoryStore.activity_logs = fresh.activity_logs;
  memoryStore.email_verifications = fresh.email_verifications;
  memoryStore.subscriptions = fresh.subscriptions;
  memoryStore.processed_webhook_events = fresh.processed_webhook_events;
}
